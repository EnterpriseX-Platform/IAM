package handlers

import (
	"api/core"
	"api/core/models"
	"api/core/usertypes"
	"database/sql"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ============ Level 1: DOMAINS ============

// GetDomains lists every active domain.
//
// Domains are the top-level grouping in the IAMX catalog — each domain owns
// a set of applications, which in turn own modules and objects.
//
// @Summary      List domains
// @Description  Returns every active domain, ordered by id. Inactive rows are filtered out at the SQL level.
// @Tags         Admin · Catalog
// @Produce      json
// @Success      200  {object}  map[string]interface{}  "{data:[...]} — array of DomainResponse"
// @Failure      500  {object}  map[string]string       "Oracle unavailable or query failure"
// @Router       /admin/domains [get]
func GetDomains(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	query := `SELECT id, code, name, description, NVL(menu_type,` + usertypes.SQLStaff() + `) AS menu_type, is_active, created_by, updated_by, created_at, updated_at
			  FROM domain
			  WHERE is_active = 1
			  ORDER BY id`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch domains",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	domains := []models.DomainResponse{}
	for rows.Next() {
		var d models.Domain
		err := rows.Scan(&d.ID, &d.Code, &d.Name, &d.Description, &d.MenuType, &d.IsActive, &d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt)
		if err != nil {
			continue
		}
		domains = append(domains, d.ToResponse())
	}

	return c.JSON(fiber.Map{"data": domains})
}

// CreateDomain inserts a new domain row.
//
// @Summary      Create a domain
// @Tags         Admin · Catalog
// @Accept       json
// @Produce      json
// @Param        body  body  object{code=string,name=string,description=string,is_active=int}  true  "Domain payload — code and name are required, description optional, is_active 1/0"
// @Success      201   {object}  map[string]interface{}  "{id, message}"
// @Failure      400   {object}  map[string]string       "Body parse error"
// @Failure      500   {object}  map[string]string       "Oracle error (often unique-constraint on code)"
// @Router       /admin/domains [post]
func CreateDomain(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req struct {
		Code        string  `json:"code"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
		MenuType    string  `json:"menu_type"`
		IsActive    int16   `json:"is_active"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.MenuType == "" {
		req.MenuType = usertypes.StaffCode()
	}
	menuType, ok := normalizeDomainMenuType(req.MenuType)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ประเภทเมนูต้องเป็น internal และ/หรือ agency อย่างน้อย 1 ประเภท"})
	}
	req.MenuType = menuType

	var newID int64
	_, err := db.Exec(
		`INSERT INTO IAMX.DOMAIN (code, name, description, menu_type, is_active)
		 VALUES (:1, :2, :3, :4, :5)
		 RETURNING id INTO :out`,
		req.Code, req.Name, req.Description, req.MenuType, req.IsActive,
		sql.Named("out", sql.Out{Dest: &newID}),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create domain",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Domain created successfully",
		"id":      newID,
	})
}

// UpdateDomain updates a single domain row.
//
// @Summary      Update a domain
// @Tags         Admin · Catalog
// @Accept       json
// @Produce      json
// @Param        id    path   int    true   "Domain id"
// @Param        body  body   object{code=string,name=string,description=string,is_active=int}  true  "Updated domain payload"
// @Success      200   {object}  map[string]string  "{message}"
// @Failure      400   {object}  map[string]string  "Missing id or body parse error"
// @Failure      500   {object}  map[string]string  "Oracle error"
// @Router       /admin/domains/{id} [put]
func UpdateDomain(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	domainID := c.Params("id")
	if domainID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Domain ID is required"})
	}

	var req struct {
		Code        string  `json:"code"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
		MenuType    string  `json:"menu_type"`
		IsActive    int16   `json:"is_active"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	// ว่าง = คงประเภทเมนูเดิม (เช่น ปุ่มเปิด/ปิดใช้งานในรายการ) — โดเมนที่ยังไม่มีค่าได้ internal เหมือนเดิม
	if req.MenuType != "" {
		menuType, ok := normalizeDomainMenuType(req.MenuType)
		if !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ประเภทเมนูต้องเป็น internal และ/หรือ agency อย่างน้อย 1 ประเภท"})
		}
		req.MenuType = menuType
	}

	query := `UPDATE domain SET code = :1, name = :2, description = :3, menu_type = :4, is_active = :5 WHERE id = :6`
	args := []interface{}{req.Code, req.Name, req.Description, req.MenuType, req.IsActive, domainID}
	if req.MenuType == "" {
		query = `UPDATE domain SET code = :1, name = :2, description = :3, menu_type = NVL(menu_type, ` + usertypes.SQLStaff() + `), is_active = :4 WHERE id = :5`
		args = []interface{}{req.Code, req.Name, req.Description, req.IsActive, domainID}
	}

	_, err := db.Exec(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update domain",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Domain updated successfully",
	})
}

// "internal" | "agency" | "internal,agency" — ค่าเดียวแบบเดิมยังเป็นรูปเดิม (backward compatible)
// รับได้ทั้งสตริงคั่น comma ตัดช่องว่าง/ตัวพิมพ์/ค่าซ้ำ · มีค่าอื่นปนหรือไม่เหลือสักค่า = ไม่ผ่าน
func normalizeDomainMenuType(raw string) (string, bool) {
	seen := map[string]bool{}
	for _, p := range strings.Split(raw, ",") {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" {
			continue
		}
		if !usertypes.Valid(p) { // 16/11/69: รายการประเภทจากค่าตั้ง IAMX.USER_TYPE
			return "", false
		}
		seen[p] = true
	}
	out := []string{}
	for _, t := range usertypes.All() {
		if seen[t.Code] {
			out = append(out, t.Code)
		}
	}
	if len(out) == 0 {
		return "", false
	}
	return strings.Join(out, ","), true
}

// DeleteDomain removes a domain row by id.
//
// @Summary      Delete a domain
// @Tags         Admin · Catalog
// @Produce      json
// @Param        id   path   int    true   "Domain id"
// @Success      200  {object}  map[string]string  "{message}"
// @Failure      400  {object}  map[string]string  "Missing id"
// @Failure      500  {object}  map[string]string  "Oracle error (FK violation etc.)"
// @Router       /admin/domains/{id} [delete]
func DeleteDomain(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	domainID := c.Params("id")
	if domainID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Domain ID is required"})
	}

	query := `DELETE FROM domain WHERE id = :1`

	_, err := db.Exec(query, domainID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete domain",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Domain deleted successfully",
	})
}

// ============ Level 2: APPLICATIONS (เชื่อมกับ Domain) ============

func GetApplicationsByDomain(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	domainID := c.Params("id")

	query := `SELECT id, domain_id, code, name, description, sort_order, is_active, icon, created_by, updated_by, created_at, updated_at
			  FROM application
			  WHERE domain_id = :1 AND is_active = 1
			  ORDER BY sort_order, id`

	rows, err := db.Query(query, domainID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch applications",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	applications := []models.ApplicationResponse{}
	for rows.Next() {
		var a models.Application
		err := rows.Scan(&a.ID, &a.DomainID, &a.Code, &a.Name, &a.Description, &a.SortOrder, &a.IsActive, &a.Icon, &a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt)
		if err != nil {
			continue
		}
		applications = append(applications, a.ToResponse())
	}

	return c.JSON(fiber.Map{"data": applications})
}

func CreateApplication(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req models.CreateApplicationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var newID int64
	_, err := db.Exec(
		`INSERT INTO IAMX.APPLICATION (domain_id, code, name, description, sort_order, is_active, icon)
		 VALUES (:1, :2, :3, :4, :5, :6, :7)
		 RETURNING id INTO :out`,
		req.DomainID, req.Code, req.Name, req.Description, req.SortOrder, req.IsActive, req.Icon,
		sql.Named("out", sql.Out{Dest: &newID}),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create application",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Application created successfully",
		"id":      newID,
	})
}

func UpdateApplication(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	applicationID := c.Params("id")
	if applicationID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Application ID is required"})
	}

	var req models.UpdateApplicationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Build dynamic query
	var updates []string
	var args []interface{}
	argCount := 1

	if req.Code != nil {
		updates = append(updates, fmt.Sprintf("code = :%d", argCount))
		args = append(args, *req.Code)
		argCount++
	}
	if req.Name != nil {
		updates = append(updates, fmt.Sprintf("name = :%d", argCount))
		args = append(args, *req.Name)
		argCount++
	}
	if req.Description != nil {
		updates = append(updates, fmt.Sprintf("description = :%d", argCount))
		args = append(args, *req.Description)
		argCount++
	}
	if req.IsActive != nil {
		updates = append(updates, fmt.Sprintf("is_active = :%d", argCount))
		args = append(args, *req.IsActive)
		argCount++
	}
	if req.Icon != nil {
		updates = append(updates, fmt.Sprintf("icon = :%d", argCount))
		args = append(args, *req.Icon)
		argCount++
	}
	if req.SortOrder != nil {
		updates = append(updates, fmt.Sprintf("sort_order = :%d", argCount))
		args = append(args, *req.SortOrder)
		argCount++
	}

	if len(updates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No fields to update"})
	}

	query := fmt.Sprintf(`UPDATE application SET %s WHERE id = :%d`,
		strings.Join(updates, ", "), argCount)
	args = append(args, applicationID)

	_, err := db.Exec(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update application",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Application updated successfully",
	})
}

// ============ Level 3: MODULES (เชื่อมกับ Application) ============

func GetModulesByApplication(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	applicationID := c.Params("id")

	query := `SELECT id, application_id, code, name, description, sort_order, is_active, icon, context_path, created_by, updated_by, created_at, updated_at
			  FROM module
			  WHERE application_id = :1 AND is_active = 1
			  ORDER BY sort_order, id`

	rows, err := db.Query(query, applicationID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch modules",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	modules := []models.ModuleResponse{}
	for rows.Next() {
		var m models.Module
		err := rows.Scan(&m.ID, &m.ApplicationID, &m.Code, &m.Name, &m.Description, &m.SortOrder, &m.IsActive, &m.Icon, &m.ContextPath, &m.CreatedBy, &m.UpdatedBy, &m.CreatedAt, &m.UpdatedAt)
		if err != nil {
			continue
		}
		modules = append(modules, m.ToResponse())
	}

	return c.JSON(fiber.Map{"data": modules})
}

func CreateModule(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req models.CreateModuleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Reactivate if inactive record with same code exists
	var existingID int64
	err := db.QueryRow(`SELECT id FROM IAMX.MODULE WHERE code = :1 AND is_active = 0`, req.Code).Scan(&existingID)
	if err == nil && existingID > 0 {
		_, err = db.Exec(`UPDATE IAMX.MODULE SET application_id=:1, name=:2, description=:3, sort_order=:4, is_active=1, icon=:5, updated_at=SYSTIMESTAMP WHERE id=:6`,
			req.ApplicationID, req.Name, req.Description, req.SortOrder, req.Icon, existingID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to reactivate module", "message": err.Error()})
		}
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "Module reactivated successfully", "id": existingID})
	}

	var newID int64
	_, err = db.Exec(
		`INSERT INTO IAMX.MODULE (application_id, code, name, description, sort_order, is_active, icon)
		 VALUES (:1, :2, :3, :4, :5, :6, :7)
		 RETURNING id INTO :out`,
		req.ApplicationID, req.Code, req.Name, req.Description, req.SortOrder, req.IsActive, req.Icon,
		sql.Named("out", sql.Out{Dest: &newID}),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create module",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Module created successfully",
		"id":      newID,
	})
}

func UpdateModule(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	moduleID := c.Params("id")
	if moduleID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Module ID is required"})
	}

	var req models.UpdateModuleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Build dynamic query
	var updates []string
	var args []interface{}
	argCount := 1

	if req.Code != nil {
		updates = append(updates, fmt.Sprintf("code = :%d", argCount))
		args = append(args, *req.Code)
		argCount++
	}
	if req.Name != nil {
		updates = append(updates, fmt.Sprintf("name = :%d", argCount))
		args = append(args, *req.Name)
		argCount++
	}
	if req.Description != nil {
		updates = append(updates, fmt.Sprintf("description = :%d", argCount))
		args = append(args, *req.Description)
		argCount++
	}
	if req.SortOrder != nil {
		updates = append(updates, fmt.Sprintf("sort_order = :%d", argCount))
		args = append(args, *req.SortOrder)
		argCount++
	}
	if req.IsActive != nil {
		updates = append(updates, fmt.Sprintf("is_active = :%d", argCount))
		args = append(args, *req.IsActive)
		argCount++
	}
	if req.Icon != nil {
		updates = append(updates, fmt.Sprintf("icon = :%d", argCount))
		args = append(args, *req.Icon)
		argCount++
	}
	if req.ContextPath != nil {
		// "" clears it — an empty contextPath means "paths under this module are
		// stored whole", which is a real setting, not a missing one.
		updates = append(updates, fmt.Sprintf("context_path = :%d", argCount))
		if *req.ContextPath == "" {
			args = append(args, nil)
		} else {
			args = append(args, *req.ContextPath)
		}
		argCount++
	}

	if len(updates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No fields to update"})
	}

	query := fmt.Sprintf(`UPDATE module SET %s WHERE id = :%d`,
		strings.Join(updates, ", "), argCount)
	args = append(args, moduleID)

	_, err := db.Exec(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update module",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Module updated successfully",
	})
}

func DeleteModule(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}
	id := c.Params("id")

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start transaction", "message": err.Error()})
	}
	defer tx.Rollback()

	res, err := tx.Exec(`UPDATE IAMX.MODULE SET is_active = 0, updated_at = SYSTIMESTAMP WHERE id = :1`, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete module", "message": err.Error()})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "module not found"})
	}

	// Cascade: deactivate all child objects under this module
	if _, err := tx.Exec(`UPDATE IAMX.OBJECT SET is_active = 0, updated_at = SYSTIMESTAMP WHERE module_id = :1 AND is_active = 1`, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to deactivate child objects", "message": err.Error()})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit", "message": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Module deleted"})
}

// ============ Level 4: APP OBJECTS (เชื่อมกับ Module) ============

func GetObjectsByModule(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	moduleID := c.Params("id")

	query := `SELECT ao.id, ao.module_id, ao.object_type_id, ao.parent_id, ao.code, ao.name, ao.path,
				     ao.object_level, ao.sort_order, ao.is_active,
				     ot.name as type_name
			  FROM object ao
			  LEFT JOIN object_type ot ON ao.object_type_id = ot.id
			  WHERE ao.module_id = :1 AND ao.is_active = 1
			  ORDER BY ao.object_level, ao.sort_order, ao.id`

	rows, err := db.Query(query, moduleID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch objects",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	objectMap := make(map[int64]*models.ObjectItem)
	parentMap := make(map[int64]*int64)

	for rows.Next() {
		var o models.AppObject
		var typeName sql.NullString
		err := rows.Scan(&o.ID, &o.ModuleID, &o.ObjectTypeID, &o.ParentID, &o.Code, &o.Name, &o.Path,
			&o.ObjectLevel, &o.SortOrder, &o.IsActive, &typeName)
		if err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}

		typeNameStr := "UNKNOWN"
		if typeName.Valid {
			typeNameStr = typeName.String
		}
		typeID := int32(o.ObjectTypeID)

		objItem := &models.ObjectItem{
			ObjectID:       &o.ID,
			ObjectName:     &o.Name,
			Code:           &o.Code,
			ObjectTypeID:   &typeID,
			ObjectTypeName: &typeNameStr,
			ObjectLevel:    o.ObjectLevel,
			SortOrder:      o.SortOrder,
			Children:       []*models.ObjectItem{},
		}

		if o.Path.Valid {
			objItem.Path = &o.Path.String
		}
		if o.ParentID.Valid {
			parentID := o.ParentID.Int64
			objItem.ParentObjectID = &parentID
			parentMap[o.ID] = &parentID
		}

		objectMap[o.ID] = objItem
	}

	rootObjects := buildObjectTree(objectMap, parentMap)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    rootObjects,
	})
}

func generateObjectCode(db *sql.DB, moduleID int64, parentID *int64) (string, error) {
	if parentID == nil || *parentID == 0 {
		var moduleCode string
		if err := db.QueryRow(`SELECT code FROM module WHERE id = :1`, moduleID).Scan(&moduleCode); err != nil {
			return "", fmt.Errorf("failed to get module code: %w", err)
		}
		var count int
		db.QueryRow(`SELECT COUNT(*) FROM object WHERE module_id = :1 AND parent_id IS NULL`, moduleID).Scan(&count)
		return fmt.Sprintf("%s_%02d", moduleCode, count+1), nil
	}
	var parentCode string
	if err := db.QueryRow(`SELECT code FROM object WHERE id = :1`, *parentID).Scan(&parentCode); err != nil {
		return "", fmt.Errorf("failed to get parent code: %w", err)
	}
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM object WHERE parent_id = :1`, *parentID).Scan(&count)
	return fmt.Sprintf("%s-%02d", parentCode, count+1), nil
}

func GetNextObjectCode(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}
	moduleID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid module ID"})
	}
	var parentID *int64
	if pid := c.QueryInt("parent_id", 0); pid > 0 {
		p := int64(pid)
		parentID = &p
	}
	code, err := generateObjectCode(db, moduleID, parentID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"code": code})
}

func CreateObjectByModule(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	moduleIDStr := c.Params("id")
	moduleID, err := strconv.ParseInt(moduleIDStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid module ID"})
	}

	var req struct {
		ObjectTypeID int32   `json:"object_type_id"`
		ParentID     *int64  `json:"parent_id"`
		Code         string  `json:"code"`
		Name         string  `json:"name"`
		Path         *string `json:"path"`
		ObjectLevel  int32   `json:"object_level"`
		SortOrder    int32   `json:"sort_order"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Auto-generate code if not provided
	if req.Code == "" {
		req.Code, err = generateObjectCode(db, moduleID, req.ParentID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate object code: " + err.Error()})
		}
	}

	// Auto-calculate object_level based on parent
	objectLevel := int32(1)
	if req.ParentID != nil && *req.ParentID > 0 {
		var parentLevel int32
		if err := db.QueryRow(`SELECT COALESCE(object_level, 1) FROM object WHERE id = :1`, *req.ParentID).Scan(&parentLevel); err == nil {
			objectLevel = parentLevel + 1
		}
	}

	var newID int64
	_, err = db.Exec(
		`INSERT INTO IAMX.OBJECT (module_id, object_type_id, parent_id, code, name, path, object_level, sort_order, is_active)
		 VALUES (:1, :2, :3, :4, :5, :6, :7, :8, 1)
		 RETURNING id INTO :out`,
		moduleID, req.ObjectTypeID, req.ParentID, req.Code, req.Name, req.Path, objectLevel, req.SortOrder,
		sql.Named("out", sql.Out{Dest: &newID}),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create object",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "Object created successfully",
		"id":      newID,
		"code":    req.Code,
	})
}

func UpdateObject(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	objectID := c.Params("id")

	var req struct {
		ObjectTypeID int32   `json:"object_type_id"`
		ParentID     *int64  `json:"parent_id"`
		Code         string  `json:"code"`
		Name         string  `json:"name"`
		Path         *string `json:"path"`
		ObjectLevel  int32   `json:"object_level"`
		SortOrder    int32   `json:"sort_order"`
		IsShortcut   int32   `json:"is_shortcut"`
		ContextPath  *string `json:"context_path"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Auto-calculate object_level based on parent
	objectLevel := int32(1) // Default level 1 (direct child of module)
	if req.ParentID != nil && *req.ParentID > 0 {
		var parentLevel int32
		err := db.QueryRow(`SELECT COALESCE(object_level, 1) FROM object WHERE id = :1`, *req.ParentID).Scan(&parentLevel)
		if err == nil {
			objectLevel = parentLevel + 1
		}
	}

	// context_path only moves when the caller sends the field, so existing
	// callers that never heard of it cannot wipe an override.
	query := `UPDATE object
			  SET object_type_id = :1, parent_id = :2, code = :3, name = :4, path = :5, object_level = :6, sort_order = :7, is_shortcut = :8,
			      context_path = CASE WHEN :9 = 1 THEN :10 ELSE context_path END
			  WHERE id = :11`

	ctxSent := 0
	var ctxVal interface{}
	if req.ContextPath != nil {
		ctxSent = 1
		if *req.ContextPath != "" {
			ctxVal = *req.ContextPath
		}
	}
	_, err := db.Exec(query, req.ObjectTypeID, req.ParentID, req.Code, req.Name, req.Path, objectLevel, req.SortOrder, req.IsShortcut, ctxSent, ctxVal, objectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update object",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Object updated successfully",
	})
}

func DeleteObject(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	objectID := c.Params("id")

	// Check if object has children
	var childCount int
	err := db.QueryRow(`SELECT COUNT(*) FROM object WHERE parent_id = :1`, objectID).Scan(&childCount)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to check children",
			"message": err.Error(),
		})
	}

	if childCount > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Cannot delete object with children. Please delete children first.",
		})
	}

	// Collect affected role_ids before deleting (for cache invalidation)
	var affectedRoles []string
	roleRows, _ := db.Query(`SELECT DISTINCT role_id FROM role_object_mapping WHERE object_id = :1`, objectID)
	if roleRows != nil {
		for roleRows.Next() {
			var rid string
			roleRows.Scan(&rid)
			affectedRoles = append(affectedRoles, rid)
		}
		roleRows.Close()
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start transaction", "message": err.Error()})
	}
	defer tx.Rollback()

	// Cascade all FK children → OBJECT
	cascade := []string{
		`DELETE FROM role_object_permission WHERE role_object_mapping_id IN (SELECT id FROM role_object_mapping WHERE object_id = :1)`,
		`DELETE FROM role_object_mapping WHERE object_id = :1`,
		`DELETE FROM user_custom_object_permission WHERE user_custom_object_mapping_id IN (SELECT id FROM user_custom_object_mapping WHERE object_id = :1)`,
		`DELETE FROM user_custom_object_mapping WHERE object_id = :1`,
		`DELETE FROM process_mapper WHERE object_id = :1`,
		`DELETE FROM object WHERE id = :1`,
	}
	for _, q := range cascade {
		if _, err := tx.Exec(q, objectID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to delete object",
				"message": err.Error(),
			})
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit", "message": err.Error()})
	}

	for _, rid := range affectedRoles {
		invalidateCacheForRole(rid)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Object deleted successfully",
	})
}

// BatchUpdateObjectOrderRequest - Request for batch updating object sort_order and parent
type BatchUpdateObjectOrderRequest struct {
	Items []ObjectOrderItem `json:"items"`
}

type ObjectOrderItem struct {
	ID          int64  `json:"id"`
	SortOrder   int32  `json:"sort_order"`
	ParentID    *int64 `json:"parent_id"`
	ObjectLevel int32  `json:"object_level"`
}

// BatchUpdateObjectOrder - Batch update object sort_order, parent_id, and object_level
func BatchUpdateObjectOrder(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req BatchUpdateObjectOrderRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to start transaction",
			"message": err.Error(),
		})
	}
	defer tx.Rollback()

	for _, item := range req.Items {
		query := `UPDATE object 
				  SET sort_order = :1, parent_id = :2, object_level = :3, updated_at = SYSTIMESTAMP 
				  WHERE id = :4`

		_, err := tx.Exec(query, item.SortOrder, item.ParentID, item.ObjectLevel, item.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   fmt.Sprintf("Failed to update object with id %d", item.ID),
				"message": err.Error(),
			})
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to commit transaction",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Object order updated successfully",
	})
}

func GetObjectTypes(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	// Oracle treats '' as NULL, so NVL(description,'') still yields NULL.
	// Scan into sql.NullString to safely handle NULL descriptions.
	query := `SELECT id, code, name, description, is_active FROM object_type ORDER BY id`

	rows, err := db.Query(query)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch object types",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	type ObjectTypeRow struct {
		ID          int64  `json:"id"`
		Code        string `json:"code"`
		Name        string `json:"name"`
		Description string `json:"description"`
		IsActive    int    `json:"is_active"`
		Value       string `json:"value"`
		Label       string `json:"label"`
	}

	options := make([]ObjectTypeRow, 0)
	for rows.Next() {
		var id int64
		var code, name string
		var description sql.NullString
		var isActive int
		if err := rows.Scan(&id, &code, &name, &description, &isActive); err != nil {
			continue
		}
		options = append(options, ObjectTypeRow{
			ID:          id,
			Code:        code,
			Name:        name,
			Description: description.String,
			IsActive:    isActive,
			Value:       fmt.Sprintf("%d", id),
			Label:       name,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    options,
	})
}

// UpdateObjectType — partial update for object_type
func UpdateObjectType(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var req struct {
		Code        *string `json:"code"`
		Name        *string `json:"name"`
		Description *string `json:"description"`
		IsActive    *int    `json:"is_active"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	var updates []string
	var args []interface{}
	n := 1
	if req.Code != nil {
		updates = append(updates, fmt.Sprintf("code = :%d", n))
		args = append(args, *req.Code)
		n++
	}
	if req.Name != nil {
		updates = append(updates, fmt.Sprintf("name = :%d", n))
		args = append(args, *req.Name)
		n++
	}
	if req.Description != nil {
		updates = append(updates, fmt.Sprintf("description = :%d", n))
		args = append(args, *req.Description)
		n++
	}
	if req.IsActive != nil {
		updates = append(updates, fmt.Sprintf("is_active = :%d", n))
		args = append(args, *req.IsActive)
		n++
	}
	if len(updates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No fields to update"})
	}
	updates = append(updates, "updated_at = SYSTIMESTAMP")
	q := fmt.Sprintf(`UPDATE object_type SET %s WHERE id = :%d`, strings.Join(updates, ", "), n)
	args = append(args, id)
	if _, err := db.Exec(q, args...); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update object type",
			"message": err.Error(),
		})
	}
	return c.JSON(fiber.Map{"message": "Object type updated successfully"})
}

// DeleteObjectType — hard delete (no soft-delete column on object_type)
func DeleteObjectType(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if _, err := db.Exec(`DELETE FROM object_type WHERE id = :1`, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete object type",
			"message": err.Error(),
		})
	}
	return c.JSON(fiber.Map{"message": "Object type deleted successfully"})
}

// CreateObjectType สร้าง Object Type ใหม่ใน Oracle (IAMX schema)
func CreateObjectType(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	type CreateObjectTypeRequest struct {
		Code        string  `json:"code"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
		IsActive    *int    `json:"is_active"`
	}

	var req CreateObjectTypeRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	if strings.TrimSpace(req.Name) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Name is required",
			"message": "Object type name cannot be empty",
		})
	}
	code := strings.TrimSpace(req.Code)
	if code == "" {
		code = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(req.Name), " ", "_"))
	}
	isActive := 1
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	var description sql.NullString
	if req.Description != nil {
		description = sql.NullString{String: *req.Description, Valid: true}
	}

	var newID int64
	if _, err := db.Exec(
		`INSERT INTO IAMX.OBJECT_TYPE (code, name, description, is_active, created_at, updated_at)
		 VALUES (:1, :2, :3, :4, SYSTIMESTAMP, SYSTIMESTAMP)
		 RETURNING id INTO :out`,
		code, strings.TrimSpace(req.Name), description, isActive,
		sql.Named("out", sql.Out{Dest: &newID}),
	); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create object type",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "Object type created successfully",
		"id":      newID,
		"data": fiber.Map{
			"id":          newID,
			"value":       fmt.Sprintf("%d", newID),
			"label":       strings.TrimSpace(req.Name),
			"code":        code,
			"name":        strings.TrimSpace(req.Name),
			"description": req.Description,
			"is_active":   isActive,
		},
	})
}

// ============ HELPER FUNCTIONS ============

func buildObjectTree(objectMap map[int64]*models.ObjectItem, parentMap map[int64]*int64) []models.ObjectItem {
	var roots []models.ObjectItem

	for id, obj := range objectMap {
		if parentID, hasParent := parentMap[id]; !hasParent || parentID == nil {
			buildChildrenRecursive(obj, objectMap, parentMap)
			roots = append(roots, *obj)
		}
	}

	// Sort roots by object_level, then sort_order
	sort.Slice(roots, func(i, j int) bool {
		if roots[i].ObjectLevel != roots[j].ObjectLevel {
			return roots[i].ObjectLevel < roots[j].ObjectLevel
		}
		return roots[i].SortOrder < roots[j].SortOrder
	})

	return roots
}

func buildChildrenRecursive(parent *models.ObjectItem, objectMap map[int64]*models.ObjectItem, parentMap map[int64]*int64) {
	if parent.ObjectID == nil {
		return
	}

	parentID := *parent.ObjectID

	for id, obj := range objectMap {
		if pid, hasParent := parentMap[id]; hasParent && pid != nil && *pid == parentID {
			buildChildrenRecursive(obj, objectMap, parentMap)
			parent.Children = append(parent.Children, obj)
		}
	}

	// Sort children by object_level, then sort_order
	sort.Slice(parent.Children, func(i, j int) bool {
		if parent.Children[i].ObjectLevel != parent.Children[j].ObjectLevel {
			return parent.Children[i].ObjectLevel < parent.Children[j].ObjectLevel
		}
		return parent.Children[i].SortOrder < parent.Children[j].SortOrder
	})
}

// ============ PROCESS & SUBPROCESS HANDLERS ============

// GetProcesses - Get processes by module_id or object_id
func GetProcesses(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	moduleID := c.Query("module_id")
	objectID := c.Query("object_id")

	query := `SELECT id, module_id, object_id, code, name, description, sort_order, is_active, created_by, updated_by, created_at, updated_at
			  FROM process
			  WHERE is_active = 1`
	var args []interface{}

	if moduleID != "" {
		query += ` AND module_id = :1`
		args = append(args, moduleID)
	}
	if objectID != "" {
		if len(args) > 0 {
			query += ` AND object_id = :2`
		} else {
			query += ` AND object_id = :1`
		}
		args = append(args, objectID)
	}

	query += ` ORDER BY sort_order, id`

	rows, err := db.Query(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch processes",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	processes := []models.ProcessResponse{}
	for rows.Next() {
		var p models.Process
		err := rows.Scan(&p.ID, &p.ModuleID, &p.ObjectID, &p.Code, &p.Name, &p.Description, &p.SortOrder, &p.IsActive, &p.CreatedBy, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			continue
		}
		processes = append(processes, p.ToResponse())
	}

	return c.JSON(fiber.Map{"data": processes})
}

// GetProcessByID - Get single process by ID
func GetProcessByID(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	processID := c.Params("id")

	query := `SELECT id, module_id, object_id, code, name, description, sort_order, is_active, created_by, updated_by, created_at, updated_at
			  FROM process
			  WHERE id = :1`

	var p models.Process
	err := db.QueryRow(query, processID).Scan(&p.ID, &p.ModuleID, &p.ObjectID, &p.Code, &p.Name, &p.Description, &p.SortOrder, &p.IsActive, &p.CreatedBy, &p.UpdatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Process not found"})
	}

	return c.JSON(fiber.Map{"data": p.ToResponse()})
}

// CreateProcess - Create new process
func CreateProcess(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req models.CreateProcessRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var newID int64
	_, err := db.Exec(
		`INSERT INTO IAMX.PROCESS (module_id, object_id, code, name, description, sort_order, is_active, created_at, updated_at)
		 VALUES (:1, :2, :3, :4, :5, :6, :7, SYSTIMESTAMP, SYSTIMESTAMP)
		 RETURNING id INTO :out`,
		req.ModuleID, req.ObjectID, req.Code, req.Name, req.Description, req.SortOrder, req.IsActive,
		sql.Named("out", sql.Out{Dest: &newID}),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create process",
			"message": err.Error(),
		})
	}

	refreshProcessMappingMV(db)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Process created successfully",
		"id":      newID,
	})
}

// UpdateProcess - Update process
func UpdateProcess(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	processID := c.Params("id")

	var req models.UpdateProcessRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	query := `UPDATE process 
			  SET module_id = COALESCE(:1, module_id), 
			      object_id = :2, 
			      code = COALESCE(:3, code), 
			      name = COALESCE(:4, name), 
			      description = COALESCE(:5, description), 
			      sort_order = COALESCE(:6, sort_order), 
			      is_active = COALESCE(:7, is_active),
			      updated_at = CURRENT_TIMESTAMP
			  WHERE id = :8`

	_, err := db.Exec(query, req.ModuleID, req.ObjectID, req.Code, req.Name, req.Description, req.SortOrder, req.IsActive, processID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update process",
			"message": err.Error(),
		})
	}

	refreshProcessMappingMV(db)

	return c.JSON(fiber.Map{"message": "Process updated successfully"})
}

// DeleteProcess - Delete process and its sub-processes
func DeleteProcess(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	processID := c.Params("id")

	// Delete sub-processes first (foreign key constraint)
	_, err := db.Exec(`DELETE FROM sub_process WHERE process_id = :1`, processID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete sub-processes",
			"message": err.Error(),
		})
	}

	// Delete process
	_, err = db.Exec(`DELETE FROM process WHERE id = :1`, processID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete process",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{"message": "Process deleted successfully"})
}

// refreshProcessMappingMV re-syncs APP.MV_PROCESS_MAPPING from
// APP.N_REF_PROCESS / APP.N_REF_SUBPROCESS.
//
// plain TABLE — there is no materialized view by that name — so the call raised
// ORA-01403/ORA-01031 on every single invocation, and the error was thrown away
// with the result. The snapshot was therefore never refreshed at all: it still
// held names from before the last rename and was missing 352 rows that exist in
// the source tables.
//
// The sync now lives in APP.PRC_SYNC_MV_PROCESS_MAPPING, which statement-level
// triggers on both N_REF tables also fire, so direct SQL and data migration stay
// in step too. Calling it here is belt-and-braces; the error is logged rather
// than swallowed.
func refreshProcessMappingMV(db *sql.DB) {
	if _, err := db.Exec(`BEGIN PRC_SYNC_MV_PROCESS_MAPPING; END;`); err != nil {
		log.Printf("Error refreshing APP.MV_PROCESS_MAPPING: %v", err)
	}
}

// ============ SubProcess Handlers ============

// GetSubProcessesByProcess - Get sub-processes by process_id
func GetSubProcessesByProcess(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	processID := c.Params("id")

	query := `SELECT id, process_id, code, name, description, sort_order, is_active, created_by, updated_by, created_at, updated_at
			  FROM sub_process
			  WHERE process_id = :1 AND is_active = 1
			  ORDER BY sort_order, id`

	rows, err := db.Query(query, processID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch sub-processes",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	subProcesses := []models.SubProcessResponse{}
	for rows.Next() {
		var s models.SubProcess
		err := rows.Scan(&s.ID, &s.ProcessID, &s.Code, &s.Name, &s.Description, &s.SortOrder, &s.IsActive, &s.CreatedBy, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			continue
		}
		subProcesses = append(subProcesses, s.ToResponse())
	}

	return c.JSON(fiber.Map{"data": subProcesses})
}

// GetSubProcessByID - Get single sub-process by ID
func GetSubProcessByID(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	subProcessID := c.Params("id")

	query := `SELECT id, process_id, code, name, description, sort_order, is_active, created_by, updated_by, created_at, updated_at
			  FROM sub_process
			  WHERE id = :1`

	var s models.SubProcess
	err := db.QueryRow(query, subProcessID).Scan(&s.ID, &s.ProcessID, &s.Code, &s.Name, &s.Description, &s.SortOrder, &s.IsActive, &s.CreatedBy, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sub-process not found"})
	}

	return c.JSON(fiber.Map{"data": s.ToResponse()})
}

// CreateSubProcess - Create new sub-process
func CreateSubProcess(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	processID := c.Params("id")

	var req struct {
		Code        string  `json:"code"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
		SortOrder   int32   `json:"sort_order"`
		IsActive    int16   `json:"is_active"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var newID int64
	_, err := db.Exec(
		`INSERT INTO IAMX.SUB_PROCESS (process_id, code, name, description, sort_order, is_active, created_at, updated_at)
		 VALUES (:1, :2, :3, :4, :5, :6, SYSTIMESTAMP, SYSTIMESTAMP)
		 RETURNING id INTO :out`,
		processID, req.Code, req.Name, req.Description, req.SortOrder, req.IsActive,
		sql.Named("out", sql.Out{Dest: &newID}),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create sub-process",
			"message": err.Error(),
		})
	}

	refreshProcessMappingMV(db)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Sub-process created successfully",
		"id":      newID,
	})
}

// UpdateSubProcess - Update sub-process
func UpdateSubProcess(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	subProcessID := c.Params("id")

	var req models.UpdateSubProcessRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	query := `UPDATE sub_process 
			  SET code = COALESCE(:1, code), 
			      name = COALESCE(:2, name), 
			      description = COALESCE(:3, description), 
			      sort_order = COALESCE(:4, sort_order), 
			      is_active = COALESCE(:5, is_active),
			      updated_at = CURRENT_TIMESTAMP
			  WHERE id = :6`

	_, err := db.Exec(query, req.Code, req.Name, req.Description, req.SortOrder, req.IsActive, subProcessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update sub-process",
			"message": err.Error(),
		})
	}

	refreshProcessMappingMV(db)

	return c.JSON(fiber.Map{"message": "Sub-process updated successfully"})
}

// DeleteSubProcess - Delete sub-process
func DeleteSubProcess(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	subProcessID := c.Params("id")

	_, err := db.Exec(`DELETE FROM sub_process WHERE id = :1`, subProcessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete sub-process",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{"message": "Sub-process deleted successfully"})
}

// ============ Batch Update Handlers for Sorting ============

// ApplicationOrderItem - Item for batch updating application sort_order
type ApplicationOrderItem struct {
	ID        int64 `json:"id"`
	SortOrder int32 `json:"sort_order"`
}

// BatchUpdateApplicationOrderRequest - Request for batch updating application sort_order
type BatchUpdateApplicationOrderRequest struct {
	Items []ApplicationOrderItem `json:"items"`
}

// BatchUpdateApplicationOrder - Batch update application sort_order
func BatchUpdateApplicationOrder(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req BatchUpdateApplicationOrderRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to start transaction",
			"message": err.Error(),
		})
	}
	defer tx.Rollback()

	for _, item := range req.Items {
		query := `UPDATE application 
				  SET sort_order = :1, updated_at = SYSTIMESTAMP 
				  WHERE id = :2`

		_, err := tx.Exec(query, item.SortOrder, item.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   fmt.Sprintf("Failed to update application with id %d", item.ID),
				"message": err.Error(),
			})
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to commit transaction",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Application order updated successfully",
	})
}

// ModuleOrderItem - Item for batch updating module sort_order
type ModuleOrderItem struct {
	ID        int64 `json:"id"`
	SortOrder int32 `json:"sort_order"`
}

// BatchUpdateModuleOrderRequest - Request for batch updating module sort_order
type BatchUpdateModuleOrderRequest struct {
	Items []ModuleOrderItem `json:"items"`
}

// BatchUpdateModuleOrder - Batch update module sort_order
func BatchUpdateModuleOrder(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	var req BatchUpdateModuleOrderRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to start transaction",
			"message": err.Error(),
		})
	}
	defer tx.Rollback()

	for _, item := range req.Items {
		query := `UPDATE module 
				  SET sort_order = :1, updated_at = SYSTIMESTAMP 
				  WHERE id = :2`

		_, err := tx.Exec(query, item.SortOrder, item.ID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   fmt.Sprintf("Failed to update module with id %d", item.ID),
				"message": err.Error(),
			})
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to commit transaction",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Module order updated successfully",
	})
}
