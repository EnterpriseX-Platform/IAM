package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"

	go_ora "github.com/sijms/go-ora/v2"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	dryRun := flag.Bool("dry-run", false, "show what would change without executing")
	fixRef := flag.Bool("fix-ref", true, "set REF_USER_ID = USER_ID where NULL")
	fixRoles := flag.Bool("fix-roles", true, "fix USER_ROLE_MAPPING orphan USER_IDs")
	flag.Parse()

	host := env("ORACLE_HOST", "")
	service := env("ORACLE_SERVICE", "")
	user := env("ORACLE_USER", "")
	dbPass := env("ORACLE_PASSWORD", "")
	port, _ := strconv.Atoi(env("ORACLE_PORT", "1521"))
	schema := env("ORACLE_SCHEMA", "IAMX")

	if host == "" || service == "" || user == "" || dbPass == "" {
		log.Fatal("set ORACLE_HOST/ORACLE_SERVICE/ORACLE_USER/ORACLE_PASSWORD")
	}

	db, err := sql.Open("oracle", go_ora.BuildUrl(host, port, service, user, dbPass, nil))
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("connect failed: %v", err)
	}
	db.Exec(fmt.Sprintf("ALTER SESSION SET CURRENT_SCHEMA = %s", schema))
	fmt.Printf("Connected to %s:%d/%s schema=%s\n", host, port, service, schema)

	if *fixRef {
		fmt.Println("\n=== Fix REF_USER_ID ===")
		rows, _ := db.Query(`SELECT USER_ID, EMAIL, USER_NAME FROM USER_INFO WHERE REF_USER_ID IS NULL`)
		var nullCount int
		for rows.Next() {
			var uid, email, uname sql.NullString
			rows.Scan(&uid, &email, &uname)
			fmt.Printf("  NULL REF_USER_ID: user_id=%s email=%s user_name=%s\n", uid.String, email.String, uname.String)
			nullCount++
		}
		rows.Close()
		fmt.Printf("  Found %d rows with NULL REF_USER_ID\n", nullCount)

		if nullCount > 0 && !*dryRun {
			res, err := db.Exec(`UPDATE USER_INFO SET REF_USER_ID = USER_ID WHERE REF_USER_ID IS NULL`)
			if err != nil {
				log.Fatalf("update REF_USER_ID: %v", err)
			}
			n, _ := res.RowsAffected()
			fmt.Printf("  ✅ Updated %d rows: REF_USER_ID = USER_ID\n", n)
		}
	}

	if *fixRoles {
		fmt.Println("\n=== Check USER_ROLE_MAPPING orphans ===")
		rows, err := db.Query(`
			SELECT urm.USER_ID, r.CODE, urm.IS_ACTIVE
			FROM USER_ROLE_MAPPING urm
			JOIN ROLE r ON r.ID = urm.ROLE_ID
			WHERE urm.USER_ID NOT IN (SELECT USER_ID FROM USER_INFO)
			AND ROWNUM <= 50
		`)
		if err != nil {
			fmt.Printf("  query error: %v\n", err)
		} else {
			var orphanCount int
			for rows.Next() {
				var uid, code sql.NullString
				var active sql.NullInt64
				rows.Scan(&uid, &code, &active)
				fmt.Printf("  Orphan: user_id=%s role=%s active=%d\n", uid.String, code.String, active.Int64)
				orphanCount++
			}
			rows.Close()
			fmt.Printf("  Found %d orphan role mappings\n", orphanCount)
		}

		// Check for old numeric USER_IDs that might map to CUID users by email/personal_card_id
		fmt.Println("\n=== Loan users role check ===")
		for _, uname := range []string{"loan_agency", "loan_pdmo"} {
			var uid sql.NullString
			db.QueryRow(`SELECT USER_ID FROM USER_INFO WHERE USER_NAME = :1 OR EMAIL = :2`, uname, uname+"@example.com").Scan(&uid)
			if !uid.Valid {
				fmt.Printf("  %s: not found in USER_INFO\n", uname)
				continue
			}
			fmt.Printf("  %s: user_id=%s\n", uname, uid.String)

			roleRows, _ := db.Query(`
				SELECT r.CODE, urm.IS_ACTIVE, urm.EFFECTIVE_DATE, urm.EXPIRE_DATE
				FROM USER_ROLE_MAPPING urm JOIN ROLE r ON r.ID = urm.ROLE_ID
				WHERE urm.USER_ID = :1
				ORDER BY r.CODE`, uid.String)
			var roleCount int
			for roleRows.Next() {
				var code sql.NullString
				var active sql.NullInt64
				var eff, exp sql.NullString
				roleRows.Scan(&code, &active, &eff, &exp)
				fmt.Printf("    role=%s active=%d eff=%s exp=%s\n", code.String, active.Int64, eff.String, exp.String)
				roleCount++
			}
			roleRows.Close()
			if roleCount == 0 {
				fmt.Printf("    ⚠️  NO ROLES found for this user_id\n")
			}
		}
	}
}
