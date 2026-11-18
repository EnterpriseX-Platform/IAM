package handlers

import (
	"api/core"
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
)

type RolePermissionResponse struct {
	ID                  int64    `json:"id"`
	RoleObjectMappingID int64    `json:"role_object_mapping_id"`
	Permissions         []string `json:"permissions"`
	ScopeFilter         *string  `json:"scope_filter"`
	CreatedBy           *int64   `json:"created_by"`
	UpdatedBy           *int64   `json:"updated_by"`
	CreatedAt           string   `json:"created_at"`
	UpdatedAt           string   `json:"updated_at"`
}

type PermissionWithObjectInfo struct {
	ID                  int64    `json:"id"`
	RoleObjectMappingID int64    `json:"role_object_mapping_id"`
	Permissions         []string `json:"permissions"`
	ScopeFilter         *string  `json:"scope_filter"`
	ObjectID            *int64   `json:"object_id"`
	ObjectName          *string  `json:"object_name"`
	ObjectPath          *string  `json:"object_path"`
	DomainName          *string  `json:"domain_name"`
	ApplicationName     *string  `json:"application_name"`
	ModuleName          *string  `json:"module_name"`
}

func nullStrToPtr(ns sql.NullString) *string {
	if ns.Valid {
		s := ns.String
		return &s
	}
	return nil
}

func nullInt64ToPtr(n sql.NullInt64) *int64 {
	if n.Valid {
		v := n.Int64
		return &v
	}
	return nil
}

// GET /directory/roles/:roleId/permissions
func GetPermissionsByRoleID(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	roleID := c.Params("roleId")

	// Driven from ROLE_OBJECT_MAPPING, not ROLE_OBJECT_PERMISSION: a mapping with no
	// permission row yet is still a mapping. The old INNER JOIN hid those rows, so the
	// roles screen believed the object was unmapped and POSTed a second mapping every
	// time a box was ticked — that is where the duplicate mappings came from.
	rows, err := db.Query(`SELECT
			NVL(rop.id, 0), rom.id,
			NVL(rop.permission, '[]'),
			rop.scope_filter,
			rom.object_id,
			o.name, o.path, d.name, a.name, m.name
		FROM IAMX.ROLE_OBJECT_MAPPING rom
		LEFT JOIN IAMX.ROLE_OBJECT_PERMISSION rop ON rop.role_object_mapping_id = rom.id
		LEFT JOIN IAMX.OBJECT o      ON rom.object_id      = o.id
		LEFT JOIN IAMX.DOMAIN d      ON rom.domain_id      = d.id
		LEFT JOIN IAMX.APPLICATION a ON rom.application_id = a.id
		LEFT JOIN IAMX.MODULE m      ON rom.module_id      = m.id
		WHERE rom.role_id = :1
		ORDER BY d.name, a.name, m.sort_order, m.name, o.sort_order, o.name`, roleID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch permissions",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	out := []PermissionWithObjectInfo{}
	for rows.Next() {
		var p PermissionWithObjectInfo
		var scope, objName, objPath, domName, appName, modName sql.NullString
		var objectID sql.NullInt64
		var permJSON string
		if err := rows.Scan(
			&p.ID, &p.RoleObjectMappingID,
			&permJSON,
			&scope,
			&objectID,
			&objName, &objPath, &domName, &appName, &modName,
		); err != nil {
			continue
		}
		p.Permissions = parsePermissionJSON(permJSON)
		p.ScopeFilter = nullStrToPtr(scope)
		p.ObjectID = nullInt64ToPtr(objectID)
		p.ObjectName = nullStrToPtr(objName)
		p.ObjectPath = nullStrToPtr(objPath)
		p.DomainName = nullStrToPtr(domName)
		p.ApplicationName = nullStrToPtr(appName)
		p.ModuleName = nullStrToPtr(modName)
		out = append(out, p)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    out,
	})
}

type CreatePermissionRequest struct {
	RoleObjectMappingID int64    `json:"role_object_mapping_id"`
	Permissions         []string `json:"permissions"`
	ScopeFilter         *string  `json:"scope_filter"`
	CreatedBy           *int64   `json:"created_by"`
}

// POST /directory/role-object-permissions
func CreateRoleObjectPermission(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req CreatePermissionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var newID int64
	_, err := db.Exec(
		`INSERT INTO IAMX.ROLE_OBJECT_PERMISSION
		 (role_object_mapping_id, permission, scope_filter, created_by, updated_by, created_at, updated_at)
		 VALUES (:1, :2, :3, :4, :5, SYSTIMESTAMP, SYSTIMESTAMP)
		 RETURNING id INTO :out`,
		req.RoleObjectMappingID, toPermissionJSON(req.Permissions), req.ScopeFilter, req.CreatedBy, req.CreatedBy,
		sql.Named("out", sql.Out{Dest: &newID}),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create permission",
			"message": err.Error(),
		})
	}

	resp, err := loadRolePermission(db, newID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to load created permission",
			"message": err.Error(),
		})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "Permission created successfully",
		"data":    resp,
	})
}

type UpdatePermissionRequest struct {
	Permissions []string `json:"permissions"`
	ScopeFilter *string  `json:"scope_filter"`
	UpdatedBy   *int64   `json:"updated_by"`
}

// PUT /directory/role-object-permissions/:id
func UpdateRoleObjectPermission(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	var req UpdatePermissionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	res, err := db.Exec(
		`UPDATE IAMX.ROLE_OBJECT_PERMISSION
		 SET permission = :1, scope_filter = :2, updated_by = :3, updated_at = SYSTIMESTAMP
		 WHERE id = :4`,
		toPermissionJSON(req.Permissions), req.ScopeFilter, req.UpdatedBy, id,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update permission",
			"message": err.Error(),
		})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Permission not found"})
	}

	idInt := int64(0)
	_ = db.QueryRow(`SELECT id FROM IAMX.ROLE_OBJECT_PERMISSION WHERE id = :1`, id).Scan(&idInt)
	resp, err := loadRolePermission(db, idInt)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to load updated permission",
			"message": err.Error(),
		})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"message": "Permission updated successfully",
		"data":    resp,
	})
}

func loadRolePermission(db *sql.DB, id int64) (RolePermissionResponse, error) {
	var resp RolePermissionResponse
	var permJSON string
	var scope sql.NullString
	var createdBy, updatedBy sql.NullInt64
	var createdAt, updatedAt time.Time
	err := db.QueryRow(`SELECT id, role_object_mapping_id,
				NVL(permission, '[]'),
				scope_filter, created_by, updated_by, created_at, updated_at
			FROM IAMX.ROLE_OBJECT_PERMISSION WHERE id = :1`, id).Scan(
		&resp.ID, &resp.RoleObjectMappingID,
		&permJSON,
		&scope, &createdBy, &updatedBy, &createdAt, &updatedAt,
	)
	if err != nil {
		return resp, err
	}
	resp.Permissions = parsePermissionJSON(permJSON)
	resp.ScopeFilter = nullStrToPtr(scope)
	resp.CreatedBy = nullInt64ToPtr(createdBy)
	resp.UpdatedBy = nullInt64ToPtr(updatedBy)
	resp.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z")
	resp.UpdatedAt = updatedAt.Format("2006-01-02T15:04:05Z")
	return resp, nil
}
