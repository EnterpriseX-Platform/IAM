package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"
	"log"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// GetMinistries lists every active ministry-level agency.
//
// Read-only against APP.M_AGC (external Oracle schema). Filtered to
// DATA_LEVEL_TYPE='MIN' and STATUS='active', ordered by Thai name.
//
// @Summary      List ministries
// @Description  Read-only — sources from external Oracle schema APP.M_AGC.
// @Tags         Admin · Agencies
// @Produce      json
// @Success      200  {object}  map[string]interface{}  "{data:[...]} — array of ministry rows"
// @Failure      500  {object}  map[string]string       "Oracle unavailable or query failure"
// @Router       /admin/agencies/ministries [get]
func GetMinistries(c *fiber.Ctx) error {
	db := core.GetDB()

	query := `
		SELECT 
			AGC_ID,
			AGC_CODE,
			AGC_NAME,
			AGC_TYPE,
			PARENT_ID
		FROM APP.M_AGC
		WHERE DATA_LEVEL_TYPE = 'MIN'
			AND STATUS = 'active'
		ORDER BY AGC_NAME
	`

	rows, err := db.Query(query)
	if err != nil {
		log.Printf("GetMinistries query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch ministries",
			"error":   err.Error(),
		})
	}
	defer rows.Close()

	var ministries []models.MAgc
	for rows.Next() {
		var m models.MAgc
		var parentID sql.NullString
		var agcType sql.NullString
		if err := rows.Scan(&m.AgcID, &m.AgcCode, &m.AgcName, &agcType, &parentID); err != nil {
			log.Printf("GetMinistries scan error: %v", err)
			continue
		}
		if agcType.Valid {
			m.AgcType = agcType.String
		}
		if parentID.Valid {
			m.ParentID = parentID.String
		}
		ministries = append(ministries, m)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    ministries,
	})
}

// GetAllAgencies returns id+name+type+parent for every active agency.
// Used by the UI to resolve agency UUIDs to display names without
// per-ID round-trips.
//
// @Summary      List all active agencies (id/name lookup)
// @Tags         Admin · Agencies
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Router       /admin/agencies/all [get]
func GetAllAgencies(c *fiber.Ctx) error {
	db := core.GetDB()

	query := `
		SELECT AGC_ID, AGC_CODE, AGC_NAME, AGC_TYPE, PARENT_ID
		FROM APP.M_AGC
		ORDER BY AGC_NAME
	`

	rows, err := db.Query(query)
	if err != nil {
		log.Printf("GetAllAgencies query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch agencies",
			"error":   err.Error(),
		})
	}
	defer rows.Close()

	var agencies []models.MAgc
	for rows.Next() {
		var m models.MAgc
		var parentID sql.NullString
		var agcType sql.NullString
		if err := rows.Scan(&m.AgcID, &m.AgcCode, &m.AgcName, &agcType, &parentID); err != nil {
			continue
		}
		if agcType.Valid {
			m.AgcType = agcType.String
		}
		if parentID.Valid {
			m.ParentID = parentID.String
		}
		agencies = append(agencies, m)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    agencies,
	})
}

// GET /oracle/agencies/children?parent_id=xxx
// ดึงหน่วยงานลูกตาม PARENT_ID
func GetAgencyChildren(c *fiber.Ctx) error {
	db := core.GetDB()
	parentID := c.Query("parent_id")

	if parentID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "parent_id is required",
		})
	}

	query := `
		SELECT 
			AGC_ID,
			AGC_CODE,
			AGC_NAME,
			AGC_TYPE,
			PARENT_ID
		FROM APP.M_AGC
		WHERE PARENT_ID = :1
			AND STATUS = 'active'
		ORDER BY AGC_NAME
	`

	rows, err := db.Query(query, parentID)
	if err != nil {
		log.Printf("GetAgencyChildren query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch agency children",
			"error":   err.Error(),
		})
	}
	defer rows.Close()

	var agencies []models.MAgc
	for rows.Next() {
		var m models.MAgc
		var parentID sql.NullString
		var agcType sql.NullString
		if err := rows.Scan(&m.AgcID, &m.AgcCode, &m.AgcName, &agcType, &parentID); err != nil {
			log.Printf("GetAgencyChildren scan error: %v", err)
			continue
		}
		if agcType.Valid {
			m.AgcType = agcType.String
		}
		if parentID.Valid {
			m.ParentID = parentID.String
		}
		agencies = append(agencies, m)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    agencies,
	})
}

// GET /oracle/agencies/types?parent_id=xxx
// ดึงประเภทหน่วยงานที่เป็นลูกของกระทรวงที่เลือก (distinct AGC_TYPE)
func GetAgencyTypesByParent(c *fiber.Ctx) error {
	db := core.GetDB()
	parentID := c.Query("parent_id")

	if parentID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "parent_id is required",
		})
	}

	// ดึง distinct AGC_TYPE ของลูก
	query := `
		SELECT DISTINCT AGC_TYPE
		FROM APP.M_AGC
		WHERE PARENT_ID = :1
			AND STATUS = 'active'
			AND AGC_TYPE IS NOT NULL
		ORDER BY AGC_TYPE
	`

	rows, err := db.Query(query, parentID)
	if err != nil {
		log.Printf("GetAgencyTypesByParent query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch agency types",
			"error":   err.Error(),
		})
	}
	defer rows.Close()

	var typeCodes []string
	for rows.Next() {
		var typeCode string
		if err := rows.Scan(&typeCode); err != nil {
			continue
		}
		typeCodes = append(typeCodes, typeCode)
	}

	// ดึง labels จาก REF_COMMON_DATA
	if len(typeCodes) == 0 {
		return c.JSON(fiber.Map{
			"success": true,
			"data":    []models.CommonDataOption{},
		})
	}

	// Build IN clause
	placeholders := make([]string, len(typeCodes))
	args := make([]interface{}, len(typeCodes))
	for i, code := range typeCodes {
		placeholders[i] = ":" + string(rune('1'+i))
		args[i] = code
	}

	labelQuery := `
		SELECT 
			COMMON_DATA_ID,
			COMMON_DATA_LABEL,
			COMMON_DATA_CODE
		FROM APP.REF_COMMON_DATA
		WHERE COMMON_DATA_TYPE = 'AGENCY_TYPE'
			AND COMMON_DATA_CODE IN (` + placeholders[0]

	// For simplicity, using basic query
	labelRows, err := db.Query(labelQuery, args...)
	if err != nil {
		// Fallback: return types without labels
		var results []models.CommonDataOption
		for _, code := range typeCodes {
			results = append(results, models.CommonDataOption{
				Value: code,
				Label: code,
				Code:  code,
			})
		}
		return c.JSON(fiber.Map{
			"success": true,
			"data":    results,
		})
	}
	defer labelRows.Close()

	var results []models.CommonDataOption
	for labelRows.Next() {
		var opt models.CommonDataOption
		var label, code sql.NullString
		var id int
		if err := labelRows.Scan(&id, &label, &code); err != nil {
			continue
		}
		opt.ID = id
		if label.Valid {
			opt.Label = label.String
		}
		if code.Valid {
			opt.Code = code.String
			opt.Value = code.String
		}
		results = append(results, opt)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    results,
	})
}

// Department - ข้อมูลกอง/แผนกจาก Oracle M_DEPARTMENT
type Department struct {
	DepartmentID   string `json:"departmentId"`
	DepartmentCode string `json:"departmentCode"`
	DepartmentName string `json:"departmentName"`
	AgencyID       string `json:"agencyId"`
	MinistryID     string `json:"ministryId"`
}

// CommonDataOption - ตัวเลือกจาก REF_COMMON_DATA
type CommonDataOption struct {
	ID    int    `json:"id"`
	Value string `json:"value"`
	Label string `json:"label"`
	Code  string `json:"code"`
}

// GetFilteredAgencies - GET /admin/agencies/filtered
// Returns agencies filtered by hierarchy level (MIN/DEPT/UNIT),
// parent ancestry, and optional geo columns (region, province, district, subdistrict).
// Supports multiple parent_ids (comma-separated) for multi-select cascades.
func GetFilteredAgencies(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	levelType := c.Query("level_type") // MIN | DEPT | UNIT
	parentIDs := c.Query("parent_ids") // comma-separated
	regionID := c.Query("region_id")
	provinceID := c.Query("province_id")
	districtID := c.Query("district_id")
	subdistrictID := c.Query("subdistrict_id")

	var args []interface{}

	// Geo matching on M_AGC itself
	geoCondition := "1=1"
	if regionID != "" {
		geoCondition += " AND rp.REGION_ID = :region_id"
	}
	if provinceID != "" {
		geoCondition += " AND (ma.PROVINCE_ID = :province_id OR ma.AGC_ID IN (SELECT AGC_ID FROM APP.M_AGC WHERE PROVINCE_ID = :province_id))"
	}
	if districtID != "" {
		geoCondition += " AND (ma.DISTRICT_ID = :district_id OR ma.AGC_ID IN (SELECT AGC_ID FROM APP.M_AGC WHERE DISTRICT_ID = :district_id))"
	}
	if subdistrictID != "" {
		geoCondition += " AND (ma.SUBDISTRICT_ID = :subdistrict_id OR ma.AGC_ID IN (SELECT AGC_ID FROM APP.M_AGC WHERE SUBDISTRICT_ID = :subdistrict_id))"
	}

	// Build the query
	query := `
		WITH GeoMatching AS (
			SELECT DISTINCT ma.AGC_ID
			FROM APP.M_AGC ma
			LEFT JOIN APP.REF_PROVINCE rp ON rp.PROVINCE_ID = ma.PROVINCE_ID
			WHERE ma.STATUS = 'active'
				AND (` + geoCondition + `)
		),
		WithAncestors AS (
			SELECT DISTINCT ma.AGC_ID, ma.PARENT_ID, ma.DATA_LEVEL_TYPE,
				ma.AGC_CODE, ma.AGC_NAME
			FROM APP.M_AGC ma
			WHERE ma.AGC_ID IN (SELECT AGC_ID FROM GeoMatching)
				OR ma.AGC_ID IN (
					SELECT DISTINCT m.PARENT_ID FROM APP.M_AGC m
					WHERE m.AGC_ID IN (SELECT AGC_ID FROM GeoMatching)
						AND m.PARENT_ID IS NOT NULL
				)
				OR ma.AGC_ID IN (
					SELECT DISTINCT m2.PARENT_ID FROM APP.M_AGC m2
					JOIN APP.M_AGC m1 ON m1.PARENT_ID = m2.AGC_ID
					WHERE m1.AGC_ID IN (SELECT AGC_ID FROM GeoMatching)
						AND m2.PARENT_ID IS NOT NULL
				)
		)
		SELECT AGC_ID, AGC_CODE, AGC_NAME, DATA_LEVEL_TYPE AS AGC_TYPE, PARENT_ID
		FROM WithAncestors
		WHERE DATA_LEVEL_TYPE = :level_type
	`

	args = append(args, sql.Named("level_type", levelType))

	if regionID != "" {
		args = append(args, sql.Named("region_id", regionID))
	}
	if provinceID != "" {
		args = append(args, sql.Named("province_id", provinceID))
	}
	if districtID != "" {
		args = append(args, sql.Named("district_id", districtID))
	}
	if subdistrictID != "" {
		args = append(args, sql.Named("subdistrict_id", subdistrictID))
	}

	// Handle multiple parent_ids for multi-select cascade
	if parentIDs != "" {
		parts := strings.Split(parentIDs, ",")
		placeholders := make([]string, len(parts))
		for i, id := range parts {
			placeholders[i] = ":parent_" + strconv.Itoa(i)
			args = append(args, sql.Named("parent_"+strconv.Itoa(i), strings.TrimSpace(id)))
		}
		query += " AND PARENT_ID IN (" + strings.Join(placeholders, ",") + ")"
	} else {
		query += " AND PARENT_ID IS NULL"
	}

	query += " ORDER BY AGC_NAME"

	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("GetFilteredAgencies error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Failed to fetch filtered agencies", "error": err.Error(),
		})
	}
	defer rows.Close()

	var agencies []models.MAgc
	for rows.Next() {
		var m models.MAgc
		var parentID sql.NullString
		var agcType sql.NullString
		if err := rows.Scan(&m.AgcID, &m.AgcCode, &m.AgcName, &agcType, &parentID); err != nil {
			log.Printf("GetFilteredAgencies scan error: %v", err)
			continue
		}
		if agcType.Valid {
			m.AgcType = agcType.String
		}
		if parentID.Valid {
			m.ParentID = parentID.String
		}
		agencies = append(agencies, m)
	}

	return c.JSON(fiber.Map{"success": true, "data": agencies})
}

// GetDepartments - GET /admin/agencies/departments
// ดึงรายชื่อกอง/แผนกจาก APP.M_DEPARTMENT พร้อม agency_id และ ministry_id สำหรับ auto-fill สังกัด
func GetDepartments(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	query := `
		SELECT md.DEPARTMENT_ID,
			   md.DEPARTMENT_CODE,
			   md.DEPARTMENT_NAME,
			   ma.AGC_ID   AS AGENCY_ID,
			   ma2.AGC_ID  AS MINISTRY_ID
		FROM APP.M_DEPARTMENT md
		LEFT JOIN APP.M_AGC ma ON ma.AGC_ID = md.AGC_ID
		LEFT JOIN APP.M_AGC ma2 ON ma2.AGC_ID = ma.PARENT_ID
		WHERE md.STATUS = 'active'
		ORDER BY md.DEPARTMENT_NAME
	`

	rows, err := db.Query(query)
	if err != nil {
		log.Printf("GetDepartments query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Failed to fetch departments", "error": err.Error(),
		})
	}
	defer rows.Close()

	var departments []Department
	for rows.Next() {
		var d Department
		var agencyID, ministryID sql.NullString
		if err := rows.Scan(&d.DepartmentID, &d.DepartmentCode, &d.DepartmentName, &agencyID, &ministryID); err != nil {
			log.Printf("GetDepartments scan error: %v", err)
			continue
		}
		if agencyID.Valid {
			d.AgencyID = agencyID.String
		}
		if ministryID.Valid {
			d.MinistryID = ministryID.String
		}
		departments = append(departments, d)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    departments,
	})
}
