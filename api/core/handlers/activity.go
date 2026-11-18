package handlers

// changes   = IAMX.ADMIN_ACTIVITY_LOG (ใครทำ · ตั้งแต่ middleware เริ่มเก็บ) + PERMISSION_AUDIT_LOG ช่วงก่อนหน้า (ไม่รู้ผู้ทำ)
// signins   = การเข้า IAMX console (ADMIN_ACTIVITY_LOG) + user events ของ Keycloak (ถ้า realm เปิดเก็บ)
// menu-usage= IAMX.MENU_ACCESS_LOGS (ระบบงานส่งมาเองอยู่แล้ว)
// ตัวกรองสร้างเป็น WHERE ตามที่ส่งมา ไม่เขียนเป็นธงใน SQL

import (
	"api/core"
	"api/core/config"
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

const activityPageSize = 50

type actFilter struct {
	q        string
	from, to string // YYYY-MM-DD
	page     int
}

func readActFilter(c *fiber.Ctx) actFilter {
	p, _ := strconv.Atoi(c.Query("page", "1"))
	if p < 1 {
		p = 1
	}
	valid := func(s string) string {
		if _, err := time.Parse("2006-01-02", s); err == nil {
			return s
		}
		return ""
	}
	return actFilter{q: strings.TrimSpace(c.Query("q")), from: valid(c.Query("from")), to: valid(c.Query("to")), page: p}
}

// where builds conditions for a time column + text columns; returns clause and args starting at :n
func (f actFilter) where(timeCol string, textCols []string, base []string, args []interface{}) (string, []interface{}) {
	conds := append([]string{}, base...)
	if f.from != "" {
		args = append(args, f.from)
		conds = append(conds, fmt.Sprintf("%s >= TO_TIMESTAMP(:%d, 'YYYY-MM-DD')", timeCol, len(args)))
	}
	if f.to != "" {
		args = append(args, f.to)
		conds = append(conds, fmt.Sprintf("%s < TO_TIMESTAMP(:%d, 'YYYY-MM-DD') + 1", timeCol, len(args)))
	}
	if f.q != "" && len(textCols) > 0 {
		args = append(args, "%"+strings.ToLower(f.q)+"%")
		ors := make([]string, 0, len(textCols))
		for _, col := range textCols {
			ors = append(ors, fmt.Sprintf("LOWER(%s) LIKE :%d", col, len(args)))
		}
		conds = append(conds, "("+strings.Join(ors, " OR ")+")")
	}
	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

func ns(v sql.NullString) string { return v.String }

func GetActivityChanges(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}
	f := readActFilter(c)
	src := `SELECT created_at ts, actor, action, path, summary, ip_address ip, 'api' src
	          FROM IAMX.ADMIN_ACTIVITY_LOG
	         WHERE action NOT IN ('LOGIN','LOGIN_FAILED','LOGOUT') AND status BETWEEN 200 AND 299
	        UNION ALL
	        SELECT MAX(a.changed_at), NULL, a.action, a.table_name,
	               TO_CHAR(COUNT(*)) || '|' || MAX(r.code) || '|' || MAX(u.user_name) || '|' || MAX(rs.name), NULL, 'db'
	          FROM (SELECT changed_at, action, table_name,
	                       JSON_VALUE(NVL(new_value, old_value), '$.ROLE_ID') role_id,
	                       JSON_VALUE(NVL(new_value, old_value), '$.USER_ID') user_id,
	                       JSON_VALUE(NVL(new_value, old_value), '$.RESPONSIBILITY_ID') resp_id
	                  FROM IAMX.PERMISSION_AUDIT_LOG
	                 WHERE changed_at < NVL((SELECT MIN(created_at) FROM IAMX.ADMIN_ACTIVITY_LOG), SYSTIMESTAMP + 1)
	                   -- ตารางสิทธิ์ย่อยเปลี่ยนพร้อมตารางหลักเสมอ → ไม่แสดงซ้ำ
	                   AND table_name NOT IN ('ROLE_OBJECT_PERMISSION','USER_CUSTOM_OBJECT_PERMISSION','USER_CUSTOM_DATA_ACCESS_PERMISSION','RESPONSIBILITY_ROLE_PERMISSION','RESPONSIBILITY_DATA_ACCESS_PERMISSION')) a
	          LEFT JOIN IAMX.ROLE r ON TO_CHAR(r.id) = a.role_id
	          LEFT JOIN IAMX.USER_INFO u ON u.user_id = a.user_id
	          LEFT JOIN IAMX.RESPONSIBILITY rs ON TO_CHAR(rs.id) = a.resp_id
	         GROUP BY a.table_name, a.action, TRUNC(a.changed_at, 'MI'), a.role_id, a.user_id, a.resp_id`
	where, args := f.where("ts", []string{"actor", "path", "summary"}, nil, nil)
	var total int
	if err := db.QueryRow(`SELECT COUNT(*) FROM (`+src+`)`+where, args...).Scan(&total); err != nil {
		log.Printf("activity changes count: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	args = append(args, (f.page-1)*activityPageSize, activityPageSize)
	rows, err := db.Query(`SELECT TO_CHAR(ts, 'YYYY-MM-DD"T"HH24:MI:SS'), actor, action, path, summary, ip, src FROM (`+src+`)`+where+
		fmt.Sprintf(` ORDER BY ts DESC OFFSET :%d ROWS FETCH NEXT :%d ROWS ONLY`, len(args)-1, len(args)), args...)
	if err != nil {
		log.Printf("activity changes: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()
	items := make([]fiber.Map, 0)
	for rows.Next() {
		var at, actor, action, path, summary, ip, s sql.NullString
		if err := rows.Scan(&at, &actor, &action, &path, &summary, &ip, &s); err != nil {
			continue
		}
		items = append(items, fiber.Map{"at": ns(at), "actor": ns(actor), "action": ns(action), "path": ns(path), "summary": ns(summary), "ip": ns(ip), "src": ns(s)})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"items": items, "total": total, "page": f.page, "pageSize": activityPageSize}})
}

func GetActivityMenuUsage(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}
	f := readActFilter(c)
	from := ` FROM IAMX.MENU_ACCESS_LOGS l LEFT JOIN IAMX.USER_INFO u ON u.user_id = l.user_id`
	where, args := f.where("l.created_date", []string{"u.user_name", "l.obj_name", "l.module_code", "l.domain_code"}, nil, nil)
	if c.Query("group") == "menu" {
		var total int
		if err := db.QueryRow(`SELECT COUNT(*) FROM (SELECT 1`+from+where+` GROUP BY l.obj_name, l.module_code, l.domain_code)`, args...).Scan(&total); err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
		args = append(args, (f.page-1)*activityPageSize, activityPageSize)
		rows, err := db.Query(`SELECT l.obj_name, l.module_code, l.domain_code, COUNT(*), COUNT(DISTINCT l.user_id), TO_CHAR(MAX(l.created_date), 'YYYY-MM-DD"T"HH24:MI:SS')`+from+where+
			fmt.Sprintf(` GROUP BY l.obj_name, l.module_code, l.domain_code ORDER BY 4 DESC OFFSET :%d ROWS FETCH NEXT :%d ROWS ONLY`, len(args)-1, len(args)), args...)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
		defer rows.Close()
		items := make([]fiber.Map, 0)
		for rows.Next() {
			var name, mod, dom, last sql.NullString
			var n, users int
			if err := rows.Scan(&name, &mod, &dom, &n, &users, &last); err != nil {
				continue
			}
			items = append(items, fiber.Map{"menu": ns(name), "module": ns(mod), "domain": ns(dom), "visits": n, "users": users, "last": ns(last)})
		}
		return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"items": items, "total": total, "page": f.page, "pageSize": activityPageSize}})
	}
	var total int
	if err := db.QueryRow(`SELECT COUNT(*)`+from+where, args...).Scan(&total); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	args = append(args, (f.page-1)*activityPageSize, activityPageSize)
	rows, err := db.Query(`SELECT TO_CHAR(l.created_date, 'YYYY-MM-DD"T"HH24:MI:SS'), NVL(u.user_name, l.user_id), l.obj_name, l.module_code, l.domain_code, l.url, l.ip_address`+from+where+
		fmt.Sprintf(` ORDER BY l.created_date DESC OFFSET :%d ROWS FETCH NEXT :%d ROWS ONLY`, len(args)-1, len(args)), args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()
	items := make([]fiber.Map, 0)
	for rows.Next() {
		var at, user, name, mod, dom, u, ip sql.NullString
		if err := rows.Scan(&at, &user, &name, &mod, &dom, &u, &ip); err != nil {
			continue
		}
		items = append(items, fiber.Map{"at": ns(at), "user": ns(user), "menu": ns(name), "module": ns(mod), "domain": ns(dom), "url": ns(u), "ip": ns(ip)})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"items": items, "total": total, "page": f.page, "pageSize": activityPageSize}})
}

// signins: รวม 2 แหล่งแล้วเรียงตามเวลา · ดึงแหล่งละไม่เกิน 1,000 รายการในช่วงที่กรอง
func GetActivitySignins(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}
	f := readActFilter(c)
	type ev struct {
		At, User, Result, Detail, App, Method, IP string
	}
	all := make([]ev, 0)

	where, args := f.where("created_at", []string{"actor", "ip_address"}, []string{"action IN ('LOGIN','LOGIN_FAILED','LOGOUT')"}, nil)
	rows, err := db.Query(`SELECT TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS'), actor, action, ip_address FROM IAMX.ADMIN_ACTIVITY_LOG`+where+` ORDER BY created_at DESC FETCH FIRST 1000 ROWS ONLY`, args...)
	if err == nil {
		for rows.Next() {
			var at, actor, action, ip sql.NullString
			if rows.Scan(&at, &actor, &action, &ip) == nil {
				r := "success"
				switch action.String {
				case "LOGIN_FAILED":
					r = "failed"
				case "LOGOUT":
					r = "logout"
				}
				all = append(all, ev{At: at.String, User: actor.String, Result: r, App: "IAMX console", Method: "Password", IP: ip.String})
			}
		}
		rows.Close()
	} else {
		log.Printf("activity signins (console): %v", err)
	}

	kc := fiber.Map{"enabled": false}
	if kcClient := config.NewKeycloakAdminClient(); kcClient != nil {
		enabled, err := kcClient.RealmEventsEnabled()
		if err != nil {
			kc["error"] = err.Error()
		} else {
			kc["enabled"] = enabled
		}
		if enabled {
			qv := url.Values{}
			qv.Set("max", "1000")
			for _, t := range []string{"LOGIN", "LOGIN_ERROR", "LOGOUT", "CODE_TO_TOKEN_ERROR"} {
				qv.Add("type", t)
			}
			if f.from != "" {
				qv.Set("dateFrom", f.from)
			}
			if f.to != "" {
				qv.Set("dateTo", f.to)
			}
			events, err := kcClient.GetEvents(qv)
			if err != nil {
				kc["error"] = err.Error()
			}
			q := strings.ToLower(f.q)
			for _, e := range events {
				det, _ := e["details"].(map[string]interface{})
				str := func(m map[string]interface{}, k string) string {
					if m == nil {
						return ""
					}
					if v, ok := m[k].(string); ok {
						return v
					}
					return ""
				}
				user := str(det, "username")
				ip, _ := e["ipAddress"].(string)
				if q != "" && !strings.Contains(strings.ToLower(user+" "+ip), q) {
					continue
				}
				ms, _ := e["time"].(float64)
				t := time.UnixMilli(int64(ms)).In(time.Local).Format("2006-01-02T15:04:05")
				typ, _ := e["type"].(string)
				result := "success"
				detail := ""
				switch typ {
				case "LOGOUT":
					result = "logout"
				case "LOGIN_ERROR", "CODE_TO_TOKEN_ERROR":
					result = "failed"
					detail, _ = e["error"].(string)
				}
				method := "Password"
				if idp := str(det, "identity_provider"); idp != "" {
					method = idp
				}
				app, _ := e["clientId"].(string)
				all = append(all, ev{At: t, User: user, Result: result, Detail: detail, App: app, Method: method, IP: ip})
			}
		}
	}

	if e, ok := kc["error"].(string); ok {
		// ข้อความผิดพลาดจาก Keycloak/Cloudflare อาจเป็นหน้า HTML ทั้งหน้า → แสดงสั้น ๆ พอ
		if strings.Contains(e, "<html") || strings.Contains(e, "<!DOCTYPE") {
			e = "Keycloak admin API not reachable from this server"
		}
		if r := []rune(e); len(r) > 160 {
			e = string(r[:160]) + "…"
		}
		kc["error"] = e
	}

	sort.SliceStable(all, func(i, j int) bool { return all[i].At > all[j].At })
	total := len(all)
	start := (f.page - 1) * activityPageSize
	if start > total {
		start = total
	}
	end := start + activityPageSize
	if end > total {
		end = total
	}
	items := make([]fiber.Map, 0, end-start)
	for _, e := range all[start:end] {
		items = append(items, fiber.Map{"at": e.At, "user": e.User, "result": e.Result, "detail": e.Detail, "app": e.App, "method": e.Method, "ip": e.IP})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"items": items, "total": total, "page": f.page, "pageSize": activityPageSize, "keycloak": kc}})
}

// 14/11/69: เก็บ log 1 ปีตามที่เคาะในแบบหน้า Activity · ลบทีละ 5,000 แถววันละครั้ง (ทุก pod ทำซ้ำได้ไม่เสียหาย)
// ไม่แตะ PERMISSION_AUDIT_LOG (ประวัติการแก้สิทธิ์เดิม เก็บไว้ทั้งหมด)
func StartLogRetention() {
	run := func() {
		db := core.GetDB()
		if db == nil {
			return
		}
		for _, q := range []string{
			`DELETE FROM IAMX.ADMIN_ACTIVITY_LOG WHERE CREATED_AT < ADD_MONTHS(SYSTIMESTAMP, -12) AND ROWNUM <= 5000`,
			`DELETE FROM IAMX.MENU_ACCESS_LOGS WHERE CREATED_DATE < ADD_MONTHS(SYSDATE, -12) AND ROWNUM <= 5000`,
		} {
			for i := 0; i < 200; i++ {
				res, err := db.Exec(q)
				if err != nil {
					log.Printf("log retention: %v", err)
					break
				}
				if n, _ := res.RowsAffected(); n < 5000 {
					break
				}
			}
		}
	}
	go func() {
		time.Sleep(2 * time.Minute)
		for {
			run()
			time.Sleep(24 * time.Hour)
		}
	}()
}
