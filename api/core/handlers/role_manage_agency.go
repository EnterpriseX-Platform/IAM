package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// GET /manage-permission/roles/:roleId/bindings/:bindingId/agencies
// ดึงข้อมูล ROLE_MANAGE_AGENCY ที่ผูกกับ ROLE_MANAGE_ID
func GetRoleManageAgencies(c *fiber.Ctx) error {
	db := core.GetDB()

	bindingId := strings.TrimSpace(c.Params("bindingId"))
	if bindingId == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "bindingId is required",
		})
	}

	query := `
		SELECT
			ROLE_MANAGE_ID,
			ROLE_AGC_TYPE,
			ROLE_AGC_ID,
			SEQ,
			TO_CHAR(EFFECTIVE_DATE, 'YYYY-MM-DD') AS EFFECTIVE_DATE,
			TO_CHAR(EXPIRE_DATE, 'YYYY-MM-DD') AS EXPIRE_DATE,
			STATUS,
			PERMISSION_DATA,
			TO_CHAR(CREATED_DATE, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_DATE,
			CREATED_BY,
			TO_CHAR(UPDATED_DATE, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_DATE,
			UPDATED_BY
		FROM IAMX.ROLE_MANAGE_AGENCY
		WHERE ROLE_MANAGE_ID = :1
		ORDER BY SEQ
	`

	rows, err := db.Query(query, bindingId)
	if err != nil {
		log.Printf("GetRoleManageAgencies query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch role manage agencies",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	results := make([]models.RoleManageAgency, 0)

	for rows.Next() {
		var (
			roleManageID   sql.NullString
			roleAgcType    sql.NullString
			roleAgcID      sql.NullString
			seq            sql.NullInt64
			effectiveDate  sql.NullString
			expireDate     sql.NullString
			status         sql.NullString
			permissionData sql.NullString
			createdDate    sql.NullString
			createdBy      sql.NullString
			updatedDate    sql.NullString
			updatedBy      sql.NullString
		)

		if err := rows.Scan(
			&roleManageID,
			&roleAgcType,
			&roleAgcID,
			&seq,
			&effectiveDate,
			&expireDate,
			&status,
			&permissionData,
			&createdDate,
			&createdBy,
			&updatedDate,
			&updatedBy,
		); err != nil {
			log.Printf("GetRoleManageAgencies scan error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to scan rows",
				"message": err.Error(),
			})
		}

		out := models.RoleManageAgency{}

		if roleManageID.Valid {
			out.RoleManageID = &roleManageID.String
		}
		if roleAgcType.Valid {
			out.RoleAgcType = &roleAgcType.String
		}
		if roleAgcID.Valid {
			out.RoleAgcID = &roleAgcID.String
		}
		if seq.Valid {
			v := int(seq.Int64)
			out.Seq = &v
		}
		if effectiveDate.Valid {
			out.EffectiveDate = &effectiveDate.String
		}
		if expireDate.Valid {
			out.ExpireDate = &expireDate.String
		}
		if status.Valid {
			out.Status = &status.String
		}
		if permissionData.Valid {
			out.PermissionData = &permissionData.String
		}
		if createdDate.Valid {
			out.CreatedDate = &createdDate.String
		}
		if createdBy.Valid {
			out.CreatedBy = &createdBy.String
		}
		if updatedDate.Valid {
			out.UpdatedDate = &updatedDate.String
		}
		if updatedBy.Valid {
			out.UpdatedBy = &updatedBy.String
		}

		results = append(results, out)
	}

	if err := rows.Err(); err != nil {
		log.Printf("GetRoleManageAgencies rows.Err: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Row iteration error",
			"message": err.Error(),
		})
	}

	return c.JSON(results)
}

// POST /manage-permission/agencies
// สร้าง ROLE_MANAGE_AGENCY ใหม่
func CreateRoleManageAgency(c *fiber.Ctx) error {
	db := core.GetDB()

	var req models.SaveRoleManageAgencyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid JSON body",
			"error":   err.Error(),
		})
	}

	// Validate required fields
	if strings.TrimSpace(req.RoleManageID) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleManageId is required",
		})
	}
	if strings.TrimSpace(req.RoleAgcType) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleAgcType is required",
		})
	}
	if strings.TrimSpace(req.RoleAgcID) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleAgcId is required",
		})
	}
	if strings.TrimSpace(req.EffectiveDate) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "effectiveDate is required",
		})
	}
	if strings.TrimSpace(req.Status) == "" {
		req.Status = "ACTIVE"
	}
	if strings.TrimSpace(req.CreatedBy) == "" {
		req.CreatedBy = "SYSTEM"
	}

	// Get next SEQ for this ROLE_MANAGE_ID
	var nextSeq int = 1
	seqQuery := `SELECT NVL(MAX(SEQ), 0) + 1 FROM IAMX.ROLE_MANAGE_AGENCY WHERE ROLE_MANAGE_ID = :1`
	if err := db.QueryRow(seqQuery, req.RoleManageID).Scan(&nextSeq); err != nil {
		log.Printf("CreateRoleManageAgency SEQ query error: %v", err)
		// Continue with default seq = 1
	}

	insSQL := `
		INSERT INTO IAMX.ROLE_MANAGE_AGENCY (
			ROLE_MANAGE_ID,
			ROLE_AGC_TYPE,
			ROLE_AGC_ID,
			SEQ,
			EFFECTIVE_DATE,
			EXPIRE_DATE,
			STATUS,
			PERMISSION_DATA,
			CREATED_DATE,
			CREATED_BY
		) VALUES (
			:1, :2, :3, :4,
			TO_DATE(:5, 'YYYY-MM-DD'),
			CASE WHEN :6 IS NOT NULL THEN TO_DATE(:6, 'YYYY-MM-DD') ELSE NULL END,
			:7, :8,
			SYSTIMESTAMP,
			:9
		)
	`

	expireDate := sql.NullString{}
	if strings.TrimSpace(req.ExpireDate) != "" {
		expireDate.String = req.ExpireDate
		expireDate.Valid = true
	}

	permissionData := sql.NullString{}
	if strings.TrimSpace(req.PermissionData) != "" {
		permissionData.String = req.PermissionData
		permissionData.Valid = true
	}

	_, err := db.Exec(
		insSQL,
		req.RoleManageID,
		req.RoleAgcType,
		req.RoleAgcID,
		nextSeq,
		req.EffectiveDate,
		expireDate,
		req.Status,
		permissionData,
		req.CreatedBy,
	)

	if err != nil {
		log.Printf("CreateRoleManageAgency insert error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create role manage agency",
			"error":   err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Created role manage agency",
		"data": fiber.Map{
			"roleManageId": req.RoleManageID,
			"seq":          nextSeq,
		},
	})
}

// PUT /manage-permission/agencies/:roleManageId/:seq
// แก้ไข ROLE_MANAGE_AGENCY
func UpdateRoleManageAgency(c *fiber.Ctx) error {
	db := core.GetDB()

	roleManageId := strings.TrimSpace(c.Params("roleManageId"))
	seqStr := strings.TrimSpace(c.Params("seq"))

	if roleManageId == "" || seqStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleManageId and seq are required",
		})
	}

	var req models.SaveRoleManageAgencyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid JSON body",
			"error":   err.Error(),
		})
	}

	// Validate required fields
	if strings.TrimSpace(req.RoleAgcType) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleAgcType is required",
		})
	}
	if strings.TrimSpace(req.RoleAgcID) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleAgcId is required",
		})
	}
	if strings.TrimSpace(req.EffectiveDate) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "effectiveDate is required",
		})
	}
	if strings.TrimSpace(req.Status) == "" {
		req.Status = "ACTIVE"
	}
	if strings.TrimSpace(req.CreatedBy) == "" {
		req.CreatedBy = "SYSTEM"
	}

	updSQL := `
		UPDATE IAMX.ROLE_MANAGE_AGENCY
		SET
			ROLE_AGC_TYPE = :1,
			ROLE_AGC_ID = :2,
			EFFECTIVE_DATE = TO_DATE(:3, 'YYYY-MM-DD'),
			EXPIRE_DATE = CASE WHEN :4 IS NOT NULL THEN TO_DATE(:4, 'YYYY-MM-DD') ELSE NULL END,
			STATUS = :5,
			PERMISSION_DATA = :6,
			UPDATED_DATE = SYSTIMESTAMP,
			UPDATED_BY = :7
		WHERE ROLE_MANAGE_ID = :8 AND SEQ = :9
	`

	expireDate := sql.NullString{}
	if strings.TrimSpace(req.ExpireDate) != "" {
		expireDate.String = req.ExpireDate
		expireDate.Valid = true
	}

	permissionData := sql.NullString{}
	if strings.TrimSpace(req.PermissionData) != "" {
		permissionData.String = req.PermissionData
		permissionData.Valid = true
	}

	result, err := db.Exec(
		updSQL,
		req.RoleAgcType,
		req.RoleAgcID,
		req.EffectiveDate,
		expireDate,
		req.Status,
		permissionData,
		req.CreatedBy, // UPDATED_BY
		roleManageId,
		seqStr,
	)

	if err != nil {
		log.Printf("UpdateRoleManageAgency update error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update role manage agency",
			"error":   err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()

	return c.JSON(fiber.Map{
		"success":      true,
		"message":      "Updated role manage agency",
		"rowsAffected": rowsAffected,
	})
}

// DELETE /manage-permission/agencies/:roleManageId/:seq
// ลบ ROLE_MANAGE_AGENCY
func DeleteRoleManageAgency(c *fiber.Ctx) error {
	db := core.GetDB()

	roleManageId := strings.TrimSpace(c.Params("roleManageId"))
	seqStr := strings.TrimSpace(c.Params("seq"))

	if roleManageId == "" || seqStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleManageId and seq are required",
		})
	}

	delSQL := `
		DELETE FROM IAMX.ROLE_MANAGE_AGENCY
		WHERE ROLE_MANAGE_ID = :1 AND SEQ = :2
	`

	result, err := db.Exec(delSQL, roleManageId, seqStr)
	if err != nil {
		log.Printf("DeleteRoleManageAgency delete error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to delete role manage agency",
			"error":   err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()

	return c.JSON(fiber.Map{
		"success":      true,
		"message":      "Deleted role manage agency",
		"rowsAffected": rowsAffected,
	})
}

// GET /agency-type-options
// ดึงตัวเลือกประเภทหน่วยงาน
func GetAgencyTypeOptions(c *fiber.Ctx) error {
	// ส่ง hardcoded options สำหรับประเภทหน่วยงาน
	options := []fiber.Map{
		{"value": "MINISTRY", "label": "ระดับกระทรวง"},
		{"value": "DEPARTMENT", "label": "ระดับกรม"},
		{"value": "UNIT", "label": "ระดับหน่วยปฏิบัติ"},
	}

	return c.JSON(options)
}

// GET /agency-options?type=MINISTRY|DEPARTMENT|UNIT
// ดึงตัวเลือกหน่วยงานตามประเภท
// TODO: แก้ไข query ให้ตรงกับโครงสร้างจริงของ database
func GetAgencyOptions(c *fiber.Ctx) error {
	db := core.GetDB()

	agencyType := strings.TrimSpace(c.Query("type"))
	if agencyType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "type parameter is required",
		})
	}

	// TODO: แก้ไข query ให้ดึงจากตารางที่เหมาะสม
	// ตอนนี้ใช้ placeholder query
	var query string
	switch agencyType {
	case "MINISTRY":
		// TODO: ดึงจากตารางกระทรวงจริง
		query = `
			SELECT DISTINCT
				'MIN_' || ROWNUM AS ID,
				'กระทรวง ' || ROWNUM AS NAME,
				'MINISTRY' AS TYPE
			FROM DUAL
			CONNECT BY LEVEL <= 5
		`
	case "DEPARTMENT":
		// TODO: ดึงจากตารางกรมจริง
		query = `
			SELECT DISTINCT
				'DEPT_' || ROWNUM AS ID,
				'กรม ' || ROWNUM AS NAME,
				'DEPARTMENT' AS TYPE
			FROM DUAL
			CONNECT BY LEVEL <= 10
		`
	case "UNIT":
		// TODO: ดึงจากตารางหน่วยปฏิบัติจริง
		query = `
			SELECT DISTINCT
				'UNIT_' || ROWNUM AS ID,
				'หน่วยปฏิบัติ ' || ROWNUM AS NAME,
				'UNIT' AS TYPE
			FROM DUAL
			CONNECT BY LEVEL <= 20
		`
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid type parameter",
		})
	}

	rows, err := db.Query(query)
	if err != nil {
		log.Printf("GetAgencyOptions query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch agency options",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	results := make([]models.AgencyOption, 0)

	for rows.Next() {
		var (
			id   sql.NullString
			name sql.NullString
			typ  sql.NullString
		)

		if err := rows.Scan(&id, &name, &typ); err != nil {
			log.Printf("GetAgencyOptions scan error: %v", err)
			continue
		}

		out := models.AgencyOption{}
		if id.Valid {
			out.ID = &id.String
		}
		if name.Valid {
			out.Name = &name.String
		}
		if typ.Valid {
			out.Type = &typ.String
		}

		results = append(results, out)
	}

	return c.JSON(results)
}
