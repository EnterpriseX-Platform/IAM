package handlers

import (
	"api/core"
	"api/core/config"
	"api/core/usertypes"
	"api/core/utils"
	"context"
	"database/sql"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type RegisterRequest struct {
	PID               string `json:"pid"`
	PreferredUsername string `json:"preferredUsername"`
	PrefixTh          string `json:"prefixTh"`
	FirstNameTh       string `json:"firstNameTh"`
	LastNameTh        string `json:"lastNameTh"`
	PrefixEn          string `json:"prefixEn"`
	FirstNameEn       string `json:"firstNameEn"`
	LastNameEn        string `json:"lastNameEn"`
	Gender            string `json:"gender"`
	Birthdate         string `json:"birthdate"`
	Email             string `json:"email"`
	Phone             string `json:"phone"`
	Mobile            string `json:"mobile"`
	IDPType           string `json:"idpType"`
	Password          string `json:"password"`
	KeycloakSub       string `json:"keycloakSub"`
}

type RegisterResponse struct {
	Success bool   `json:"success"`
	UserID  string `json:"userId"`
	Message string `json:"message"`
}

type empInfo struct {
	EmpID        sql.NullString
	EmpCode      sql.NullString
	PrefixID     sql.NullString
	DepartmentID sql.NullString
	PositionID   sql.NullString
}

func nullStr(ns sql.NullString) interface{} {
	if ns.Valid && ns.String != "" {
		return ns.String
	}
	return nil
}

func RegisterHandler(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// H-1: identity must come from proof (verified token / BFF signature), never the body.
	caller, authErr := resolveRegisterCaller(c)
	if authErr != nil {
		log.Printf("RegisterHandler: rejected unauthenticated call from %s: %v", c.IP(), authErr)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Unauthorized",
		})
	}
	switch caller.Mode {
	case registerModeToken:
		if caller.PID == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Token carries no personal ID",
			})
		}
		req.PID = caller.PID
		req.KeycloakSub = caller.Sub
		req.PreferredUsername = caller.Username
		if caller.Email != "" {
			req.Email = caller.Email
		} else if !caller.ServiceSigned {
			// email typed at signup is only accepted when the BFF (which verified the OTP) signs it
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Email must come from the token or a signed service call",
			})
		}
	case registerModeService:
		// keycloakSub links to an existing Keycloak account — only a token may name it
		req.KeycloakSub = ""
	}
	log.Printf("RegisterHandler: mode=%s token=%t signed=%t", caller.Mode, caller.HasToken, caller.ServiceSigned)

	if req.Email == "" || req.FirstNameTh == "" || req.LastNameTh == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing required fields: email, firstNameTh, lastNameTh",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Oracle database not connected",
		})
	}

	userName := req.PreferredUsername
	if userName == "" {
		userName = req.Email
	}
	if userName == "" {
		userName = req.PID
	}

	// Check existing user by personal_card_id
	var userID string
	var existingEmail string
	pidErr := db.QueryRow(
		`SELECT user_id, COALESCE(email, '') FROM user_info WHERE personal_card_id = :1 AND status = 'active' AND ROWNUM = 1`,
		req.PID,
	).Scan(&userID, &existingEmail)

	if pidErr == nil && existingEmail != "" {
		// H-1: an active account that already has an email is never modified here —
		// this branch used to reset its Keycloak email+password from body fields,
		// which let anyone holding a national ID take the account over.
		// Existing users recover access through "forgot password", not registration.
		log.Printf("RegisterHandler: refused re-registration of existing account %s (mode=%s)", userID, caller.Mode)
		return c.Status(fiber.StatusConflict).JSON(RegisterResponse{
			Success: false,
			UserID:  "",
			Message: "บัญชีนี้ลงทะเบียนไว้แล้ว กรุณาเข้าสู่ระบบ หรือใช้เมนูลืมรหัสผ่าน",
		})
	}
	if pidErr == nil && caller.Mode == registerModeLegacy {
		// Row exists (no email yet) — attaching an email/password to it needs a proven pid.
		return c.Status(fiber.StatusConflict).JSON(RegisterResponse{
			Success: false,
			Message: "ลงทะเบียนไม่สำเร็จ: ต้องยืนยันตัวตนก่อน กรุณาเริ่มสมัครใหม่",
		})
	}

	// 17/11/69: อีเมลซ้ำ — เดิมนับเฉพาะผู้ใช้ status='active' และเทียบตัวพิมพ์ตรงตัว
	// ⇒ นับทุกสถานะ · ไม่สนตัวพิมพ์/ช่องว่าง · ยกเว้นเฉพาะแถวที่กำลังจะเติมอีเมล (เลขบัตรเดียวกัน ยังไม่มีอีเมล)
	req.Email = strings.TrimSpace(req.Email)
	var existingEmailID string
	emailErr := db.QueryRow(
		`SELECT user_id FROM user_info
		  WHERE LOWER(TRIM(email)) = LOWER(:1)
		    AND NOT (user_id = :2)
		  FETCH FIRST 1 ROWS ONLY`,
		req.Email, userIDOrDash(userID, pidErr),
	).Scan(&existingEmailID)
	if emailErr == nil {
		log.Printf("RegisterHandler: email already used by user %s — refused", existingEmailID)
		return c.Status(fiber.StatusConflict).JSON(RegisterResponse{
			Success: false,
			Message: EmailInUseMessage,
		})
	}
	if emailErr != sql.ErrNoRows {
		log.Printf("RegisterHandler: email check failed: %v", emailErr)
		return c.Status(fiber.StatusInternalServerError).JSON(RegisterResponse{
			Success: false,
			Message: "ลงทะเบียนไม่สำเร็จ: ตรวจสอบอีเมลไม่ได้ กรุณาลองใหม่",
		})
	}

	// H-1 preflight (before anything is written): resolve the Keycloak account this call
	// would attach an email/password to, and refuse if that account is already set up —
	// or, for a legacy (unsigned) call, if it is not a brokered ThaiD account.
	// Doing this first means a refused call leaves no USER_INFO / role rows behind.
	// 17/11/69: อีเมลนี้เป็นของบัญชีอื่นใน Keycloak อยู่แล้ว (realm ห้ามอีเมลซ้ำ) — ต้องรู้ก่อนเขียนอะไรลง USER_INFO
	// เดิมเขียนแถวก่อนแล้วค่อยชน 409 ตอนตั้งอีเมลใน Keycloak → ตอบผู้สมัครว่าไม่สำเร็จ แต่แถวค้างอยู่
	if kcCfg := config.LoadKeycloakConfig(); kcCfg.Enabled {
		kcAdmin := config.NewKeycloakAdminClient()
		ownTarget := req.KeycloakSub
		if req.KeycloakSub != "" && req.PreferredUsername != "" {
			if foundID, lookupErr := kcAdmin.FindUserByUsername(req.PreferredUsername); lookupErr == nil && foundID != "" {
				ownTarget = foundID
			}
		}
		ownerID, findErr := kcAdmin.FindUserByEmail(req.Email)
		switch {
		case findErr != nil && !strings.Contains(findErr.Error(), "user not found"):
			log.Printf("RegisterHandler: Keycloak email lookup failed for %s: %v", req.Email, findErr)
			return c.Status(fiber.StatusBadGateway).JSON(RegisterResponse{
				Success: false,
				Message: "ลงทะเบียนไม่สำเร็จ: ตรวจสอบบัญชีเข้าใช้งานไม่ได้ กรุณาลองใหม่",
			})
		case findErr == nil && ownerID != "" && ownerID != ownTarget:
			log.Printf("RegisterHandler: email already owned by Keycloak user %s — refused", ownerID)
			return c.Status(fiber.StatusConflict).JSON(RegisterResponse{
				Success: false,
				Message: EmailInUseMessage,
			})
		}
	}

	if req.KeycloakSub != "" {
		if kcCfg := config.LoadKeycloakConfig(); kcCfg.Enabled {
			kcAdmin := config.NewKeycloakAdminClient()
			targetID := req.KeycloakSub
			if req.PreferredUsername != "" {
				if foundID, lookupErr := kcAdmin.FindUserByUsername(req.PreferredUsername); lookupErr == nil && foundID != "" {
					targetID = foundID
				}
			}
			kcEmail, kcLinks, stateErr := kcAdmin.GetUserRegistrationState(targetID)
			switch {
			case stateErr != nil:
				log.Printf("RegisterHandler: Keycloak preflight failed for %s: %v", targetID, stateErr)
				return c.Status(fiber.StatusBadGateway).JSON(RegisterResponse{
					Success: false,
					Message: "ลงทะเบียนไม่สำเร็จ: ตรวจสอบบัญชีเข้าใช้งานไม่ได้ กรุณาลองใหม่",
				})
			case kcEmail != "":
				log.Printf("RegisterHandler: refused to overwrite Keycloak user %s that already has an email (mode=%s)", targetID, caller.Mode)
				return c.Status(fiber.StatusConflict).JSON(RegisterResponse{
					Success: false,
					Message: "บัญชีนี้ลงทะเบียนไว้แล้ว กรุณาเข้าสู่ระบบ หรือใช้เมนูลืมรหัสผ่าน",
				})
			case caller.Mode == registerModeLegacy && kcLinks == 0:
				log.Printf("RegisterHandler: legacy call named non-brokered Keycloak user %s — refused", targetID)
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "Forbidden"})
			}
		}
	}

	// Check M_EMPLOYEE to determine user_type and resolve employee/prefix fields
	emp := lookupEmployee(db, req.PID)
	// 16/11/69: ประเภทจากค่าตั้ง IAMX.USER_TYPE — อยู่ในทะเบียน HR = ประเภทบุคลากร ไม่งั้น = ประเภทภายนอก
	userType := usertypes.ExternalCode()
	if emp.EmpID.Valid {
		userType = usertypes.StaffCode()
	}
	prefixID := nullStr(emp.PrefixID)
	if prefixID == nil && req.PrefixTh != "" {
		prefixID = lookupPrefixID(db, req.PrefixTh)
	}

	var err error
	insertedNew := false
	if pidErr == sql.ErrNoRows {
		// INSERT new user
		userID = utils.NewCUID()
		// ref_user_id = user_id — คีย์ที่ mapper ส่งเป็น claim USERINFO.REF_USER_ID
		// ให้ปลายทาง (เช่น DTS) ใช้ผูกข้อมูล (ดูเหตุผลเต็มใน CreateUser)
		_, err = db.Exec(`
			INSERT INTO user_info (
				user_id, ref_user_id,
				user_name, first_name, last_name,
				email, personal_card_id,
				birth_date, phone, mobile,
				user_type, status, created_date,
				first_name_eng, last_name_eng,
				employee_id, user_department_id, user_position_id, prefix
			) VALUES (
				:1, :2,
				:3, :4, :5,
				:6, :7,
				TO_DATE(:8, 'YYYY-MM-DD'), :9, :10,
				:11, 'active', SYSTIMESTAMP,
				:12, :13,
				:14, :15, :16, :17
			)`,
			userID, userID,
			userName, req.FirstNameTh, req.LastNameTh,
			req.Email, req.PID,
			req.Birthdate, req.Phone, req.Mobile,
			userType,
			req.FirstNameEn, req.LastNameEn,
			nullStr(emp.EmpCode), nullStr(emp.DepartmentID), nullStr(emp.PositionID), prefixID,
		)
		insertedNew = err == nil
	} else if pidErr == nil {
		// User exists with PID but no email yet — UPDATE with email
		_, err = db.Exec(`
			UPDATE user_info SET
				user_name      = :1,
				first_name     = :2,
				last_name      = :3,
				email          = :4,
				birth_date     = TO_DATE(:5, 'YYYY-MM-DD'),
				phone          = :6,
				mobile         = :7,
				user_type      = :8,
				first_name_eng = :9,
				last_name_eng  = :10,
				employee_id        = :11,
				user_department_id = :12,
				user_position_id   = :13,
				prefix             = :14,
				updated_date   = SYSTIMESTAMP
			WHERE personal_card_id = :15`,
			userName, req.FirstNameTh, req.LastNameTh,
			req.Email,
			req.Birthdate, req.Phone, req.Mobile,
			userType,
			req.FirstNameEn, req.LastNameEn,
			nullStr(emp.EmpCode), nullStr(emp.DepartmentID), nullStr(emp.PositionID), prefixID,
			req.PID,
		)
	}
	if err != nil {
		log.Printf("RegisterHandler upsert error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to upsert user_info",
		})
	}

	assignDefaultRole(db, userID)

	// Keycloak sync
	keycloakConfig := config.LoadKeycloakConfig()
	if keycloakConfig.Enabled {
		kcAdmin := config.NewKeycloakAdminClient()
		var kcID string
		var kcErr error

		if req.KeycloakSub != "" {
			// ThaiD path — resolve pairwise sub → actual UUID via username lookup
			actualID := req.KeycloakSub
			if req.PreferredUsername != "" {
				if foundID, lookupErr := kcAdmin.FindUserByUsername(req.PreferredUsername); lookupErr == nil && foundID != "" {
					log.Printf("RegisterHandler: resolved pairwise sub %s → UUID %s via username %q", req.KeycloakSub, foundID, req.PreferredUsername)
					actualID = foundID
				} else {
					log.Printf("RegisterHandler: username lookup failed for %q (%v), falling back to sub %s", req.PreferredUsername, lookupErr, req.KeycloakSub)
				}
			}
			kcErr = kcAdmin.UpdateUserEmailAndPassword(actualID, req.Email, req.Password)
			kcID = actualID
		} else {
			// Normal path — create new Keycloak user
			pw := req.Password
			if pw == "" {
				pw = generateTempPassword()
			}
			kcID, kcErr = kcAdmin.CreateUser(req.Email, req.FirstNameTh, req.LastNameTh, userName, pw, false)
		}

		if kcErr != nil {
			// เดิมบันทึกเป็นแค่คำเตือนแล้วตอบว่าสมัครสำเร็จ
			// ผลคือบัญชีถูกสร้างในทะเบียนผู้ใช้ แต่ฝั่งระบบล็อกอินไม่ได้ตั้งอีเมลและรหัสผ่าน
			// ผู้สมัครจึงเข้าระบบไม่ได้เลยและไม่มีใครรู้จนกว่าจะลองล็อกอิน
			// ขั้นตอนนี้เป็นหัวใจของการสมัคร ถ้าทำไม่สำเร็จต้องแจ้งให้รู้ ไม่ใช่เงียบ
			log.Printf("RegisterHandler: Keycloak sync FAILED for user %s: %v", userID, kcErr)
			// 17/11/69: ตอบว่าไม่สำเร็จต้องไม่มีบัญชีค้าง — ถอยสิ่งที่เพิ่งเขียน (แถวใหม่ลบทิ้ง · แถวเดิมคืนอีเมลว่าง)
			rollbackRegistration(db, userID, insertedNew)
			msg := "ลงทะเบียนไม่สำเร็จ: ตั้งค่าบัญชีเข้าใช้งานไม่ได้ กรุณาลองใหม่ หรือติดต่อผู้ดูแลระบบ"
			if strings.Contains(kcErr.Error(), "409") {
				msg = EmailInUseMessage
			}
			return c.Status(fiber.StatusBadGateway).JSON(RegisterResponse{
				Success: false,
				Message: msg,
			})
		} else if kcID != "" {
			if _, storeErr := db.Exec(
				`UPDATE user_info SET keycloak_id = :1 WHERE user_id = :2`,
				kcID, userID,
			); storeErr != nil {
				log.Printf("RegisterHandler: failed to store keycloak_id: %v", storeErr)
			}
		}
	}

	if insertedNew {
		// ผู้ใช้สมัครเอง → ออกใบรับรอง DTS (non-blocking) · ย้ายมาหลังบัญชีเข้าใช้งานพร้อมแล้ว ไม่ออกให้แถวที่ถูกถอย
		go IssueDTSCertificate(userID, req.Email, strings.TrimSpace(req.FirstNameTh+" "+req.LastNameTh))
	}

	return c.Status(fiber.StatusCreated).JSON(RegisterResponse{
		Success: true,
		UserID:  userID,
		Message: "User registered successfully",
	})
}

// lookupEmployee queries APP.M_EMPLOYEE by PERSONAL_CARD_ID
func lookupEmployee(db *sql.DB, pid string) *empInfo {
	query := `
		SELECT EMP_ID, EMP_CODE, PREFIX_ID, DEPARTMENT_ID, POSITION_ID
		FROM APP.M_EMPLOYEE
		WHERE PERSONAL_CARD_ID = :1
		  AND (DELETED_DATE IS NULL)
		  AND ROWNUM = 1
	`
	emp := &empInfo{}
	err := db.QueryRowContext(context.Background(), query, pid).Scan(
		&emp.EmpID, &emp.EmpCode, &emp.PrefixID, &emp.DepartmentID, &emp.PositionID,
	)
	if err != nil {
		// Not in M_EMPLOYEE — citizen / external user, proceed without employee data
		return &empInfo{}
	}
	return emp
}

// lookupPrefixID queries APP.M_PREFIX by Thai title (NAME_TH)
func lookupPrefixID(db *sql.DB, titleTh string) interface{} {
	var prefixID string
	err := db.QueryRowContext(context.Background(),
		`SELECT PREFIX_ID FROM APP.M_PREFIX WHERE NAME_TH = :1`, titleTh,
	).Scan(&prefixID)
	if err != nil {
		return nil
	}
	if prefixID == "" {
		return nil
	}
	return prefixID
}

func assignDefaultRole(db *sql.DB, userID string) {
	var defaultRoleID string
	roleErr := db.QueryRow(`SELECT id FROM role WHERE default_role = 1 AND ROWNUM = 1`).Scan(&defaultRoleID)
	if roleErr == nil {
		_, mapErr := db.Exec(`
			MERGE INTO user_role_mapping t
			USING (SELECT :1 AS user_id, :2 AS role_id FROM dual) src
			ON (t.user_id = src.user_id AND t.role_id = src.role_id)
			WHEN NOT MATCHED THEN INSERT
			    (user_id, role_id, effective_date, is_active, created_at)
			VALUES
			    (src.user_id, src.role_id, TRUNC(SYSDATE), 1, SYSTIMESTAMP)
		`, userID, defaultRoleID)
		if mapErr != nil {
			log.Printf("assignDefaultRole error: %v", mapErr)
		} else {
			log.Printf("assignDefaultRole: assigned default role %s to user %s", defaultRoleID, userID)
		}
	} else {
		log.Printf("assignDefaultRole: no default role found in IAMX.role, skipping")
	}
}

// EmailInUseMessage — ข้อความเดียวกับที่พอร์ทัลแสดงตอนกรอกอีเมล
const EmailInUseMessage = "อีเมลนี้มีบัญชีผู้ใช้งานอยู่แล้ว กรุณาเข้าสู่ระบบ หรือใช้เมนูลืมรหัสผ่าน"

// userIDOrDash — แถวที่กำลังจะเติมอีเมล (พบเลขบัตร) ไม่นับเป็นอีเมลซ้ำของตัวเอง
func userIDOrDash(userID string, pidErr error) string {
	if pidErr == nil && userID != "" {
		return userID
	}
	return "-"
}

// rollbackRegistration ถอยการเขียนของ RegisterHandler เมื่อขั้น Keycloak ล้ม
func rollbackRegistration(db *sql.DB, userID string, insertedNew bool) {
	if insertedNew {
		if _, err := db.Exec(`DELETE FROM user_role_mapping WHERE user_id = :1`, userID); err != nil {
			log.Printf("RegisterHandler rollback: role mapping %s: %v", userID, err)
		}
		if _, err := db.Exec(`DELETE FROM user_info WHERE user_id = :1`, userID); err != nil {
			log.Printf("RegisterHandler rollback: user_info %s: %v", userID, err)
			return
		}
		log.Printf("RegisterHandler rollback: removed half-created user %s", userID)
		return
	}
	if _, err := db.Exec(`UPDATE user_info SET email = NULL, updated_date = SYSTIMESTAMP WHERE user_id = :1`, userID); err != nil {
		log.Printf("RegisterHandler rollback: clear email %s: %v", userID, err)
	}
}
