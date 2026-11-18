package handlers

import (
	"api/core"
	"log"

	"github.com/gofiber/fiber/v2"
)

// GET /directory/permission-types?group=OBJECT|DATA_ACCESS
func GetPermissionTypes(c *fiber.Ctx) error {
	group := c.Query("group")

	query := `
		SELECT id, permission_type, permission_type_group, description, is_active
		FROM permission_type
		WHERE is_active = 1
	`
	args := []interface{}{}

	if group != "" {
		query += ` AND permission_type_group = :1`
		args = append(args, group)
	}

	query += ` ORDER BY permission_type_group, permission_type`

	rows, err := core.GetDB().Query(query, args...)
	if err != nil {
		log.Printf("GetPermissionTypes error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var id int
		var permType, permGroup, description string
		var isActive int
		if err := rows.Scan(&id, &permType, &permGroup, &description, &isActive); err != nil {
			continue
		}
		results = append(results, map[string]interface{}{
			"id":                    id,
			"permission_type":       permType,
			"permission_type_group": permGroup,
			"description":           description,
			"is_active":             isActive,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    results,
	})
}

// GET /directory/permission-types/groups
func GetPermissionTypeGroups(c *fiber.Ctx) error {
	rows, err := core.GetDB().Query(`
		SELECT DISTINCT permission_type_group
		FROM permission_type
		WHERE is_active = 1
		ORDER BY permission_type_group
	`)
	if err != nil {
		log.Printf("GetPermissionTypeGroups error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}
	defer rows.Close()

	var results []string
	for rows.Next() {
		var group string
		if err := rows.Scan(&group); err != nil {
			continue
		}
		results = append(results, group)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    results,
	})
}

type permissionTypeRequest struct {
	PermissionType      string `json:"permission_type"`
	PermissionTypeGroup string `json:"permission_type_group"`
	Description         string `json:"description"`
	IsActive            *int   `json:"is_active"`
}

// POST /directory/permission-types
func CreatePermissionType(c *fiber.Ctx) error {
	var req permissionTypeRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "invalid request body",
		})
	}
	if req.PermissionType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "permission_type is required",
		})
	}
	active := 1
	if req.IsActive != nil {
		active = *req.IsActive
	}

	var id int64
	_, err := core.GetDB().Exec(`
		INSERT INTO permission_type (permission_type, permission_type_group, description, is_active)
		VALUES (:1, :2, :3, :4)
		RETURNING id INTO :5
	`, req.PermissionType, req.PermissionTypeGroup, req.Description, active, &id)
	if err != nil {
		log.Printf("CreatePermissionType error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"id":      id,
	})
}

// PUT /directory/permission-types/:id
func UpdatePermissionType(c *fiber.Ctx) error {
	id := c.Params("id")
	var req permissionTypeRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "invalid request body",
		})
	}
	active := 1
	if req.IsActive != nil {
		active = *req.IsActive
	}

	res, err := core.GetDB().Exec(`
		UPDATE permission_type
		   SET permission_type = :1,
		       permission_type_group = :2,
		       description = :3,
		       is_active = :4,
		       updated_at = SYSTIMESTAMP
		 WHERE id = :5
	`, req.PermissionType, req.PermissionTypeGroup, req.Description, active, id)
	if err != nil {
		log.Printf("UpdatePermissionType error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "permission type not found",
		})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DELETE /directory/permission-types/:id  (soft delete)
func DeletePermissionType(c *fiber.Ctx) error {
	id := c.Params("id")
	res, err := core.GetDB().Exec(`
		UPDATE permission_type
		   SET is_active = 0, updated_at = SYSTIMESTAMP
		 WHERE id = :1
	`, id)
	if err != nil {
		log.Printf("DeletePermissionType error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "permission type not found",
		})
	}
	return c.JSON(fiber.Map{"success": true})
}
