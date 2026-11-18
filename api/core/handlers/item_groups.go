package handlers

// กลุ่มของบทบาท (KIND=ROLE) และความรับผิดชอบ (KIND=RESP) ตั้งค่าได้ที่ System settings › Groups

import (
	"api/core"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
)

var groupCodeRe = regexp.MustCompile(`^[A-Z0-9_-]{1,40}$`)

func groupKind(k string) string {
	k = strings.ToUpper(k)
	if k == "ROLE" || k == "RESP" {
		return k
	}
	return ""
}

func usageTable(kind string) string {
	if kind == "ROLE" {
		return "IAMX.ROLE"
	}
	return "IAMX.RESPONSIBILITY"
}

// GET /admin/item-groups?kind=ROLE|RESP
func ListItemGroups(c *fiber.Ctx) error {
	kind := groupKind(c.Query("kind"))
	if kind == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "kind must be ROLE or RESP"})
	}
	rows, err := core.GetDB().Query(`SELECT g.ID, g.CODE, g.NAME, g.SORT_ORDER, g.IS_ACTIVE,
		  (SELECT COUNT(*) FROM `+usageTable(kind)+` t WHERE t.GROUP_CODE = g.CODE)
		  FROM IAMX.ITEM_GROUP g WHERE g.KIND = :1 ORDER BY g.SORT_ORDER, g.NAME`, kind)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id, sort, active, used int64
		var code, name string
		if rows.Scan(&id, &code, &name, &sort, &active, &used) == nil {
			out = append(out, fiber.Map{"id": id, "code": code, "name": name, "sort_order": sort, "is_active": active, "used": used})
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

// POST /admin/item-groups {kind, code, name}
func CreateItemGroup(c *fiber.Ctx) error {
	var in struct{ Kind, Code, Name string }
	if c.BodyParser(&in) != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid data"})
	}
	kind, code, name := groupKind(in.Kind), strings.ToUpper(strings.TrimSpace(in.Code)), strings.TrimSpace(in.Name)
	if kind == "" || !groupCodeRe.MatchString(code) || name == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Code (A-Z, 0-9, _ -) and name are required"})
	}
	db := core.GetDB()
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM IAMX.ITEM_GROUP WHERE KIND = :1 AND CODE = :2`, kind, code).Scan(&n)
	if n > 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Code already used, choose another"})
	}
	if _, err := db.Exec(`INSERT INTO IAMX.ITEM_GROUP (KIND, CODE, NAME, SORT_ORDER)
		VALUES (:1, :2, :3, (SELECT NVL(MAX(SORT_ORDER), 0) + 10 FROM IAMX.ITEM_GROUP WHERE KIND = :4))`, kind, code, name, kind); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// POST /admin/item-groups/:id {name, is_active}
func UpdateItemGroup(c *fiber.Ctx) error {
	var in struct {
		Name     string `json:"name"`
		IsActive *int   `json:"is_active"`
	}
	if c.BodyParser(&in) != nil || strings.TrimSpace(in.Name) == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Name is required"})
	}
	active := 1
	if in.IsActive != nil && *in.IsActive == 0 {
		active = 0
	}
	res, err := core.GetDB().Exec(`UPDATE IAMX.ITEM_GROUP SET NAME = :1, IS_ACTIVE = :2, UPDATED_AT = SYSTIMESTAMP WHERE ID = :3`, strings.TrimSpace(in.Name), active, c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Item not found"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /admin/item-groups/:id — ลบได้เมื่อไม่มีบทบาท/ความรับผิดชอบใช้อยู่
func DeleteItemGroup(c *fiber.Ctx) error {
	db := core.GetDB()
	var kind, code string
	if err := db.QueryRow(`SELECT KIND, CODE FROM IAMX.ITEM_GROUP WHERE ID = :1`, c.Params("id")).Scan(&kind, &code); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Item not found"})
	}
	var used int
	db.QueryRow(`SELECT COUNT(*) FROM `+usageTable(kind)+` WHERE GROUP_CODE = :1`, code).Scan(&used)
	if used > 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "This group is in use. Move its items to another group first"})
	}
	if _, err := db.Exec(`DELETE FROM IAMX.ITEM_GROUP WHERE ID = :1`, c.Params("id")); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// POST /admin/item-groups/reorder {ids: [..]} — เรียงตามลำดับที่ส่งมา
func ReorderItemGroups(c *fiber.Ctx) error {
	var in struct {
		IDs []int64 `json:"ids"`
	}
	if c.BodyParser(&in) != nil || len(in.IDs) == 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid data"})
	}
	db := core.GetDB()
	for i, id := range in.IDs {
		if _, err := db.Exec(`UPDATE IAMX.ITEM_GROUP SET SORT_ORDER = :1, UPDATED_AT = SYSTIMESTAMP WHERE ID = :2`, (i+1)*10, id); err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
	}
	return c.JSON(fiber.Map{"success": true})
}

// POST /admin/roles/:id/group · /admin/resp-ux/:id/group {group_code} ("" = ไม่มีกลุ่ม)
func setGroup(c *fiber.Ctx, kind string) error {
	var in struct {
		GroupCode string `json:"group_code"`
	}
	if c.BodyParser(&in) != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Invalid data"})
	}
	db := core.GetDB()
	code := strings.ToUpper(strings.TrimSpace(in.GroupCode))
	if code != "" {
		var n int
		db.QueryRow(`SELECT COUNT(*) FROM IAMX.ITEM_GROUP WHERE KIND = :1 AND CODE = :2`, kind, code).Scan(&n)
		if n == 0 {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "Unknown group"})
		}
	}
	var arg interface{} = code
	if code == "" {
		arg = nil
	}
	if _, err := db.Exec(`UPDATE `+usageTable(kind)+` SET GROUP_CODE = :1 WHERE TO_CHAR(ID) = :2`, arg, c.Params("id")); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func SetRoleGroup(c *fiber.Ctx) error { return setGroup(c, "ROLE") }
func SetRespGroup(c *fiber.Ctx) error { return setGroup(c, "RESP") }
