package handlers

// ประเภทผู้ใช้ตั้งค่าได้ที่ System settings › User types · รหัสเปลี่ยนไม่ได้ (token/ระบบอื่นใช้)

import (
	"api/core"
	"api/core/usertypes"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
)

var userTypeCodeRe = regexp.MustCompile(`^[a-z0-9_-]{1,40}$`)

func userTypeUsage(code string) int64 {
	var n int64
	core.GetDB().QueryRow(`SELECT
		(SELECT COUNT(*) FROM IAMX.USER_INFO WHERE USER_TYPE = :1) +
		(SELECT COUNT(*) FROM IAMX.ROLE WHERE ROLE_TYPE = :2) +
		(SELECT COUNT(*) FROM IAMX.DOMAIN WHERE ','||MENU_TYPE||',' LIKE '%,'||:3||',%') FROM DUAL`, code, code, code).Scan(&n)
	return n
}

func cleanAliases(s string) string {
	parts := []string{}
	for _, a := range strings.Split(strings.ToLower(s), ",") {
		if a = strings.TrimSpace(a); userTypeCodeRe.MatchString(a) {
			parts = append(parts, a)
		}
	}
	return strings.Join(parts, ",")
}

// GET /admin/user-types
func ListUserTypes(c *fiber.Ctx) error {
	usertypes.Clear()
	out := []fiber.Map{}
	for _, t := range usertypes.All() {
		out = append(out, fiber.Map{"code": t.Code, "name": t.Name, "is_staff": t.IsStaff, "aliases": t.Aliases,
			"sort_order": t.Sort, "is_active": t.IsActive, "used": userTypeUsage(t.Code)})
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

// POST /admin/user-types {code, name, is_staff, aliases}
func CreateUserType(c *fiber.Ctx) error {
	var in struct {
		Code    string `json:"code"`
		Name    string `json:"name"`
		IsStaff bool   `json:"is_staff"`
		Aliases string `json:"aliases"`
	}
	if c.BodyParser(&in) != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid data"})
	}
	code, name := strings.ToLower(strings.TrimSpace(in.Code)), strings.TrimSpace(in.Name)
	if !userTypeCodeRe.MatchString(code) || name == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Code (a-z, 0-9, _ -) and name are required"})
	}
	db := core.GetDB()
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM IAMX.USER_TYPE WHERE CODE = :1 OR ','||ALIASES||',' LIKE '%,'||:2||',%'`, code, code).Scan(&n)
	if n > 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Code already used, choose another"})
	}
	staff := 0
	if in.IsStaff {
		staff = 1
	}
	if _, err := db.Exec(`INSERT INTO IAMX.USER_TYPE (CODE, NAME, IS_STAFF, ALIASES, SORT_ORDER)
		VALUES (:1, :2, :3, NULLIF(:4,''), (SELECT NVL(MAX(SORT_ORDER), 0) + 10 FROM IAMX.USER_TYPE))`, code, name, staff, cleanAliases(in.Aliases)); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	usertypes.Clear()
	return c.JSON(fiber.Map{"success": true})
}

// POST /admin/user-types/:code {name, is_staff, aliases, is_active}
func UpdateUserType(c *fiber.Ctx) error {
	code := c.Params("code")
	var in struct {
		Name     string `json:"name"`
		IsStaff  bool   `json:"is_staff"`
		Aliases  string `json:"aliases"`
		IsActive bool   `json:"is_active"`
	}
	if c.BodyParser(&in) != nil || strings.TrimSpace(in.Name) == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Name is required"})
	}
	// ต้องเหลือประเภทบุคลากรที่เปิดใช้อย่างน้อย 1 และประเภทที่เปิดใช้อย่างน้อย 1
	staffLeft, activeLeft := 0, 0
	for _, t := range usertypes.All() {
		st, ac := t.IsStaff, t.IsActive
		if t.Code == code {
			st, ac = in.IsStaff, in.IsActive
		}
		if ac {
			activeLeft++
			if st {
				staffLeft++
			}
		}
	}
	if staffLeft == 0 || activeLeft == 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "At least one active internal (staff) type is required"})
	}
	staff, active := 0, 0
	if in.IsStaff {
		staff = 1
	}
	if in.IsActive {
		active = 1
	}
	res, err := core.GetDB().Exec(`UPDATE IAMX.USER_TYPE SET NAME = :1, IS_STAFF = :2, ALIASES = NULLIF(:3,''), IS_ACTIVE = :4, UPDATED_AT = SYSTIMESTAMP WHERE CODE = :5`,
		strings.TrimSpace(in.Name), staff, cleanAliases(in.Aliases), active, code)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Not found"})
	}
	usertypes.Clear()
	return c.JSON(fiber.Map{"success": true})
}

// POST /admin/user-types/reorder {codes:[...]}
func ReorderUserTypes(c *fiber.Ctx) error {
	var in struct {
		Codes []string `json:"codes"`
	}
	if c.BodyParser(&in) != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid data"})
	}
	db := core.GetDB()
	for i, code := range in.Codes {
		db.Exec(`UPDATE IAMX.USER_TYPE SET SORT_ORDER = :1 WHERE CODE = :2`, (i+1)*10, code)
	}
	usertypes.Clear()
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /admin/user-types/:code — ลบได้เมื่อไม่มีผู้ใช้/บทบาท/ระบบงานใช้
func DeleteUserType(c *fiber.Ctx) error {
	code := c.Params("code")
	if userTypeUsage(code) > 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "This type is in use and can't be deleted"})
	}
	if _, err := core.GetDB().Exec(`DELETE FROM IAMX.USER_TYPE WHERE CODE = :1`, code); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	usertypes.Clear()
	return c.JSON(fiber.Map{"success": true})
}
