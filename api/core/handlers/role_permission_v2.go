package handlers

import (
	"api/core"
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
)

// RolePermissionV2 struct for permission format
type RolePermissionV2 struct {
	ID                  int64          `json:"id"`
	RoleObjectMappingID int64          `json:"role_object_mapping_id"`
	Permissions         []string       `json:"permissions"`
	ScopeFilter         sql.NullString `json:"scope_filter"`
	CreatedBy           sql.NullInt64  `json:"created_by"`
	UpdatedBy           sql.NullInt64  `json:"updated_by"`
	CreatedAt           time.Time      `json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
}

// RolePermissionV2Response struct for JSON response
type RolePermissionV2Response struct {
	ID                  int64    `json:"id"`
	RoleObjectMappingID int64    `json:"role_object_mapping_id"`
	Permissions         []string `json:"permissions"`
	ScopeFilter         *string  `json:"scope_filter"`
	CreatedBy           *int64   `json:"created_by"`
	UpdatedBy           *int64   `json:"updated_by"`
	CreatedAt           string   `json:"created_at"`
	UpdatedAt           string   `json:"updated_at"`
}

// PermissionWithObjectInfoV2 struct for role permissions list
type PermissionWithObjectInfoV2 struct {
	ID                  int64    `json:"id"`
	RoleObjectMappingID int64    `json:"role_object_mapping_id"`
	Permissions         []string `json:"permissions"`
	ScopeFilter         *string  `json:"scope_filter"`
	ObjectName          *string  `json:"object_name"`
	ObjectPath          *string  `json:"object_path"`
	DomainName          *string  `json:"domain_name"`
	ApplicationName     *string  `json:"application_name"`
	ModuleName          *string  `json:"module_name"`
}

func (p *RolePermissionV2) ToResponse() RolePermissionV2Response {
	resp := RolePermissionV2Response{
		ID:                  p.ID,
		RoleObjectMappingID: p.RoleObjectMappingID,
		Permissions:         p.Permissions,
		CreatedAt:           p.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:           p.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if p.ScopeFilter.Valid {
		resp.ScopeFilter = &p.ScopeFilter.String
	}
	if p.CreatedBy.Valid {
		resp.CreatedBy = &p.CreatedBy.Int64
	}
	if p.UpdatedBy.Valid {
		resp.UpdatedBy = &p.UpdatedBy.Int64
	}
	return resp
}

// GetPermissionsV2ByRoleID returns all permissions with object info for a role.
func GetPermissionsV2ByRoleID(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	roleID := c.Params("roleId")

	query := `SELECT rop.id, rop.role_object_mapping_id,
			  NVL(rop.permission,'[]'), rop.scope_filter,
			  o.name, o.path, d.name, a.name, m.name
			  FROM IAMX.ROLE_OBJECT_PERMISSION rop
			  INNER JOIN IAMX.ROLE_OBJECT_MAPPING rom ON rop.role_object_mapping_id = rom.id
			  LEFT JOIN IAMX.OBJECT o ON rom.object_id = o.id
			  LEFT JOIN IAMX.DOMAIN d ON rom.domain_id = d.id
			  LEFT JOIN IAMX.APPLICATION a ON rom.application_id = a.id
			  LEFT JOIN IAMX.MODULE m ON rom.module_id = m.id
			  WHERE rom.role_id = :1
			  ORDER BY d.name, a.name, m.sort_order, m.name, o.sort_order, o.name`

	rows, err := db.Query(query, roleID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch permissions",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	permissions := []PermissionWithObjectInfoV2{}
	for rows.Next() {
		var p PermissionWithObjectInfoV2
		var permJSON string
		err := rows.Scan(
			&p.ID, &p.RoleObjectMappingID,
			&permJSON, &p.ScopeFilter,
			&p.ObjectName, &p.ObjectPath, &p.DomainName, &p.ApplicationName, &p.ModuleName,
		)
		if err != nil {
			continue
		}
		p.Permissions = parsePermissionJSON(permJSON)
		permissions = append(permissions, p)
	}

	return c.JSON(fiber.Map{"success": true, "data": permissions})
}

// CreatePermissionV2Request struct
type CreatePermissionV2Request struct {
	RoleObjectMappingID int64    `json:"role_object_mapping_id"`
	Permissions         []string `json:"permissions"`
	ScopeFilter         *string  `json:"scope_filter"`
	CreatedBy           *int64   `json:"created_by"`
}

// CreateRoleObjectPermissionV2 creates a new permission record.
func CreateRoleObjectPermissionV2(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req CreatePermissionV2Request
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

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "Permission created successfully",
		"data": fiber.Map{
			"id":                     newID,
			"role_object_mapping_id": req.RoleObjectMappingID,
			"permissions":            req.Permissions,
		},
	})
}

// UpdatePermissionV2Request struct
type UpdatePermissionV2Request struct {
	Permissions []string `json:"permissions"`
	ScopeFilter *string  `json:"scope_filter"`
	UpdatedBy   *int64   `json:"updated_by"`
}

// UpdateRoleObjectPermissionV2 updates a permission record.
func UpdateRoleObjectPermissionV2(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	var req UpdatePermissionV2Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	result, err := db.Exec(
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

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Permission not found"})
	}

	return c.JSON(fiber.Map{
		"success":     true,
		"message":     "Permission updated successfully",
		"permissions": req.Permissions,
	})
}

// TogglePermissionRequest struct for toggling a single permission
type TogglePermissionRequest struct {
	Permission string `json:"permission"`
	Enabled    bool   `json:"enabled"`
	UpdatedBy  *int64 `json:"updated_by"`
}

// SetRoleObjectPermissionsRequest replaces entire permission list for a (role, object) pair.
type SetRoleObjectPermissionsRequest struct {
	Permissions []string `json:"permissions"`
	UpdatedBy   *int64   `json:"updated_by"`
}

// SetRoleObjectPermissions upserts mapping + replaces full permission array in one call.
// POST /admin/roles/:roleId/objects/:objectId/set-permissions
func SetRoleObjectPermissions(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	roleID := c.Params("roleId")
	objectID := c.Params("objectId")
	if roleID == "" || objectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "roleId and objectId required"})
	}

	var req SetRoleObjectPermissionsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Permissions == nil {
		req.Permissions = []string{}
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "tx begin failed", "message": err.Error()})
	}
	defer tx.Rollback()

	// Find existing mapping
	var mappingID int64
	err = tx.QueryRow(
		`SELECT id FROM IAMX.ROLE_OBJECT_MAPPING WHERE role_id = :1 AND object_id = :2`,
		roleID, objectID,
	).Scan(&mappingID)

	if err == sql.ErrNoRows {
		// Insert new mapping
		_, err = tx.Exec(
			`INSERT INTO IAMX.ROLE_OBJECT_MAPPING
			 (role_id, object_id, effective_date, is_active, created_at, updated_at)
			 VALUES (:1, :2, SYSDATE, 1, SYSTIMESTAMP, SYSTIMESTAMP)
			 RETURNING id INTO :out`,
			roleID, objectID, sql.Named("out", sql.Out{Dest: &mappingID}),
		)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create mapping", "message": err.Error()})
		}
	} else if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to find mapping", "message": err.Error()})
	}

	permJSON := toPermissionJSON(req.Permissions)

	// Upsert permission row
	var existingPermID int64
	permErr := tx.QueryRow(
		`SELECT id FROM IAMX.ROLE_OBJECT_PERMISSION WHERE role_object_mapping_id = :1`,
		mappingID,
	).Scan(&existingPermID)

	if permErr == sql.ErrNoRows {
		_, err = tx.Exec(
			`INSERT INTO IAMX.ROLE_OBJECT_PERMISSION
			 (role_object_mapping_id, permission, created_by, updated_by, created_at, updated_at)
			 VALUES (:1, :2, :3, :3, SYSTIMESTAMP, SYSTIMESTAMP)`,
			mappingID, permJSON, req.UpdatedBy,
		)
	} else if permErr == nil {
		_, err = tx.Exec(
			`UPDATE IAMX.ROLE_OBJECT_PERMISSION
			 SET permission = :1, updated_by = :2, updated_at = SYSTIMESTAMP
			 WHERE role_object_mapping_id = :3`,
			permJSON, req.UpdatedBy, mappingID,
		)
	} else {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read permissions", "message": permErr.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to write permissions", "message": err.Error()})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "tx commit failed", "message": err.Error()})
	}

	invalidateCacheForRole(roleID)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"role_object_mapping_id": mappingID,
			"permissions":            req.Permissions,
		},
	})
}

// ToggleRolePermission toggles a single permission flag for a role-object mapping.
func ToggleRolePermission(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	mappingID := c.Params("mappingId")

	var req TogglePermissionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Read current permission JSON
	var permJSON string
	selectErr := db.QueryRow(
		`SELECT NVL(permission, '[]') FROM IAMX.ROLE_OBJECT_PERMISSION WHERE role_object_mapping_id = :1`,
		mappingID,
	).Scan(&permJSON)

	currentPerms := parsePermissionJSON(permJSON)

	// Toggle
	perm := req.Permission
	if req.Enabled {
		found := false
		for _, p := range currentPerms {
			if p == perm {
				found = true
				break
			}
		}
		if !found {
			currentPerms = append(currentPerms, perm)
		}
	} else {
		newPerms := []string{}
		for _, p := range currentPerms {
			if p != perm {
				newPerms = append(newPerms, p)
			}
		}
		currentPerms = newPerms
	}

	newPermJSON := toPermissionJSON(currentPerms)

	var err error
	if selectErr == sql.ErrNoRows {
		_, err = db.Exec(
			`INSERT INTO IAMX.ROLE_OBJECT_PERMISSION
			 (role_object_mapping_id, permission, updated_by, created_at, updated_at)
			 VALUES (:1, :2, :3, SYSTIMESTAMP, SYSTIMESTAMP)`,
			mappingID, newPermJSON, req.UpdatedBy,
		)
	} else {
		_, err = db.Exec(
			`UPDATE IAMX.ROLE_OBJECT_PERMISSION
			 SET permission = :1, updated_by = :2, updated_at = SYSTIMESTAMP
			 WHERE role_object_mapping_id = :3`,
			newPermJSON, req.UpdatedBy, mappingID,
		)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to toggle permission",
			"message": err.Error(),
		})
	}

	invalidateCacheForMapping(mappingID)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Permission toggled successfully",
		"data": fiber.Map{
			"role_object_mapping_id": mappingID,
			"permissions":            currentPerms,
		},
	})
}
