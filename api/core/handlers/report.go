package handlers

import (
	"api/core"
	"api/core/models"
	"api/core/services"
	"database/sql"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ==================== REPORT CATALOG (proxy) ====================
// รายงานเป็นของ Report Studio (คนละโปรเจกต์ คนละฐานข้อมูล)
// IAMX ไม่เก็บ catalog — อ่านผ่าน services.FetchReports เท่านั้น
// ยังไม่ได้ตั้ง REPORT_STUDIO_API_BASE = ได้ mock กลับมา

// GET /admin/reports?search=
func GetReports(c *fiber.Ctx) error {
	reports, err := services.FetchReports(c.Query("search"))
	if err != nil {
		log.Printf("GetReports error: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"success": false, "message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"source":  services.ReportSource(),
		"data":    reports,
	})
}

// ==================== REPORT -> OWNERS (reverse lookup) ====================
// หน้า UI ตั้งต้นจาก "รายงาน" แล้วค่อยดูว่าบทบาท/ผู้ใช้ไหนได้สิทธิ์บ้าง

// GET /admin/reports/:reportCode/role-mappings
func GetReportRoleMappings(c *fiber.Ctx) error {
	return reportOwnerMappings(c, "role")
}

// GET /admin/reports/:reportCode/user-mappings
func GetReportUserMappings(c *fiber.Ctx) error {
	return reportOwnerMappings(c, "user")
}

func reportOwnerMappings(c *fiber.Ctx, kind string) error {
	reportCode := strings.TrimSpace(c.Params("reportCode"))
	if reportCode == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "reportCode is required",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	query := `
		SELECT id, role_id, NVL(permission, '[]'),
		       TO_CHAR(effective_date, 'YYYY-MM-DD'),
		       TO_CHAR(expire_date, 'YYYY-MM-DD'),
		       is_active
		FROM IAMX.ROLE_REPORT_MAPPING
		WHERE report_code = :1
		ORDER BY role_id`
	if kind == "user" {
		query = `
		SELECT id, user_id, NVL(permission, '[]'),
		       TO_CHAR(effective_date, 'YYYY-MM-DD'),
		       TO_CHAR(expire_date, 'YYYY-MM-DD'),
		       is_active
		FROM IAMX.USER_REPORT_MAPPING
		WHERE report_code = :1
		ORDER BY user_id`
	}

	rows, err := db.Query(query, reportCode)
	if err != nil {
		log.Printf("reportOwnerMappings(%s) error: %v", kind, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": err.Error(),
		})
	}
	defer rows.Close()

	results := make([]models.ReportMapping, 0)
	for rows.Next() {
		var (
			m             models.ReportMapping
			ownerID       string
			permJSON      string
			effectiveDate sql.NullString
			expireDate    sql.NullString
		)
		if err := rows.Scan(&m.ID, &ownerID, &permJSON, &effectiveDate, &expireDate, &m.IsActive); err != nil {
			log.Printf("reportOwnerMappings(%s) scan error: %v", kind, err)
			continue
		}

		m.ReportCode = reportCode
		m.Permissions = parsePermissionJSON(permJSON)
		m.EffectiveDate = reportNullStr(effectiveDate)
		m.ExpireDate = reportNullStr(expireDate)
		if kind == "user" {
			m.UserID = &ownerID
		} else {
			m.RoleID = &ownerID
		}
		results = append(results, m)
	}

	return c.JSON(fiber.Map{"success": true, "data": results})
}

// GET /admin/report-mappings/summary
// นับจำนวนบทบาท/ผู้ใช้ต่อรายงาน สำหรับแสดงในตารางหลัก
func GetReportMappingSummary(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	summary := map[string]map[string]int{}

	countInto := func(query, key string) error {
		rows, err := db.Query(query)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var code string
			var n int
			if err := rows.Scan(&code, &n); err != nil {
				continue
			}
			code = strings.TrimSpace(code)
			if summary[code] == nil {
				summary[code] = map[string]int{"role_count": 0, "user_count": 0}
			}
			summary[code][key] = n
		}
		return rows.Err()
	}

	if err := countInto(`
		SELECT report_code, COUNT(*) FROM IAMX.ROLE_REPORT_MAPPING
		WHERE is_active = 1 GROUP BY report_code`, "role_count"); err != nil {
		log.Printf("GetReportMappingSummary role error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": err.Error(),
		})
	}
	if err := countInto(`
		SELECT report_code, COUNT(*) FROM IAMX.USER_REPORT_MAPPING
		WHERE is_active = 1 GROUP BY report_code`, "user_count"); err != nil {
		log.Printf("GetReportMappingSummary user error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{"success": true, "data": summary})
}

// ==================== ROLE -> REPORT MAPPING ====================

// GET /admin/roles/:roleId/report-mappings
func GetRoleReportMappings(c *fiber.Ctx) error {
	roleID := c.Params("roleId")
	if roleID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "roleId is required",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	rows, err := db.Query(`
		SELECT id, report_code, NVL(permission, '[]'),
		       TO_CHAR(effective_date, 'YYYY-MM-DD'),
		       TO_CHAR(expire_date, 'YYYY-MM-DD'),
		       is_active
		FROM IAMX.ROLE_REPORT_MAPPING
		WHERE role_id = :1
		ORDER BY report_code`, roleID)
	if err != nil {
		log.Printf("GetRoleReportMappings error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": err.Error(),
		})
	}
	defer rows.Close()

	results := make([]models.ReportMapping, 0)
	for rows.Next() {
		m, err := scanReportMapping(rows)
		if err != nil {
			log.Printf("GetRoleReportMappings scan error: %v", err)
			continue
		}
		m.RoleID = &roleID
		results = append(results, m)
	}

	return c.JSON(fiber.Map{"success": true, "data": results})
}

type setReportPermissionsRequest struct {
	Permissions    []string `json:"permissions"`
	EffectiveDate  *string  `json:"effective_date"`
	ExpireDate     *string  `json:"expire_date"`
	OverrideReason *string  `json:"override_reason"`
	UpdatedBy      *string  `json:"updated_by"`
}

// POST /admin/roles/:roleId/reports/:reportCode/set-permissions
// สร้าง mapping ถ้ายังไม่มี แล้วเขียนทับ permission ทั้งชุด
// ส่ง permissions = [] มาเท่ากับถอนสิทธิ์ (ลบ mapping ทิ้ง)
func SetRoleReportPermissions(c *fiber.Ctx) error {
	roleID := c.Params("roleId")
	reportCode := strings.TrimSpace(c.Params("reportCode"))
	if roleID == "" || reportCode == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "roleId and reportCode are required",
		})
	}

	var req setReportPermissionsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "Invalid request body",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	if len(req.Permissions) == 0 {
		if _, err := db.Exec(
			`DELETE FROM IAMX.ROLE_REPORT_MAPPING WHERE role_id = :1 AND report_code = :2`,
			roleID, reportCode,
		); err != nil {
			log.Printf("SetRoleReportPermissions delete error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false, "message": err.Error(),
			})
		}
		invalidateCacheForRole(roleID)
		return c.JSON(fiber.Map{
			"success": true,
			"data":    fiber.Map{"permissions": []string{}},
		})
	}

	permJSON := toPermissionJSON(req.Permissions)

	var mappingID int64
	err := db.QueryRow(
		`SELECT id FROM IAMX.ROLE_REPORT_MAPPING WHERE role_id = :1 AND report_code = :2`,
		roleID, reportCode,
	).Scan(&mappingID)

	if err == sql.ErrNoRows {
		_, err = db.Exec(`
			INSERT INTO IAMX.ROLE_REPORT_MAPPING
			(role_id, report_code, permission, effective_date, expire_date,
			 is_active, created_by, updated_by, created_at, updated_at)
			VALUES (:1, :2, :3, NVL(TO_DATE(:4, 'YYYY-MM-DD'), SYSDATE),
			        TO_DATE(:5, 'YYYY-MM-DD'), 1, :6, :7, SYSTIMESTAMP, SYSTIMESTAMP)`,
			roleID, reportCode, permJSON, req.EffectiveDate, req.ExpireDate, req.UpdatedBy, req.UpdatedBy,
		)
		if err == nil {
			err = db.QueryRow(
				`SELECT id FROM IAMX.ROLE_REPORT_MAPPING WHERE role_id = :1 AND report_code = :2`,
				roleID, reportCode,
			).Scan(&mappingID)
		}
	} else if err == nil {
		_, err = db.Exec(`
			UPDATE IAMX.ROLE_REPORT_MAPPING
			SET permission = :1, updated_by = :2, updated_at = SYSTIMESTAMP
			WHERE id = :3`,
			permJSON, req.UpdatedBy, mappingID,
		)
	}
	if err != nil {
		log.Printf("SetRoleReportPermissions error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": err.Error(),
		})
	}

	invalidateCacheForRole(roleID)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"id":          mappingID,
			"permissions": req.Permissions,
		},
	})
}

// ==================== USER -> REPORT MAPPING ====================

// GET /admin/user-report-mappings?user_id=xxx
func GetUserReportMappings(c *fiber.Ctx) error {
	userID := c.Query("user_id")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "user_id is required",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	rows, err := db.Query(`
		SELECT id, report_code, NVL(permission, '[]'),
		       TO_CHAR(effective_date, 'YYYY-MM-DD'),
		       TO_CHAR(expire_date, 'YYYY-MM-DD'),
		       is_active
		FROM IAMX.USER_REPORT_MAPPING
		WHERE user_id = :1
		ORDER BY report_code`, userID)
	if err != nil {
		log.Printf("GetUserReportMappings error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": err.Error(),
		})
	}
	defer rows.Close()

	results := make([]models.ReportMapping, 0)
	for rows.Next() {
		m, err := scanReportMapping(rows)
		if err != nil {
			log.Printf("GetUserReportMappings scan error: %v", err)
			continue
		}
		m.UserID = &userID
		results = append(results, m)
	}

	return c.JSON(fiber.Map{"success": true, "data": results})
}

// POST /admin/users/:userId/reports/:reportCode/set-permissions
func SetUserReportPermissions(c *fiber.Ctx) error {
	userID := c.Params("userId")
	reportCode := strings.TrimSpace(c.Params("reportCode"))
	if userID == "" || reportCode == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "userId and reportCode are required",
		})
	}

	var req setReportPermissionsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "Invalid request body",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	if len(req.Permissions) == 0 {
		if _, err := db.Exec(
			`DELETE FROM IAMX.USER_REPORT_MAPPING WHERE user_id = :1 AND report_code = :2`,
			userID, reportCode,
		); err != nil {
			log.Printf("SetUserReportPermissions delete error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false, "message": err.Error(),
			})
		}
		invalidateCacheForUser(userID)
		return c.JSON(fiber.Map{
			"success": true,
			"data":    fiber.Map{"permissions": []string{}},
		})
	}

	permJSON := toPermissionJSON(req.Permissions)

	var mappingID int64
	err := db.QueryRow(
		`SELECT id FROM IAMX.USER_REPORT_MAPPING WHERE user_id = :1 AND report_code = :2`,
		userID, reportCode,
	).Scan(&mappingID)

	if err == sql.ErrNoRows {
		_, err = db.Exec(`
			INSERT INTO IAMX.USER_REPORT_MAPPING
			(user_id, report_code, permission, override_reason, effective_date, expire_date,
			 is_active, created_by, updated_by, created_at, updated_at)
			VALUES (:1, :2, :3, :4, NVL(TO_DATE(:5, 'YYYY-MM-DD'), SYSDATE),
			        TO_DATE(:6, 'YYYY-MM-DD'), 1, :7, :8, SYSTIMESTAMP, SYSTIMESTAMP)`,
			userID, reportCode, permJSON, req.OverrideReason,
			req.EffectiveDate, req.ExpireDate, req.UpdatedBy, req.UpdatedBy,
		)
		if err == nil {
			err = db.QueryRow(
				`SELECT id FROM IAMX.USER_REPORT_MAPPING WHERE user_id = :1 AND report_code = :2`,
				userID, reportCode,
			).Scan(&mappingID)
		}
	} else if err == nil {
		_, err = db.Exec(`
			UPDATE IAMX.USER_REPORT_MAPPING
			SET permission = :1, updated_by = :2, updated_at = SYSTIMESTAMP
			WHERE id = :3`,
			permJSON, req.UpdatedBy, mappingID,
		)
	}
	if err != nil {
		log.Printf("SetUserReportPermissions error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": err.Error(),
		})
	}

	invalidateCacheForUser(userID)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"id":          mappingID,
			"permissions": req.Permissions,
		},
	})
}

// ==================== helpers ====================

type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanReportMapping(rows rowScanner) (models.ReportMapping, error) {
	var (
		m             models.ReportMapping
		permJSON      string
		effectiveDate sql.NullString
		expireDate    sql.NullString
	)

	if err := rows.Scan(&m.ID, &m.ReportCode, &permJSON, &effectiveDate, &expireDate, &m.IsActive); err != nil {
		return m, err
	}

	m.Permissions = parsePermissionJSON(permJSON)
	m.EffectiveDate = reportNullStr(effectiveDate)
	m.ExpireDate = reportNullStr(expireDate)
	return m, nil
}

func reportNullStr(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	return &v.String
}
