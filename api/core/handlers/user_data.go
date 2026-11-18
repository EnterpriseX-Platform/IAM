package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"
	"encoding/json"
	"log"
	"sort"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

// GetUserDataByUsername returns user data, roles, domains, and permissions for the authenticated user
func GetUserDataByUsername(c *fiber.Ctx) error {
	username, ok := c.Locals("username").(string)
	if !ok || username == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "User not authenticated",
		})
	}

	log.Printf("GetUserDataByUsername: Fetching data for user '%s'", username)

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Oracle database not connected",
		})
	}

	var userID string
	var userInfo struct {
		UserID    string         `json:"user_id"`
		UserName  string         `json:"user_name"`
		Email     sql.NullString `json:"email"`
		FirstName sql.NullString `json:"first_name"`
		LastName  sql.NullString `json:"last_name"`
		Status    sql.NullString `json:"status"`
	}

	err := db.QueryRow(`
		SELECT user_id, user_name, email, first_name, last_name, status
		FROM IAMX.USER_INFO
		WHERE user_name = :1
	`, username).Scan(
		&userInfo.UserID,
		&userInfo.UserName,
		&userInfo.Email,
		&userInfo.FirstName,
		&userInfo.LastName,
		&userInfo.Status,
	)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "User not found in IAMX",
		})
	}

	if err != nil {
		log.Printf("GetUserDataByUsername: Database error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch user data",
		})
	}

	userID = userInfo.UserID

	userRoles := getUserRolesForHandler(db, userID)
	domains, applications := buildMenuWithPermissionsForHandler(db, userID)

	userData := models.AuthUser{
		UserID:    userID,
		Username:  userInfo.UserName,
		FirstName: nullableString(userInfo.FirstName),
		LastName:  nullableString(userInfo.LastName),
		Email:     nullableString(userInfo.Email),
		Status:    nullableString(userInfo.Status),
		Roles:     userRoles,
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"user":         userData,
			"domains":      domains,
			"applications": applications,
		},
	})
}

func getUserRolesForHandler(db *sql.DB, userID string) []models.UserLoginRole {
	roleQuery := `
		SELECT
			r.id as role_id,
			r.code as role_name,
			r.name as role_desc
		FROM IAMX.USER_ROLE_MAPPING urm
		JOIN IAMX.ROLE r ON urm.role_id = r.id
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

func buildMenuWithPermissionsForHandler(db *sql.DB, userID string) ([]models.DomainInfo, []models.MenuApplicationWithModules) {
	log.Printf("buildMenuWithPermissions: called with userID=%s", userID)

	query := `
		SELECT
			v.domain_id,
			v.domain_code,
			COALESCE(d.name, v.domain_code) as domain_name,
			v.application_id,
			v.application_code,
			COALESCE(app.name, v.application_code) as application_name,
			v.application_icon,
			app.sort_order as application_sort_order,
			v.module_id,
			v.module_code,
			COALESCE(m.name, v.module_code) as module_name,
			v.module_icon,
			v.module_sort_order,
			v.object_id,
			v.object_code,
			COALESCE(obj.name, v.object_code) as object_name,
			v.object_icon,
			obj.parent_id,
			obj.path,
			obj.object_level,
			obj.sort_order as object_sort_order,
			v.permission,
			v.priority
		FROM IAMX.V_USER_EFFECTIVE_PERMISSION v
		JOIN IAMX.OBJECT obj ON obj.id = v.object_id
		LEFT JOIN IAMX.DOMAIN d ON d.id = v.domain_id
		LEFT JOIN IAMX.APPLICATION app ON app.id = v.application_id
		LEFT JOIN IAMX.MODULE m ON m.id = v.module_id
		WHERE v.user_id = :1
		ORDER BY v.domain_id, v.application_id, v.module_sort_order, v.module_id, v.object_id, v.priority
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

		err := rows.Scan(
			&domainID, &domainCode, &domainName,
			&appID, &appCode, &appName, &appIcon, &appSortOrder,
			&modID, &modCode, &modName, &modIcon, &modSortOrder,
			&objID, &objCode, &objName, &objIcon,
			&parentID, &objPath, &objLevel, &objSortOrder,
			&permissionJSON, &priority,
		)
		if err != nil {
			log.Printf("Scan menu permission error: %v", err)
			continue
		}

		perms := parsePermissionsJSON(permissionJSON)

		if _, ok := domains[domainID]; !ok {
			domains[domainID] = models.DomainInfo{
				ID:   domainID,
				Code: domainCode,
				Name: domainName,
			}
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
			existing.Permission = mergePermissions(existing.Permission, perms)
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
	}

	childrenMap := make(map[int64][]*models.MenuObjectNode)
	for _, obj := range objects {
		if obj.ParentID != nil {
			childrenMap[*obj.ParentID] = append(childrenMap[*obj.ParentID], obj)
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
		modRootObjects := []models.MenuObjectNode{}
		for _, obj := range moduleObjectMap[modID] {
			if obj.ParentID == nil {
				modRootObjects = append(modRootObjects, buildChildren(obj))
			} else if _, parentExists := objects[*obj.ParentID]; !parentExists {
				modRootObjects = append(modRootObjects, buildChildren(obj))
			}
		}
		sort.Slice(modRootObjects, func(i, j int) bool {
			return modRootObjects[i].SortOrder < modRootObjects[j].SortOrder
		})
		mod.Objects = modRootObjects
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

	return domainList, appList
}

func parsePermissionsJSON(jsonStr string) []string {
	result := []string{}
	if jsonStr == "" || jsonStr == "null" {
		return result
	}
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return result
	}
	return result
}

func mergePermissions(a, b []string) []string {
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

func int64ToString(i int64) string {
	return strconv.FormatInt(i, 10)
}
