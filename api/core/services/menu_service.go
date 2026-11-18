package services

import (
	"api/core"
	"api/core/models"
	"api/core/utils/token"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
)

var menuLogger *log.Logger

func init() {
	logFile, err := os.OpenFile("menu_service.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Println("Failed to open log file:", err)
	} else {
		menuLogger = log.New(logFile, "[MENU] ", log.LstdFlags|log.Lmicroseconds)
	}
}

func logDebug(format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	fmt.Println(msg)
	if menuLogger != nil {
		menuLogger.Println(msg)
	}
}

type MenuService struct {
	db           *sql.DB
	cacheService *CacheService
}

func NewMenuService(db *sql.DB, cacheService *CacheService) *MenuService {
	return &MenuService{
		db:           db,
		cacheService: cacheService,
	}
}

// GetUserData handles user data retrieval by username (email)
func (s *MenuService) GetUserData(ctx context.Context, req models.UserDataRequest) (*models.UserDataResponse, error) {
	refUserID, err := s.getRefUserIDByEmail(ctx, req.Username)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return s.GetUserMenu(ctx, refUserID)
}

// getRefUserIDByEmail looks up ref_user_id from user email
func (s *MenuService) getRefUserIDByEmail(ctx context.Context, email string) (string, error) {
	oracleDB := core.GetDB()
	if oracleDB == nil {
		return "", fmt.Errorf("Oracle database connection not available")
	}
	query := `SELECT REF_USER_ID FROM IAMX.USER_INFO WHERE EMAIL = :1 AND ROWNUM = 1`
	var refUserID string
	err := oracleDB.QueryRowContext(ctx, query, email).Scan(&refUserID)
	if err != nil {
		logDebug("DEBUG getRefUserIDByEmail error for email=%s: %v", email, err)
		return "", err
	}
	logDebug("DEBUG getRefUserIDByEmail: email=%s -> refUserID=%s", email, refUserID)
	return refUserID, nil
}

// getUser retrieves user by ref_user_id from IAMX.USER_INFO (single source of truth)
func (s *MenuService) getUser(ctx context.Context, refUserID string) (*models.MenuUser, error) {
	oracleDB := core.GetDB()
	if oracleDB == nil {
		return nil, fmt.Errorf("database connection not available")
	}

	query := `SELECT ui.USER_INFO_ID, ui.REF_USER_ID, ui.USER_NAME, ui.FIRST_NAME, ui.LAST_NAME,
		ui.FIRST_NAME || ' ' || ui.LAST_NAME AS FULL_NAME, ui.PHONE, ui.MOBILE,
		ui.EMAIL, ma.AGC_ID as AGENCY_ID, ma.AGC_CODE AS AGENCY_CODE, ma.AGC_TYPE
		AS AGENCY_TYPE, ma.AGC_TYPE, ma.AGC_NAME as AGENCY_NAME, ma.AGC_SHORTNAME,
		CASE WHEN ma3.AGC_ID IS NOT NULL THEN ma3.AGC_ID ELSE ma2.AGC_ID END AS MINISTRY_ID,
		CASE WHEN ma3.AGC_CODE IS NOT NULL THEN ma3.AGC_CODE ELSE ma2.AGC_CODE END AS MINISTRY_CODE,
		CASE WHEN ma3.AGC_NAME IS NOT NULL THEN ma3.AGC_NAME ELSE ma2.AGC_NAME END AS MINISTRY_NAME,
		ma.AGC_SP_FLAG, rp.PROVINCE_NAME, rd.DISTRICT_NAME, rs.SUBDISTRICT_NAME,
		CASE WHEN ma2.AGC_NAME = 'องค์กรปกครองส่วนท้องถิ่น' THEN 'Y' ELSE 'N' END AS AGC_LGO_FLAG,
		ui.USER_DEPARTMENT_ID, ui.USER_OPERATION_ID, ma4.AGC_CODE AS SUBAGENCY_CODE,
		CASE WHEN md.DEPARTMENT_NAME IS NOT NULL THEN md.DEPARTMENT_NAME ELSE '' END AS DEPARTMENT_NAME,
		'' as DEPARTMENT_ABV, '' as DEPARTMENT_COLOR, ui.MOBILE AS TEL,
		mp.POSITION_NAME,
		CASE WHEN me.EMP_ID IS NOT NULL THEN 1 ELSE 0 END AS IS_EMPLOYEE
		FROM IAMX.USER_INFO ui
		LEFT JOIN APP.M_AGC ma ON ma.AGC_ID = ui.USER_AGENCY_ID
		LEFT JOIN APP.M_AGC ma2 ON ma.PARENT_ID = ma2.AGC_ID
		LEFT JOIN APP.M_AGC ma3 ON ma3.AGC_ID = ui.USER_MINISTRY_ID
		LEFT JOIN APP.M_AGC ma4 ON ma4.AGC_ID = ui.USER_OPERATION_ID
		LEFT JOIN APP.REF_PROVINCE rp ON ma.PROVINCE_ID = rp.PROVINCE_ID
		LEFT JOIN APP.REF_DISTRICT rd ON ma.DISTRICT_ID = rd.DISTRICT_ID
		LEFT JOIN APP.REF_SUBDISTRICT rs ON ma.SUBDISTRICT_ID = rs.SUBDISTRICT_ID
		LEFT JOIN APP.M_DEPARTMENT md ON ui.USER_DEPARTMENT_ID = md.DEPARTMENT_ID
		LEFT JOIN APP.M_POSITION mp ON mp.POSITION_ID = ui.USER_POSITION_ID
		LEFT JOIN APP.M_EMPLOYEE me ON me.PERSONAL_CARD_ID = ui.PERSONAL_CARD_ID
			AND me.DELETED_DATE IS NULL
		WHERE ui.REF_USER_ID = :1 OR ui.USER_ID = :2
		FETCH FIRST 1 ROW ONLY`

	var user models.MenuUser
	var isEmployeeInt int
	err := oracleDB.QueryRowContext(ctx, query, refUserID, refUserID).Scan(
		&user.UserInfoID, &user.RefUserID, &user.UserName, &user.FirstName, &user.LastName,
		&user.FullName, &user.Phone, &user.Mobile, &user.Email,
		&user.AgencyID, &user.AgencyCode, &user.AgencyType, &user.AgencyType, &user.AgencyName, &user.AgcShortName,
		&user.MinistryID, &user.MinistryCode, &user.MinistryName,
		&user.AgencySPFlag, &user.ProvinceName, &user.DistrictName, &user.SubdistrictName,
		&user.AgcLGOFlag, &user.UserDepartmentID, &user.UserOperationID,
		&user.SubagencyCode, &user.DepartmentName, &user.DepartmentABV, &user.DepartmentColor, &user.Tel,
		&user.PositionName,
		&isEmployeeInt,
	)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	user.IsEmployee = isEmployeeInt == 1

	return &user, nil
}

// GetUserMenu retrieves the complete menu structure for a user
func (s *MenuService) GetUserMenu(ctx context.Context, refUserID string) (*models.UserDataResponse, error) {
	// อนุมัติคำร้องหรือแก้บทบาทแล้ว ลายนิ้วมือเปลี่ยน → ไม่ใช้เมนูเก่าที่แคชไว้ (เดิมต้องรอกด "รีเฟรชแคชทั้งหมด")
	cacheKey := "all|" + s.assignmentFingerprint(ctx, refUserID)
	if s.cacheService != nil {
		if cached, found := s.cacheService.GetMenu(refUserID, cacheKey, nil); found {
			return cached, nil
		}
	}

	user, err := s.getUser(ctx, refUserID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	if !user.RefUserID.Valid || user.RefUserID.String == "" {
		user.RefUserID = models.NullableString{NullString: sql.NullString{String: refUserID, Valid: true}}
	}

	response, err := s.buildMenuHierarchy(ctx, refUserID, user)
	if err != nil {
		return nil, err
	}

	if s.cacheService != nil {
		s.cacheService.SetMenu(refUserID, cacheKey, nil, response)
	}

	return response, nil
}

// assignmentFingerprint: จำนวน + เวลาแก้ล่าสุดของการผูกสิทธิ์ของผู้ใช้ — อ่านไม่ได้คืน "" (ทำงานแบบเดิม)
func (s *MenuService) assignmentFingerprint(ctx context.Context, refUserID string) string {
	var fp sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT (SELECT COUNT(*) || '.' || TO_CHAR(MAX(NVL(m.updated_at, m.created_at)), 'YYYYMMDDHH24MISSFF3')
		          FROM user_role_mapping m WHERE m.is_active = 1 AND m.user_id IN (SELECT u.user_id FROM user_info u WHERE u.ref_user_id = :1 OR u.user_id = :2))
		    || '|' ||
		       (SELECT COUNT(*) || '.' || TO_CHAR(MAX(NVL(c.updated_at, c.created_at)), 'YYYYMMDDHH24MISSFF3')
		          FROM user_custom_object_mapping c WHERE c.user_id IN (SELECT u.user_id FROM user_info u WHERE u.ref_user_id = :3 OR u.user_id = :4))
		  FROM dual`, refUserID, refUserID, refUserID, refUserID).Scan(&fp)
	if err != nil {
		return ""
	}
	return fp.String
}

// oracleDAEntry is used to parse the extra_da_json column from V_USER_EFFECTIVE_PERMISSION.
type oracleDAEntry struct {
	AgencyPath string `json:"agency_path"`
}

// buildMenuHierarchy builds the complete menu hierarchy from v_user_effective_permission.
// Returns one row per (object, role); permissions are merged at the object level,
// data access is kept separate per role.
func (s *MenuService) buildMenuHierarchy(ctx context.Context, refUserID string, user *models.MenuUser) (*models.UserDataResponse, error) {
	query := `
		SELECT
			v.domain_id,
			v.domain_code,
			NVL(d.name, v.domain_code)              AS domain_name,
			v.application_id,
			v.application_code,
			NVL(app.name, v.application_code)        AS application_name,
			v.application_icon,
			app.sort_order                           AS application_sort_order,
			v.module_id,
			v.module_code,
			NVL(mod.name, v.module_code)             AS module_name,
			v.module_icon,
			v.module_sort_order,
			v.object_id,
			v.object_code,
			NVL(obj.name, v.object_code)             AS object_name,
			-- 26/8: view ตอก object_icon เป็น NULL ตายตัว (CLOB ใช้ใน UNION ไม่ได้)
			-- อ่านจากตาราง OBJECT ตรง ๆ ผ่าน join ที่มีอยู่แล้ว — ตัดที่ 3900 ไบต์กัน overflow VARCHAR2
			DBMS_LOB.SUBSTR(obj.icon, 3900, 1)       AS object_icon,
			ot.CODE AS object_type_code,
			obj.parent_id,
			obj.path,
			obj.context_path                         AS object_context_path,
			mod.context_path                         AS module_context_path,
			obj.object_level,
			obj.sort_order                           AS object_sort_order,
			NVL(v.permission, '[]')                  AS permission,
			v.priority,
			v.role_id,
			v.role_code,
			v.all_data_access,
			v.default_agency_path,
			v.extra_da_json
		FROM IAMX.V_USER_EFFECTIVE_PERMISSION v
		JOIN IAMX.OBJECT      obj ON obj.id = v.object_id
		LEFT JOIN IAMX.OBJECT_TYPE ot ON obj.OBJECT_TYPE_ID = ot.ID
		LEFT JOIN IAMX.DOMAIN      d   ON d.id   = v.domain_id
		LEFT JOIN IAMX.APPLICATION app ON app.id = v.application_id
		LEFT JOIN IAMX.MODULE      mod ON mod.id = v.module_id
		WHERE v.user_id = :1
		  AND ot.CODE IN ('MENU', 'SUB_MENU')
		ORDER BY v.object_id, v.priority ASC, v.role_id ASC NULLS LAST
	`

	rows, err := s.db.QueryContext(ctx, query, refUserID)
	if err != nil {
		logDebug("DEBUG buildMenuHierarchy query error: %v", err)
		return nil, err
	}
	defer rows.Close()

	domains := make(map[int64]models.DomainInfo)
	apps := make(map[int64]*models.MenuApplicationWithModules)
	modules := make(map[int64]*models.MenuModuleWithObjects)
	objects := make(map[int64]*models.MenuObjectNode)
	appModuleMap := make(map[int64]map[int64]bool)
	moduleObjectMap := make(map[int64][]*models.MenuObjectNode)
	objectRoles := make(map[int64]map[string]bool) // objID → set of roleIDs already appended

	for rows.Next() {
		var domainID, appID, modID, objID int64
		var domainCode, appCode, modCode, objCode string
		var domainName, appName, modName, objName string
		var appIcon, modIcon, objIcon sql.NullString
		var appSortOrder sql.NullInt64
		var modSortOrder int
		var objTypeCode sql.NullString
		var parentID sql.NullInt64
		var objPath, objCtxPath, modCtxPath sql.NullString
		var objLevel, objSortOrder int
		var permJSON string
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
			&objID, &objCode, &objName, &objIcon, &objTypeCode,
			&parentID, &objPath, &objCtxPath, &modCtxPath, &objLevel, &objSortOrder,
			&permJSON, &priority,
			&roleID, &roleCode, &allDA, &defaultPath, &extraDAJSON,
		)
		if err != nil {
			logDebug("DEBUG buildMenuHierarchy scan error: %v", err)
			continue
		}

		pidStr := "nil"
		if parentID.Valid {
			pidStr = fmt.Sprintf("%d", parentID.Int64)
		}
		logDebug("MENU_ROW: obj_id=%d obj_code=%s mod_id=%d mod_code=%s parent_id=%s type=%s", objID, objCode, modID, modCode, pidStr, nullableString(objTypeCode))

		// Store domain
		if _, ok := domains[domainID]; !ok {
			domains[domainID] = models.DomainInfo{
				ID:   domainID,
				Code: domainCode,
				Name: domainName,
			}
		}

		// Store application with domain info
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

		// Store module
		if _, ok := modules[modID]; !ok {
			modules[modID] = &models.MenuModuleWithObjects{
				MenuModule: models.MenuModule{
					ID:          modID,
					Code:        modCode,
					Name:        modName,
					Icon:        nullableString(modIcon),
					SortOrder:   modSortOrder,
					ContextPath: nullableString(modCtxPath),
				},
				Objects:   []models.MenuObjectNode{},
				Processes: []models.MenuProcess{},
			}
			if appModuleMap[appID] == nil {
				appModuleMap[appID] = make(map[int64]bool)
			}
			appModuleMap[appID][modID] = true
		}

		perms := parseMenuPermissionJSON(permJSON)

		// Create object on first encounter; merge permissions on subsequent roles.
		if existing, ok := objects[objID]; ok {
			existing.Permission = mergePermissions(existing.Permission, perms)
		} else {
			obj := &models.MenuObjectNode{
				ID:             objID,
				Code:           objCode,
				Name:           objName,
				Icon:           nullableString(objIcon),
				Path:           nullableString(objPath),
				ContextPath:    nullableString(objCtxPath),
				ObjectTypeCode: nullableString(objTypeCode),
				ObjectLevel:    objLevel,
				SortOrder:      objSortOrder,
				Children:       []models.MenuObjectNode{},
				Permission:     perms,
			}
			if parentID.Valid {
				obj.ParentID = &parentID.Int64
			}
			objects[objID] = obj
			moduleObjectMap[modID] = append(moduleObjectMap[modID], obj)
		}

		// Append RoleDataAccess once per (object, role) pair.
		roleKey := ""
		if roleID.Valid {
			roleKey = roleID.String
		}
		if objectRoles[objID] == nil {
			objectRoles[objID] = make(map[string]bool)
		}
		if !objectRoles[objID][roleKey] {
			objectRoles[objID][roleKey] = true

			var rawDA []oracleDAEntry
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

	if err := rows.Err(); err != nil {
		logDebug("DEBUG buildMenuHierarchy rows error: %v", err)
		return nil, err
	}

	userRoles := s.getUserRoles(ctx, refUserID)
	userRoleIDs := make([]string, 0, len(userRoles))
	for _, r := range userRoles {
		if r.RoleID != nil {
			userRoleIDs = append(userRoleIDs, *r.RoleID)
		}
	}

	// Build object tree recursively
	// First, organize objects by parent
	childrenMap := make(map[int64][]*models.MenuObjectNode) // parent_id -> children

	for _, obj := range objects {
		logDebug("MENU_OBJECT: id=%d code=%s parentID=%v moduleAssigned=%t",
			obj.ID, obj.Code, obj.ParentID, isObjInAnyModule(obj, moduleObjectMap))
		if obj.ParentID != nil {
			// This is a child object
			childrenMap[*obj.ParentID] = append(childrenMap[*obj.ParentID], obj)
			if *obj.ParentID == obj.ID {
				logDebug("MENU_WARN: SELF-REFERENCING object id=%d code=%s — parent_id points to itself!", obj.ID, obj.Code)
			}
		}
	}

	// Log children map summary
	for parentID, children := range childrenMap {
		for _, child := range children {
			logDebug("MENU_CHILD: parent=%d + child=%d (code=%s)", parentID, child.ID, child.Code)
		}
	}

	// Recursively build children for each object and fetch object-level processes
	var buildChildren func(obj *models.MenuObjectNode, modCtx string) models.MenuObjectNode
	buildChildren = func(obj *models.MenuObjectNode, modCtx string) models.MenuObjectNode {
		node := *obj // Copy the object

		// Object contextPath wins over the module's; empty means no prefix.
		effCtx := node.ContextPath
		if effCtx == "" {
			effCtx = modCtx
		}

		// Fetch object-level processes for this object
		node.Processes = s.getObjectProcesses(ctx, obj.ID, refUserID, userRoleIDs)
		for i := range node.Processes {
			node.Processes[i].ResolvedPath = resolveMenuPath(node.Processes[i].Path, effCtx, "MENU")
		}

		node.PathNormalized = strings.TrimSpace(node.Path)
		// Only MENU/SUB_MENU children make a node a folder. BUTTON and TAB children
		// "รายการปฏิทินงบประมาณ" is a page with two TABs, not a folder.
		node.NodeKind = "screen"
		for _, ch := range childrenMap[obj.ID] {
			if ch.ObjectTypeCode == "MENU" || ch.ObjectTypeCode == "SUB_MENU" {
				node.NodeKind = "folder"
				break
			}
		}
		node.ResolvedPath = resolveMenuPath(node.Path, effCtx, node.ObjectTypeCode)
		node.IsNavigable = node.NodeKind == "screen" && isNavigablePath(node.ResolvedPath)

		if children, ok := childrenMap[obj.ID]; ok {
			node.Children = make([]models.MenuObjectNode, 0, len(children))
			for _, child := range children {
				node.Children = append(node.Children, buildChildren(child, modCtx))
			}
			// Sort children by SortOrder
			sort.Slice(node.Children, func(i, j int) bool {
				return node.Children[i].SortOrder < node.Children[j].SortOrder
			})
		}
		return node
	}

	// Build modules with root objects and their full tree
	for modID, mod := range modules {
		logDebug("MENU_MODULE: building module id=%d code=%s with %d raw objects",
			modID, mod.Code, len(moduleObjectMap[modID]))
		modRootObjects := []models.MenuObjectNode{}
		for _, obj := range moduleObjectMap[modID] {
			pid := "nil"
			if obj.ParentID != nil {
				pid = fmt.Sprintf("%d", *obj.ParentID)
			}
			// Include root objects (no parent) OR objects whose parent is not in the permitted list
			if obj.ParentID == nil {
				logDebug("MENU_ROOT: module=%s obj=%s (id=%d) — no parent, treating as root", mod.Code, obj.Code, obj.ID)
				modRootObjects = append(modRootObjects, buildChildren(obj, mod.ContextPath))
			} else if _, parentExists := objects[*obj.ParentID]; !parentExists {
				logDebug("MENU_ROOT: module=%s obj=%s (id=%d) — parent %d not in permitted list, treating as root", mod.Code, obj.Code, obj.ID, *obj.ParentID)
				modRootObjects = append(modRootObjects, buildChildren(obj, mod.ContextPath))
			} else {
				logDebug("MENU_SKIP: module=%s obj=%s (id=%d) — parent %d EXISTS in objects but was NOT treated as root (may be self-ref or in another subtree)", mod.Code, obj.Code, obj.ID, *obj.ParentID)
			}
			_ = pid
		}
		// Sort root objects by SortOrder
		sort.Slice(modRootObjects, func(i, j int) bool {
			return modRootObjects[i].SortOrder < modRootObjects[j].SortOrder
		})
		mod.Objects = modRootObjects
		logDebug("MENU_MODULE_RESULT: module=%s has %d root objects after tree build", mod.Code, len(modRootObjects))
	}

	// Build applications with modules
	for appID, app := range apps {
		appMods := []models.MenuModuleWithObjects{}
		for modID := range appModuleMap[appID] {
			if mod, ok := modules[modID]; ok {
				// Fetch processes for this module
				processes := s.getModuleProcesses(ctx, modID, refUserID, userRoleIDs)
				for i := range processes {
					processes[i].ResolvedPath = resolveMenuPath(processes[i].Path, mod.ContextPath, "MENU")
				}
				mod.Processes = processes
				appMods = append(appMods, *mod)
			}
		}
		app.Modules = appMods
	}

	// Convert maps to slices
	domainList := []models.DomainInfo{}
	for _, d := range domains {
		domainList = append(domainList, d)
	}

	appList := []models.MenuApplicationWithModules{}
	for _, a := range apps {
		appList = append(appList, *a)
	}

	// Sort applications by SortOrder
	sort.Slice(appList, func(i, j int) bool {
		return appList[i].SortOrder < appList[j].SortOrder
	})

	// Sort modules within each application by SortOrder
	for i := range appList {
		sort.Slice(appList[i].Modules, func(a, b int) bool {
			return appList[i].Modules[a].SortOrder < appList[i].Modules[b].SortOrder
		})
	}

	// Generate JWT token
	jwtToken, err := token.GenerateToken(
		user.RefUserID.String, // userid = ref_user_id
		user.UserName.String,
		user.Email.String,
		user.FirstName.String,
		user.LastName.String,
	)
	if err != nil {
		logDebug("DEBUG buildMenuHierarchy token generation error: %v", err)
		// Don't fail if token generation fails, just log it
	}

	// Debug: Print first app and its modules
	for appID, app := range apps {
		logDebug("DEBUG App %d (%s): %d modules", appID, app.Code, len(app.Modules))
		for i, mod := range app.Modules {
			logDebug("DEBUG  Module %d: %s with %d objects", i, mod.Code, len(mod.Objects))
		}
		break // Only print first app
	}

	logDebug("DEBUG buildMenuHierarchy: refUserID=%s, domains=%d, apps=%d, modules=%d, objects=%d, token_len=%d, roles=%d",
		refUserID, len(domainList), len(appList), len(modules), len(objects), len(jwtToken), len(userRoles))

	return &models.UserDataResponse{
		UserInfo:     convertToUserInfoResponse(user),
		Token:        jwtToken,
		Domains:      domainList,
		Applications: appList,
		Roles:        userRoles,
	}, nil
}

// resolveMenuPath applies a module/object contextPath to a stored path.
//
// An absolute path always wins — a row that already carries its prefix is
// returned untouched, so setting a contextPath can never rewrite a working URL.
//
// Two rules keep it from inventing URLs out of values that were never paths:
//
//   - Only menu nodes get a contextPath. BUTTON and TAB rows keep the path
//     column as their identity: /me/page-permissions reports object permissions
//     keyed by obj.path ("บันทึกร่าง", "BUDGET-CALENDAR"), so prefixing those
//     would both fabricate a URL and break the key apps match on.
//   - A relative path that already opens with the contextPath only gains the
//     lost its slash, not a row missing its prefix, and doubling it would give
func resolveMenuPath(path, contextPath, objectTypeCode string) string {
	t := strings.TrimSpace(path)
	if t == "" || isNavigablePath(t) {
		return t
	}
	if objectTypeCode != "" && objectTypeCode != "MENU" && objectTypeCode != "SUB_MENU" {
		return t
	}
	c := strings.TrimSuffix(strings.TrimSpace(contextPath), "/")
	if c == "" {
		return t
	}
	if slashed := "/" + strings.TrimPrefix(t, "/"); slashed == c || strings.HasPrefix(slashed, c+"/") {
		return slashed
	}
	return c + "/" + strings.TrimPrefix(t, "/")
}

// isNavigablePath reports whether a menu node's path can actually be opened.
// label), and some rows have a stray leading space, so trim before testing.
func isNavigablePath(p string) bool {
	t := strings.TrimSpace(p)
	return strings.HasPrefix(t, "/") ||
		strings.HasPrefix(t, "http://") ||
		strings.HasPrefix(t, "https://")
}

// processMapperRoleAllowed reports whether a process mapper row (whose
// allowed_role_ids is a comma-separated list from V_PROCESS_MAPPER_ROLES) is
// visible to a user holding userRoleIDs. Empty/NULL allowedRoleIDs means the
// process mapper is unrestricted (visible to everyone).
func processMapperRoleAllowed(allowedRoleIDs sql.NullString, userRoleIDs []string) bool {
	if !allowedRoleIDs.Valid || allowedRoleIDs.String == "" {
		return true
	}
	for _, allowed := range strings.Split(allowedRoleIDs.String, ",") {
		for _, userRoleID := range userRoleIDs {
			if allowed == userRoleID {
				return true
			}
		}
	}
	return false
}

// getModuleProcesses retrieves process mappers for a module (module-level only)
// Returns flat list - each row is a separate process
func (s *MenuService) getModuleProcesses(ctx context.Context, moduleID int64, refUserID string, userRoleIDs []string) []models.MenuProcess {
	query := `
		SELECT
			pm.id,
			pm.process_id,
			pm.subprocess_id,
			pm.process_code,
			pm.subprocess_code,
			pm.process_code      AS code,
			pm.display_text      AS name,
			pm.process_name,
			pm.subprocess_name,
			pm.display_component AS description,
			pm.url               AS path,
			pm.fiscal_year,
			pm.allowed_role_ids,
			m.code               AS module_code
		FROM V_PROCESS_MAPPER_ROLES pm
		LEFT JOIN IAMX.MODULE m ON m.id = pm.module_id
		WHERE pm.module_id = :1
		  AND pm.object_id IS NULL
		ORDER BY pm.display_component, pm.process_code, pm.subprocess_code
	`
	rows, err := s.db.QueryContext(ctx, query, moduleID)
	if err != nil {
		logDebug("DEBUG getModuleProcesses error: %v", err)
		return []models.MenuProcess{}
	}
	defer rows.Close()

	processes := []models.MenuProcess{}
	for rows.Next() {
		var p models.MenuProcess
		var desc sql.NullString
		var path sql.NullString
		var allowedRoleIDs sql.NullString

		var processID, subProcessID, procName, subProcName sql.NullString
		var modCode sql.NullString
		if err := rows.Scan(&p.ID, &processID, &subProcessID, &p.ProcessCode, &p.SubProcessCode, &p.Code, &p.Name, &procName, &subProcName, &desc, &path, &p.FiscalYear, &allowedRoleIDs, &modCode); err != nil {
			logDebug("DEBUG getModuleProcesses scan error: %v", err)
			continue
		}
		mid := moduleID
		p.ModuleID = &mid
		p.ModuleCode = nullableString(modCode)
		p.OwnerObjectID = nil
		p.Scope = "module"
		if !processMapperRoleAllowed(allowedRoleIDs, userRoleIDs) {
			continue
		}
		if processID.Valid {
			p.ProcessID = processID.String
		}
		if subProcessID.Valid {
			p.SubProcessID = subProcessID.String
		}
		if procName.Valid {
			p.ProcessName = procName.String
		}
		if subProcName.Valid {
			p.SubProcessName = subProcName.String
		}
		if desc.Valid {
			p.Description = desc.String
		}
		if path.Valid {
			p.Path = path.String
		}
		p.SortOrder = 0

		processes = append(processes, p)
	}

	logDebug("DEBUG getModuleProcesses: moduleID=%d, totalProcesses=%d", moduleID, len(processes))
	return processes
}

// getObjectProcesses retrieves process mappers for an object
// Returns flat list - each row is a separate process
func (s *MenuService) getObjectProcesses(ctx context.Context, objectID int64, refUserID string, userRoleIDs []string) []models.MenuProcess {
	query := `
		SELECT
			pm.id,
			pm.process_id,
			pm.subprocess_id,
			pm.process_code,
			pm.subprocess_code,
			pm.process_code as code,
			pm.display_text as name,
			pm.process_name,
			pm.subprocess_name,
			pm.display_component as description,
			pm.url as path,
			pm.fiscal_year,
			pm.allowed_role_ids,
			o.code  AS owner_object_code,
			pm.module_id,
			m.code  AS module_code
		FROM V_PROCESS_MAPPER_ROLES pm
		LEFT JOIN IAMX.OBJECT o ON o.id = pm.object_id
		LEFT JOIN IAMX.MODULE m ON m.id = pm.module_id
		WHERE pm.object_id = :1
		ORDER BY pm.display_component, pm.process_code, pm.subprocess_code
	`
	rows, err := s.db.QueryContext(ctx, query, objectID)
	if err != nil {
		logDebug("DEBUG getObjectProcesses error: %v", err)
		return []models.MenuProcess{}
	}
	defer rows.Close()

	processes := []models.MenuProcess{}
	rawRowCount := 0
	for rows.Next() {
		rawRowCount++
		var p models.MenuProcess
		var desc sql.NullString
		var path sql.NullString
		var allowedRoleIDs sql.NullString

		var processID, subProcessID, procName, subProcName sql.NullString
		var ownerObjCode, modCode sql.NullString
		var modID sql.NullInt64
		if err := rows.Scan(&p.ID, &processID, &subProcessID, &p.ProcessCode, &p.SubProcessCode, &p.Code, &p.Name, &procName, &subProcName, &desc, &path, &p.FiscalYear, &allowedRoleIDs, &ownerObjCode, &modID, &modCode); err != nil {
			logDebug("DEBUG getObjectProcesses scan error: %v", err)
			continue
		}
		ownerID := objectID
		p.OwnerObjectID = &ownerID
		p.OwnerObjectCode = nullableString(ownerObjCode)
		p.ModuleCode = nullableString(modCode)
		if modID.Valid {
			mid := modID.Int64
			p.ModuleID = &mid
		}
		p.Scope = "object"
		logDebug("DEBUG getObjectProcesses raw row: id=%d objectID=%d procCode=%s subprocCode=%s allowedRoleIDs=%q valid=%v",
			p.ID, objectID, p.ProcessCode, p.SubProcessCode, allowedRoleIDs.String, allowedRoleIDs.Valid)
		if !processMapperRoleAllowed(allowedRoleIDs, userRoleIDs) {
			logDebug("DEBUG getObjectProcesses ROLE REJECTED: id=%d allowedRoleIDs=%q userRoleIDs=%v",
				p.ID, allowedRoleIDs.String, userRoleIDs)
			continue
		}
		if processID.Valid {
			p.ProcessID = processID.String
		}
		if subProcessID.Valid {
			p.SubProcessID = subProcessID.String
		}
		if procName.Valid {
			p.ProcessName = procName.String
		}
		if subProcName.Valid {
			p.SubProcessName = subProcName.String
		}
		if desc.Valid {
			p.Description = desc.String
		}
		if path.Valid {
			p.Path = path.String
		}
		p.SortOrder = 0

		processes = append(processes, p)
	}

	logDebug("DEBUG getObjectProcesses: objectID=%d, rawRows=%d, filtered=%d", objectID, rawRowCount, len(processes))
	return processes
}

// GetPagePermissions returns the unified page-level permission response:
//   - Page        — the menu object code (parentCode parameter)
//   - Permissions — effective permissions on the page object itself (MENU/SUB_MENU)
//   - ObjectPermissions — effective permissions for child objects (BUTTON, TAB, etc.)
//
// When parentCode is empty, Permissions is empty and ObjectPermissions contains
// all non-menu objects the user can see.
func (s *MenuService) GetPagePermissions(ctx context.Context, refUserID string, parentCode string) (*models.PagePermissionsResponse, error) {
	resp := &models.PagePermissionsResponse{
		Page:              parentCode,
		Permissions:       []string{},
		ObjectPermissions: []models.ObjectPermission{},
	}

	// --- 1. Page object's own permissions (only when parentCode given) ---
	if parentCode != "" {
		pageQuery := `
			SELECT NVL(v.permission, '[]') AS permission, v.priority
			FROM IAMX.V_USER_EFFECTIVE_PERMISSION v
			JOIN IAMX.OBJECT obj ON obj.id = v.object_id
			LEFT JOIN IAMX.OBJECT_TYPE ot ON obj.OBJECT_TYPE_ID = ot.ID
			WHERE v.user_id = :1
			  AND v.object_code = :2
			  AND ot.CODE IN ('MENU', 'SUB_MENU')
			ORDER BY v.priority ASC
		`
		pageRows, err := s.db.QueryContext(ctx, pageQuery, refUserID, parentCode)
		if err != nil {
			logDebug("DEBUG GetPagePermissions page query error: %v", err)
			return nil, err
		}
		var pagePerms []string
		for pageRows.Next() {
			var permJSON string
			var priority int
			if err := pageRows.Scan(&permJSON, &priority); err != nil {
				continue
			}
			pagePerms = mergePermissions(pagePerms, parseMenuPermissionJSON(permJSON))
		}
		pageRows.Close()
		resp.Permissions = pagePerms
	}

	// --- 2. Child object permissions (BUTTON, TAB, etc.) ---
	var parentParam interface{}
	if parentCode != "" {
		parentParam = parentCode
	}

	childQuery := `
		SELECT
			v.object_id,
			v.object_code,
			obj.path,
			NVL(v.permission, '[]') AS permission,
			v.priority
		FROM IAMX.V_USER_EFFECTIVE_PERMISSION v
		JOIN IAMX.OBJECT obj   ON obj.id = v.object_id
		LEFT JOIN IAMX.OBJECT_TYPE ot ON obj.OBJECT_TYPE_ID = ot.ID
		LEFT JOIN IAMX.OBJECT pobj ON pobj.id = obj.parent_id
		WHERE v.user_id = :1
		  AND ot.CODE NOT IN ('MENU', 'SUB_MENU')
		  AND INSTR(v.permission, '"VIEW"') > 0
		  AND (:2 IS NULL OR pobj.code = :2)
		ORDER BY v.object_id, v.priority ASC
	`
	rows, err := s.db.QueryContext(ctx, childQuery, refUserID, parentParam, parentParam)
	if err != nil {
		logDebug("DEBUG GetPagePermissions child query error: %v", err)
		return nil, err
	}
	defer rows.Close()

	type merged struct {
		code  string
		path  string
		perms []string
	}
	mergedMap := make(map[int64]*merged)
	var order []int64

	for rows.Next() {
		var objID int64
		var objCode, objPath string
		var permJSON string
		var priority int
		if err := rows.Scan(&objID, &objCode, &objPath, &permJSON, &priority); err != nil {
			logDebug("DEBUG GetPagePermissions child scan error: %v", err)
			continue
		}
		perms := parseMenuPermissionJSON(permJSON)
		if m, ok := mergedMap[objID]; ok {
			m.perms = mergePermissions(m.perms, perms)
		} else {
			mergedMap[objID] = &merged{
				code:  objCode,
				path:  objPath,
				perms: perms,
			}
			order = append(order, objID)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, id := range order {
		m := mergedMap[id]
		resp.ObjectPermissions = append(resp.ObjectPermissions, models.ObjectPermission{
			Object:      m.path,
			Permissions: m.perms,
		})
	}
	return resp, nil
}

func nullableString(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

// stringPtr returns a pointer to the string value, or nil if empty
func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// stringPtrFromNullableString returns a pointer to the string value from NullableString, or nil if not valid
func stringPtrFromNullableString(ns models.NullableString) *string {
	if ns.Valid && ns.String != "" {
		return &ns.String
	}
	return nil
}

// convertToUserInfoResponse converts MenuUser to UserInfoResponse with uppercase field names
func convertToUserInfoResponse(user *models.MenuUser) models.UserInfoResponse {
	return models.UserInfoResponse{
		USER_INFO_ID:       stringPtrFromNullableString(user.UserInfoID),
		AGENCY_ID:          stringPtrFromNullableString(user.AgencyID),
		USER_OPERATION_ID:  stringPtrFromNullableString(user.UserOperationID),
		AGC_SP_FLAG:        stringPtrFromNullableString(user.AgencySPFlag),
		USER_DEPARTMENT_ID: stringPtrFromNullableString(user.UserDepartmentID),
		DEPARTMENT_NAME:    stringPtrFromNullableString(user.DepartmentName),
		PHONE:              stringPtrFromNullableString(user.Phone),
		MINISTRY_NAME:      stringPtrFromNullableString(user.MinistryName),
		LAST_NAME:          stringPtrFromNullableString(user.LastName),
		EMAIL:              stringPtrFromNullableString(user.Email),
		FIRST_NAME:         stringPtrFromNullableString(user.FirstName),
		DEPARTMENT_ABV:     stringPtrFromNullableString(user.DepartmentABV),
		MINISTRY_CODE:      stringPtrFromNullableString(user.MinistryCode),
		DISTRICT_NAME:      stringPtrFromNullableString(user.DistrictName),
		FULL_NAME:          stringPtrFromNullableString(user.FullName),
		REF_USER_ID:        stringPtrFromNullableString(user.RefUserID),
		SUBDISTRICT_NAME:   stringPtrFromNullableString(user.SubdistrictName),
		AGENCY_CODE:        stringPtrFromNullableString(user.AgencyCode),
		DEPARTMENT_COLOR:   stringPtrFromNullableString(user.DepartmentColor),
		AGC_SHORTNAME:      stringPtrFromNullableString(user.AgcShortName),
		SUBAGENCY_CODE:     stringPtrFromNullableString(user.SubagencyCode),
		USER_NAME:          stringPtrFromNullableString(user.UserName),
		PROVINCE_NAME:      stringPtrFromNullableString(user.ProvinceName),
		MINISTRY_ID:        stringPtrFromNullableString(user.MinistryID),
		AGENCY_TYPE:        stringPtrFromNullableString(user.AgencyType),
		AGENCY_NAME:        stringPtrFromNullableString(user.AgencyName),
		AGC_LGO_FLAG:       stringPtrFromNullableString(user.AgcLGOFlag),
		MOBILE:             stringPtrFromNullableString(user.Mobile),
		TEL:                stringPtrFromNullableString(user.Tel),
		POSITION_NAME:      stringPtrFromNullableString(user.PositionName),
		IS_EMPLOYEE:        user.IsEmployee,
	}
}

// InvalidateUserCache invalidates menu cache for a user
func (s *MenuService) InvalidateUserCache(refUserID string) {
	if s.cacheService != nil {
		s.cacheService.InvalidateMenu(refUserID)
	}
}

// getUserRoles retrieves user roles from Oracle
func (s *MenuService) getUserRoles(ctx context.Context, refUserID string) []models.UserLoginRole {
	// refUserID is the user_id from user_info table
	query := `
		SELECT
			r.id        AS role_id,
			r.code      AS role_name,
			r.name      AS role_desc,
			r.role_type AS role_type
		FROM user_role_mapping urm
		JOIN role r ON urm.role_id = r.id
		WHERE urm.user_id  = :1
		  AND urm.is_active = 1
	`
	rows, err := s.db.QueryContext(ctx, query, refUserID)
	if err != nil {
		logDebug("DEBUG getUserRoles error: %v", err)
		return []models.UserLoginRole{}
	}
	defer rows.Close()

	var roles []models.UserLoginRole
	for rows.Next() {
		var r models.UserLoginRole
		var roleID sql.NullString
		var roleName, roleDesc, roleType sql.NullString

		if err := rows.Scan(&roleID, &roleName, &roleDesc, &roleType); err != nil {
			logDebug("DEBUG getUserRoles scan error: %v", err)
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
		if roleType.Valid {
			r.RoleType = strPtr(roleType.String)
		}

		roles = append(roles, r)
	}

	logDebug("DEBUG getUserRoles: refUserID=%s, roles=%d", refUserID, len(roles))
	return roles
}

// Helper functions for pointer conversion
func strPtr(s string) *string {
	return &s
}

// isObjInAnyModule checks if an object belongs to any module in the moduleObjectMap
func isObjInAnyModule(obj *models.MenuObjectNode, moduleObjectMap map[int64][]*models.MenuObjectNode) bool {
	for _, objs := range moduleObjectMap {
		for _, o := range objs {
			if o.ID == obj.ID {
				return true
			}
		}
	}
	return false
}

func parseMenuPermissionJSON(s string) []string {
	result := []string{}
	if s == "" || s == "[]" || s == "null" {
		return result
	}
	_ = json.Unmarshal([]byte(s), &result)
	return result
}

// parsePermissionBytes parses JSONB permission byte array to string slice
func parsePermissionBytes(data []byte) []string {
	result := []string{}
	if len(data) == 0 || string(data) == "null" {
		return result
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return result
	}
	return result
}

// mergePermissions merges two permission arrays into a union (unique values)
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
