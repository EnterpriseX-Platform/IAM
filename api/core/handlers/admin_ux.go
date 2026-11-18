package handlers

import (
	"api/core"
	"database/sql"
	"log"

	"github.com/gofiber/fiber/v2"
)

// ไม่แตะ endpoint เดิมที่ระบบอื่นเรียกใช้

// GET /directory/user-role-summary — role ของผู้ใช้ทุกคน (ใช้แสดงคอลัมน์/ตัวกรอง role ในหน้าผู้ใช้)
// คืน { user_id: [{code, name}] }
func GetUserRoleSummary(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}
	rows, err := db.Query(`
		SELECT m.USER_ID, r.CODE, r.NAME
		  FROM IAMX.USER_ROLE_MAPPING m
		  JOIN IAMX.ROLE r ON r.ID = m.ROLE_ID
		 WHERE m.IS_ACTIVE = 1 AND NVL(r.IS_ACTIVE, 1) = 1
		 ORDER BY m.USER_ID, r.CODE`)
	if err != nil {
		log.Printf("GetUserRoleSummary error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()
	out := map[string][]fiber.Map{}
	for rows.Next() {
		var uid, code string
		var name sql.NullString
		if err := rows.Scan(&uid, &code, &name); err != nil {
			continue
		}
		out[uid] = append(out[uid], fiber.Map{"code": code, "name": name.String})
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

// GET /directory/effective-permissions?user_id=xxx — เมนูที่ผู้ใช้เห็นจริง และได้มาจากไหน (role / เฉพาะคน)
// อ่านจาก IAMX.V_USER_EFFECTIVE_PERMISSION (view เดียวกับที่ระบบใช้ตัดสินสิทธิ์)
func GetUserEffectivePermissions(c *fiber.Ctx) error {
	userID := c.Query("user_id")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "user_id is required"})
	}
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}
	rows, err := db.Query(`
		SELECT v.OBJECT_ID, v.OBJECT_CODE, o.NAME, v.APPLICATION_CODE, v.MODULE_CODE,
		       v.PERMISSION, v.PERMISSION_SOURCE, v.ROLE_CODE
		  FROM IAMX.V_USER_EFFECTIVE_PERMISSION v
		  LEFT JOIN IAMX.OBJECT o ON o.ID = v.OBJECT_ID
		 WHERE v.USER_ID = :1
		 ORDER BY v.APPLICATION_CODE, v.MODULE_CODE, v.OBJECT_CODE, v.PRIORITY`, userID)
	if err != nil {
		log.Printf("GetUserEffectivePermissions error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()
	var out []fiber.Map
	for rows.Next() {
		var objID sql.NullInt64
		var code, name, app, mod, perm, src, role sql.NullString
		if err := rows.Scan(&objID, &code, &name, &app, &mod, &perm, &src, &role); err != nil {
			continue
		}
		out = append(out, fiber.Map{
			"object_id": objID.Int64, "object_code": code.String, "object_name": name.String,
			"application_code": app.String, "module_code": mod.String,
			"permission": perm.String, "source": src.String, "role_code": role.String,
		})
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}
