package handlers

import (
	"api/core"
	"database/sql"
	"fmt"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ==================== USER ROLE MAPPINGS ====================

// GET /directory/user-role-mappings?user_id=xxx
func GetUserRoleMappings(c *fiber.Ctx) error {
	userIdStr := c.Query("user_id")
	if userIdStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "user_id is required",
		})
	}
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	query := `
		SELECT id, user_id, role_id,
		       TO_CHAR(effective_date, 'YYYY-MM-DD'),
		       TO_CHAR(expire_date, 'YYYY-MM-DD'),
		       is_active
		FROM IAMX.USER_ROLE_MAPPING
		WHERE user_id = :1 AND is_active = 1
	`
	rows, err := db.Query(query, userIdStr)
	if err != nil {
		log.Printf("GetUserRoleMappings error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var r struct {
			ID            int
			UserID        string
			RoleID        string
			EffectiveDate sql.NullString
			ExpireDate    sql.NullString
			IsActive      int
		}
		if err := rows.Scan(&r.ID, &r.UserID, &r.RoleID, &r.EffectiveDate, &r.ExpireDate, &r.IsActive); err != nil {
			continue
		}
		results = append(results, map[string]interface{}{
			"id":             r.ID,
			"user_id":        r.UserID,
			"role_id":        r.RoleID,
			"effective_date": r.EffectiveDate.String,
			"expire_date":    r.ExpireDate.String,
			"is_active":      r.IsActive,
		})
	}

	return c.JSON(fiber.Map{"success": true, "data": results})
}

// POST /directory/user-role-mappings
func CreateUserRoleMapping(c *fiber.Ctx) error {
	var req struct {
		UserID        string `json:"user_id"`
		RoleID        string `json:"role_id"`
		EffectiveDate string `json:"effective_date"`
		ExpireDate    string `json:"expire_date"`
		IsActive      int    `json:"is_active"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	var expireDate *string
	if req.ExpireDate != "" {
		expireDate = &req.ExpireDate
	}

	var id int
	_, err := db.Exec(`
		INSERT INTO IAMX.USER_ROLE_MAPPING (user_id, role_id, effective_date, expire_date, is_active, created_at)
		VALUES (:1, :2, TO_DATE(:3, 'YYYY-MM-DD'), TO_DATE(:4, 'YYYY-MM-DD'), :5, SYSTIMESTAMP)
		RETURNING id INTO :out`,
		req.UserID, req.RoleID, req.EffectiveDate, expireDate, req.IsActive,
		sql.Named("out", sql.Out{Dest: &id}),
	)
	if err != nil {
		log.Printf("CreateUserRoleMapping error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "data": map[string]int{"id": id}})
}

// DELETE /directory/user-role-mappings/:id
func DeleteUserRoleMapping(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	_, err := db.Exec(`DELETE FROM IAMX.USER_ROLE_MAPPING WHERE id = :1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ==================== USER RESPONSIBILITY MAPPINGS ====================

// GET /directory/user-responsibility-mappings?user_id=xxx
func GetUserResponsibilityMappings(c *fiber.Ctx) error {
	userIdStr := c.Query("user_id")
	if userIdStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "user_id is required",
		})
	}
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	query := `
		SELECT id, user_id, responsibility_id,
		       TO_CHAR(effective_date, 'YYYY-MM-DD'),
		       TO_CHAR(expire_date, 'YYYY-MM-DD'),
		       is_active
		FROM IAMX.USER_RESPONSIBILITY_MAPPING
		WHERE user_id = :1 AND is_active = 1
	`
	rows, err := db.Query(query, userIdStr)
	if err != nil {
		log.Printf("GetUserResponsibilityMappings error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var r struct {
			ID               int
			UserID           string
			ResponsibilityID int
			EffectiveDate    sql.NullString
			ExpireDate       sql.NullString
			IsActive         int
		}
		if err := rows.Scan(&r.ID, &r.UserID, &r.ResponsibilityID, &r.EffectiveDate, &r.ExpireDate, &r.IsActive); err != nil {
			continue
		}
		results = append(results, map[string]interface{}{
			"id":                r.ID,
			"user_id":           r.UserID,
			"responsibility_id": r.ResponsibilityID,
			"effective_date":    r.EffectiveDate.String,
			"expire_date":       r.ExpireDate.String,
			"is_active":         r.IsActive,
		})
	}

	return c.JSON(fiber.Map{"success": true, "data": results})
}

// POST /directory/user-responsibility-mappings
func CreateUserResponsibilityMapping(c *fiber.Ctx) error {
	var req struct {
		UserID           string `json:"user_id"`
		ResponsibilityID int    `json:"responsibility_id"`
		EffectiveDate    string `json:"effective_date"`
		ExpireDate       string `json:"expire_date"`
		IsActive         int    `json:"is_active"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	var expireDate *string
	if req.ExpireDate != "" {
		expireDate = &req.ExpireDate
	}

	var id int
	_, err := db.Exec(`
		INSERT INTO IAMX.USER_RESPONSIBILITY_MAPPING (user_id, responsibility_id, effective_date, expire_date, is_active, created_at)
		VALUES (:1, :2, TO_DATE(:3, 'YYYY-MM-DD'), TO_DATE(:4, 'YYYY-MM-DD'), :5, SYSTIMESTAMP)
		RETURNING id INTO :out`,
		req.UserID, req.ResponsibilityID, req.EffectiveDate, expireDate, req.IsActive,
		sql.Named("out", sql.Out{Dest: &id}),
	)
	if err != nil {
		log.Printf("CreateUserResponsibilityMapping error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	invalidateCacheForUser(fmt.Sprint(req.UserID))

	return c.JSON(fiber.Map{"success": true, "data": map[string]int{"id": id}})
}

// DELETE /directory/user-responsibility-mappings/:id
func DeleteUserResponsibilityMapping(c *fiber.Ctx) error {
	id := c.Params("id")

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	var userID string
	db.QueryRow(`SELECT user_id FROM IAMX.USER_RESPONSIBILITY_MAPPING WHERE id = :1`, id).Scan(&userID)

	_, err := db.Exec(`DELETE FROM IAMX.USER_RESPONSIBILITY_MAPPING WHERE id = :1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	if userID != "" {
		invalidateCacheForUser(userID)
	}

	return c.JSON(fiber.Map{"success": true})
}

// ==================== USER CUSTOM OBJECT MAPPINGS ====================

// GET /directory/user-custom-object-mappings?user_id=xxx
func GetUserCustomObjectMappings(c *fiber.Ctx) error {
	userIdStr := c.Query("user_id")
	if userIdStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "user_id is required",
		})
	}
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	query := `
		SELECT ucom.id, ucom.object_id, NVL(ucop.permission, '[]')
		FROM IAMX.USER_CUSTOM_OBJECT_MAPPING ucom
		LEFT JOIN IAMX.USER_CUSTOM_OBJECT_PERMISSION ucop ON ucom.id = ucop.user_custom_object_mapping_id
		WHERE ucom.user_id = :1 AND ucom.is_active = 1
	`
	rows, err := db.Query(query, userIdStr)
	if err != nil {
		log.Printf("GetUserCustomObjectMappings error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()

	type objPermRow struct {
		ID          int      `json:"id"`
		ObjectID    int      `json:"object_id"`
		Permissions []string `json:"permissions"`
	}
	results := []objPermRow{}
	for rows.Next() {
		var id, objectId int
		var permJSON string
		if err := rows.Scan(&id, &objectId, &permJSON); err != nil {
			continue
		}
		results = append(results, objPermRow{
			ID:          id,
			ObjectID:    objectId,
			Permissions: parsePermissionJSON(permJSON),
		})
	}

	return c.JSON(fiber.Map{"success": true, "data": results})
}

// POST /directory/user-custom-object-mappings/toggle
func ToggleUserCustomObjectPermission(c *fiber.Ctx) error {
	var req struct {
		UserID     string `json:"user_id"`
		ObjectID   int    `json:"object_id"`
		Permission string `json:"permission"`
		Enabled    bool   `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	// Find or create mapping
	var mappingId int
	findErr := db.QueryRow(`SELECT id FROM IAMX.USER_CUSTOM_OBJECT_MAPPING WHERE user_id = :1 AND object_id = :2`, req.UserID, req.ObjectID).Scan(&mappingId)

	if findErr == sql.ErrNoRows {
		var newMappingId int
		_, err := db.Exec(`
			INSERT INTO IAMX.USER_CUSTOM_OBJECT_MAPPING (user_id, object_id, effective_date, is_active, created_at, updated_at)
			VALUES (:1, :2, SYSDATE, 1, SYSTIMESTAMP, SYSTIMESTAMP)
			RETURNING id INTO :out`,
			req.UserID, req.ObjectID,
			sql.Named("out", sql.Out{Dest: &newMappingId}),
		)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
		mappingId = newMappingId
	} else if findErr != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": findErr.Error()})
	}

	// Read current permission JSON
	var permJSON string
	readErr := db.QueryRow(
		`SELECT NVL(permission, '[]') FROM IAMX.USER_CUSTOM_OBJECT_PERMISSION WHERE user_custom_object_mapping_id = :1`,
		mappingId,
	).Scan(&permJSON)

	currentPerms := parsePermissionJSON(permJSON)
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
	if readErr == sql.ErrNoRows {
		_, err = db.Exec(`
			INSERT INTO IAMX.USER_CUSTOM_OBJECT_PERMISSION
			(user_custom_object_mapping_id, permission, created_at, updated_at)
			VALUES (:1, :2, SYSTIMESTAMP, SYSTIMESTAMP)`,
			mappingId, newPermJSON,
		)
	} else {
		_, err = db.Exec(`
			UPDATE IAMX.USER_CUSTOM_OBJECT_PERMISSION
			SET permission = :1, updated_at = SYSTIMESTAMP
			WHERE user_custom_object_mapping_id = :2`,
			newPermJSON, mappingId,
		)
	}
	if err != nil {
		log.Printf("ToggleUserCustomObjectPermission error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "permissions": currentPerms})
}

// SetUserCustomObjectPermissions replaces entire permission list for (user, object).
// POST /admin/users/:userId/objects/:objectId/set-permissions
func SetUserCustomObjectPermissions(c *fiber.Ctx) error {
	userID := c.Params("userId")
	objectID := c.Params("objectId")
	if userID == "" || objectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "userId and objectId required"})
	}

	var req struct {
		Permissions []string `json:"permissions"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	if req.Permissions == nil {
		req.Permissions = []string{}
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer tx.Rollback()

	var mappingID int
	findErr := tx.QueryRow(
		`SELECT id FROM IAMX.USER_CUSTOM_OBJECT_MAPPING WHERE user_id = :1 AND object_id = :2`,
		userID, objectID,
	).Scan(&mappingID)

	if findErr == sql.ErrNoRows {
		_, err = tx.Exec(`
			INSERT INTO IAMX.USER_CUSTOM_OBJECT_MAPPING (user_id, object_id, effective_date, is_active, created_at, updated_at)
			VALUES (:1, :2, SYSDATE, 1, SYSTIMESTAMP, SYSTIMESTAMP)
			RETURNING id INTO :out`,
			userID, objectID, sql.Named("out", sql.Out{Dest: &mappingID}),
		)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
	} else if findErr != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": findErr.Error()})
	}

	permJSON := toPermissionJSON(req.Permissions)

	var existingID int
	readErr := tx.QueryRow(
		`SELECT id FROM IAMX.USER_CUSTOM_OBJECT_PERMISSION WHERE user_custom_object_mapping_id = :1`,
		mappingID,
	).Scan(&existingID)

	if readErr == sql.ErrNoRows {
		_, err = tx.Exec(`
			INSERT INTO IAMX.USER_CUSTOM_OBJECT_PERMISSION
			(user_custom_object_mapping_id, permission, created_at, updated_at)
			VALUES (:1, :2, SYSTIMESTAMP, SYSTIMESTAMP)`,
			mappingID, permJSON,
		)
	} else if readErr == nil {
		_, err = tx.Exec(`
			UPDATE IAMX.USER_CUSTOM_OBJECT_PERMISSION
			SET permission = :1, updated_at = SYSTIMESTAMP
			WHERE user_custom_object_mapping_id = :2`,
			permJSON, mappingID,
		)
	} else {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": readErr.Error()})
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "permissions": req.Permissions})
}

// ==================== USER CUSTOM DATA ACCESS ====================

// GET /directory/user-custom-data-accesses?user_id=xxx
func GetUserCustomDataAccesses(c *fiber.Ctx) error {
	userIdStr := c.Query("user_id")
	if userIdStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "user_id is required",
		})
	}
	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	roleIdFilter := c.Query("role_id")

	var query string
	var queryArgs []interface{}
	if roleIdFilter != "" {
		if roleIdFilter == "null" {
			query = `
				SELECT d.id, d.user_id, d.agency_path,
				       TO_CHAR(d.effective_date, 'YYYY-MM-DD'),
				       TO_CHAR(d.expire_date, 'YYYY-MM-DD'),
				       d.is_active, NVL(dp.permission, '[]'), d.role_id
				FROM IAMX.USER_CUSTOM_DATA_ACCESS d
				LEFT JOIN IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION dp ON d.id = dp.user_custom_data_access_id
				WHERE d.user_id = :1 AND d.is_active = 1 AND d.role_id IS NULL
			`
			queryArgs = []interface{}{userIdStr}
		} else {
			query = `
				SELECT d.id, d.user_id, d.agency_path,
				       TO_CHAR(d.effective_date, 'YYYY-MM-DD'),
				       TO_CHAR(d.expire_date, 'YYYY-MM-DD'),
				       d.is_active, NVL(dp.permission, '[]'), d.role_id
				FROM IAMX.USER_CUSTOM_DATA_ACCESS d
				LEFT JOIN IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION dp ON d.id = dp.user_custom_data_access_id
				WHERE d.user_id = :1 AND d.is_active = 1 AND d.role_id = :2
			`
			queryArgs = []interface{}{userIdStr, roleIdFilter}
		}
	} else {
		query = `
			SELECT d.id, d.user_id, d.agency_path,
			       TO_CHAR(d.effective_date, 'YYYY-MM-DD'),
			       TO_CHAR(d.expire_date, 'YYYY-MM-DD'),
			       d.is_active, NVL(dp.permission, '[]'), d.role_id
			FROM IAMX.USER_CUSTOM_DATA_ACCESS d
			LEFT JOIN IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION dp ON d.id = dp.user_custom_data_access_id
			WHERE d.user_id = :1 AND d.is_active = 1
		`
		queryArgs = []interface{}{userIdStr}
	}

	rows, err := db.Query(query, queryArgs...)
	if err != nil {
		log.Printf("GetUserCustomDataAccesses error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer rows.Close()

	var results []map[string]interface{}
	allCodes := make(map[string]bool)

	for rows.Next() {
		var id, userID string
		var agencyID, effectiveDate, expireDate sql.NullString
		var isActive int
		var permJSON string
		var roleID sql.NullString
		var roleCode, roleName sql.NullString
		if err := rows.Scan(&id, &userID, &agencyID, &effectiveDate, &expireDate, &isActive, &permJSON, &roleID, &roleCode, &roleName); err != nil {
			continue
		}
		agencyPath := agencyID.String
		parts := strings.Split(agencyPath, ".")
		agencyCode, agcCode, unitCode := "", "", ""
		if len(parts) > 0 && parts[0] != "" {
			agencyCode = parts[0]
			allCodes[agencyCode] = true
		}
		if len(parts) > 1 && parts[1] != "" {
			agcCode = parts[1]
			allCodes[agcCode] = true
		}
		if len(parts) > 2 && parts[2] != "" {
			unitCode = parts[2]
			allCodes[unitCode] = true
		}
		row := map[string]interface{}{
			"id":             id,
			"user_id":        userID,
			"agency_path":    agencyPath,
			"agency_code":    agencyCode,
			"agc_code":       agcCode,
			"unit_code":      unitCode,
			"agency_name":    "",
			"agc_name":       "",
			"unit_name":      "",
			"permissions":    parsePermissionJSON(permJSON),
			"effective_date": effectiveDate.String,
			"expire_date":    expireDate.String,
			"is_active":      isActive,
			"role_id":        nil,
			"role_code":      "",
			"role_name":      "",
		}
		if roleID.Valid {
			row["role_id"] = roleID.String
		}
		if roleCode.Valid {
			row["role_code"] = roleCode.String
		}
		if roleName.Valid {
			row["role_name"] = roleName.String
		}
		results = append(results, row)
	}

	if len(allCodes) > 0 {
		names := getAgencyNames(allCodes)
		for _, r := range results {
			if code, ok := r["agency_code"].(string); ok && code != "" {
				if name, exists := names[code]; exists {
					r["agency_name"] = name
				}
			}
			if code, ok := r["agc_code"].(string); ok && code != "" {
				if name, exists := names[code]; exists {
					r["agc_name"] = name
				}
			}
			if code, ok := r["unit_code"].(string); ok && code != "" {
				if name, exists := names[code]; exists {
					r["unit_name"] = name
				}
			}
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": results})
}

// POST /directory/user-custom-data-accesses
func CreateUserCustomDataAccess(c *fiber.Ctx) error {
	var req struct {
		UserID        string   `json:"user_id"`
		AgencyPath    string   `json:"agency_path"`
		Permissions   []string `json:"permissions"`
		EffectiveDate string   `json:"effective_date"`
		ExpireDate    string   `json:"expire_date"`
		IsActive      int      `json:"is_active"`
		RoleID        *string  `json:"role_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	if len(req.Permissions) == 0 {
		req.Permissions = []string{"VIEW"}
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to start transaction"})
	}
	defer tx.Rollback()

	var expireDate *string
	if req.ExpireDate != "" {
		expireDate = &req.ExpireDate
	}

	var id int
	_, err = tx.Exec(`
		INSERT INTO IAMX.USER_CUSTOM_DATA_ACCESS
		(user_id, agency_path, type, role_id, effective_date, expire_date, is_active, created_at, updated_at)
		VALUES (:1, :2, 'AGENCY', :3, TO_DATE(:4, 'YYYY-MM-DD'), TO_DATE(:5, 'YYYY-MM-DD'), :6, SYSTIMESTAMP, SYSTIMESTAMP)
		RETURNING id INTO :out`,
		req.UserID, req.AgencyPath, req.RoleID, req.EffectiveDate, expireDate, req.IsActive,
		sql.Named("out", sql.Out{Dest: &id}),
	)
	if err != nil {
		log.Printf("CreateUserCustomDataAccess error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	_, err = tx.Exec(`
		INSERT INTO IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
		(user_custom_data_access_id, permission, created_at, updated_at)
		VALUES (:1, :2, SYSTIMESTAMP, SYSTIMESTAMP)`,
		id, toPermissionJSON(req.Permissions),
	)
	if err != nil {
		log.Printf("CreateUserCustomDataAccessPermission error: %v", err)
	}

	tx.Commit()

	return c.JSON(fiber.Map{"success": true, "data": map[string]int{"id": id}})
}

// POST /directory/user-custom-data-accesses/:id/toggle-permission
func ToggleUserCustomDataAccessPermission(c *fiber.Ctx) error {
	dataAccessId := c.Params("id")

	var req struct {
		Permission string `json:"permission"`
		Enabled    bool   `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	var permJSON string
	readErr := db.QueryRow(`
		SELECT NVL(permission, '[]')
		FROM IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
		WHERE user_custom_data_access_id = :1`, dataAccessId,
	).Scan(&permJSON)

	currentPerms := parsePermissionJSON(permJSON)
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
	if readErr == sql.ErrNoRows {
		_, err = db.Exec(`
			INSERT INTO IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
			(user_custom_data_access_id, permission, created_at, updated_at)
			VALUES (:1, :2, SYSTIMESTAMP, SYSTIMESTAMP)`,
			dataAccessId, newPermJSON,
		)
	} else {
		_, err = db.Exec(`
			UPDATE IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
			SET permission = :1, updated_at = SYSTIMESTAMP
			WHERE user_custom_data_access_id = :2`,
			newPermJSON, dataAccessId,
		)
	}
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update permissions",
		})
	}

	invalidateCacheForUserCustomDataAccess(dataAccessId)

	return c.JSON(fiber.Map{
		"success":     true,
		"message":     "Permission toggled successfully",
		"permissions": currentPerms,
	})
}

// DELETE /directory/user-custom-data-accesses/:id
func DeleteUserCustomDataAccess(c *fiber.Ctx) error {
	id := c.Params("id")

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	_, _ = db.Exec(`DELETE FROM IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION WHERE user_custom_data_access_id = :1`, id)

	_, err := db.Exec(`DELETE FROM IAMX.USER_CUSTOM_DATA_ACCESS WHERE id = :1`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ==================== BATCH USER CUSTOM DATA ACCESS ====================

// BatchReplaceUserCustomDataAccess - POST /admin/user-custom-data-accesses/batch
// Replaces all UCDA rows for a (user_id, role_id) with new entries.
// For each entry, creates UCDA + UCDA_PERMISSION rows.
// If role_id is omitted, targets role_id IS NULL rows.
type BatchUCDAEntry struct {
	AgencyPath    string   `json:"agency_path"`
	Permissions   []string `json:"permissions"`
	EffectiveDate string   `json:"effective_date"`
}

type BatchReplaceUCDARequest struct {
	UserID  string           `json:"user_id"`
	RoleID  *string          `json:"role_id"`
	Entries []BatchUCDAEntry `json:"entries"`
}

func BatchReplaceUserCustomDataAccess(c *fiber.Ctx) error {
	var req BatchReplaceUCDARequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Oracle database not connected"})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Failed to start transaction"})
	}
	defer tx.Rollback()

	// 1. Delete existing UCDA for (user_id, role_id)
	if req.RoleID != nil {
		_, err = tx.Exec(`
			DELETE FROM IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
			WHERE user_custom_data_access_id IN (
				SELECT id FROM IAMX.USER_CUSTOM_DATA_ACCESS
				WHERE user_id = :1 AND role_id = :2
			)`, req.UserID, *req.RoleID)
		if err != nil {
			log.Printf("BatchReplaceUCDA delete permission error: %v", err)
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
		_, err = tx.Exec(`
			DELETE FROM IAMX.USER_CUSTOM_DATA_ACCESS
			WHERE user_id = :1 AND role_id = :2`, req.UserID, *req.RoleID)
	} else {
		_, err = tx.Exec(`
			DELETE FROM IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
			WHERE user_custom_data_access_id IN (
				SELECT id FROM IAMX.USER_CUSTOM_DATA_ACCESS
				WHERE user_id = :1 AND role_id IS NULL
			)`, req.UserID)
		if err != nil {
			log.Printf("BatchReplaceUCDA delete permission error: %v", err)
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
		_, err = tx.Exec(`
			DELETE FROM IAMX.USER_CUSTOM_DATA_ACCESS
			WHERE user_id = :1 AND role_id IS NULL`, req.UserID)
	}
	if err != nil {
		log.Printf("BatchReplaceUCDA delete error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	// 2. Insert new entries
	var createdIDs []int
	for _, entry := range req.Entries {
		var effDate *string
		if entry.EffectiveDate != "" {
			effDate = &entry.EffectiveDate
		}

		var id int
		_, err = tx.Exec(`
			INSERT INTO IAMX.USER_CUSTOM_DATA_ACCESS
			(user_id, agency_path, type, role_id, effective_date, expire_date, is_active, created_at, updated_at)
			VALUES (:1, :2, 'AGENCY', :3, TO_DATE(:4, 'YYYY-MM-DD'), NULL, 1, SYSTIMESTAMP, SYSTIMESTAMP)
			RETURNING id INTO :out`,
			req.UserID, entry.AgencyPath, req.RoleID, effDate,
			sql.Named("out", sql.Out{Dest: &id}),
		)
		if err != nil {
			log.Printf("BatchReplaceUCDA insert error: %v", err)
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}

		perms := entry.Permissions
		if len(perms) == 0 {
			perms = []string{"OWN_ONLY"}
		}
		_, err = tx.Exec(`
			INSERT INTO IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
			(user_custom_data_access_id, permission, created_at, updated_at)
			VALUES (:1, :2, SYSTIMESTAMP, SYSTIMESTAMP)`,
			id, toPermissionJSON(perms),
		)
		if err != nil {
			log.Printf("BatchReplaceUCDA insert permission error: %v", err)
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
		createdIDs = append(createdIDs, id)
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	invalidateUserCacheByID(fmt.Sprint(req.UserID))

	return c.JSON(fiber.Map{"success": true, "data": map[string]interface{}{"ids": createdIDs}})
}

func invalidateUserCacheByID(userID string) {
	if cs := getCacheService(); cs != nil {
		cs.InvalidateMenu(userID)
	}
}
