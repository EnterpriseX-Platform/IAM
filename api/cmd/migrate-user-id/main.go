// Migrate IAMX.USER_INFO.USER_ID from NUMBER to CUID2 VARCHAR2(36).
//
// Run AFTER migrate_user_id_to_cuid.sql Parts 1-3 (FK constraints dropped,
// created_by/updated_by columns already changed).
//
// Idempotent: safe to re-run after partial failure.
//   - Re-uses CUIDs already written to USER_INFO.user_id_new.
//   - Skips FK tables whose user_id is already VARCHAR2.
//   - APP.USER_INFO.REF_USER_ID remap runs before PK swap (while old NUMBER exists).
//   - Constraint recreation is warn-only (data duplicates don't abort).
//
// Usage:
//
//	go run ./cmd/migrate-user-id \
//	  --oracle='oracle://USER:pw@host:1521/SID'
package main

import (
	"api/core/utils"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"strings"

	_ "github.com/sijms/go-ora/v2"
)

var flagOracle = flag.String("oracle", "", "Oracle DSN (required)")

func main() {
	flag.Parse()
	if *flagOracle == "" {
		log.Fatal("--oracle is required")
	}

	db, err := sql.Open("oracle", *flagOracle)
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("ping: %v", err)
	}
	log.Println("connected to Oracle")

	if err := run(db); err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	log.Println("migration complete — now run migrate_user_id_to_cuid.sql Part 4 to re-create FK constraints")
}

func execStmt(db *sql.DB, stmt string) error {
	_, err := db.Exec(stmt)
	return err
}

// execIgnore runs stmt, ignoring errors whose message contains any of the skip strings.
func execIgnore(db *sql.DB, stmt string, skipContains ...string) error {
	_, err := db.Exec(stmt)
	if err != nil {
		msg := err.Error()
		for _, s := range skipContains {
			if strings.Contains(msg, s) {
				return nil
			}
		}
	}
	return err
}

// columnDataType returns the DATA_TYPE of a column, or "" if not found.
func columnDataType(db *sql.DB, owner, table, col string) string {
	var dt string
	db.QueryRow(
		`SELECT DATA_TYPE FROM ALL_TAB_COLUMNS
		 WHERE OWNER = :1 AND TABLE_NAME = :2 AND COLUMN_NAME = :3`,
		strings.ToUpper(owner), strings.ToUpper(table), strings.ToUpper(col),
	).Scan(&dt)
	return dt
}

// columnExists reports whether a column exists in owner.table.
func columnExists(db *sql.DB, owner, table, col string) bool {
	return columnDataType(db, owner, table, col) != ""
}

// splitOwnerTable splits "OWNER.TABLE" → ("OWNER", "TABLE").
func splitOwnerTable(full string) (owner, table string) {
	if i := strings.Index(full, "."); i >= 0 {
		return full[:i], full[i+1:]
	}
	return "", full
}

type fkTable struct {
	table           string
	col             string
	dropConstraints []string
	addConstraints  []string
}

func run(db *sql.DB) error {
	type mapping struct {
		oldID int64
		newID string
	}
	var mappings []mapping

	// Step 1+2: ensure USER_INFO.user_id_new exists and is populated.
	// Re-use existing CUIDs if column already present (idempotent re-run).
	if columnExists(db, "IAMX", "USER_INFO", "user_id_new") {
		rows, err := db.Query(`SELECT user_id, user_id_new FROM IAMX.USER_INFO ORDER BY user_id`)
		if err != nil {
			return fmt.Errorf("read existing cuid map: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var oldID int64
			var newID string
			if err := rows.Scan(&oldID, &newID); err != nil {
				return fmt.Errorf("scan existing: %w", err)
			}
			mappings = append(mappings, mapping{oldID: oldID, newID: newID})
		}
		if err := rows.Err(); err != nil {
			return err
		}
		log.Printf("step 1: re-used %d existing CUIDs from USER_INFO.user_id_new", len(mappings))
	} else {
		rows, err := db.Query(`SELECT user_id FROM IAMX.USER_INFO ORDER BY user_id`)
		if err != nil {
			return fmt.Errorf("select user_ids: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var oldID int64
			if err := rows.Scan(&oldID); err != nil {
				return fmt.Errorf("scan: %w", err)
			}
			mappings = append(mappings, mapping{oldID: oldID, newID: utils.NewCUID()})
		}
		if err := rows.Err(); err != nil {
			return err
		}
		log.Printf("step 1: generated CUIDs for %d users", len(mappings))

		if err := execStmt(db, `ALTER TABLE IAMX.USER_INFO ADD (user_id_new VARCHAR2(36))`); err != nil {
			return fmt.Errorf("add user_info temp column: %w", err)
		}
		for _, m := range mappings {
			if _, err := db.Exec(
				`UPDATE IAMX.USER_INFO SET user_id_new = :1 WHERE user_id = :2`,
				m.newID, m.oldID,
			); err != nil {
				return fmt.Errorf("populate user_info user_id_new (old=%d): %w", m.oldID, err)
			}
		}
		log.Println("step 2: USER_INFO.user_id_new populated")
	}

	// Step 3: swap each FK table column NUMBER → VARCHAR2(36) with CUID values.
	// Oracle ORA-01439 prevents MODIFY NUMBER→VARCHAR2 on non-empty column;
	// use add/_new / populate / drop old / rename pattern.
	// Composite UNIQUE constraints cause ORA-12991 on DROP COLUMN — drop first, recreate after.
	fkTables := []fkTable{
		{
			table: "IAMX.USER_ROLE_MAPPING",
			col:   "user_id",
			dropConstraints: []string{
				`ALTER TABLE IAMX.USER_ROLE_MAPPING DROP CONSTRAINT uq_url`,
			},
			addConstraints: []string{
				`ALTER TABLE IAMX.USER_ROLE_MAPPING ADD CONSTRAINT uq_url UNIQUE (user_id, role_id)`,
			},
		},
		{
			table: "IAMX.USER_RESPONSIBILITY_MAPPING",
			col:   "user_id",
			dropConstraints: []string{
				`ALTER TABLE IAMX.USER_RESPONSIBILITY_MAPPING DROP CONSTRAINT uq_urm`,
			},
			addConstraints: []string{
				`ALTER TABLE IAMX.USER_RESPONSIBILITY_MAPPING ADD CONSTRAINT uq_urm UNIQUE (user_id, responsibility_id)`,
			},
		},
		{
			table:           "IAMX.USER_CUSTOM_OBJECT_MAPPING",
			col:             "user_id",
			dropConstraints: nil,
			addConstraints:  nil,
		},
		{
			table: "IAMX.USER_CUSTOM_DATA_ACCESS",
			col:   "user_id",
			dropConstraints: []string{
				`DROP INDEX IAMX.uq_ucda`,
			},
			addConstraints: []string{
				`CREATE UNIQUE INDEX IAMX.uq_ucda ON IAMX.USER_CUSTOM_DATA_ACCESS(user_id, NVL(responsibility_id, -1), agency_path)`,
			},
		},
	}

	for _, t := range fkTables {
		o, tbl := splitOwnerTable(t.table)
		newCol := t.col + "_new"

		// Skip if already processed (user_id already VARCHAR2 from a prior partial run)
		if columnDataType(db, o, tbl, t.col) == "VARCHAR2" {
			log.Printf("step 3: %s.%s already VARCHAR2 — skipping", t.table, t.col)
			continue
		}

		// Drop composite constraints (ORA-12991 otherwise on DROP COLUMN)
		// Ignore ORA-02443 (constraint not found) and ORA-01418 (index not found)
		for _, stmt := range t.dropConstraints {
			if err := execIgnore(db, stmt, "ORA-02443", "ORA-01418"); err != nil {
				return fmt.Errorf("drop constraint on %s (%s): %w", t.table, stmt, err)
			}
		}

		// ORA-01430 = column already exists (idempotent safety)
		if err := execIgnore(db,
			fmt.Sprintf(`ALTER TABLE %s ADD (%s VARCHAR2(36))`, t.table, newCol),
			"ORA-01430",
		); err != nil {
			return fmt.Errorf("add %s.%s: %w", t.table, newCol, err)
		}

		for _, m := range mappings {
			if _, err := db.Exec(
				fmt.Sprintf(`UPDATE %s SET %s = :1 WHERE %s = :2`, t.table, newCol, t.col),
				m.newID, m.oldID,
			); err != nil {
				return fmt.Errorf("populate %s.%s (old=%d): %w", t.table, newCol, m.oldID, err)
			}
		}

		if err := execStmt(db, fmt.Sprintf(`ALTER TABLE %s DROP COLUMN %s`, t.table, t.col)); err != nil {
			return fmt.Errorf("drop %s.%s: %w", t.table, t.col, err)
		}
		if err := execStmt(db, fmt.Sprintf(`ALTER TABLE %s RENAME COLUMN %s TO %s`, t.table, newCol, t.col)); err != nil {
			return fmt.Errorf("rename %s.%s: %w", t.table, newCol, err)
		}

		// Recreate composite constraints — warn-only (skip if data has duplicates)
		for _, stmt := range t.addConstraints {
			if err := execStmt(db, stmt); err != nil {
				log.Printf("WARN: could not recreate constraint on %s: %v", t.table, err)
				log.Printf("WARN: %s may have duplicate (user_id, ...) rows — investigate after migration", t.table)
			}
		}

		log.Printf("step 3: swapped %s.%s", t.table, t.col)
	}

	// Step 4: remap APP.USER_INFO.REF_USER_ID to new CUID.
	// APP.REF_USER_ID stores IAMX user_id as its FK reference.
	// Must run HERE — while IAMX.USER_INFO.user_id is still NUMBER.
	// Skip rows where REF_USER_ID is already a CUID (not a pure integer).
	res, err := db.Exec(`
		UPDATE APP.USER_INFO ai
		SET ai.REF_USER_ID = (
			SELECT ui.user_id_new
			FROM IAMX.USER_INFO ui
			WHERE ui.user_id = TO_NUMBER(ai.REF_USER_ID)
		)
		WHERE ai.REF_USER_ID IS NOT NULL
		  AND REGEXP_LIKE(ai.REF_USER_ID, '^\d+$')
		  AND EXISTS (
			SELECT 1 FROM IAMX.USER_INFO ui
			WHERE ui.user_id = TO_NUMBER(ai.REF_USER_ID)
		)
	`)
	if err != nil {
		return fmt.Errorf("remap APP.USER_INFO.REF_USER_ID: %w", err)
	}
	n, _ := res.RowsAffected()
	log.Printf("step 4: remapped %d APP.USER_INFO.REF_USER_ID rows", n)

	// Step 5: swap USER_INFO PK column
	for _, stmt := range []string{
		`ALTER TABLE IAMX.USER_INFO DROP PRIMARY KEY`,
		`ALTER TABLE IAMX.USER_INFO DROP COLUMN user_id`,
		`ALTER TABLE IAMX.USER_INFO RENAME COLUMN user_id_new TO user_id`,
		`ALTER TABLE IAMX.USER_INFO MODIFY (user_id VARCHAR2(36) NOT NULL)`,
		`ALTER TABLE IAMX.USER_INFO ADD CONSTRAINT pk_user_info PRIMARY KEY (user_id)`,
	} {
		if err := execStmt(db, stmt); err != nil {
			return fmt.Errorf("PK swap (%s): %w", stmt, err)
		}
	}
	log.Println("step 5: USER_INFO.user_id is now VARCHAR2(36) PRIMARY KEY")

	return nil
}
