package handlers

// 14/11/69: "ใครเข้าเมนูนี้ได้" — ค้นย้อนจากเมนู (อ่านอย่างเดียว)
// ได้จากบทบาท (สิทธิ์ VIEW + ผูกบทบาทอยู่) + ข้อยกเว้นรายคนที่ให้เพิ่ม − ข้อยกเว้นที่ซ่อนเมนู · เฉพาะผู้ใช้ที่ใช้งานอยู่

import (
	"api/core"
	"database/sql"
	"log"

	"github.com/gofiber/fiber/v2"
)

func GetMenuAccess(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}
	id := c.Params("id")
	rows, err := db.Query(`
		WITH by_role AS (
		  SELECT urm.user_id, r.code role_code
		    FROM IAMX.ROLE_OBJECT_MAPPING m
		    JOIN IAMX.ROLE_OBJECT_PERMISSION p ON p.role_object_mapping_id = m.id
		    JOIN IAMX.ROLE r ON r.id = m.role_id
		    JOIN IAMX.USER_ROLE_MAPPING urm ON urm.role_id = r.id AND urm.is_active = 1
		   WHERE TO_CHAR(m.object_id) = :1 AND NVL(m.is_active, 1) = 1 AND NVL(r.is_active, 1) = 1
		     AND p.permission LIKE '%VIEW%'),
		cust AS (
		  SELECT cm.user_id, MAX(CASE WHEN cp.permission LIKE '%VIEW%' THEN 1 ELSE 0 END) grants
		    FROM IAMX.USER_CUSTOM_OBJECT_MAPPING cm
		    LEFT JOIN IAMX.USER_CUSTOM_OBJECT_PERMISSION cp ON cp.user_custom_object_mapping_id = cm.id
		   WHERE TO_CHAR(cm.object_id) = :1 AND NVL(cm.is_active, 1) = 1
		   GROUP BY cm.user_id)
		SELECT u.user_id, u.user_name, TRIM(u.first_name || ' ' || u.last_name),
		       (SELECT LISTAGG(DISTINCT b.role_code, ', ') WITHIN GROUP (ORDER BY b.role_code) FROM by_role b WHERE b.user_id = u.user_id),
		       NVL((SELECT x.grants FROM cust x WHERE x.user_id = u.user_id), -1)
		  FROM IAMX.USER_INFO u
		 WHERE u.status = 'active'
		   AND (u.user_id IN (SELECT user_id FROM by_role) OR u.user_id IN (SELECT user_id FROM cust WHERE grants = 1))
		   AND u.user_id NOT IN (SELECT user_id FROM cust WHERE grants = 0)
		 ORDER BY u.user_name`, id)
	if err != nil {
		log.Printf("GetMenuAccess: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()
	items := make([]fiber.Map, 0)
	for rows.Next() {
		var uid, uname, name, roles sql.NullString
		var cust int
		if rows.Scan(&uid, &uname, &name, &roles, &cust) != nil {
			continue
		}
		items = append(items, fiber.Map{"user_id": uid.String, "user_name": uname.String, "name": name.String, "roles": roles.String, "exception": cust == 1})
	}
	var hidden int
	_ = db.QueryRow(`SELECT COUNT(DISTINCT cm.user_id) FROM IAMX.USER_CUSTOM_OBJECT_MAPPING cm
		LEFT JOIN IAMX.USER_CUSTOM_OBJECT_PERMISSION cp ON cp.user_custom_object_mapping_id = cm.id
		WHERE TO_CHAR(cm.object_id) = :1 AND NVL(cm.is_active, 1) = 1 AND NVL(cp.permission, '[]') NOT LIKE '%VIEW%'`, id).Scan(&hidden)
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"items": items, "hidden": hidden}})
}
