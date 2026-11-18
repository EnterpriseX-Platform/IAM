// Command reset-admin-pw — จัดการ login table IAMX.ADMIN ของ /iamx/login (ไม่ใช่ Keycloak)
//
// modes:
//
//	-list                 list USERNAME/ROLE/STATUS ใน IAMX.ADMIN
//	-dump                 dump ทุก row เป็น JSON (stdout) — ใช้ทำ migration ข้าม env
//	-load <file.json>     INSERT row จากไฟล์ JSON เข้า IAMX.ADMIN (-replace = ลบ USERNAME เดิมก่อน)
//	(default)             reset password ของ -username (bcrypt; หรือ -plain = เก็บ plaintext สำหรับ column สั้น)
//
// env: ORACLE_HOST, ORACLE_PORT(=1521), ORACLE_SERVICE, ORACLE_USER, ORACLE_PASSWORD
//
// ตัวอย่าง migration SIT→UAT (2 pod คนละ network):
//
//	SIT pod:  ORACLE_HOST=127.0.0.1 ORACLE_SERVICE=resdb ORACLE_USER=IAMX ORACLE_PASSWORD=... /reset -dump > /tmp/admin.json
//	ORACLE_HOST=db.example ORACLE_SERVICE=IAMXDB ORACLE_USER=APP  ORACLE_PASSWORD=... /reset -load /tmp/admin.json
package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	go_ora "github.com/sijms/go-ora/v2"
	"golang.org/x/crypto/bcrypt"
)

const table = "IAMX.ADMIN"

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func randomPassword(n int) string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*"
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("rand: %v", err)
	}
	for i := range b {
		b[i] = chars[int(b[i])%len(chars)]
	}
	return string(b)
}

type dumpFile struct {
	Columns []string    `json:"columns"`
	Rows    [][]*string `json:"rows"`
}

func main() {
	username := flag.String("username", "admin", "USERNAME ที่จะ reset")
	password := flag.String("password", "", "password ใหม่ (ว่าง = สุ่ม)")
	plain := flag.Bool("plain", false, "เก็บ password เป็น plaintext (ไม่ bcrypt) — สำหรับ column สั้น (เช่น PASSWORD VARCHAR(40))")
	dryRun := flag.Bool("dry-run", false, "พิมพ์ SQL เฉยๆ")
	list := flag.Bool("list", false, "list users แล้วออก")
	dump := flag.Bool("dump", false, "dump ทุก row เป็น JSON (stdout)")
	loadFile := flag.String("load", "", "INSERT จากไฟล์ JSON เข้า "+table)
	replace := flag.Bool("replace", true, "ลบ row USERNAME เดิมก่อน INSERT")
	flag.Parse()

	host := env("ORACLE_HOST", "")
	service := env("ORACLE_SERVICE", "")
	user := env("ORACLE_USER", "")
	dbPass := env("ORACLE_PASSWORD", "")
	port, err := strconv.Atoi(env("ORACLE_PORT", "1521"))
	if err != nil {
		log.Fatalf("ORACLE_PORT: %v", err)
	}
	if host == "" || service == "" || user == "" || dbPass == "" {
		log.Fatal("ต้อง set ORACLE_HOST/ORACLE_SERVICE/ORACLE_USER/ORACLE_PASSWORD")
	}

	db, err := sql.Open("oracle", go_ora.BuildUrl(host, port, service, user, dbPass, nil))
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("เชื่อม Oracle %s:%d/%s ไม่ได้: %v", host, port, service, err)
	}

	switch {
	case *list:
		rows, err := db.Query(`SELECT USERNAME, ROLE, STATUS FROM ` + table + ` ORDER BY USERNAME`)
		if err != nil {
			log.Fatalf("query: %v", err)
		}
		defer rows.Close()
		fmt.Println(table + " users:")
		for rows.Next() {
			var u, role, status sql.NullString
			_ = rows.Scan(&u, &role, &status)
			fmt.Printf("  username=%-24s role=%-14s status=%s\n", u.String, role.String, status.String)
		}

	case *dump:
		rows, err := db.Query(`SELECT * FROM ` + table)
		if err != nil {
			log.Fatalf("dump query: %v", err)
		}
		defer rows.Close()
		cols, _ := rows.Columns()
		out := dumpFile{Columns: cols}
		for rows.Next() {
			vals := make([]sql.NullString, len(cols))
			ptrs := make([]interface{}, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				log.Fatalf("scan: %v", err)
			}
			row := make([]*string, len(cols))
			for i, v := range vals {
				if v.Valid {
					s := v.String
					row[i] = &s
				}
			}
			out.Rows = append(out.Rows, row)
		}
		if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
			log.Fatalf("encode: %v", err)
		}

	case *loadFile != "":
		data, err := os.ReadFile(*loadFile)
		if err != nil {
			log.Fatalf("read %s: %v", *loadFile, err)
		}
		var in dumpFile
		if err := json.Unmarshal(data, &in); err != nil {
			log.Fatalf("parse json: %v", err)
		}
		ph := make([]string, len(in.Columns))
		for i := range ph {
			ph[i] = fmt.Sprintf(":%d", i+1)
		}
		insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", table,
			strings.Join(in.Columns, ", "), strings.Join(ph, ", "))
		unameIdx := -1
		for i, c := range in.Columns {
			if strings.EqualFold(c, "USERNAME") {
				unameIdx = i
			}
		}
		n := 0
		for _, row := range in.Rows {
			args := make([]interface{}, len(row))
			for i, v := range row {
				if v != nil {
					args[i] = *v
				} else {
					args[i] = nil
				}
			}
			if *replace && unameIdx >= 0 && row[unameIdx] != nil {
				if _, err := db.Exec(`DELETE FROM `+table+` WHERE USERNAME = :1`, *row[unameIdx]); err != nil {
					log.Fatalf("delete %q: %v", *row[unameIdx], err)
				}
			}
			if _, err := db.Exec(insertSQL, args...); err != nil {
				log.Fatalf("insert row %d: %v", n, err)
			}
			n++
		}
		fmt.Printf("✅ loaded %d rows เข้า %s\n", n, table)

	default: // reset password
		pw := *password
		if pw == "" {
			pw = randomPassword(12)
			fmt.Printf("สุ่ม password ใหม่: %s\n", pw)
		}
		stored := pw
		if !*plain {
			h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
			if err != nil {
				log.Fatalf("bcrypt: %v", err)
			}
			stored = string(h)
		}
		if *dryRun {
			fmt.Printf("UPDATE %s SET PASSWORD = '%s' WHERE USERNAME = '%s';\n", table, stored, *username)
			return
		}
		res, err := db.Exec(`UPDATE `+table+` SET PASSWORD = :1 WHERE USERNAME = :2`, stored, *username)
		if err != nil {
			log.Fatalf("UPDATE: %v", err)
		}
		rn, _ := res.RowsAffected()
		if rn == 0 {
			log.Fatalf("ไม่มี USERNAME=%q ใน %s (เช็ค -list)", *username, table)
		}
		fmt.Printf("✅ reset %s USERNAME=%q (rows=%d)\n   password ใหม่: %s\n", table, *username, rn, pw)
	}
}
