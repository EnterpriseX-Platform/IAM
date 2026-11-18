package handlers

import (
	"api/core"
	"api/core/config"
	"api/core/models"
	"api/core/usertypes"
	"api/core/utils"
	"bytes"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"

	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Helper function to convert sql.NullString to *string
func nullStringToPtr(ns sql.NullString) *string {
	if ns.Valid {
		return &ns.String
	}
	return nil
}

// emptyToNil converts an empty string to nil so Oracle binds it as SQL NULL
// instead of an empty NVARCHAR2, avoiding ORA-12704 on NULLIF(:x, ”) comparisons.
func emptyToNil(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// generateTempPassword สุ่มรหัสชั่วคราว 16 ตัว มีครบ พิมพ์ใหญ่/เล็ก/ตัวเลข/อักขระพิเศษ
// (19/10/69 Keycloak realm มี password policy แล้ว — สุ่มแบบเดิมอาจขาดบางชนิดจนสร้างผู้ใช้ไม่ผ่าน)
func generateTempPassword() string {
	sets := []string{"ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%&*?"}
	all := strings.Join(sets, "")
	pick := func(chars string) byte {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return chars[0]
		}
		return chars[n.Int64()]
	}
	const length = 16
	pw := make([]byte, 0, length)
	for _, set := range sets {
		pw = append(pw, pick(set))
	}
	for len(pw) < length {
		pw = append(pw, pick(all))
	}
	for i := len(pw) - 1; i > 0; i-- {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err == nil {
			j := int(n.Int64())
			pw[i], pw[j] = pw[j], pw[i]
		}
	}
	return string(pw)
}

func sendRegistrationEmail(email, firstName, lastName, username, password, website string) {
	notifyURL := os.Getenv("NOTIFY_SERVICE_URL")
	if notifyURL == "" {
		notifyURL = "https://iam.example.com"
	}

	payload, err := json.Marshal(map[string]interface{}{
		"templateCode": "REGISTER_01",
		"params": map[string]string{
			"emailList": email,
			"firstName": firstName,
			"lastName":  lastName,
			"username":  username,
			"password":  password,
			"website":   website,
		},
	})
	if err != nil {
		log.Printf("sendRegistrationEmail marshal error: %v", err)
		return
	}

	resp, err := http.Post(
		notifyURL+"/notifyservice/api/email-templates/send",
		"application/json",
		bytes.NewReader(payload),
	)
	if err != nil {
		log.Printf("sendRegistrationEmail request error: %v", err)
		return
	}
	defer resp.Body.Close()
	log.Printf("sendRegistrationEmail: status %d for %s", resp.StatusCode, email)
}

// HealthCheck reports server + database state.
//
// Wired to BOTH /iamx/api/health (legacy) and /iamx/api/system/health (new).
// Used by Kubernetes liveness/readiness probes and the deploy-time smoke test.
//
// @Summary      Health probe
// @Description  Returns ok + database state. Used by K8s liveness probes.
// @Tags         System
// @Produce      json
// @Success      200  {object}  models.HealthResponse
// @Router       /system/health [get]
// @Router       /health [get]
func HealthCheck(c *fiber.Ctx) error {
	dbStatus := "connected"
	db := core.GetDB()

	if err := db.Ping(); err != nil {
		dbStatus = "disconnected"
	}

	return c.JSON(models.HealthResponse{
		Status:   "ok",
		Database: dbStatus,
		Time:     time.Now().Format(time.RFC3339),
	})
}

func GetUsers(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	query := `
		SELECT ui.user_id, ui.first_name, ui.last_name, ui.email, ui.user_name, ui.status,
		       ui.personal_card_id, ui.agency_code, ui.agency_type, ui.user_type,
		       ui.user_ministry_id, ui.user_agency_id, ui.user_department_id, ui.user_operation_id,
		       mn.AGC_NAME, ag.AGC_NAME, md.DEPARTMENT_NAME, op.AGC_NAME,
		       ui.send_flag, ui.created_date, ui.updated_date
		FROM user_info ui
		LEFT JOIN APP.M_AGC mn ON mn.AGC_ID = ui.user_ministry_id
		LEFT JOIN APP.M_AGC ag ON ag.AGC_ID = ui.user_agency_id
		LEFT JOIN APP.M_DEPARTMENT md ON md.DEPARTMENT_ID = ui.user_department_id
		LEFT JOIN APP.M_AGC op ON op.AGC_ID = ui.user_operation_id
		WHERE (ui.status = 'active' OR :1 = 'Y')
	`
	// 20/10/69: หน้าผู้ใช้ IAM-X ต้องเห็นคนที่ปิดใช้งานด้วย (เปิดกลับ/ลบได้) · ผู้เรียกอื่นได้เฉพาะ active ตามเดิม
	includeInactive := "N"
	if c.Query("include_inactive") == "1" {
		includeInactive = "Y"
	}
	// 14/11/69: รายการปิดเลขบัตร → ค้นด้วยเลขบัตรต้องค้นที่ server (?card=ตัวเลขอย่างน้อย 4 หลัก)
	args := []interface{}{includeInactive}
	if card := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, c.Query("card")); len(card) >= 4 {
		args = append(args, card)
		query += ` AND ui.personal_card_id LIKE '%' || :2 || '%'`
	}
	query += ` ORDER BY ui.first_name, ui.last_name`
	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("GetUsers error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch users",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	type UserInfo struct {
		UserID         string         `json:"user_id"`
		FirstName      sql.NullString `json:"-"`
		LastName       sql.NullString `json:"-"`
		Email          sql.NullString `json:"-"`
		UserName       sql.NullString `json:"-"`
		Status         sql.NullString `json:"-"`
		PersonalCardID sql.NullString `json:"-"`
		AgencyCode     sql.NullString `json:"-"`
		AgencyType     sql.NullString `json:"-"`
		UserType       sql.NullString `json:"-"`
		MinistryID     sql.NullString `json:"-"`
		AgencyID       sql.NullString `json:"-"`
		DepartmentID   sql.NullString `json:"-"`
		OperationID    sql.NullString `json:"-"`
		MinistryName   sql.NullString `json:"-"`
		AgencyName     sql.NullString `json:"-"`
		DepartmentName sql.NullString `json:"-"`
		OperationName  sql.NullString `json:"-"`
		SendFlag       sql.NullString `json:"-"`
	}

	type UserResponse struct {
		UserID         string  `json:"user_id"`
		FirstName      *string `json:"first_name"`
		LastName       *string `json:"last_name"`
		Email          *string `json:"email"`
		UserName       *string `json:"user_name"`
		Status         *string `json:"status"`
		PersonalCardID *string `json:"personal_card_id"`
		AgencyCode     *string `json:"agency_code"`
		AgencyType     *string `json:"agency_type"`
		UserType       *string `json:"user_type"`
		MinistryID     *string `json:"user_ministry_id"`
		AgencyID       *string `json:"user_agency_id"`
		DepartmentID   *string `json:"user_department_id"`
		OperationID    *string `json:"user_operation_id"`
		MinistryName   *string `json:"user_ministry_name"`
		AgencyName     *string `json:"user_agency_name"`
		DepartmentName *string `json:"user_department_name"`
		OperationName  *string `json:"user_operation_name"`
		SendFlag       *string `json:"send_flag"`
	}

	users := []UserResponse{}
	for rows.Next() {
		var u UserInfo
		if err := rows.Scan(&u.UserID, &u.FirstName, &u.LastName, &u.Email,
			&u.UserName, &u.Status, &u.PersonalCardID, &u.AgencyCode, &u.AgencyType, &u.UserType,
			&u.MinistryID, &u.AgencyID, &u.DepartmentID, &u.OperationID,
			&u.MinistryName, &u.AgencyName, &u.DepartmentName, &u.OperationName,
			&u.SendFlag, new(interface{}), new(interface{})); err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
		users = append(users, UserResponse{
			UserID:         u.UserID,
			FirstName:      nullStringToPtr(u.FirstName),
			LastName:       nullStringToPtr(u.LastName),
			Email:          nullStringToPtr(u.Email),
			UserName:       nullStringToPtr(u.UserName),
			Status:         nullStringToPtr(u.Status),
			PersonalCardID: maskCardID(u.PersonalCardID), // 14/11/69 PDPA: รายการแสดงแค่ 4 ตัวท้าย
			AgencyCode:     nullStringToPtr(u.AgencyCode),
			AgencyType:     nullStringToPtr(u.AgencyType),
			UserType:       nullStringToPtr(u.UserType),
			MinistryID:     nullStringToPtr(u.MinistryID),
			AgencyID:       nullStringToPtr(u.AgencyID),
			DepartmentID:   nullStringToPtr(u.DepartmentID),
			OperationID:    nullStringToPtr(u.OperationID),
			MinistryName:   nullStringToPtr(u.MinistryName),
			AgencyName:     nullStringToPtr(u.AgencyName),
			DepartmentName: nullStringToPtr(u.DepartmentName),
			OperationName:  nullStringToPtr(u.OperationName),
			SendFlag:       nullStringToPtr(u.SendFlag),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    users,
	})
}

func GetUser(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	query := `
		SELECT ui.user_id, ui.first_name, ui.last_name, ui.email, ui.user_name, ui.status,
		       ui.personal_card_id, ui.agency_code, ui.agency_type, ui.user_type,
		       ui.user_ministry_id, ui.user_agency_id, ui.user_department_id, ui.user_operation_id,
		       mn.AGC_NAME, ag.AGC_NAME, md.DEPARTMENT_NAME, op.AGC_NAME,
		       ui.send_flag, ui.created_date, ui.updated_date
		FROM user_info ui
		LEFT JOIN APP.M_AGC mn ON mn.AGC_ID = ui.user_ministry_id
		LEFT JOIN APP.M_AGC ag ON ag.AGC_ID = ui.user_agency_id
		LEFT JOIN APP.M_DEPARTMENT md ON md.DEPARTMENT_ID = ui.user_department_id
		LEFT JOIN APP.M_AGC op ON op.AGC_ID = ui.user_operation_id
		WHERE ui.user_id = :1
	`
	type UserInfo struct {
		UserID         string         `json:"user_id"`
		FirstName      sql.NullString `json:"-"`
		LastName       sql.NullString `json:"-"`
		Email          sql.NullString `json:"-"`
		UserName       sql.NullString `json:"-"`
		Status         sql.NullString `json:"-"`
		PersonalCardID sql.NullString `json:"-"`
		AgencyCode     sql.NullString `json:"-"`
		AgencyType     sql.NullString `json:"-"`
		UserType       sql.NullString `json:"-"`
		MinistryID     sql.NullString `json:"-"`
		AgencyID       sql.NullString `json:"-"`
		DepartmentID   sql.NullString `json:"-"`
		OperationID    sql.NullString `json:"-"`
		MinistryName   sql.NullString `json:"-"`
		AgencyName     sql.NullString `json:"-"`
		DepartmentName sql.NullString `json:"-"`
		OperationName  sql.NullString `json:"-"`
		SendFlag       sql.NullString `json:"-"`
	}
	var u UserInfo
	err := db.QueryRow(query, id).Scan(&u.UserID, &u.FirstName, &u.LastName, &u.Email,
		&u.UserName, &u.Status, &u.PersonalCardID, &u.AgencyCode, &u.AgencyType, &u.UserType,
		&u.MinistryID, &u.AgencyID, &u.DepartmentID, &u.OperationID,
		&u.MinistryName, &u.AgencyName, &u.DepartmentName, &u.OperationName,
		&u.SendFlag, new(interface{}), new(interface{}))

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"error":   "User not found",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to fetch user",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": map[string]interface{}{
			"user_id":              u.UserID,
			"first_name":           nullStringToPtr(u.FirstName),
			"last_name":            nullStringToPtr(u.LastName),
			"email":                nullStringToPtr(u.Email),
			"user_name":            nullStringToPtr(u.UserName),
			"status":               nullStringToPtr(u.Status),
			"personal_card_id":     nullStringToPtr(u.PersonalCardID),
			"agency_code":          nullStringToPtr(u.AgencyCode),
			"agency_type":          nullStringToPtr(u.AgencyType),
			"user_type":            nullStringToPtr(u.UserType),
			"user_ministry_id":     nullStringToPtr(u.MinistryID),
			"user_agency_id":       nullStringToPtr(u.AgencyID),
			"user_department_id":   nullStringToPtr(u.DepartmentID),
			"user_operation_id":    nullStringToPtr(u.OperationID),
			"user_ministry_name":   nullStringToPtr(u.MinistryName),
			"user_agency_name":     nullStringToPtr(u.AgencyName),
			"user_department_name": nullStringToPtr(u.DepartmentName),
			"user_operation_name":  nullStringToPtr(u.OperationName),
			"send_flag":            nullStringToPtr(u.SendFlag),
		},
	})
}

func CreateUser(c *fiber.Ctx) error {
	// 28/10/69 (security): สร้าง/แก้/ลบผู้ใช้ได้เฉพาะผู้ดูแล IAM-X Console (role=admin) — token Keycloak ทั่วไปได้ 403
	if _, err := requireConsoleAdmin(c); err != nil {
		return err
	}
	var req struct {
		FirstName        string `json:"first_name"`
		LastName         string `json:"last_name"`
		FirstNameEng     string `json:"first_name_eng"`
		LastNameEng      string `json:"last_name_eng"`
		Email            string `json:"email"`
		UserName         string `json:"user_name"`
		Status           string `json:"status"`
		Password         string `json:"password"`
		PersonalCardID   string `json:"personal_card_id"`
		UserMinistryID   string `json:"user_ministry_id"`
		UserAgencyID     string `json:"user_agency_id"`
		UserDepartmentID string `json:"user_department_id"`
		UserOperationID  string `json:"user_operation_id"`
		UserType         string `json:"user_type"`
		SendFlag         string `json:"send_flag"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body",
		})
	}
	if !validUserType(req.UserType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "user_type must be internal or agency",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Oracle database not connected",
		})
	}

	// Check for duplicate personal_card_id (ข้ามเมื่อไม่ได้กรอก — ERP-13329 เลขบัตรไม่บังคับแล้ว)
	if req.PersonalCardID != "" {
		var existingID string
		dupErr := db.QueryRow(
			`SELECT user_id FROM user_info WHERE personal_card_id = :1 AND ROWNUM = 1`,
			req.PersonalCardID,
		).Scan(&existingID)
		if dupErr != sql.ErrNoRows {
			if dupErr == nil {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{
					"success": false,
					"error":   "Personal card ID already exists",
				})
			}
			log.Printf("CreateUser duplicate check error: %v", dupErr)
		}
	}

	// (ฝั่ง Keycloak อีเมลต้องไม่ซ้ำ ถ้าปล่อยผ่านจะได้บัญชีที่ล็อกอินด้วยรหัสที่ส่งไปไม่ได้)
	if req.Email != "" {
		var dupEmailID string
		dupErr := db.QueryRow(
			`SELECT user_id FROM user_info WHERE LOWER(TRIM(email)) = LOWER(TRIM(:1)) AND ROWNUM = 1`,
			req.Email,
		).Scan(&dupEmailID)
		if dupErr == nil {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"success": false,
				"error":   "อีเมลนี้มีผู้ใช้งานในระบบแล้ว",
			})
		} else if dupErr != sql.ErrNoRows {
			log.Printf("CreateUser duplicate email check error: %v", dupErr)
		}
	}

	// Derive user_name from email local part (before @)
	userName := req.Email
	if idx := strings.Index(req.Email, "@"); idx > 0 {
		userName = req.Email[:idx]
	}

	adminPassword := req.Password
	if adminPassword != "" {
		if req.Email == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "กรุณากรอกอีเมลก่อนกำหนดรหัสผ่าน"})
		}
		if msg := consolePasswordError(adminPassword, userName); msg != "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": msg})
		}
		if strings.Contains(strings.ToLower(adminPassword), strings.ToLower(req.Email)) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "รหัสผ่านห้ามมีชื่อผู้ใช้หรืออีเมล"})
		}
	}

	// Check M_EMPLOYEE to determine user_type and resolve employee/prefix fields
	emp := lookupEmployee(db, req.PersonalCardID)
	// 16/11/69: ประเภทจากค่าตั้ง IAMX.USER_TYPE
	userType := usertypes.ExternalCode()
	if emp.EmpID.Valid {
		userType = usertypes.StaffCode()
	}
	// ไม่ส่ง (client เก่า/นำเข้า) ยังเดาจาก M_EMPLOYEE เหมือนเดิม
	if req.UserType != "" {
		userType = req.UserType
	}
	prefixID := nullStr(emp.PrefixID)

	// USER_DEPARTMENT_ID prefers the request value (admin-entered); falls back to M_EMPLOYEE
	deptID := req.UserDepartmentID
	if deptID == "" {
		deptID = emp.DepartmentID.String
	}

	userID := utils.NewCUID()
	// ref_user_id = user_id เสมอ — mapper ของ Keycloak หยิบคอลัมน์นี้ไปเป็น claim
	// USERINFO.REF_USER_ID ซึ่งปลายทาง (เช่น DTS) ใช้เป็นคีย์ผูกข้อมูลของผู้ใช้
	// เดิมไม่ได้ใส่ ทำให้ผู้ใช้ที่สร้างใหม่มี REF_USER_ID = NULL แล้วปลายทางมองไม่เห็น
	// ส่ง userID สองครั้งเป็นคนละ bind (:1, :2) แทนการใช้ :1 ซ้ำ — driver ผูกค่าตาม
	// ลำดับ ถ้าใช้ placeholder ซ้ำจำนวน bind กับ arg จะไม่ตรงกัน
	_, err := db.Exec(`
		INSERT INTO user_info (user_id, ref_user_id, first_name, last_name, first_name_eng, last_name_eng, email, user_name, status, personal_card_id,
		                      user_ministry_id, user_agency_id, user_department_id, user_operation_id,
		                      user_type, employee_id, user_position_id, prefix, send_flag, created_date)
		VALUES (:1, :2, :3, :4, :5, :6, :7, :8, COALESCE(:9, 'active'), :10, NULLIF(:11, ''), NULLIF(:12, ''), NULLIF(:13, ''), NULLIF(:14, ''), :15, :16, :17, :18, NULLIF(:19, ''), SYSTIMESTAMP)`,
		userID, userID,
		req.FirstName, req.LastName, req.FirstNameEng, req.LastNameEng, req.Email, userName, req.Status, emptyToNil(req.PersonalCardID),
		req.UserMinistryID, req.UserAgencyID, deptID, req.UserOperationID,
		userType, nullStr(emp.EmpCode), nullStr(emp.PositionID), prefixID, req.SendFlag,
	)

	if err != nil {
		log.Printf("CreateUser error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to create user",
			"message": err.Error(),
		})
	}

	// เว้นว่าง = สร้างบัญชีไม่มีรหัส แล้วให้ Keycloak ส่งลิงก์ UPDATE_PASSWORD (execute-actions-email) ไปที่อีเมลผู้ใช้
	// (แทนการสุ่มรหัสชั่วคราวแล้วส่งรหัสทางอีเมลแบบ 28/10)
	passwordMode := "link"
	if adminPassword != "" {
		passwordMode = "admin"
	}

	// Sync user to Keycloak if enabled
	var keycloakUserID string
	var keycloakErr error

	keycloakConfig := config.LoadKeycloakConfig()
	var kcAdmin *config.KeycloakAdminClient
	if keycloakConfig.Enabled {
		kcAdmin = config.NewKeycloakAdminClient()

		keycloakUserID, keycloakErr = kcAdmin.CreateUser(
			req.Email,
			req.FirstName,
			req.LastName,
			req.Email, // username = email so portal login works with email
			adminPassword,
			true, // temporary — Keycloak บังคับ UPDATE_PASSWORD ตอนเข้าครั้งแรก
		)
		// ถ้าบัญชีนั้นไม่ได้เป็นของผู้ใช้ที่ใช้งานอยู่รายอื่น ให้ผูกกับผู้ใช้ใหม่นี้ (ตั้งรหัสตามที่กรอก หรือส่งลิงก์)
		if errors.Is(keycloakErr, config.ErrKeycloakUserExists) {
			keycloakUserID, keycloakErr = adoptExistingKeycloakUser(db, kcAdmin, userID, req.Email, adminPassword)
		}
		if keycloakErr != nil {
			// ตั้งบัญชีเข้าสู่ระบบไม่ได้ = ยกเลิกแถวที่เพิ่งเพิ่ม (ยังไม่ได้ผูกบทบาท/ออกใบรับรอง) เพื่อให้ผู้ดูแลแก้แล้วสร้างใหม่ได้
			log.Printf("CreateUser Keycloak sync FAILED for %s: %v", req.Email, keycloakErr)
			if _, delErr := db.Exec(`DELETE FROM user_info WHERE user_id = :1`, userID); delErr != nil {
				log.Printf("CreateUser: rollback user_info %s failed: %v", userID, delErr)
			}
			if errors.Is(keycloakErr, config.ErrKeycloakPasswordPolicy) {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"success": false,
					"error":   "รหัสผ่านไม่ผ่านนโยบายรหัสผ่านของระบบ (อย่างน้อย 10 ตัว ภาษาอังกฤษ ตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข อักขระพิเศษ ไม่มีชื่อผู้ใช้/อีเมล)",
				})
			}
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
				"success":        false,
				"error":          "สร้างผู้ใช้ไม่สำเร็จ: ตั้งค่าบัญชีเข้าสู่ระบบไม่ได้ กรุณาติดต่อผู้ดูแลระบบ",
				"keycloak_error": keycloakErr.Error(),
			})
		} else {
			log.Printf("CreateUser: synced user to Keycloak, ID: %s", keycloakUserID)
			// Best-effort: store keycloak_id in IAMX user_info (column may not exist)
			if keycloakUserID != "" {
				if _, storeErr := db.Exec(
					`UPDATE user_info SET keycloak_id = :1 WHERE user_id = :2`,
					keycloakUserID, userID,
				); storeErr != nil {
					log.Printf("CreateUser: failed to store keycloak_id (column may not exist): %v", storeErr)
				}
			}
		}
	}

	// Auto-assign default role for all registration types
	assignDefaultRole(db, userID)

	// ออกใบรับรองอิเล็กทรอนิกส์ (DTS) ให้ตั้งแต่ตอนสร้างบัญชี — ไม่ต้องรอแอดมินมาออกให้
	// ทำแบบ non-blocking + ไม่คืน error เพราะห้ามให้การสร้างผู้ใช้ล้มเพราะเรื่องนี้
	go IssueDTSCertificate(userID, req.Email, strings.TrimSpace(req.FirstName+" "+req.LastName))

	linkSent := false
	linkErr := ""
	if passwordMode == "link" && kcAdmin != nil && keycloakUserID != "" && req.Email != "" {
		website := os.Getenv("APP_BASE_URL")
		if website == "" {
			website = c.Protocol() + "://" + c.Hostname() + "/app"
		}
		linkSent, linkErr = sendSetPasswordLink(kcAdmin, keycloakUserID, website)
	}

	resp := fiber.Map{
		"success": true,
		"data": fiber.Map{
			"user_id": userID,
			"message": "User created successfully",
		},
		"password_mode": passwordMode,
	}
	if passwordMode == "link" {
		resp["password_link_sent"] = linkSent
		if linkErr != "" {
			resp["password_link_error"] = linkErr
		}
	}

	if keycloakConfig.Enabled {
		resp["keycloak_synced"] = keycloakErr == nil
		resp["keycloak_user_id"] = keycloakUserID
		if keycloakErr != nil {
			resp["keycloak_error"] = keycloakErr.Error()
		}
	}

	return c.Status(fiber.StatusCreated).JSON(resp)
}

// sendSetPasswordLink — ให้ Keycloak ส่งอีเมลลิงก์ตั้งรหัสผ่าน (UPDATE_PASSWORD) อายุตาม realm
// (actionTokenGeneratedByAdminLifespan) · ลอง client portal + redirect กลับหน้าเว็บก่อน
// ถ้า redirect ไม่อยู่ในรายการที่ client อนุญาต ส่งแบบไม่มี redirect แทน
func sendSetPasswordLink(kcAdmin *config.KeycloakAdminClient, keycloakUserID, website string) (bool, string) {
	clientID := os.Getenv("KEYCLOAK_ACTION_CLIENT_ID")
	if clientID == "" {
		clientID = "portal"
	}
	err := kcAdmin.ExecuteActionsEmail(keycloakUserID, []string{"UPDATE_PASSWORD"}, clientID, website, 0)
	if err != nil {
		log.Printf("CreateUser: set-password link with redirect failed (%v) — retry without redirect", err)
		err = kcAdmin.ExecuteActionsEmail(keycloakUserID, []string{"UPDATE_PASSWORD"}, "", "", 0)
	}
	if err != nil {
		log.Printf("CreateUser: set-password link FAILED for %s: %v", keycloakUserID, err)
		return false, "ส่งอีเมลลิงก์ตั้งรหัสผ่านไม่สำเร็จ"
	}
	log.Printf("CreateUser: set-password link sent for %s", keycloakUserID)
	return true, ""
}

// ยอมเฉพาะเมื่อไม่มีผู้ใช้ที่ใช้งานอยู่รายอื่นในทะเบียนอ้างบัญชีนั้น แล้วตั้งรหัสผ่าน (ถาวร) + เปิดใช้งาน
func adoptExistingKeycloakUser(db *sql.DB, kcAdmin *config.KeycloakAdminClient, userID, email, password string) (string, error) {
	kcID, err := kcAdmin.FindUserByEmail(email)
	if err != nil || kcID == "" {
		kcID, err = kcAdmin.FindUserByUsername(email)
	}
	if err != nil || kcID == "" {
		return "", fmt.Errorf("Keycloak user exists but lookup failed: %v", err)
	}

	var owners int
	if qErr := db.QueryRow(
		`SELECT COUNT(*) FROM user_info
		  WHERE user_id != :1 AND status = 'active'
		    AND (keycloak_id = :2 OR LOWER(email) = LOWER(:3))`,
		userID, kcID, email,
	).Scan(&owners); qErr != nil {
		return "", fmt.Errorf("check Keycloak account owner: %w", qErr)
	}
	if owners > 0 {
		return "", fmt.Errorf("Keycloak account %s already belongs to another active user", kcID)
	}

	if password != "" {
		if pwErr := kcAdmin.SetUserPassword(kcID, password, true); pwErr != nil {
			return "", pwErr
		}
	}
	if enErr := kcAdmin.SetUserEnabled(kcID, true); enErr != nil {
		return "", enErr
	}
	log.Printf("CreateUser: adopted existing Keycloak user %s for %s (password reset)", kcID, email)
	return kcID, nil
}

func UpdateUser(c *fiber.Ctx) error {
	// 28/10/69 (security): สร้าง/แก้/ลบผู้ใช้ได้เฉพาะผู้ดูแล IAM-X Console (role=admin) — token Keycloak ทั่วไปได้ 403
	if _, err := requireConsoleAdmin(c); err != nil {
		return err
	}
	id := c.Params("id")
	var req struct {
		FirstName        string  `json:"first_name"`
		LastName         string  `json:"last_name"`
		FirstNameEng     string  `json:"first_name_eng"`
		LastNameEng      string  `json:"last_name_eng"`
		Email            string  `json:"email"`
		UserName         string  `json:"user_name"`
		Status           string  `json:"status"`
		UserType         string  `json:"user_type"`
		PersonalCardID   string  `json:"personal_card_id"`
		SendFlag         string  `json:"send_flag"`
		UserMinistryID   *string `json:"user_ministry_id"`
		UserAgencyID     *string `json:"user_agency_id"`
		UserDepartmentID *string `json:"user_department_id"`
		UserOperationID  *string `json:"user_operation_id"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body",
		})
	}
	// 14/11/69 PDPA: รายการผู้ใช้ส่งเลขบัตรแบบปิด (•) — ถ้าค่าที่ส่งกลับมามีตัวปิด ไม่เขียนทับเลขจริง
	if strings.Contains(req.PersonalCardID, "•") {
		req.PersonalCardID = ""
	}
	// 13/11/69: คำขอที่ส่งมาแค่ status (ปุ่มเปิด/ปิดใช้งาน) → บันทึกเฉพาะ status
	// เดิมตกไปที่ UPDATE เต็มแถว แล้วล้างกระทรวง/กรม/หน่วยงาน/หน่วยปฏิบัติ/ชื่ออังกฤษ/send_flag เป็นค่าว่าง
	var rawKeys map[string]json.RawMessage
	_ = json.Unmarshal(c.Body(), &rawKeys)
	_, hasStatus := rawKeys["status"]
	statusOnly := hasStatus && len(rawKeys) == 1
	if !validUserType(req.UserType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "user_type must be internal or agency",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Oracle database not connected",
		})
	}

	// Fetch current status + email before updating (for Keycloak sync + conflict check)
	var oldStatus, oldEmail sql.NullString
	_ = db.QueryRow(`SELECT status, email FROM user_info WHERE user_id = :1`, id).Scan(&oldStatus, &oldEmail)

	// Block reactivation if email already taken by another active user
	if req.Status == "active" {
		emailToCheck := req.Email
		if emailToCheck == "" && oldEmail.Valid {
			emailToCheck = oldEmail.String
		}
		if emailToCheck != "" {
			var conflictID string
			conflictErr := db.QueryRow(
				`SELECT user_id FROM user_info WHERE LOWER(TRIM(email)) = LOWER(TRIM(:1)) AND status = 'active' AND user_id != :2 AND ROWNUM = 1`,
				emailToCheck, id,
			).Scan(&conflictID)
			if conflictErr == nil {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{
					"success": false,
					"error":   "Cannot reactivate: email already in use by another active user",
				})
			}
		}
	}

	ministryID, agencyID, deptID, opID := "", "", "", ""
	if req.UserMinistryID != nil {
		ministryID = *req.UserMinistryID
	}
	if req.UserAgencyID != nil {
		agencyID = *req.UserAgencyID
	}
	if req.UserDepartmentID != nil {
		deptID = *req.UserDepartmentID
	}
	if req.UserOperationID != nil {
		opID = *req.UserOperationID
	}

	var result sql.Result
	var err error
	if statusOnly {
		result, err = db.Exec(`UPDATE user_info SET status = :1, updated_date = SYSTIMESTAMP WHERE user_id = :2`, req.Status, id)
	} else {
		result, err = db.Exec(`
		UPDATE user_info
		SET first_name         = COALESCE(NULLIF(:1, ''), first_name),
		    last_name          = COALESCE(NULLIF(:2, ''), last_name),
		    email              = COALESCE(NULLIF(:3, ''), email),
		    user_name          = COALESCE(NULLIF(:4, ''), user_name),
		    status             = COALESCE(NULLIF(:5, ''), status),
		    personal_card_id   = COALESCE(NULLIF(:6, ''), personal_card_id),
		    send_flag          = NULLIF(:7, ''),
		    first_name_eng     = :8,
		    last_name_eng      = :9,
		    user_type          = COALESCE(NULLIF(:10, ''), user_type),
		    user_ministry_id   = NULLIF(:11, ''),
		    user_agency_id     = NULLIF(:12, ''),
		    user_department_id = NULLIF(:13, ''),
		    user_operation_id  = NULLIF(:14, ''),
		    updated_date       = SYSTIMESTAMP
		WHERE user_id = :15`,
			req.FirstName, req.LastName, req.Email, req.UserName, req.Status,
			req.PersonalCardID, req.SendFlag, req.FirstNameEng, req.LastNameEng, req.UserType,
			ministryID, agencyID, deptID, opID, id)
	}

	if err != nil {
		log.Printf("UpdateUser error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to update user",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"error":   "User not found",
		})
	}

	// Keycloak enable/disable sync
	keycloakConfig := config.LoadKeycloakConfig()
	if keycloakConfig.Enabled && req.Status != "" {
		newStatus := req.Status
		oldStatusStr := ""
		if oldStatus.Valid {
			oldStatusStr = oldStatus.String
		}

		if newStatus != oldStatusStr {
			emailToSearch := req.Email
			if emailToSearch == "" && oldEmail.Valid {
				emailToSearch = oldEmail.String
			}

			if emailToSearch != "" {
				kcAdmin := config.NewKeycloakAdminClient()
				kcID, findErr := kcAdmin.FindUserByEmail(emailToSearch)
				if findErr != nil {
					log.Printf("UpdateUser: Keycloak user not found by email %s: %v", emailToSearch, findErr)
				} else {
					if newStatus == "inactive" {
						if disErr := kcAdmin.SetUserEnabled(kcID, false); disErr != nil {
							log.Printf("UpdateUser: failed to disable Keycloak user %s: %v", kcID, disErr)
						} else {
							log.Printf("UpdateUser: disabled Keycloak user %s", kcID)
						}
					} else if newStatus == "active" {
						if enErr := kcAdmin.SetUserEnabled(kcID, true); enErr != nil {
							log.Printf("UpdateUser: failed to enable Keycloak user %s: %v", kcID, enErr)
						} else {
							log.Printf("UpdateUser: enabled Keycloak user %s", kcID)
						}
					}
				}
			}
		}
	}

	resp := fiber.Map{
		"success": true,
		"message": "User updated successfully",
	}
	return c.JSON(resp)
}

func DeleteUser(c *fiber.Ctx) error {
	// 28/10/69 (security): สร้าง/แก้/ลบผู้ใช้ได้เฉพาะผู้ดูแล IAM-X Console (role=admin) — token Keycloak ทั่วไปได้ 403
	if _, err := requireConsoleAdmin(c); err != nil {
		return err
	}
	id := c.Params("id")
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Oracle database not connected",
		})
	}

	// ลบ = ลบจริงครบทุกที่ ยกเว้นทะเบียนบุคลากร APP.M_EMPLOYEE
	// เดิมแค่ล้างข้อมูลส่วนตัวใน user_info แล้วเขียนชื่อเป็นอักขระเพี้ยน — บทบาท/ความรับผิดชอบ/คำร้อง UPM ค้างอยู่
	var userEmail, userName, refUserID, userInfoID sql.NullString
	if err := db.QueryRow(
		`SELECT email, user_name, ref_user_id, TO_CHAR(user_info_id) FROM user_info WHERE user_id = :1`, id,
	).Scan(&userEmail, &userName, &refUserID, &userInfoID); err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "error": "User not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to delete user", "message": err.Error()})
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to delete user", "message": err.Error()})
	}
	steps := []string{
		`DELETE FROM user_custom_object_permission WHERE user_custom_object_mapping_id IN (SELECT id FROM user_custom_object_mapping WHERE user_id = :1)`,
		`DELETE FROM user_custom_object_mapping WHERE user_id = :1`,
		`DELETE FROM user_custom_data_access_permission WHERE user_custom_data_access_id IN (SELECT id FROM user_custom_data_access WHERE user_id = :1)`,
		`DELETE FROM user_custom_data_access WHERE user_id = :1`,
		`DELETE FROM responsibility_role_grant WHERE user_id = :1`,
		`DELETE FROM user_role_mapping WHERE user_id = :1`,
		`DELETE FROM user_responsibility_mapping WHERE user_id = :1`,
		`DELETE FROM user_report_mapping WHERE user_id = :1`,
		`DELETE FROM user_profile_image WHERE user_id = :1`,
		`DELETE FROM user_preferences WHERE user_id = :1`,
		`DELETE FROM menu_pins WHERE user_id = :1`,
		`DELETE FROM menu_access_logs WHERE user_id = :1`,
		`DELETE FROM chat_group_member WHERE user_id = :1`,
		`DELETE FROM chat_group_agent WHERE user_id = :1`,
		`DELETE FROM chat_thread_read WHERE user_id = :1`,
	}
	for _, q := range steps {
		if _, err := tx.Exec(q, id); err != nil {
			_ = tx.Rollback()
			log.Printf("DeleteUser %s: %s: %v", id, q, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to delete user", "message": err.Error()})
		}
	}
	// คำร้อง UPM (ทุกสถานะ รวมที่ยังไม่อนุมัติ) + PDPA — โพรซีเดอร์ของ APP (IAMX ไม่มีสิทธิ์ลบตรง)
	var purged int64
	if userInfoID.Valid && userInfoID.String != "" {
		if _, err := tx.Exec(`BEGIN APP_PURGE_USER_REQUESTS(:1, :2, :3); END;`, userInfoID.String, refUserID.String, sql.Out{Dest: &purged}); err != nil {
			_ = tx.Rollback()
			log.Printf("DeleteUser %s: purge UPM requests: %v", id, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to delete user requests", "message": err.Error()})
		}
	}
	if _, err := tx.Exec(`DELETE FROM user_info WHERE user_id = :1`, id); err != nil {
		_ = tx.Rollback()
		log.Printf("DeleteUser %s: user_info: %v", id, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to delete user", "message": err.Error()})
	}
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to delete user", "message": err.Error()})
	}
	log.Printf("DeleteUser %s: removed from IAM-X (UPM requests purged: %d)", id, purged)

	// Hard delete from Keycloak (not disable) so the same email/username/PID
	// can register again. Try email first, fall back to username.
	keycloakConfig := config.LoadKeycloakConfig()
	if keycloakConfig.Enabled {
		kcAdmin := config.NewKeycloakAdminClient()
		var kcID string
		var findErr error
		if userEmail.Valid && userEmail.String != "" {
			kcID, findErr = kcAdmin.FindUserByEmail(userEmail.String)
			if findErr != nil {
				log.Printf("DeleteUser: Keycloak lookup by email %s failed: %v", userEmail.String, findErr)
			}
		}
		if kcID == "" && userName.Valid && userName.String != "" {
			kcID, findErr = kcAdmin.FindUserByUsername(userName.String)
			if findErr != nil {
				log.Printf("DeleteUser: Keycloak lookup by username %s failed: %v", userName.String, findErr)
			}
		}
		if kcID != "" {
			if delErr := kcAdmin.DeleteUser(kcID); delErr != nil {
				log.Printf("DeleteUser: failed to hard-delete Keycloak user %s: %v", kcID, delErr)
			} else {
				log.Printf("DeleteUser: hard-deleted Keycloak user %s", kcID)
			}
		} else {
			log.Printf("DeleteUser: no Keycloak user matched for IAMX user_id=%s", id)
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "User deleted successfully",
	})
}

func validUserType(t string) bool {
	return t == "" || usertypes.Valid(t) // 16/11/69: จากค่าตั้ง IAMX.USER_TYPE
}

// maskCardID ปิดเลขบัตรประชาชนในรายการผู้ใช้ เหลือ 4 ตัวท้าย (PDPA) · เลขเต็มดูได้ที่ GET /users/:id
func maskCardID(v sql.NullString) *string {
	if !v.Valid || v.String == "" {
		return nil
	}
	d := v.String
	if len(d) <= 4 {
		m := strings.Repeat("•", len(d))
		return &m
	}
	m := strings.Repeat("•", len(d)-4) + d[len(d)-4:]
	return &m
}
