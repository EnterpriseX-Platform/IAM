package handlers

import (
	"api/core"
	"api/core/models"
	"api/core/usertypes"
	"api/core/utils"
	"database/sql"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// GetRoles lists every role (including inactive/future-effective).
//
// @Summary      List roles
// @Description  Returns every role row, regardless of is_active. Use /admin/roles/active for the live set only.
// @Tags         Admin · RBAC
// @Produce      json
// @Success      200  {object}  map[string]interface{}  "{data:[...]} — array of RoleResponse"
// @Failure      500  {object}  map[string]string       "Oracle unavailable or query failure"
// @Router       /admin/roles [get]
func GetRoles(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `SELECT r.id, r.code, r.name, r.description, NVL(r.role_type,` + usertypes.SQLStaff() + `) AS role_type,
			  r.effective_date, r.expire_date, r.is_active,
			  r.default_role, r.all_data_access, r.created_by, r.updated_by, r.created_at, r.updated_at,
			  NVL((SELECT COUNT(DISTINCT urm.user_id)
			       FROM user_role_mapping urm
			       JOIN user_info ui ON ui.user_id = urm.user_id
			       WHERE urm.role_id = r.id), 0) AS user_count,
			  -- 13/11/69: จำนวนเมนูที่ "ดู" ได้ (หน้าแรก/ตัวกรอง "บทบาทที่ยังไม่มีเมนู")
			  (SELECT COUNT(*) FROM role_object_mapping m JOIN role_object_permission p ON p.role_object_mapping_id = m.id
			    WHERE m.role_id = r.id AND p.permission LIKE '%VIEW%') AS menu_count,
			  NVL(r.group_code, ' ') AS group_code
			  FROM role r
			  ORDER BY r.code`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch roles",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	roles := []models.RoleResponse{}
	for rows.Next() {
		var r models.Role
		var userCount, menuCount int64
		var groupCode string
		err := rows.Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.RoleType, &r.EffectiveDate, &r.ExpireDate,
			&r.IsActive, &r.DefaultRole, &r.AllDataAccess, &r.CreatedBy, &r.UpdatedBy, &r.CreatedAt, &r.UpdatedAt,
			&userCount, &menuCount, &groupCode)
		if err != nil {
			continue
		}
		resp := r.ToResponse()
		resp.UserCount = userCount
		resp.MenuCount = &menuCount
		resp.GroupCode = strings.TrimSpace(groupCode)
		roles = append(roles, resp)
	}

	return c.JSON(fiber.Map{"data": roles})
}

// GetRoleByID ดึงข้อมูล role ตาม ID
func GetRoleByID(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")

	query := `SELECT id, code, name, description, NVL(role_type,` + usertypes.SQLStaff() + `) AS role_type,
			  effective_date, expire_date, is_active, default_role, all_data_access,
			  created_by, updated_by, created_at, updated_at
			  FROM role
			  WHERE id = :1`

	var r models.Role
	err := db.QueryRow(query, id).Scan(&r.ID, &r.Code, &r.Name, &r.Description, &r.RoleType, &r.EffectiveDate, &r.ExpireDate,
		&r.IsActive, &r.DefaultRole, &r.AllDataAccess, &r.CreatedBy, &r.UpdatedBy, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Role not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch role",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{"data": r.ToResponse()})
}

// CreateRole สร้าง role ใหม่
func CreateRole(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req models.CreateRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

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

	if req.RoleType == "" {
		req.RoleType = usertypes.StaffCode()
	}

	// effective_date is NOT NULL DEFAULT SYSDATE; passing :N as NULL still
	// violates NOT NULL because DEFAULT only fires for omitted columns, not
	// for explicit NULL binds. NVL falls back to SYSDATE when the bind is
	// NULL (i.e., caller didn't send effective_date in the body).
	roleID := utils.NewCUID()

	query := `INSERT INTO role (id, code, name, description, role_type, effective_date, expire_date, is_active, default_role, all_data_access, created_at, updated_at)
			  VALUES (:1, :2, :3, :4, :5, NVL(:6, SYSDATE), :7, :8, :9, :10, SYSTIMESTAMP, SYSTIMESTAMP)`

	_, err := db.Exec(query, roleID, req.Code, req.Name, req.Description, req.RoleType, effectiveDate, expireDate, req.IsActive, req.DefaultRole, req.AllDataAccess)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create role",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Role created successfully",
		"id":      roleID,
	})
}

// UpdateRole อัปเดต role
func UpdateRole(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Role ID is required"})
	}

	var req models.UpdateRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

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

	if req.RoleType == "" {
		req.RoleType = usertypes.StaffCode()
	}

	query := `UPDATE role
			  SET code = :1, name = :2, description = :3, role_type = :4,
			      effective_date = NVL(:5, effective_date), expire_date = :6,
			      is_active = :7, default_role = :8, all_data_access = :9, updated_at = SYSTIMESTAMP
			  WHERE id = :10`

	_, err := db.Exec(query, req.Code, req.Name, req.Description, req.RoleType, effectiveDate, expireDate, req.IsActive, req.DefaultRole, req.AllDataAccess, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update role",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Role updated successfully",
	})
}

// DeleteRole ลบ role พร้อม cascade ผ่าน FK ทั้งหมด
func DeleteRole(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Role ID is required"})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start transaction", "message": err.Error()})
	}
	defer tx.Rollback()

	steps := []string{
		`DELETE FROM role_object_permission WHERE role_object_mapping_id IN (SELECT id FROM role_object_mapping WHERE role_id = :1)`,
		`DELETE FROM role_object_mapping WHERE role_id = :1`,
		`DELETE FROM responsibility_role_permission WHERE responsibility_role_mapping_id IN (SELECT id FROM responsibility_role_mapping WHERE role_id = :1)`,
		`DELETE FROM responsibility_role_mapping WHERE role_id = :1`,
		`DELETE FROM user_custom_data_access_permission WHERE user_custom_data_access_id IN (SELECT id FROM user_custom_data_access WHERE role_id = :1)`,
		`DELETE FROM user_custom_data_access WHERE role_id = :1`,
		`DELETE FROM user_role_mapping WHERE role_id = :1`,
	}
	for _, q := range steps {
		if _, err := tx.Exec(q, id); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete role dependencies", "message": err.Error()})
		}
	}

	res, err := tx.Exec(`DELETE FROM role WHERE id = :1`, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete role", "message": err.Error()})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Role not found"})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit", "message": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Role deleted successfully"})
}

// SetDefaultRole sets a role as the default and unsets all others
func SetDefaultRole(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Role ID is required"})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to start transaction",
			"message": err.Error(),
		})
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`UPDATE role SET default_role = 0`); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to unset existing default roles",
			"message": err.Error(),
		})
	}

	result, err := tx.Exec(`UPDATE role SET default_role = 1 WHERE id = :1`, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to set default role",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Role not found"})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to commit transaction",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Default role set successfully",
	})
}

// GetRoleUsers ดึงรายการผู้ใช้ที่ได้รับ role นี้
//
// @Summary      List users assigned to a role
// @Tags         Admin · RBAC
// @Produce      json
// @Param        id   path  int  true  "Role ID"
// @Success      200  {object}  map[string]interface{}
// @Router       /admin/roles/{id}/users [get]
func GetRoleUsers(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Role ID is required"})
	}

	query := `SELECT ui.user_id, ui.user_name, ui.first_name, ui.last_name, ui.email,
	                 ui.status, ui.employee_id, urm.is_active,
	                 urm.effective_date, urm.expire_date
	          FROM user_role_mapping urm
	          JOIN user_info ui ON ui.user_id = urm.user_id
	          WHERE urm.role_id = :1
	          ORDER BY ui.first_name, ui.last_name, ui.user_name`

	rows, err := db.Query(query, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch role users",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	type RoleUser struct {
		UserID        string  `json:"user_id"`
		UserName      *string `json:"user_name,omitempty"`
		FirstName     *string `json:"first_name,omitempty"`
		LastName      *string `json:"last_name,omitempty"`
		Email         *string `json:"email,omitempty"`
		Status        *string `json:"status,omitempty"`
		EmployeeID    *string `json:"employee_id,omitempty"`
		IsActive      int     `json:"is_active"`
		EffectiveDate *string `json:"effective_date,omitempty"`
		ExpireDate    *string `json:"expire_date,omitempty"`
	}

	users := []RoleUser{}
	for rows.Next() {
		var u RoleUser
		var eff, exp sql.NullTime
		if err := rows.Scan(&u.UserID, &u.UserName, &u.FirstName, &u.LastName, &u.Email,
			&u.Status, &u.EmployeeID, &u.IsActive, &eff, &exp); err != nil {
			continue
		}
		if eff.Valid {
			s := eff.Time.Format("2006-01-02")
			u.EffectiveDate = &s
		}
		if exp.Valid {
			s := exp.Time.Format("2006-01-02")
			u.ExpireDate = &s
		}
		users = append(users, u)
	}

	return c.JSON(fiber.Map{"data": users})
}

// GetActiveRoles ดึงรายการ roles ที่ active อยู่ (สำหรับ dropdown)
func GetActiveRoles(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	rows, err := db.Query(`SELECT id, code, name FROM role WHERE is_active = 1 ORDER BY code`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch roles",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	type SimpleRole struct {
		ID   string `json:"id"`
		Code string `json:"code"`
		Name string `json:"name"`
	}

	roles := []SimpleRole{}
	for rows.Next() {
		var r SimpleRole
		if err := rows.Scan(&r.ID, &r.Code, &r.Name); err != nil {
			continue
		}
		roles = append(roles, r)
	}

	return c.JSON(fiber.Map{"data": roles})
}
