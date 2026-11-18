package handlers

import (
	"api/core"
	"api/core/config"
	"api/core/models"
	"api/core/services"
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// errResponseWritten is returned by resolveRefUserID after it has already
// written an HTTP response. Callers must return nil (not this error) so
// Fiber does not attempt a second write.
var errResponseWritten = fmt.Errorf("response already written")

// MenuHandler handles menu-related HTTP requests
type MenuHandler struct {
	menuService *services.MenuService
}

// isPositiveInt reports whether s parses as a positive (>0) integer.
// Used to gate IAMX user_info queries that bind to NUMBER columns â€”
// go-ora aborts on an empty / non-numeric refUserID before any rows
// come back.
func isPositiveInt(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if r < '0' || r > '9' {
			return false
		}
		// guard against leading-zero-only strings ("0", "00") which
		// parse cleanly but never match a real user_id.
		if i == 0 && r == '0' && len(s) == 1 {
			return false
		}
	}
	return true
}

// NewMenuHandler creates a new MenuHandler
func NewMenuHandler(menuService *services.MenuService) *MenuHandler {
	return &MenuHandler{menuService: menuService}
}

// kcClaims holds the subset of Keycloak token claims this package consumes.
type kcClaims struct {
	Subject   string `json:"sub"`
	Email     string `json:"email"`
	Username  string `json:"preferred_username"`
	FirstName string `json:"given_name"`
	LastName  string `json:"family_name"`
	PID       string `json:"pid"`
	IDPType   string `json:"idp_type"`
}

// resolveRefUserID extracts the Keycloak token from the Authorization header,
// validates it (or parses mock token in dev), then resolves REF_USER_ID via
// IAMX user_info PID lookup (ThaiD) or APP.USER_INFO email lookup. Returns
// refUserID, parsed claims, userInfo (Oracle row or constructed minimal map),
// and a non-nil error response that the caller MUST return directly when
// present.
func (h *MenuHandler) resolveRefUserID(c *fiber.Ctx) (string, kcClaims, map[string]interface{}, error) {
	var claims kcClaims

	authHeader := c.Get("Authorization")
	if authHeader == "" {
		_ = c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Authorization header is required"})
		return "", claims, nil, errResponseWritten
	}

	var keycloakToken string
	if strings.HasPrefix(authHeader, "Bearer ") {
		keycloakToken = strings.TrimPrefix(authHeader, "Bearer ")
	} else {
		keycloakToken = authHeader
	}
	if keycloakToken == "" {
		_ = c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Bearer token is required in Authorization header"})
		return "", claims, nil, errResponseWritten
	}

	keycloakConfig := config.LoadKeycloakConfig()

	// Keycloak is mandatory. Unsigned/manually-parsed tokens are never accepted â€”
	// every login must be backed by a Keycloak signature verification.
	if !keycloakConfig.Enabled {
		_ = c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error":   "Keycloak authentication is required but not enabled",
			"details": "Set KEYCLOAK_ENABLED=true and configure KEYCLOAK_URL / KEYCLOAK_REALM / KEYCLOAK_CLIENT_ID",
		})
		return "", claims, nil, errResponseWritten
	}

	kcProvider, err := config.GetKeycloakProvider()
	if err != nil {
		_ = c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error":   "Keycloak authentication is not available",
			"details": err.Error(),
		})
		return "", claims, nil, errResponseWritten
	}
	ctx := context.Background()
	idToken, err := kcProvider.VerifyToken(ctx, keycloakToken)
	if err != nil {
		_ = c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Invalid Keycloak token",
			"details": err.Error(),
		})
		return "", claims, nil, errResponseWritten
	}
	if err := idToken.Claims(&claims); err != nil {
		_ = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to extract Keycloak claims",
			"details": err.Error(),
		})
		return "", claims, nil, errResponseWritten
	}

	// Diagnostic: portal /login was 500-ing with no useful log. Print the
	// claim shape so the next time we hit a "refUserID is empty" we can tell
	// which field is missing without re-deploying the binary.
	fmt.Printf("[Bootstrap]resolved claims sub=%q email=%q username=%q pid=%q idp_type=%q\n",
		claims.Subject, claims.Email, claims.Username, claims.PID, claims.IDPType)

	var refUserID string
	var userInfo map[string]interface{}

	if claims.PID != "" {
		pgUser, err := h.getUserFromIAMXByPID(context.Background(), claims.PID)
		if err != nil {
			if err == sql.ErrNoRows {
				_ = c.Status(fiber.StatusNotFound).JSON(fiber.Map{
					"success":    false,
					"error":      "USER_NOT_FOUND",
					"errorCode":  "THAID_USER_NOT_REGISTERED",
					"idpType":    "thaid",
					"pid":        claims.PID,
					"givenName":  claims.FirstName,
					"familyName": claims.LastName,
					"email":      claims.Email,
				})
				return "", claims, nil, errResponseWritten
			}
			_ = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to lookup ThaiD user",
				"details": err.Error(),
			})
			return "", claims, nil, errResponseWritten
		}

		refUserID = pgUser.RefUserID
		// Defensive: a row matched on personal_card_id but the cast user_id::text
		// came back blank â€” treat as an incomplete registration rather than
		// letting the empty refUserID poison every downstream query.
		if refUserID == "" {
			fmt.Printf("[Bootstrap]PID match but ref_user_id is empty (pid=%s, email=%s, user_id=%v)\n",
				claims.PID, pgUser.Email, pgUser.UserID)
			_ = c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success":   false,
				"error":     "USER_INCOMPLETE",
				"errorCode": "REF_USER_ID_MISSING",
				"message":   "à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰à¸™à¸µà¹‰à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸¥à¸‡à¸—à¸°à¹€à¸šà¸µà¸¢à¸™ REF_USER_ID â€” à¹‚à¸›à¸£à¸”à¸•à¸´à¸”à¸•à¹ˆà¸­à¸œà¸¹à¹‰à¸”à¸¹à¹à¸¥à¸£à¸°à¸šà¸š",
				"pid":       claims.PID,
				"email":     pgUser.Email,
			})
			return "", claims, nil, errResponseWritten
		}
		lookupUsername := pgUser.Email
		if lookupUsername == "" {
			lookupUsername = pgUser.UserName
		}

		tokenSub := claims.Subject
		if pgUser.KeycloakID != "" && pgUser.KeycloakID != tokenSub {
			go linkThaiDToExistingKeycloakUser(pgUser.KeycloakID, tokenSub)
		}

		dbUserInfo, dbErr := h.getUserInfo(context.Background(), lookupUsername)
		if dbErr != nil {
			userInfo = map[string]interface{}{
				"REF_USER_ID": refUserID,
				"USER_NAME":   pgUser.UserName,
				"FIRST_NAME":  pgUser.FirstName,
				"LAST_NAME":   pgUser.LastName,
				"EMAIL":       pgUser.Email,
				"FULL_NAME":   pgUser.FirstName + " " + pgUser.LastName,
			}
		} else {
			userInfo = dbUserInfo
		}
	} else {
		lookupUsername := claims.Email
		if lookupUsername == "" {
			lookupUsername = claims.Username
		}

		dbUserInfo, err := h.getUserInfo(context.Background(), lookupUsername)
		if err != nil {
			if err == sql.ErrNoRows {
				_ = c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"success": false,
					"error":   "USER_NOT_REGISTERED",
					"message": "User not registered in the system. Please contact administrator.",
				})
				return "", claims, nil, errResponseWritten
			}
			_ = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to get user info",
				"details": err.Error(),
			})
			return "", claims, nil, errResponseWritten
		}
		userInfo = dbUserInfo

		var ok bool
		refUserID, ok = userInfo["REF_USER_ID"].(string)
		if !ok || refUserID == "" {
			refUserID, ok = userInfo["USER_ID"].(string)
			if !ok || refUserID == "" {
				_ = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "REF_USER_ID and USER_ID not found in user info"})
				return "", claims, nil, errResponseWritten
			}
		}
	}

	return refUserID, claims, userInfo, nil
}

// GetMyBootstrap handles GET /iamx/api/public/me/bootstrap.
// Accepts Keycloak access_token in the Authorization header and returns
// a single payload with userInfo + applications + domains + roles â€”
// the data the portal needs to render the shell on session start.
//
// Renamed from GetUserData (Round 3): the legacy POST /iamx/api/login
// route is gone; this handler is now reached only via /public/me/bootstrap.
func (h *MenuHandler) GetMyBootstrap(c *fiber.Ctx) error {
	fmt.Printf("[Bootstrap] Received request: %s %s\n", c.Method(), c.Path())

	refUserID, keycloakClaims, userInfo, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}

	// Get menu/domains/applications from menu service.
	// Phase 4: dropped the legacy HMAC `token` field â€” Keycloak access_token
	// is the only credential, verified by resource servers via JWKS. Callers
	// that need v_user_effective_data_access should hit /public/me/permissions
	// directly instead of decoding the (now-gone) IAMX JWT.
	menuData, err := h.menuService.GetUserMenu(context.Background(), refUserID)
	if err != nil {
		// stdout-print so the operator can see the actual cause without
		// having to dig into the response body.
		fmt.Printf("[Bootstrap]GetUserMenu failed for refUserID=%q: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get user menu",
			"details": err.Error(),
		})
	}

	// keycloakClaims and userInfo are intentionally unused here now that
	// generateIAMXToken is gone â€” kept in resolveRefUserID's return so
	// other handlers (UpdateMyProfile, GetMyPermissions) can use them
	// without re-resolving.
	_ = keycloakClaims
	_ = userInfo

	fmt.Printf("[Bootstrap]Success for user: %s, Applications: %v\n", refUserID, menuData.Applications)
	fmt.Printf("[Bootstrap]Success for user: %s, Domains: %v\n", refUserID, menuData.Domains)

	resp := fiber.Map{
		"userInfo":     menuData.UserInfo,
		"domains":      menuData.Domains,
		"applications": menuData.Applications,
		"roles":        menuData.Roles,
	}

	// Optional: include data-access permissions when caller asks for them.
	//
	// Default is NOT to call getDataAccess() â€” it runs a heavier UNION query
	// and depends on USER_CUSTOM_DATA_ACCESS.scope_filter, which is missing
	// on some DBs (see migrate_add_scope_filter_to_ucda.sql). Keeping it
	// opt-in protects bootstrap's "must-succeed on session start" role.
	//
	// Graceful degrade: if getDataAccess() errors (e.g. the missing column
	// on a not-yet-migrated env), bootstrap still returns 200 with
	// permissions: null and logs the cause â€” the shell still renders, the
	// caller can fall back to /me/permissions for retry/debug.
	if c.Query("include") == "permissions" {
		if dataAccess, err := h.getDataAccess(context.Background(), refUserID); err != nil {
			fmt.Printf("[Bootstrap] include=permissions: getDataAccess failed for refUserID=%q: %v (returning permissions: null)\n", refUserID, err)
			resp["permissions"] = nil
			resp["permissions_error"] = err.Error()
		} else {
			resp["permissions"] = fiber.Map{"v_user_effective_data_access": dataAccess}
		}
	}

	return c.JSON(resp)
}

// UpdateMyProfileRequest is the request body for PUT /iamx/api/public/me.
// All fields are optional pointers; only non-nil fields are written.
type UpdateMyProfileRequest struct {
	UserName         *string `json:"userName"`
	FirstName        *string `json:"firstName"`
	LastName         *string `json:"lastName"`
	Email            *string `json:"email"`
	Phone            *string `json:"phone"`
	Mobile           *string `json:"mobile"`
	UserAgencyID     *string `json:"userAgencyId"`
	UserMinistryID   *string `json:"userMinistryId"`
	UserDepartmentID *string `json:"userDepartmentId"`
	UserOperationID  *string `json:"userOperationId"`
	UserPositionID   *string `json:"userPositionId"`
}

// UpdateMyProfile handles PUT /iamx/api/public/me.
//
// Renamed from UpdateUserProfile (Round 3): the legacy PUT /iamx/api/user/profile
// route is gone; this handler is now reached only via /public/me.
// Authentication mirrors GetMyBootstrap: Bearer Keycloak token in Authorization header.
// Updates IAMX.user_info directly (source of truth) — APP.USER_INFO is a
// view over it, so no separate write is needed.
func (h *MenuHandler) UpdateMyProfile(c *fiber.Ctx) error {
	fmt.Printf("[ProfileUpdate] Received request: %s %s\n", c.Method(), c.Path())

	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}

	var req UpdateMyProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"details": err.Error(),
		})
	}

	// หน่วยงาน/กระทรวง/กรม/หน่วยปฏิบัติ และชื่อบัญชี ผู้ใช้ห้ามแก้เอง — ข้อมูลในระบบย่อยแบ่งขอบเขตตามหน่วยงาน
	// เดิมเปิดไว้ ผู้ใช้ย้ายตัวเองไปหน่วยงานอื่นแล้วเห็นข้อมูลหน่วยงานนั้น (ตรวจ security 18 ก.ย. 2569)
	// หน่วยงานเปลี่ยนผ่านคำร้องขอสิทธิ์ (UPM) ที่เจ้าหน้าที่อนุมัติ ซึ่งเขียนฐานตรง ไม่ผ่านเส้นนี้
	if req.UserAgencyID != nil || req.UserMinistryID != nil || req.UserDepartmentID != nil || req.UserOperationID != nil || req.UserName != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "agency/ministry/department/operation/userName cannot be changed via self-service profile",
		})
	}

	// Email is the Oracle lookup key + Keycloak token claim. Block changes here;
	// the caller must use a separate flow that also updates Keycloak.
	if req.Email != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "email change not supported via this endpoint",
		})
	}

	updated := []string{}
	if req.UserName != nil {
		updated = append(updated, "userName")
	}
	if req.FirstName != nil {
		updated = append(updated, "firstName")
	}
	if req.LastName != nil {
		updated = append(updated, "lastName")
	}
	if req.Phone != nil {
		updated = append(updated, "phone")
	}
	if req.Mobile != nil {
		updated = append(updated, "mobile")
	}
	if req.UserAgencyID != nil {
		updated = append(updated, "userAgencyId")
	}
	if req.UserMinistryID != nil {
		updated = append(updated, "userMinistryId")
	}
	if req.UserDepartmentID != nil {
		updated = append(updated, "userDepartmentId")
	}
	if req.UserOperationID != nil {
		updated = append(updated, "userOperationId")
	}
	if req.UserPositionID != nil {
		updated = append(updated, "userPositionId")
	}

	if len(updated) == 0 {
		return c.JSON(fiber.Map{
			"success":   true,
			"refUserId": refUserID,
			"updated":   updated,
		})
	}

	ctx := context.Background()

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database connection not available",
		})
	}

	// ช่องที่ผู้ใช้ล้างให้ว่างได้ (ส่ง "" มา) — Oracle มอง "" เป็น NULL ทำให้ NVL(:x, เดิม) เก็บค่าเดิมไว้
	// เสมอ ผู้ใช้จึงลบตำแหน่ง/เบอร์โทรไม่ได้ ใช้ธงแยกบอกว่า "ตั้งใจล้าง"
	clearFlag := func(p *string) int {
		if p != nil && strings.TrimSpace(*p) == "" {
			return 1
		}
		return 0
	}

	result, err := oracleDB.ExecContext(ctx, `
		UPDATE user_info SET
			user_name          = NVL(:1, user_name),
			first_name         = NVL(:2, first_name),
			last_name          = NVL(:3, last_name),
			phone              = CASE WHEN :4 = 1 THEN NULL ELSE NVL(:5, phone) END,
			mobile             = CASE WHEN :6 = 1 THEN NULL ELSE NVL(:7, mobile) END,
			user_agency_id     = NVL(:8, user_agency_id),
			user_ministry_id   = NVL(:9, user_ministry_id),
			user_department_id = NVL(:10, user_department_id),
			user_operation_id  = NVL(:11, user_operation_id),
			user_position_id   = CASE WHEN :12 = 1 THEN NULL ELSE NVL(:13, user_position_id) END,
			updated_date       = SYSTIMESTAMP
		WHERE TO_CHAR(user_id) = :14`,
		// go-ora ผูกค่าตามลำดับที่ตัวแปรโผล่ใน SQL — เรียงอาร์กิวเมนต์ให้ตรงลำดับนั้น
		req.UserName, req.FirstName, req.LastName,
		clearFlag(req.Phone), req.Phone,
		clearFlag(req.Mobile), req.Mobile,
		req.UserAgencyID, req.UserMinistryID, req.UserDepartmentID, req.UserOperationID,
		clearFlag(req.UserPositionID), req.UserPositionID,
		refUserID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update IAMX user_info",
			"details": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":     "User not found in IAMX.user_info",
			"refUserId": refUserID,
		})
	}

	if h.menuService != nil {
		h.menuService.InvalidateUserCache(refUserID)
	}

	fmt.Printf("[ProfileUpdate] Success for refUserId=%s, updated=%v\n", refUserID, updated)

	return c.JSON(fiber.Map{
		"success":   true,
		"refUserId": refUserID,
		"updated":   updated,
	})
}

// getUserInfo queries the database for user profile, org hierarchy, role codes, and derived fields.
func (h *MenuHandler) getUserInfo(ctx context.Context, email string) (map[string]interface{}, error) {
	db := core.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database connection not available")
	}

	query := `SELECT ui.USER_ID, ui.USER_INFO_ID, ui.REF_USER_ID, ui.USER_NAME, ui.FIRST_NAME, ui.LAST_NAME,
		ui.FIRST_NAME || ' ' || ui.LAST_NAME AS FULL_NAME, ui.PHONE, ui.MOBILE,
		ui.EMAIL, ma.AGC_ID as AGENCY_ID, ma.AGC_CODE AS AGENCY_CODE, ma.AGC_TYPE
		AS AGENCY_TYPE, ma.AGC_TYPE, ma.AGC_NAME as AGENCY_NAME, ma.AGC_SHORTNAME,
		CASE WHEN ma3.AGC_ID IS NOT NULL THEN ma3.AGC_ID ELSE ma2.AGC_ID END AS MINISTRY_ID,
		CASE WHEN ma3.AGC_CODE IS NOT NULL THEN ma3.AGC_CODE ELSE ma2.AGC_CODE END AS MINISTRY_CODE,
		CASE WHEN ma3.AGC_NAME IS NOT NULL THEN ma3.AGC_NAME ELSE ma2.AGC_NAME END AS MINISTRY_NAME,
		NVL(ma.AGC_SP_FLAG, 'N'), rp.PROVINCE_NAME, rd.DISTRICT_NAME, rs.SUBDISTRICT_NAME,
		CASE WHEN ma2.AGC_NAME = 'à¸­à¸‡à¸„à¹Œà¸à¸£à¸›à¸à¸„à¸£à¸­à¸‡à¸ªà¹ˆà¸§à¸™à¸—à¹‰à¸­à¸‡à¸–à¸´à¹ˆà¸™' THEN 'Y' ELSE 'N' END AS AGC_LGO_FLAG,
		CASE WHEN ma.DATA_LEVEL_TYPE = 'MIN' AND ma.AGC_CODE NOT IN ('50000','70000','75000') THEN 'Y' ELSE 'N' END AS AGC_CENTER_FLAG,
		ui.USER_DEPARTMENT_ID, ui.USER_OPERATION_ID, ma4.AGC_ID AS SUBAGENCY_ID, ma4.AGC_CODE AS SUBAGENCY_CODE, ma4.AGC_NAME AS SUBAGENCY_NAME,
		CASE WHEN md.DEPARTMENT_NAME IS NOT NULL THEN md.DEPARTMENT_NAME ELSE '' END AS DEPARTMENT_NAME, ui.MOBILE AS TEL,
		mp.POSITION_NAME,
		CASE WHEN ui.USER_OPERATION_ID IS NOT NULL THEN 'SUBAGENCY' WHEN ui.USER_AGENCY_ID IS NOT NULL THEN 'AGENCY' WHEN ui.USER_MINISTRY_ID IS NOT NULL THEN 'MINISTRY' ELSE NULL END AS USER_LEVEL
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
		WHERE ui.EMAIL = :1
		-- 17 ก.ย. 2569: QueryRow + WHERE EMAIL เฉย ๆ = ได้แถวไหนก็ได้เมื่ออีเมลซ้ำ
		-- (ของเก่า 24/05 inactive + ของจริง 25/05 active) แล้วมันหยิบแถว inactive ที่
		-- ไม่มีหน่วยงาน ⇒ ผู้ใช้ล็อกอินได้แต่จอโครงการว่างเปล่า
		-- เลือกแถว active ก่อนเสมอ และถ้าสถานะเท่ากันเอาแถวใหม่สุด — ไม่ตัดผู้ใช้ inactive
		-- ทิ้ง (48 แถวบน PROD) เพียงแต่ทำให้การเลือกแน่นอน ไม่ขึ้นกับลำดับที่ Oracle คืนมา
		ORDER BY CASE WHEN ui.STATUS = 'active' THEN 0 ELSE 1 END, ui.CREATED_DATE DESC
		FETCH FIRST 1 ROWS ONLY`

	var userID, userInfoID, refUserID, userName, firstName, lastName, fullName sql.NullString
	var phone, mobile, userEmail, agencyID, agencyCode, agencyType, agencyName, agcShortName sql.NullString
	var ministryID, ministryCode, ministryName, agencySPFlag sql.NullString
	var provinceName, districtName, subdistrictName, agcLGOFlag, agcCenterFlag sql.NullString
	var userDepartmentID, userOperationID, subagencyID, subagencyCode, subagencyName, departmentName, tel sql.NullString
	var positionName, userLevel sql.NullString

	err := db.QueryRowContext(ctx, query, email).Scan(
		&userID, &userInfoID, &refUserID, &userName, &firstName, &lastName,
		&fullName, &phone, &mobile, &userEmail, &agencyID, &agencyCode, &agencyType, &agencyType, &agencyName, &agcShortName,
		&ministryID, &ministryCode, &ministryName, &agencySPFlag, &provinceName, &districtName, &subdistrictName,
		&agcLGOFlag, &agcCenterFlag, &userDepartmentID, &userOperationID, &subagencyID, &subagencyCode, &subagencyName, &departmentName, &tel,
		&positionName, &userLevel,
	)
	if err != nil {
		return nil, err
	}

	// Query ROLE_CODES
	var roleCodes []string
	if userID.Valid && userID.String != "" {
		roleRows, roleErr := db.QueryContext(ctx,
			`SELECT DISTINCT r.CODE FROM IAMX.USER_ROLE_MAPPING urm
			 JOIN IAMX.ROLE r ON r.ID = urm.ROLE_ID AND r.IS_ACTIVE = 1
			 WHERE urm.USER_ID = :1 AND urm.IS_ACTIVE = 1
			 AND TRUNC(SYSDATE) BETWEEN urm.EFFECTIVE_DATE AND NVL(urm.EXPIRE_DATE, TRUNC(SYSDATE))
			 ORDER BY r.CODE`, userID.String)
		if roleErr == nil {
			defer roleRows.Close()
			for roleRows.Next() {
				var code string
				if roleRows.Scan(&code) == nil {
					roleCodes = append(roleCodes, code)
				}
			}
		}
	}
	if roleCodes == nil {
		roleCodes = []string{}
	}

	userInfo := map[string]interface{}{
		"USER_ID":            nullableString(userID),
		"USER_INFO_ID":       nullableString(userInfoID),
		"REF_USER_ID":        nullableString(refUserID),
		"USER_NAME":          nullableString(userName),
		"FIRST_NAME":         nullableString(firstName),
		"LAST_NAME":          nullableString(lastName),
		"FULL_NAME":          nullableString(fullName),
		"PHONE":              nullableString(phone),
		"MOBILE":             nullableString(mobile),
		"EMAIL":              nullableString(userEmail),
		"AGENCY_ID":          nullableString(agencyID),
		"AGENCY_CODE":        nullableString(agencyCode),
		"AGENCY_TYPE":        nullableString(agencyType),
		"AGENCY_NAME":        nullableString(agencyName),
		"AGC_SHORTNAME":      nullableString(agcShortName),
		"MINISTRY_ID":        nullableString(ministryID),
		"MINISTRY_CODE":      nullableString(ministryCode),
		"MINISTRY_NAME":      nullableString(ministryName),
		"AGC_SP_FLAG":        nullableString(agencySPFlag),
		"PROVINCE_NAME":      nullableString(provinceName),
		"DISTRICT_NAME":      nullableString(districtName),
		"SUBDISTRICT_NAME":   nullableString(subdistrictName),
		"AGC_LGO_FLAG":       nullableString(agcLGOFlag),
		"AGC_CENTER_FLAG":    nullableString(agcCenterFlag),
		"USER_DEPARTMENT_ID": nullableString(userDepartmentID),
		"USER_OPERATION_ID":  nullableString(userOperationID),
		"SUBAGENCY_ID":       nullableString(subagencyID),
		"SUBAGENCY_CODE":     nullableString(subagencyCode),
		"SUBAGENCY_NAME":     nullableString(subagencyName),
		"DEPARTMENT_NAME":    nullableString(departmentName),
		"TEL":                nullableString(tel),
		"POSITION_NAME":      nullableString(positionName),
		"USER_LEVEL":         nullableString(userLevel),
		"ROLE_CODES":         roleCodes,
	}

	return userInfo, nil
}

// getDataAccess queries IAMX Oracle tables for effective data access (custom + responsibility paths).
func (h *MenuHandler) getDataAccess(ctx context.Context, refUserID string) ([]models.DataAccessClaim, error) {
	db := core.GetDB()
	if db == nil {
		return nil, fmt.Errorf("Oracle database connection not available")
	}

	query := `
		SELECT ucda.agency_path,
		       NVL(ucdap.permission, '[]'),
		       ucda.scope_filter, 'CUSTOM' AS permission_source, 1 AS priority
		FROM IAMX.USER_INFO ui
		JOIN IAMX.USER_CUSTOM_DATA_ACCESS ucda ON ucda.user_id = ui.user_id AND ucda.is_active = 1
		JOIN IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION ucdap ON ucdap.user_custom_data_access_id = ucda.id
		WHERE ui.user_id = :1
		  AND TRUNC(SYSDATE) >= ucda.effective_date
		  AND TRUNC(SYSDATE) <= NVL(ucda.expire_date, TRUNC(SYSDATE))
		UNION ALL
		SELECT rda.agency_path,
		       NVL(rdap.permission, '[]'),
		       rda.scope_filter, 'RESPONSIBILITY' AS permission_source, 2 AS priority
		FROM IAMX.USER_INFO ui
		JOIN IAMX.USER_RESPONSIBILITY_MAPPING urm ON urm.user_id = ui.user_id AND urm.is_active = 1
		JOIN IAMX.RESPONSIBILITY resp ON resp.id = urm.responsibility_id AND resp.is_active = 1
		JOIN IAMX.RESPONSIBILITY_DATA_ACCESS rda ON rda.responsibility_id = resp.id AND rda.is_active = 1
		JOIN IAMX.RESPONSIBILITY_DATA_ACCESS_PERMISSION rdap ON rdap.responsibility_data_access_id = rda.id
		WHERE ui.user_id = :2
		  AND TRUNC(SYSDATE) >= urm.effective_date
		  AND TRUNC(SYSDATE) <= NVL(urm.expire_date, TRUNC(SYSDATE))
		ORDER BY priority ASC, agency_path
	`

	rows, err := db.QueryContext(ctx, query, refUserID, refUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dataAccess []models.DataAccessClaim
	for rows.Next() {
		var agencyID sql.NullString
		var permJSON string
		var scopeFilter, permissionSource sql.NullString
		var priority int

		if err := rows.Scan(&agencyID, &permJSON, &scopeFilter, &permissionSource, &priority); err != nil {
			continue
		}

		var da models.DataAccessClaim
		da.AgencyPath = nullableString(agencyID)
		da.Permission = parsePermissionJSON(permJSON)
		da.PermissionSource = nullableString(permissionSource)
		if scopeFilter.Valid {
			da.ScopeFilter = &scopeFilter.String
		}

		dataAccess = append(dataAccess, da)
	}

	return dataAccess, nil
}

// generateIAMXToken was removed in Phase 4 â€” the legacy HMAC iamxToken is
// no longer issued. Resource servers now verify Keycloak access_tokens via
// JWKS (see middleware/keycloak_oidc.go). Callers that needed
// v_user_effective_data_access should hit GET /iamx/api/public/me/permissions.

// GetMyProfile handles GET /iamx/api/public/me.
// Validates the Keycloak access_token and returns userInfo only â€” no menu,
// no domains, no roles. Use /public/me/bootstrap when you need everything.
//
// Renamed from GetToken (Round 3): the name was a misnomer â€” this handler
// has never returned a token. The legacy POST /iamx/api/token route is gone.
func (h *MenuHandler) GetMyProfile(c *fiber.Ctx) error {
	fmt.Printf("[Profile] Received request: %s %s\n", c.Method(), c.Path())

	_, _, userInfo, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}

	return c.JSON(fiber.Map{
		"userInfo": userInfo,
	})
}

// getUserFromIAMXByPID looks up a user in IAMX.user_info (Oracle) by personal_card_id (ThaiD)
func (h *MenuHandler) getUserFromIAMXByPID(ctx context.Context, pid string) (*iamxUserInfo, error) {
	oracleDB := core.GetDB()
	if oracleDB == nil {
		return nil, fmt.Errorf("Oracle database connection not available")
	}

	query := `
		SELECT user_id, TO_CHAR(user_id) AS ref_user_id, user_name, first_name, last_name, email, status,
		       keycloak_id
		FROM user_info
		WHERE personal_card_id = :1 AND status = 'active' AND ROWNUM = 1
	`

	var user iamxUserInfo
	var keycloakID sql.NullString
	err := oracleDB.QueryRowContext(ctx, query, pid).Scan(
		&user.UserID, &user.RefUserID, &user.UserName,
		&user.FirstName, &user.LastName, &user.Email, &user.Status,
		&keycloakID,
	)
	if keycloakID.Valid {
		user.KeycloakID = keycloakID.String
	}
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// iamxUserInfo represents minimal user info from IAMX.user_info (Oracle)
type iamxUserInfo struct {
	UserID     string `json:"userId"`
	RefUserID  string `json:"refUserId"`
	UserName   string `json:"userName"`
	FirstName  string `json:"firstName"`
	LastName   string `json:"lastName"`
	Email      string `json:"email"`
	Status     string `json:"status"`
	KeycloakID string `json:"keycloakId"`
}

// linkThaiDToExistingKeycloakUser links ThaiD federated identity to the real Keycloak account
// and deletes the auto-created orphan account. Runs async â€” user is already logged in.
func linkThaiDToExistingKeycloakUser(realKeycloakID, thaidCreatedID string) {
	kcAdmin := config.NewKeycloakAdminClient()

	identity, err := kcAdmin.GetFederatedIdentity(thaidCreatedID, "thaid")
	if err != nil {
		fmt.Printf("[ThaiD Link] Failed to get federated identity from %s: %v\n", thaidCreatedID, err)
		return
	}

	if err := kcAdmin.AddFederatedIdentity(realKeycloakID, "thaid", identity); err != nil {
		fmt.Printf("[ThaiD Link] Failed to link ThaiD to %s: %v\n", realKeycloakID, err)
		return
	}

	if err := kcAdmin.DeleteUser(thaidCreatedID); err != nil {
		fmt.Printf("[ThaiD Link] Failed to delete orphan account %s: %v\n", thaidCreatedID, err)
		return
	}

	fmt.Printf("[ThaiD Link] Linked ThaiD to %s, deleted orphan %s\n", realKeycloakID, thaidCreatedID)
}
