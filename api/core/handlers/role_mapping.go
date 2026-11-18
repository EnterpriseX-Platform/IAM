package handlers

import (
	"api/core"
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
)

// RoleObjectMappingResponse struct for JSON response
type RoleObjectMappingResponse struct {
	ID             int64   `json:"id"`
	RoleID         string  `json:"role_id"`
	DomainID       *int64  `json:"domain_id"`
	ApplicationID  *int64  `json:"application_id"`
	ModuleID       *int64  `json:"module_id"`
	ObjectID       *int64  `json:"object_id"`
	ProcessID      *int64  `json:"process_id"`
	SubProcessID   *int64  `json:"sub_process_id"`
	EffectiveDate  string  `json:"effective_date"`
	ExpireDate     string  `json:"expire_date"`
	IsActive       int16   `json:"is_active"`
	DomainName     *string `json:"domain_name"`
	AppName        *string `json:"application_name"`
	ModuleName     *string `json:"module_name"`
	ObjectName     *string `json:"object_name"`
	ObjectPath     *string `json:"object_path"`
	ProcessName    *string `json:"process_name"`
	SubProcessName *string `json:"sub_process_name"`
}

// RoleObjectMapping struct for DB scan
type RoleObjectMapping struct {
	ID             int64          `json:"id"`
	RoleID         string         `json:"role_id"`
	DomainID       sql.NullInt64  `json:"domain_id"`
	ApplicationID  sql.NullInt64  `json:"application_id"`
	ModuleID       sql.NullInt64  `json:"module_id"`
	ObjectID       sql.NullInt64  `json:"object_id"`
	ProcessID      sql.NullInt64  `json:"process_id"`
	SubProcessID   sql.NullInt64  `json:"sub_process_id"`
	EffectiveDate  string         `json:"effective_date"`
	ExpireDate     string         `json:"expire_date"`
	IsActive       int16          `json:"is_active"`
	DomainName     sql.NullString `json:"domain_name"`
	AppName        sql.NullString `json:"application_name"`
	ModuleName     sql.NullString `json:"module_name"`
	ObjectName     sql.NullString `json:"object_name"`
	ObjectPath     sql.NullString `json:"object_path"`
	ProcessName    sql.NullString `json:"process_name"`
	SubProcessName sql.NullString `json:"sub_process_name"`
}

// ToResponse converts DB struct to Response struct
func (m *RoleObjectMapping) ToResponse() RoleObjectMappingResponse {
	resp := RoleObjectMappingResponse{
		ID:            m.ID,
		RoleID:        m.RoleID,
		EffectiveDate: m.EffectiveDate,
		ExpireDate:    m.ExpireDate,
		IsActive:      m.IsActive,
	}
	if m.DomainID.Valid {
		resp.DomainID = &m.DomainID.Int64
	}
	if m.ApplicationID.Valid {
		resp.ApplicationID = &m.ApplicationID.Int64
	}
	if m.ModuleID.Valid {
		resp.ModuleID = &m.ModuleID.Int64
	}
	if m.ObjectID.Valid {
		resp.ObjectID = &m.ObjectID.Int64
	}
	if m.ProcessID.Valid {
		resp.ProcessID = &m.ProcessID.Int64
	}
	if m.SubProcessID.Valid {
		resp.SubProcessID = &m.SubProcessID.Int64
	}
	if m.DomainName.Valid {
		resp.DomainName = &m.DomainName.String
	}
	if m.AppName.Valid {
		resp.AppName = &m.AppName.String
	}
	if m.ModuleName.Valid {
		resp.ModuleName = &m.ModuleName.String
	}
	if m.ObjectName.Valid {
		resp.ObjectName = &m.ObjectName.String
	}
	if m.ObjectPath.Valid {
		resp.ObjectPath = &m.ObjectPath.String
	}
	if m.ProcessName.Valid {
		resp.ProcessName = &m.ProcessName.String
	}
	if m.SubProcessName.Valid {
		resp.SubProcessName = &m.SubProcessName.String
	}
	return resp
}

// GetRoleObjectMappings ดึงรายการ role object mappings ทั้งหมดของ role
func GetRoleObjectMappings(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	roleID := c.Params("roleId")

	query := `SELECT rom.id, rom.role_id, rom.domain_id, rom.application_id, rom.module_id, rom.object_id,
			  rom.process_id, rom.sub_process_id, rom.effective_date, rom.expire_date, rom.is_active,
			  d.name as domain_name, a.name as application_name, m.name as module_name,
			  o.name as object_name, o.path as object_path
			  FROM IAMX.ROLE_OBJECT_MAPPING rom
			  LEFT JOIN IAMX.DOMAIN d ON rom.domain_id = d.id
			  LEFT JOIN IAMX.APPLICATION a ON rom.application_id = a.id
			  LEFT JOIN IAMX.MODULE m ON rom.module_id = m.id
			  LEFT JOIN IAMX.OBJECT o ON rom.object_id = o.id
			  WHERE rom.role_id = :1
			  ORDER BY o.name`

	rows, err := db.Query(query, roleID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch role object mappings",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	mappings := []RoleObjectMappingResponse{}
	for rows.Next() {
		var m RoleObjectMapping
		var effectiveDate, expireDate sql.NullTime
		err := rows.Scan(&m.ID, &m.RoleID, &m.DomainID, &m.ApplicationID, &m.ModuleID, &m.ObjectID,
			&m.ProcessID, &m.SubProcessID, &effectiveDate, &expireDate, &m.IsActive,
			&m.DomainName, &m.AppName, &m.ModuleName, &m.ObjectName, &m.ObjectPath)
		if err != nil {
			continue
		}
		if effectiveDate.Valid {
			m.EffectiveDate = effectiveDate.Time.Format("2006-01-02")
		}
		if expireDate.Valid {
			m.ExpireDate = expireDate.Time.Format("2006-01-02")
		}
		mappings = append(mappings, m.ToResponse())
	}

	return c.JSON(fiber.Map{"data": mappings})
}

// CreateRoleObjectMapping สร้าง role object mapping ใหม่
func CreateRoleObjectMapping(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req struct {
		RoleID        string `json:"role_id"`
		DomainID      *int64 `json:"domain_id"`
		ApplicationID *int64 `json:"application_id"`
		ModuleID      *int64 `json:"module_id"`
		ObjectID      *int64 `json:"object_id"`
		ProcessID     *int64 `json:"process_id"`
		SubProcessID  *int64 `json:"sub_process_id"`
		EffectiveDate string `json:"effective_date"`
		ExpireDate    string `json:"expire_date"`
		IsActive      int16  `json:"is_active"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var effectiveDate, expireDate sql.NullTime
	if req.EffectiveDate != "" {
		if t, err := time.Parse("2006-01-02", req.EffectiveDate); err == nil {
			effectiveDate = sql.NullTime{Time: t, Valid: true}
		}
	}
	if req.ExpireDate != "" {
		if t, err := time.Parse("2006-01-02", req.ExpireDate); err == nil {
			expireDate = sql.NullTime{Time: t, Valid: true}
		}
	}

	query := `INSERT INTO IAMX.ROLE_OBJECT_MAPPING
			  (role_id, domain_id, application_id, module_id, object_id, process_id, sub_process_id,
			   effective_date, expire_date, is_active, created_at, updated_at)
			  VALUES (:1, :2, :3, :4, :5, :6, :7, NVL(:8, SYSDATE), :9, :10, SYSTIMESTAMP, SYSTIMESTAMP)
			  RETURNING id INTO :out`

	var newID int64
	_, err := db.Exec(query, req.RoleID,
		toNullInt64(req.DomainID), toNullInt64(req.ApplicationID), toNullInt64(req.ModuleID),
		toNullInt64(req.ObjectID), toNullInt64(req.ProcessID), toNullInt64(req.SubProcessID),
		effectiveDate, expireDate, req.IsActive,
		sql.Named("out", sql.Out{Dest: &newID}))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create role object mapping",
			"message": err.Error(),
		})
	}

	// Invalidate cache for all users with this role
	invalidateCacheForRole(req.RoleID)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Role object mapping created successfully",
		"id":      newID,
	})
}

// UpdateRoleObjectMapping อัปเดต role object mapping
func UpdateRoleObjectMapping(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	var req struct {
		DomainID      *int64 `json:"domain_id"`
		ApplicationID *int64 `json:"application_id"`
		ModuleID      *int64 `json:"module_id"`
		ObjectID      *int64 `json:"object_id"`
		ProcessID     *int64 `json:"process_id"`
		SubProcessID  *int64 `json:"sub_process_id"`
		EffectiveDate string `json:"effective_date"`
		ExpireDate    string `json:"expire_date"`
		IsActive      int16  `json:"is_active"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var effectiveDate, expireDate sql.NullTime
	if req.EffectiveDate != "" {
		if t, err := time.Parse("2006-01-02", req.EffectiveDate); err == nil {
			effectiveDate = sql.NullTime{Time: t, Valid: true}
		}
	}
	if req.ExpireDate != "" {
		if t, err := time.Parse("2006-01-02", req.ExpireDate); err == nil {
			expireDate = sql.NullTime{Time: t, Valid: true}
		}
	}

	// Get role_id before updating for cache invalidation
	var roleID string
	db.QueryRow(`SELECT role_id FROM IAMX.ROLE_OBJECT_MAPPING WHERE id = :1`, id).Scan(&roleID)

	query := `UPDATE IAMX.ROLE_OBJECT_MAPPING
			  SET domain_id = :1, application_id = :2, module_id = :3, object_id = :4,
			      process_id = :5, sub_process_id = :6, effective_date = :7, expire_date = :8,
			      is_active = :9, updated_at = SYSTIMESTAMP
			  WHERE id = :10`

	_, err := db.Exec(query,
		toNullInt64(req.DomainID), toNullInt64(req.ApplicationID), toNullInt64(req.ModuleID),
		toNullInt64(req.ObjectID), toNullInt64(req.ProcessID), toNullInt64(req.SubProcessID),
		effectiveDate, expireDate, req.IsActive, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update role object mapping",
			"message": err.Error(),
		})
	}

	// Invalidate cache for all users with this role
	if roleID != "" {
		invalidateCacheForRole(roleID)
	}

	return c.JSON(fiber.Map{
		"message": "Role object mapping updated successfully",
	})
}

// DeleteRoleObjectMapping ลบ role object mapping
func DeleteRoleObjectMapping(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	// Get role_id before deleting for cache invalidation
	var roleID string
	db.QueryRow(`SELECT role_id FROM IAMX.ROLE_OBJECT_MAPPING WHERE id = :1`, id).Scan(&roleID)

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start transaction", "message": err.Error()})
	}
	defer tx.Rollback()

	// Cascade: ROP → ROM
	if _, err := tx.Exec(`DELETE FROM IAMX.ROLE_OBJECT_PERMISSION WHERE role_object_mapping_id = :1`, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete role object permission",
			"message": err.Error(),
		})
	}
	if _, err := tx.Exec(`DELETE FROM IAMX.ROLE_OBJECT_MAPPING WHERE id = :1`, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete role object mapping",
			"message": err.Error(),
		})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit", "message": err.Error()})
	}

	// Invalidate cache for all users with this role
	if roleID != "" {
		invalidateCacheForRole(roleID)
	}

	return c.JSON(fiber.Map{
		"message": "Role object mapping deleted successfully",
	})
}

// Helper function
func toNullInt64(ptr *int64) sql.NullInt64 {
	if ptr == nil {
		return sql.NullInt64{Valid: false}
	}
	return sql.NullInt64{Int64: *ptr, Valid: true}
}
