package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
)

// GetResponsibilities ดึงรายการ responsibilities ทั้งหมด
func GetResponsibilities(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `SELECT id, code, name, description, effective_date, expire_date, is_active,
			  NVL(permissions, '[]'), created_by, updated_by, created_at, updated_at
			  FROM responsibility
			  ORDER BY id`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch responsibilities",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	responsibilities := []models.ResponsibilityResponse{}
	for rows.Next() {
		var r models.Responsibility
		err := rows.Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.EffectiveDate, &r.ExpireDate,
			&r.IsActive, &r.Permissions, &r.CreatedBy, &r.UpdatedBy, &r.CreatedAt, &r.UpdatedAt)
		if err != nil {
			continue
		}
		responsibilities = append(responsibilities, r.ToResponse())
	}

	return c.JSON(fiber.Map{"data": responsibilities})
}

// GetResponsibilityByID ดึงข้อมูล responsibility ตาม ID
func GetResponsibilityByID(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	query := `SELECT id, code, name, description, effective_date, expire_date, is_active,
			  NVL(permissions, '[]'), created_by, updated_by, created_at, updated_at
			  FROM responsibility
			  WHERE id = :1`

	var r models.Responsibility
	err := db.QueryRow(query, id).Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.EffectiveDate, &r.ExpireDate,
		&r.IsActive, &r.Permissions, &r.CreatedBy, &r.UpdatedBy, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Responsibility not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch responsibility",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{"data": r.ToResponse()})
}

// CreateResponsibility สร้าง responsibility ใหม่
func CreateResponsibility(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req models.CreateResponsibilityRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Parse dates
	var effectiveDate, expireDate sql.NullTime
	if req.EffectiveDate != nil && *req.EffectiveDate != "" {
		if t, err := time.Parse("2006-01-02", *req.EffectiveDate); err == nil {
			effectiveDate = sql.NullTime{Time: t, Valid: true}
		}
	}
	if req.ExpireDate != nil && *req.ExpireDate != "" {
		if t, err := time.Parse("2006-01-02", *req.ExpireDate); err == nil {
			expireDate = sql.NullTime{Time: t, Valid: true}
		}
	}

	// NVL guards against NULL effective_date when caller omits it
	// (effective_date is NOT NULL DEFAULT SYSDATE — DEFAULT only fires
	// for omitted columns, not explicit NULL).
	insertQ := `INSERT INTO responsibility (code, name, description, effective_date, expire_date, is_active, permissions)
			  VALUES (:1, :2, :3, NVL(:4, SYSDATE), :5, :6, :7)
			  RETURNING id INTO :8`

	var newID int64
	if _, err := db.Exec(insertQ, req.Code, req.Name, req.Description, effectiveDate, expireDate, req.IsActive, models.MarshalPermissionsJSON(req.Permissions), &newID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create responsibility",
			"message": err.Error(),
		})
	}

	var r models.Responsibility
	err := db.QueryRow(`SELECT id, code, name, description, effective_date, expire_date, is_active,
					NVL(permissions, '[]'), created_by, updated_by, created_at, updated_at
				FROM responsibility WHERE id = :1`, newID).
		Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.EffectiveDate, &r.ExpireDate,
			&r.IsActive, &r.Permissions, &r.CreatedBy, &r.UpdatedBy, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to load created responsibility",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Responsibility created successfully",
		"data":    r.ToResponse(),
	})
}

// UpdateResponsibility อัปเดต responsibility
func UpdateResponsibility(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	var req models.UpdateResponsibilityRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Parse dates
	var effectiveDate, expireDate sql.NullTime
	if req.EffectiveDate != nil && *req.EffectiveDate != "" {
		if t, err := time.Parse("2006-01-02", *req.EffectiveDate); err == nil {
			effectiveDate = sql.NullTime{Time: t, Valid: true}
		}
	}
	if req.ExpireDate != nil && *req.ExpireDate != "" {
		if t, err := time.Parse("2006-01-02", *req.ExpireDate); err == nil {
			expireDate = sql.NullTime{Time: t, Valid: true}
		}
	}

	updateQ := `UPDATE responsibility
			  SET code = :1, name = :2, description = :3, effective_date = NVL(:4, effective_date), expire_date = :5, is_active = :6, permissions = :7, updated_at = SYSTIMESTAMP
			  WHERE id = :8`
	res, err := db.Exec(updateQ, req.Code, req.Name, req.Description, effectiveDate, expireDate, req.IsActive, models.MarshalPermissionsJSON(req.Permissions), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update responsibility",
			"message": err.Error(),
		})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Responsibility not found"})
	}

	var r models.Responsibility
	err = db.QueryRow(`SELECT id, code, name, description, effective_date, expire_date, is_active,
					NVL(permissions, '[]'), created_by, updated_by, created_at, updated_at
				FROM responsibility WHERE id = :1`, id).
		Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.EffectiveDate, &r.ExpireDate,
			&r.IsActive, &r.Permissions, &r.CreatedBy, &r.UpdatedBy, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to load updated responsibility",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Responsibility updated successfully",
		"data":    r.ToResponse(),
	})
}

// DeleteResponsibility ลบ responsibility
func DeleteResponsibility(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	// Delete related role mappings first
	_, err := db.Exec(`DELETE FROM responsibility_role_mapping WHERE responsibility_id = :1`, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete responsibility role mappings",
			"message": err.Error(),
		})
	}

	query := `DELETE FROM responsibility WHERE id = :1`
	result, err := db.Exec(query, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete responsibility",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Responsibility not found"})
	}

	return c.JSON(fiber.Map{"message": "Responsibility deleted successfully"})
}

// ==================== Responsibility Role Mapping ====================

// GetResponsibilityRoleMappings ดึงรายการ role mappings ของ responsibility
func GetResponsibilityRoleMappings(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	responsibilityID := c.Params("id")

	query := `SELECT m.id, m.responsibility_id, m.role_id, m.effective_date, m.expire_date, m.is_active,
			  r.code as role_code, r.name as role_name
			  FROM responsibility_role_mapping m
			  JOIN role r ON m.role_id = r.id
			  WHERE m.responsibility_id = :1
			  ORDER BY m.id`

	rows, err := db.Query(query, responsibilityID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch responsibility role mappings",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	mappings := []map[string]interface{}{}
	for rows.Next() {
		var id, responsibilityID int64
		var roleID string
		var effectiveDate, expireDate sql.NullTime
		var isActive int
		var roleCode, roleName string

		err := rows.Scan(&id, &responsibilityID, &roleID, &effectiveDate, &expireDate, &isActive, &roleCode, &roleName)
		if err != nil {
			continue
		}

		mapping := map[string]interface{}{
			"id":                id,
			"responsibility_id": responsibilityID,
			"role_id":           roleID,
			"effective_date":    nil,
			"expire_date":       nil,
			"is_active":         isActive,
			"role_code":         roleCode,
			"role_name":         roleName,
		}

		if effectiveDate.Valid {
			mapping["effective_date"] = effectiveDate.Time.Format("2006-01-02")
		}
		if expireDate.Valid {
			mapping["expire_date"] = expireDate.Time.Format("2006-01-02")
		}

		mappings = append(mappings, mapping)
	}

	return c.JSON(fiber.Map{"data": mappings})
}

// CreateResponsibilityRoleMapping สร้าง responsibility role mapping ใหม่
func CreateResponsibilityRoleMapping(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req models.CreateResponsibilityRoleMappingRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Parse dates
	var effectiveDate, expireDate sql.NullTime
	if req.EffectiveDate != nil && *req.EffectiveDate != "" {
		if t, err := time.Parse("2006-01-02", *req.EffectiveDate); err == nil {
			effectiveDate = sql.NullTime{Time: t, Valid: true}
		}
	}
	if req.ExpireDate != nil && *req.ExpireDate != "" {
		if t, err := time.Parse("2006-01-02", *req.ExpireDate); err == nil {
			expireDate = sql.NullTime{Time: t, Valid: true}
		}
	}

	insertQ := `INSERT INTO responsibility_role_mapping (responsibility_id, role_id, effective_date, expire_date, is_active)
			  VALUES (:1, :2, NVL(:3, SYSDATE), :4, :5)
			  RETURNING id INTO :6`

	var id int64
	if _, err := db.Exec(insertQ, req.ResponsibilityID, req.RoleID, effectiveDate, expireDate, req.IsActive, &id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create responsibility role mapping",
			"message": err.Error(),
		})
	}

	var respID int64
	var roleID string
	var effDate, expDate sql.NullTime
	var isActive int
	var createdAt, updatedAt time.Time
	if err := db.QueryRow(`SELECT responsibility_id, role_id, effective_date, expire_date, is_active, created_at, updated_at
				FROM responsibility_role_mapping WHERE id = :1`, id).
		Scan(&respID, &roleID, &effDate, &expDate, &isActive, &createdAt, &updatedAt); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to load created mapping",
			"message": err.Error(),
		})
	}

	// Invalidate cache for all users with this role
	invalidateCacheForRole(roleID)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Responsibility role mapping created successfully",
		"data": fiber.Map{
			"id":                id,
			"responsibility_id": respID,
			"role_id":           roleID,
			"is_active":         isActive,
			"created_at":        createdAt,
			"updated_at":        updatedAt,
		},
	})
}

// DeleteResponsibilityRoleMapping ลบ responsibility role mapping
func DeleteResponsibilityRoleMapping(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	// Get role_id before deleting for cache invalidation
	var roleID string
	db.QueryRow(`SELECT role_id FROM responsibility_role_mapping WHERE id = :1`, id).Scan(&roleID)

	query := `DELETE FROM responsibility_role_mapping WHERE id = :1`
	result, err := db.Exec(query, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete responsibility role mapping",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Responsibility role mapping not found"})
	}

	// Invalidate cache for all users with this role
	if roleID != "" {
		invalidateCacheForRole(roleID)
	}

	return c.JSON(fiber.Map{"message": "Responsibility role mapping deleted successfully"})
}

// GetAllResponsibilityRoleMappings ดึงรายการ responsibility role mappings ทั้งหมด (สำหรับ Matrix View)
func GetAllResponsibilityRoleMappings(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `SELECT m.id, m.responsibility_id, m.role_id, m.effective_date, m.expire_date, m.is_active,
			  r.code as role_code, r.name as role_name,
			  resp.code as responsibility_code, resp.name as responsibility_name
			  FROM responsibility_role_mapping m
			  JOIN role r ON m.role_id = r.id
			  JOIN responsibility resp ON m.responsibility_id = resp.id
			  ORDER BY m.id`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch responsibility role mappings",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	mappings := []map[string]interface{}{}
	for rows.Next() {
		var id, responsibilityID int64
		var roleID string
		var effectiveDate, expireDate sql.NullTime
		var isActive int
		var roleCode, roleName, respCode, respName string

		err := rows.Scan(&id, &responsibilityID, &roleID, &effectiveDate, &expireDate, &isActive,
			&roleCode, &roleName, &respCode, &respName)
		if err != nil {
			continue
		}

		mapping := map[string]interface{}{
			"id":                  id,
			"responsibility_id":   responsibilityID,
			"role_id":             roleID,
			"effective_date":      nil,
			"expire_date":         nil,
			"is_active":           isActive,
			"role_code":           roleCode,
			"role_name":           roleName,
			"responsibility_code": respCode,
			"responsibility_name": respName,
		}

		if effectiveDate.Valid {
			mapping["effective_date"] = effectiveDate.Time.Format("2006-01-02")
		}
		if expireDate.Valid {
			mapping["expire_date"] = expireDate.Time.Format("2006-01-02")
		}

		mappings = append(mappings, mapping)
	}

	return c.JSON(fiber.Map{"data": mappings})
}
