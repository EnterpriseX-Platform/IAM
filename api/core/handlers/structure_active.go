package handlers

import (
	"github.com/gofiber/fiber/v2"

	"api/core"
)

// ปิดแล้วผลเหมือนลบ (V_USER_EFFECTIVE_PERMISSION กรอง is_active ทุกระดับอยู่แล้ว ลูกจึงปิดตามระดับบน)
// แต่ข้อมูล ลำดับ และสิทธิ์ที่ผูกไว้ยังอยู่ครบ เปิดกลับได้

var structureTables = map[string]string{"domain": "IAMX.DOMAIN", "application": "IAMX.APPLICATION", "module": "IAMX.MODULE", "object": "IAMX.OBJECT"}

// countStructureChildren นับรายการลูกทุกระดับใต้รายการนี้ (ใช้ในกล่องยืนยัน)
func countStructureChildren(typ string, id string) int {
	db := core.GetDB()
	var n int
	var q string
	switch typ {
	case "domain":
		q = `SELECT (SELECT COUNT(*) FROM IAMX.APPLICATION a WHERE a.domain_id = :1 AND a.is_active = 1)
		     + (SELECT COUNT(*) FROM IAMX.MODULE m JOIN IAMX.APPLICATION a ON a.id = m.application_id WHERE a.domain_id = :2 AND m.is_active = 1)
		     + (SELECT COUNT(*) FROM IAMX.OBJECT o JOIN IAMX.MODULE m ON m.id = o.module_id JOIN IAMX.APPLICATION a ON a.id = m.application_id WHERE a.domain_id = :3 AND o.is_active = 1) FROM dual`
		db.QueryRow(q, id, id, id).Scan(&n)
	case "application":
		q = `SELECT (SELECT COUNT(*) FROM IAMX.MODULE m WHERE m.application_id = :1 AND m.is_active = 1)
		     + (SELECT COUNT(*) FROM IAMX.OBJECT o JOIN IAMX.MODULE m ON m.id = o.module_id WHERE m.application_id = :2 AND o.is_active = 1) FROM dual`
		db.QueryRow(q, id, id).Scan(&n)
	case "module":
		db.QueryRow(`SELECT COUNT(*) FROM IAMX.OBJECT WHERE module_id = :1 AND is_active = 1`, id).Scan(&n)
	case "object":
		db.QueryRow(`SELECT COUNT(*) - 1 FROM IAMX.OBJECT START WITH id = :1 CONNECT BY PRIOR id = parent_id AND is_active = 1`, id).Scan(&n)
	}
	return n
}

// GET /directory/structure/:type/:id/children-count
func GetStructureChildrenCount(c *fiber.Ctx) error {
	typ := c.Params("type")
	if _, ok := structureTables[typ]; !ok {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "ประเภทไม่ถูกต้อง"})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"children": countStructureChildren(typ, c.Params("id"))}})
}

// PUT /directory/structure/:type/:id/active  body {is_active: 0|1}
func SetStructureActive(c *fiber.Ctx) error {
	typ := c.Params("type")
	table, ok := structureTables[typ]
	if !ok {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "ประเภทไม่ถูกต้อง"})
	}
	var in struct {
		IsActive int `json:"is_active"`
	}
	if err := c.BodyParser(&in); err != nil || (in.IsActive != 0 && in.IsActive != 1) {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "is_active ต้องเป็น 0 หรือ 1"})
	}
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}
	res, err := db.Exec(`UPDATE `+table+` SET is_active = :1 WHERE id = :2`, in.IsActive, c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "ไม่พบรายการ"})
	}
	return c.JSON(fiber.Map{"success": true})
}
