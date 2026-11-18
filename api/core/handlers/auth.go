package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret []byte

// InitJWTSecret must be called from main() after env is loaded.
func InitJWTSecret() {
	v := os.Getenv("JWT_SECRET")
	if v == "" {
		panic("JWT_SECRET is not configured")
	}
	jwtSecret = []byte(v)
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// Login - Handler สำหรับ login
func Login(c *fiber.Ctx) error {
	var req models.LoginRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.Username == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Username and password are required",
		})
	}

	db := core.GetDB()

	// 14/11/69 (security): ผิด 5 ครั้งใน 15 นาที (นับจากเข้าสำเร็จครั้งล่าสุด) → ล็อก 15 นาที
	// นับจาก IAMX.ADMIN_ACTIVITY_LOG ที่ middleware บันทึก (ใช้ได้ทุก pod) · นับเฉพาะ 401 ไม่นับคำขอที่ถูกล็อก (429)
	var failures int
	if err := db.QueryRow(`SELECT COUNT(*) FROM IAMX.ADMIN_ACTIVITY_LOG
		 WHERE action = 'LOGIN_FAILED' AND status = 401 AND LOWER(actor) = LOWER(:1)
		   AND created_at > SYSTIMESTAMP - INTERVAL '15' MINUTE
		   AND created_at > NVL((SELECT MAX(created_at) FROM IAMX.ADMIN_ACTIVITY_LOG
		                          WHERE action = 'LOGIN' AND LOWER(actor) = LOWER(:1)), TIMESTAMP '1970-01-01 00:00:00')`,
		req.Username).Scan(&failures); err == nil && failures >= 5 {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"success": false,
			"message": "Too many failed sign-ins. Try again in 15 minutes.",
		})
	}

	var user models.AdminUser
	err := db.QueryRow(`
		SELECT USER_ID, USERNAME, PASSWORD, FIRST_NAME, LAST_NAME, STATUS, ROLE
		FROM IAMX.ADMIN WHERE USERNAME = :1`,
		req.Username,
	).Scan(&user.UserID, &user.Username, &user.Password, &user.FirstName, &user.LastName, &user.Status, &user.Role)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Invalid username or password",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Internal server error",
		})
	}

	statusTrimmed := strings.TrimSpace(user.Status)
	isActive := statusTrimmed == "1" || statusTrimmed == "A" || statusTrimmed == "Y" || statusTrimmed == ""
	if !isActive {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "User account is inactive",
		})
	}

	if !verifyPassword(user.Password, req.Password) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Invalid username or password",
		})
	}

	token, err := generateJWT(user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to generate token",
		})
	}

	var userRoles []models.UserLoginRole
	var domains []models.DomainInfo
	var applications []models.MenuApplicationWithModules
	var userID int

	if db != nil {
		if err := db.QueryRow(`SELECT user_id FROM user_info WHERE user_name = :1`, user.Username).Scan(&userID); err == nil {
			userRoles = getUserRoles(db, userID)
			domains, applications = buildMenuWithPermissions(db, userID)
			// Update last login timestamp
			db.Exec(`UPDATE user_info SET last_login_date = SYSTIMESTAMP WHERE user_id = :1`, userID)
		}
	}

	outputAccess := getUserOutputAccess(db, userID)

	// Return success response
	return c.JSON(fiber.Map{
		"success": true,
		"message": "Login successful",
		"data": models.LoginResponse{
			Token:     token,
			ExpiresIn: 3600 * 24,
			User: models.AuthUser{
				UserID:       user.UserID,
				Username:     user.Username,
				FirstName:    user.FirstName,
				LastName:     user.LastName,
				Role:         user.Role,
				Roles:        userRoles,
				Status:       user.Status,
				OutputAccess: outputAccess,
			},
			Domains:      domains,
			Applications: applications,
		},
	})
}

// getUserOutputAccess retrieves user's OUTPUT selections from IAMX.USER_CUSTOM_DATA_ACCESS
func getUserOutputAccess(db *sql.DB, userID int) []string {
	if db == nil || userID == 0 {
		return nil
	}
	query := `
		SELECT scope_filter
		FROM user_custom_data_access
		WHERE user_id = :1
		  AND NVL(type, 'AGENCY') = 'OUTPUT'
		  AND is_active = 1
		  AND SYSDATE BETWEEN effective_date AND NVL(expire_date, SYSDATE)
	`
	rows, err := db.Query(query, userID)
	if err != nil {
		log.Printf("Query user output access error: %v", err)
		return nil
	}
	defer rows.Close()

	resultSet := make(map[string]bool)
	for rows.Next() {
		var filterJSON string
		if err := rows.Scan(&filterJSON); err != nil {
			continue
		}
		var codes []string
		if err := json.Unmarshal([]byte(filterJSON), &codes); err != nil {
			continue
		}
		for _, code := range codes {
			if code != "" {
				resultSet[code] = true
			}
		}
	}

	result := make([]string, 0, len(resultSet))
	for code := range resultSet {
		result = append(result, code)
	}
	sort.Strings(result)
	return result
}

// getUserRoles retrieves user roles from Oracle (IAMX schema)
func getUserRoles(db *sql.DB, userID int) []models.UserLoginRole {
	roleQuery := `
		SELECT 
			r.id as role_id,
			r.code as role_name,
			r.name as role_desc
		FROM user_role_mapping urm
		JOIN role r ON urm.role_id = r.id
		WHERE urm.user_id = :1
		  AND urm.is_active = 1
	`
	rows, err := db.Query(roleQuery, userID)
	if err != nil {
		log.Printf("Query user roles error: %v", err)
		return []models.UserLoginRole{}
	}
	defer rows.Close()

	var roles []models.UserLoginRole
	for rows.Next() {
		var r models.UserLoginRole
		var roleID sql.NullString
		var roleName, roleDesc sql.NullString

		if err := rows.Scan(&roleID, &roleName, &roleDesc); err != nil {
			continue
		}

		if roleID.Valid {
			r.RoleID = &roleID.String
		}
		if roleName.Valid {
			r.RoleName = strPtr(roleName.String)
		}
		if roleDesc.Valid {
			r.RoleDesc = strPtr(roleDesc.String)
		}

		roles = append(roles, r)
	}
	return roles
}

// buildMenuWithPermissions builds the menu hierarchy with permissions from v_user_effective_permission.
// Uses ROW_NUMBER CTE to pick the single highest-priority row per object (priority 1=Custom > 2=Responsibility > 3=Role).
// For responsibility-sourced objects, also fetches and attaches data access records.
func buildMenuWithPermissions(db *sql.DB, userID int) ([]models.DomainInfo, []models.MenuApplicationWithModules) {
	log.Printf("LOGIN buildMenuWithPermissions: called with userID=%d", userID)

	query := `
		SELECT
			v.domain_id,
			v.domain_code,
			COALESCE(d.name, v.domain_code)          AS domain_name,
			v.application_id,
			v.application_code,
			COALESCE(app.name, v.application_code)   AS application_name,
			v.application_icon,
			app.sort_order                           AS application_sort_order,
			v.module_id,
			v.module_code,
			COALESCE(m.name, v.module_code)          AS module_name,
			v.module_icon,
			v.module_sort_order,
			v.object_id,
			v.object_code,
			COALESCE(obj.name, v.object_code)        AS object_name,
			v.object_icon,
			obj.parent_id,
			obj.path,
			obj.object_level,
			obj.sort_order                           AS object_sort_order,
			NVL(v.permission, '[]')                  AS permission,
			v.priority,
			v.role_id,
			v.role_code,
			v.all_data_access,
			v.default_agency_path,
			v.extra_da_json
		FROM v_user_effective_permission v
		JOIN object           obj ON obj.id  = v.object_id
		LEFT JOIN domain      d   ON d.id    = v.domain_id
		LEFT JOIN application app ON app.id  = v.application_id
		LEFT JOIN module      m   ON m.id    = v.module_id
		WHERE v.user_id = :1
		  AND INSTR(v.permission, '"VIEW"') > 0
		ORDER BY v.object_id, v.priority ASC, v.role_id ASC NULLS LAST
	`

	rows, err := db.Query(query, userID)
	if err != nil {
		log.Printf("Query menu permissions error: %v", err)
		return []models.DomainInfo{}, []models.MenuApplicationWithModules{}
	}
	defer rows.Close()

	domains := make(map[int64]models.DomainInfo)
	apps := make(map[int64]*models.MenuApplicationWithModules)
	modules := make(map[int64]*models.MenuModuleWithObjects)
	objects := make(map[int64]*models.MenuObjectNode)
	appModuleMap := make(map[int64]map[int64]bool)
	moduleObjectMap := make(map[int64][]*models.MenuObjectNode)
	objectRoles := make(map[int64]map[string]bool)

	for rows.Next() {
		var domainID, appID, modID, objID int64
		var domainCode, appCode, modCode, objCode string
		var domainName, appName, modName, objName string
		var appIcon, modIcon, objIcon sql.NullString
		var appSortOrder sql.NullInt64
		var modSortOrder int
		var parentID sql.NullInt64
		var objPath string
		var objLevel, objSortOrder int
		var permissionJSON string
		var priority int
		var roleID sql.NullString
		var roleCode sql.NullString
		var allDA int
		var defaultPath sql.NullString
		var extraDAJSON string

		err := rows.Scan(
			&domainID, &domainCode, &domainName,
			&appID, &appCode, &appName, &appIcon, &appSortOrder,
			&modID, &modCode, &modName, &modIcon, &modSortOrder,
			&objID, &objCode, &objName, &objIcon,
			&parentID, &objPath, &objLevel, &objSortOrder,
			&permissionJSON, &priority,
			&roleID, &roleCode, &allDA, &defaultPath, &extraDAJSON,
		)
		if err != nil {
			log.Printf("Scan menu permission error: %v", err)
			continue
		}

		pidStr := "nil"
		if parentID.Valid {
			pidStr = fmt.Sprintf("%d", parentID.Int64)
		}
		log.Printf("LOGIN_ROW: obj_id=%d obj_code=%s mod_id=%d mod_code=%s parent_id=%s", objID, objCode, modID, modCode, pidStr)

		perms := parsePerms(permissionJSON)

		if _, ok := domains[domainID]; !ok {
			domains[domainID] = models.DomainInfo{ID: domainID, Code: domainCode, Name: domainName}
		}

		if _, ok := apps[appID]; !ok {
			apps[appID] = &models.MenuApplicationWithModules{
				MenuApplication: models.MenuApplication{
					ID:         appID,
					Code:       appCode,
					Name:       appName,
					Icon:       nullableString(appIcon),
					SortOrder:  int(appSortOrder.Int64),
					DomainID:   domainID,
					DomainCode: domainCode,
				},
				Modules: []models.MenuModuleWithObjects{},
			}
		}

		if _, ok := modules[modID]; !ok {
			modules[modID] = &models.MenuModuleWithObjects{
				MenuModule: models.MenuModule{
					ID:        modID,
					Code:      modCode,
					Name:      modName,
					Icon:      nullableString(modIcon),
					SortOrder: modSortOrder,
				},
				Objects:   []models.MenuObjectNode{},
				Processes: []models.MenuProcess{},
			}
			if appModuleMap[appID] == nil {
				appModuleMap[appID] = make(map[int64]bool)
			}
			appModuleMap[appID][modID] = true
		}

		if existing, ok := objects[objID]; ok {
			existing.Permission = mergePerms(existing.Permission, perms)
		} else {
			obj := &models.MenuObjectNode{
				ID:          objID,
				Code:        objCode,
				Name:        objName,
				Icon:        nullableString(objIcon),
				Path:        objPath,
				ObjectLevel: objLevel,
				SortOrder:   objSortOrder,
				Children:    []models.MenuObjectNode{},
				Permission:  perms,
			}
			if parentID.Valid {
				obj.ParentID = &parentID.Int64
			}
			objects[objID] = obj
			moduleObjectMap[modID] = append(moduleObjectMap[modID], obj)
		}

		roleKey := ""
		if roleID.Valid {
			roleKey = roleID.String
		}
		if objectRoles[objID] == nil {
			objectRoles[objID] = make(map[string]bool)
		}
		if !objectRoles[objID][roleKey] {
			objectRoles[objID][roleKey] = true

			type rawDAEntry struct {
				AgencyPath string `json:"agency_path"`
			}
			var rawDA []rawDAEntry
			if extraDAJSON != "" && extraDAJSON != "[]" {
				_ = json.Unmarshal([]byte(extraDAJSON), &rawDA)
			}
			extra := make([]models.ExtraDataAccess, 0, len(rawDA))
			for _, e := range rawDA {
				extra = append(extra, models.ExtraDataAccess{
					AgencyPath: e.AgencyPath,
				})
			}
			rda := models.RoleDataAccess{
				AllDataAccess: allDA != 0,
				Permission:    perms,
				ExtraAccess:   extra,
			}
			if roleID.Valid {
				rda.RoleID = roleID.String
				rda.RoleCode = roleCode.String
			}
			if defaultPath.Valid {
				rda.DefaultAgencyPath = defaultPath.String
			}
			objects[objID].DataAccess = append(objects[objID].DataAccess, rda)
		}
	}

	// Build object tree
	childrenMap := make(map[int64][]*models.MenuObjectNode)
	for _, obj := range objects {
		if obj.ParentID != nil {
			if *obj.ParentID == obj.ID {
				log.Printf("LOGIN_WARN: SELF-REFERENCING object id=%d code=%s — parent_id points to itself!", obj.ID, obj.Code)
			}
		}
	}

	for _, obj := range objects {
		if obj.ParentID != nil {
			childrenMap[*obj.ParentID] = append(childrenMap[*obj.ParentID], obj)
			log.Printf("LOGIN_CHILD: parent=%d + child=%d (code=%s)", *obj.ParentID, obj.ID, obj.Code)
		}
	}

	var buildChildren func(obj *models.MenuObjectNode) models.MenuObjectNode
	buildChildren = func(obj *models.MenuObjectNode) models.MenuObjectNode {
		node := *obj
		if node.Permission == nil {
			node.Permission = []string{}
		}
		if children, ok := childrenMap[obj.ID]; ok {
			sort.Slice(children, func(i, j int) bool {
				return children[i].SortOrder < children[j].SortOrder
			})
			node.Children = make([]models.MenuObjectNode, 0, len(children))
			for _, child := range children {
				childCopy := buildChildren(child)
				if childCopy.Permission == nil {
					childCopy.Permission = []string{}
				}
				node.Children = append(node.Children, childCopy)
			}
		}
		return node
	}

	for modID, mod := range modules {
		log.Printf("LOGIN_MODULE: building module id=%d code=%s with %d raw objects",
			modID, mod.Code, len(moduleObjectMap[modID]))
		modRootObjects := []models.MenuObjectNode{}
		for _, obj := range moduleObjectMap[modID] {
			if obj.ParentID == nil {
				log.Printf("LOGIN_ROOT: module=%s obj=%s (id=%d) — no parent, treating as root", mod.Code, obj.Code, obj.ID)
				modRootObjects = append(modRootObjects, buildChildren(obj))
			} else if _, parentExists := objects[*obj.ParentID]; !parentExists {
				log.Printf("LOGIN_ROOT: module=%s obj=%s (id=%d) — parent %d not in permitted list, treating as root", mod.Code, obj.Code, obj.ID, *obj.ParentID)
				modRootObjects = append(modRootObjects, buildChildren(obj))
			} else {
				log.Printf("LOGIN_SKIP: module=%s obj=%s (id=%d) — parent %d EXISTS in objects but was NOT treated as root", mod.Code, obj.Code, obj.ID, *obj.ParentID)
			}
		}
		sort.Slice(modRootObjects, func(i, j int) bool {
			return modRootObjects[i].SortOrder < modRootObjects[j].SortOrder
		})
		mod.Objects = modRootObjects
		log.Printf("LOGIN_MODULE_RESULT: module=%s has %d root objects after tree build", mod.Code, len(modRootObjects))
	}

	for appID, app := range apps {
		appMods := []models.MenuModuleWithObjects{}
		for modID := range appModuleMap[appID] {
			if mod, ok := modules[modID]; ok {
				appMods = append(appMods, *mod)
			}
		}
		sort.Slice(appMods, func(i, j int) bool {
			return appMods[i].SortOrder < appMods[j].SortOrder
		})
		app.Modules = appMods
	}

	domainList := []models.DomainInfo{}
	for _, d := range domains {
		domainList = append(domainList, d)
	}

	appList := []models.MenuApplicationWithModules{}
	for _, a := range apps {
		appList = append(appList, *a)
	}
	sort.Slice(appList, func(i, j int) bool {
		return appList[i].SortOrder < appList[j].SortOrder
	})

	log.Printf("LOGIN buildMenuWithPermissions: returning %d domains, %d apps", len(domainList), len(appList))
	return domainList, appList
}

// parsePerms parses JSONB permission array
func parsePerms(jsonStr string) []string {
	result := []string{}
	if jsonStr == "" || jsonStr == "null" {
		return result
	}
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return result
	}
	return result
}

// mergePerms merges two permission arrays
func mergePerms(a, b []string) []string {
	permSet := make(map[string]bool)
	for _, p := range a {
		permSet[p] = true
	}
	for _, p := range b {
		permSet[p] = true
	}
	result := []string{}
	for p := range permSet {
		result = append(result, p)
	}
	return result
}

// verifyPassword - ตรวจสอบรหัสผ่าน
func verifyPassword(hashedPassword, plainPassword string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(plainPassword))
	// 28/10/69 (security): เทียบ bcrypt เท่านั้น — ตัด fallback เทียบข้อความตรง ๆ (ช่อง admin/admin1234)
	return err == nil
}

// generateJWT - สร้าง JWT token
func generateJWT(user models.AdminUser) (string, error) {
	claims := jwt.MapClaims{
		"userId":    user.UserID,
		"username":  user.Username,
		"firstName": user.FirstName,
		"lastName":  user.LastName,
		"role":      user.Role,
		"status":    user.Status,
		"exp":       time.Now().Add(time.Hour * 24).Unix(),
		"iat":       time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// HashPassword - Helper function สำหรับ hash password
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// Helper functions for pointer conversion
func strPtr(s string) *string {
	return &s
}

// nullableString returns string from NullString or empty if not valid
func nullableString(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}
