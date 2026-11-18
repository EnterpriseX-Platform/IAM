// Migrate IAMX.ROLE.ID from NUMBER to CUID VARCHAR2(36).
//
// Run AFTER migrate_role_id_to_cuid.sql Part 1 (FK constraints dropped).
//
// Idempotent: safe to re-run after partial failure.
//   - Re-uses CUIDs already written to ROLE.id_new.
//   - Skips FK tables whose role_id is already VARCHAR2.
//   - Saves old NUMBER id/role_id into _old VARCHAR2 backup columns.
//
// Usage:
//
//	go run ./cmd/migrate-role-id \
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
	log.Println("migration complete — now run migrate_role_id_to_cuid.sql Part 3 to re-create FK constraints")
}

func execStmt(db *sql.DB, stmt string) error {
	_, err := db.Exec(stmt)
	return err
}

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

func columnDataType(db *sql.DB, owner, table, col string) string {
	var dt string
	db.QueryRow(
		`SELECT DATA_TYPE FROM ALL_TAB_COLUMNS
		 WHERE OWNER = :1 AND TABLE_NAME = :2 AND COLUMN_NAME = :3`,
		strings.ToUpper(owner), strings.ToUpper(table), strings.ToUpper(col),
	).Scan(&dt)
	return dt
}

func columnExists(db *sql.DB, owner, table, col string) bool {
	return columnDataType(db, owner, table, col) != ""
}

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

// saveOldBackup adds col_old VARCHAR2 column and populates with TO_CHAR(old NUMBER).
// Idempotent: skips if col_old already exists.
func saveOldBackup(db *sql.DB, owner, tbl, col string) error {
	oldCol := col + "_old"
	full := ""
	if owner != "" {
		full = owner + "."
	}
	full += tbl

	if columnExists(db, owner, tbl, oldCol) {
		log.Printf("backup: %s.%s already exists — skipping", full, oldCol)
		return nil
	}

	if err := execStmt(db, fmt.Sprintf(
		`ALTER TABLE %s ADD (%s VARCHAR2(36))`, full, oldCol,
	)); err != nil {
		return fmt.Errorf("add %s.%s: %w", full, oldCol, err)
	}

	// Populate with string representation of old NUMBER values (NULL stays NULL)
	if _, err := db.Exec(fmt.Sprintf(
		`UPDATE %s SET %s = TO_CHAR(%s)`, full, oldCol, col,
	)); err != nil {
		return fmt.Errorf("populate %s.%s: %w", full, oldCol, err)
	}

	log.Printf("backup: %s.%s saved old NUMBER values", full, oldCol)
	return nil
}

func run(db *sql.DB) error {
	type mapping struct {
		oldID int64
		newID string
	}
	var mappings []mapping

	// Step 0: save ROLE.id backup before any changes
	if err := saveOldBackup(db, "IAMX", "ROLE", "id"); err != nil {
		return fmt.Errorf("save ROLE backup: %w", err)
	}

	// Step 1+2: ensure ROLE.id_new exists and is populated.
	// Re-use existing CUIDs if column already present (idempotent re-run).
	if columnExists(db, "IAMX", "ROLE", "id_new") {
		rows, err := db.Query(`SELECT id, id_new FROM IAMX.ROLE ORDER BY id`)
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
		log.Printf("step 1: re-used %d existing CUIDs from ROLE.id_new", len(mappings))
	} else {
		rows, err := db.Query(`SELECT id FROM IAMX.ROLE ORDER BY id`)
		if err != nil {
			return fmt.Errorf("select role ids: %w", err)
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
		log.Printf("step 1: generated CUIDs for %d roles", len(mappings))

		if err := execStmt(db, `ALTER TABLE IAMX.ROLE ADD (id_new VARCHAR2(36))`); err != nil {
			return fmt.Errorf("add role temp column: %w", err)
		}
		for _, m := range mappings {
			if _, err := db.Exec(
				`UPDATE IAMX.ROLE SET id_new = :1 WHERE id = :2`,
				m.newID, m.oldID,
			); err != nil {
				return fmt.Errorf("populate ROLE id_new (old=%d): %w", m.oldID, err)
			}
		}
		log.Println("step 2: ROLE.id_new populated")
	}

	// Step 3: swap each FK table column NUMBER → VARCHAR2(36) with CUID values.
	fkTables := []fkTable{
		{
			table:           "IAMX.ROLE_OBJECT_MAPPING",
			col:             "role_id",
			dropConstraints: nil,
			addConstraints:  nil,
		},
		{
			table: "IAMX.RESPONSIBILITY_ROLE_MAPPING",
			col:   "role_id",
			dropConstraints: []string{
				`ALTER TABLE IAMX.RESPONSIBILITY_ROLE_MAPPING DROP CONSTRAINT uq_rrm`,
			},
			addConstraints: []string{
				`ALTER TABLE IAMX.RESPONSIBILITY_ROLE_MAPPING ADD CONSTRAINT uq_rrm UNIQUE (responsibility_id, role_id)`,
			},
		},
		{
			table: "IAMX.USER_ROLE_MAPPING",
			col:   "role_id",
			dropConstraints: []string{
				`ALTER TABLE IAMX.USER_ROLE_MAPPING DROP CONSTRAINT uq_url`,
			},
			addConstraints: []string{
				`ALTER TABLE IAMX.USER_ROLE_MAPPING ADD CONSTRAINT uq_url UNIQUE (user_id, role_id)`,
			},
		},
		{
			table: "IAMX.USER_CUSTOM_DATA_ACCESS",
			col:   "role_id",
			dropConstraints: []string{
				`DROP INDEX IAMX.uq_ucda`,
				`DROP INDEX IAMX.idx_ucda_role`,
			},
			addConstraints: []string{
				`CREATE UNIQUE INDEX IAMX.uq_ucda ON IAMX.USER_CUSTOM_DATA_ACCESS(user_id, NVL(role_id, '-1'), agency_path)`,
			},
		},
		{
			table:           "APP.M_DEPARTMENT",
			col:             "role_id",
			dropConstraints: nil,
			addConstraints:  nil,
		},
	}

	for _, t := range fkTables {
		o, tbl := splitOwnerTable(t.table)
		newCol := t.col + "_new"

		// Skip if already processed from a prior partial run
		if columnDataType(db, o, tbl, t.col) == "VARCHAR2" {
			log.Printf("step 3: %s.%s already VARCHAR2 — skipping", t.table, t.col)
			continue
		}
		// Skip if column doesn't exist
		if !columnExists(db, o, tbl, t.col) {
			log.Printf("step 3: %s.%s does not exist — skipping", t.table, t.col)
			continue
		}

		// Save old backup before swapping
		if err := saveOldBackup(db, o, tbl, t.col); err != nil {
			return fmt.Errorf("backup %s.%s: %w", t.table, t.col, err)
		}

		// Drop composite constraints / indexes (ORA-12991 otherwise on DROP COLUMN)
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
				log.Printf("WARN: %s may have duplicate rows — investigate after migration", t.table)
			}
		}

		log.Printf("step 3: swapped %s.%s", t.table, t.col)
	}

	// Step 4: swap ROLE PK column
	for _, stmt := range []string{
		`ALTER TABLE IAMX.ROLE DROP PRIMARY KEY`,
		`ALTER TABLE IAMX.ROLE DROP COLUMN id`,
		`ALTER TABLE IAMX.ROLE RENAME COLUMN id_new TO id`,
		`ALTER TABLE IAMX.ROLE MODIFY (id VARCHAR2(36) NOT NULL)`,
		`ALTER TABLE IAMX.ROLE ADD CONSTRAINT pk_role PRIMARY KEY (id)`,
	} {
		if err := execStmt(db, stmt); err != nil {
			return fmt.Errorf("PK swap (%s): %w", stmt, err)
		}
	}
	log.Println("step 4: ROLE.id is now VARCHAR2(36) PRIMARY KEY")

	return nil
}
