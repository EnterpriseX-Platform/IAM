package handlers

import (
	"api/core"
	"api/core/config"
	"api/core/usertypes"
	"api/core/utils"
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

type importRequest struct {
	Base64     string `json:"base64"`
	FileName   string `json:"fileName"`
	EmpType    string `json:"empType"`
	UserCreate string `json:"userCreate"`
}

type importRowError struct {
	Row    int    `json:"row"`
	Name   string `json:"name,omitempty"`
	Reason string `json:"reason"`
}

type importSummary struct {
	Total    int              `json:"total"`
	Imported int              `json:"imported"`
	Skipped  int              `json:"skipped"`
	Failed   int              `json:"failed"`
	Errors   []importRowError `json:"errors"`
	Warnings []importRowError `json:"warnings"`
}

func ImportUsersHandler(c *fiber.Ctx) error {
	// 28/10/69 (security): นำเข้าผู้ใช้ได้เฉพาะผู้ดูแล IAM-X Console (role=admin) — token Keycloak ทั่วไปได้ 403
	if _, err := requireConsoleAdmin(c); err != nil {
		return err
	}
	var req importRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Invalid request body"})
	}
	if req.Base64 == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "base64 is required"})
	}
	// 16/11/69: ประเภทจากค่าตั้ง IAMX.USER_TYPE · รูปแบบไฟล์ตามธง "บุคลากร" ของประเภท
	if !usertypes.Valid(req.EmpType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "empType is not an active user type"})
	}
	staffFile := usertypes.IsStaff(req.EmpType)

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Database not connected"})
	}

	fileBytes, err := base64.StdEncoding.DecodeString(req.Base64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Invalid base64 data"})
	}

	f, err := excelize.OpenReader(bytes.NewReader(fileBytes))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Failed to parse Excel file: " + err.Error()})
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "No sheets in Excel file"})
	}

	rows, err := f.GetRows(sheets[0], excelize.Options{RawCellValue: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to read rows"})
	}

	// Validate template type via document Subject metadata
	if docProps, propErr := f.GetDocProps(); propErr == nil && docProps != nil && docProps.Subject != "" {
		if docProps.Subject != req.EmpType {
			typeLabel := map[string]string{}
			for _, t := range usertypes.All() {
				typeLabel[t.Code] = t.Name
			}
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error": fmt.Sprintf("ไฟล์ไม่ถูกต้อง: ไฟล์นี้เป็นประเภท %s แต่เลือก %s",
					typeLabel[docProps.Subject], typeLabel[req.EmpType]),
			})
		}
	}

	result := importSummary{Errors: []importRowError{}, Warnings: []importRowError{}}

	// Detect data start row: row 0 is always the header; row 1 is a second header only if
	// its first cell contains "ชื่อ" (header text). Otherwise data begins at row 1.
	dataStart := 1
	if len(rows) > 1 && strings.Contains(importCell(rows[1], 0), "ชื่อ") {
		dataStart = 2
	}

	// Detect old vs new agency template format from the header row (rows[0]).
	// Old format: col 1 = PID, col 9 = email.
	// New format: col 1 = email, col 2 = PID.
	oldAgencyFormat := false
	if !staffFile && len(rows) > 0 {
		col1Header := importCell(rows[0], 1)
		if strings.Contains(col1Header, "เลข") {
			oldAgencyFormat = true
		}
	}

	for i := dataStart; i < len(rows); i++ {
		row := rows[i]
		rowNum := i + 1

		// Skip completely empty rows
		if len(row) == 0 {
			continue
		}
		isBlank := true
		for _, cell := range row {
			if strings.TrimSpace(cell) != "" {
				isBlank = false
				break
			}
		}
		if isBlank {
			continue
		}

		result.Total++

		var prefixName, firstName, lastName, email, personalCardID string

		if staffFile {
			// Col 0: ชื่อ-นามสกุล, Col 1: เลขบัตรประชาชน, Col 8: อีเมล
			prefixName, firstName, lastName = importParseThaiName(importCell(row, 0))
			personalCardID = importCellCode(row, 1)
			email = importCell(row, 8)
		} else if oldAgencyFormat {
			// Old agency format: Col 0: name, Col 1: PID, Col 9: email
			prefixName, firstName, lastName = importParseThaiName(importCell(row, 0))
			personalCardID = importCellCode(row, 1)
			email = importCell(row, 9)
		} else {
			// New agency format: Col 0: name, Col 1: email, Col 2: PID
			prefixName, firstName, lastName = importParseThaiName(importCell(row, 0))
			email = importCell(row, 1)
			personalCardID = importCellCode(row, 2)
		}

		if firstName == "" {
			result.Skipped++
			result.Errors = append(result.Errors, importRowError{Row: rowNum, Reason: "ไม่มีชื่อ-นามสกุล"})
			continue
		}
		if email == "" {
			result.Skipped++
			result.Errors = append(result.Errors, importRowError{Row: rowNum, Name: firstName, Reason: "ไม่มีอีเมล"})
			continue
		}

		// Skip if PERSONAL_CARD_ID already exists in IAMX.user_info
		if personalCardID != "" {
			var existID int
			if checkErr := db.QueryRow(`SELECT user_id FROM user_info WHERE personal_card_id = :1 AND ROWNUM = 1`, personalCardID).Scan(&existID); checkErr != sql.ErrNoRows {
				result.Skipped++
				result.Errors = append(result.Errors, importRowError{Row: rowNum, Name: firstName, Reason: "เลขบัตรประชาชนซ้ำในระบบ"})
				continue
			}
		}

		employeeID := uuid.New().String()

		var processErr error
		if staffFile {
			processErr = importProcessInternal(db, row, prefixName, firstName, lastName, personalCardID, email, employeeID, req.EmpType, req.UserCreate)
		} else {
			processErr = importProcessAgency(db, row, prefixName, firstName, lastName, personalCardID, email, employeeID, req.EmpType, oldAgencyFormat)
		}

		if processErr != nil {
			result.Failed++
			result.Errors = append(result.Errors, importRowError{Row: rowNum, Name: firstName, Reason: processErr.Error()})
		} else {
			result.Imported++
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": result})
}

// ImportTemplateHandler generates and streams an Excel template for the given user type.
// GET /iamx/api/users/import/template?type=internal|agency
func ImportTemplateHandler(c *fiber.Ctx) error {
	empType := c.Query("type", usertypes.StaffCode())
	if !usertypes.Valid(empType) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "type is not an active user type"})
	}
	staffFile := usertypes.IsStaff(empType)

	f := excelize.NewFile()
	defer f.Close()

	sheet := "Sheet1"
	idx, _ := f.GetSheetIndex(sheet)
	f.SetActiveSheet(idx)
	f.SetDocProps(&excelize.DocProperties{Subject: empType})

	// Header row (index 0) — row 1 in Excel
	var headers []string
	if staffFile {
		headers = []string{"ชื่อ-นามสกุล", "เลขบัตรประชาชน", "ตำแหน่ง", "ประเภทตำแหน่ง", "สำนัก/กอง", "ต่ำกว่ากอง 1 ระดับ", "ต่ำกว่ากอง 2 ระดับ", "สำนัก/กอง (มอบหมาย)", "อีเมล"}
	} else {
		headers = []string{"ชื่อ-นามสกุล", "อีเมล", "เลขบัตรประชาชน", "รหัสกระทรวง", "ชื่อกระทรวง", "รหัสกรม", "ชื่อกรม", "รหัสหน่วยปฏิบัติ", "ชื่อหน่วยปฏิบัติ", "ประเภทสิทธิ (MIN/AGC/SUB_AGC)", "สิทธินำส่ง (Y/N)"}
	}

	// Row 1: header label, Row 2: column name (data starts row 3 = index 2)
	for col, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(col+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	// Sample data row at index 2 (row 3)
	var sampleRow []string
	if staffFile {
		sampleRow = []string{"นาย สมชาย ใจดี", "1234567890123", "นักวิเคราะห์", "ข้าราชการ", "สำนักงานเลขาธิการ", "", "", "", "somchai@example.go.th"}
	} else {
		sampleRow = []string{"นาง สมหญิง ใจดี", "somying@agency.th", "9876543210987", "MIN001", "กระทรวงตัวอย่าง", "AGC001", "กรมตัวอย่าง", "OP001", "หน่วยปฏิบัติตัวอย่าง", "AGC", "Y"}
	}
	for col, val := range sampleRow {
		cell, _ := excelize.CoordinatesToCellName(col+1, 3)
		f.SetCellValue(sheet, cell, val)
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to generate template"})
	}

	filename := fmt.Sprintf("import_template_%s.xlsx", empType)
	c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set("Content-Disposition", "attachment; filename="+filename)
	return c.Send(buf.Bytes())
}

func importProcessInternal(db *sql.DB, row []string, prefixName, firstName, lastName, personalCardID, email, employeeID, empType, userCreate string) error {
	// Prefix required — validate before any DB writes
	if prefixName == "" {
		return fmt.Errorf("ไม่พบคำนำหน้าชื่อ (นาย/นาง/นางสาว)")
	}
	prefixID := lookupPrefixID(db, prefixName)
	if prefixID == nil {
		return fmt.Errorf("คำนำหน้าชื่อ %q ไม่พบในระบบ", prefixName)
	}

	position := importCell(row, 2)
	positionType := importCell(row, 3)
	departmentName := importCell(row, 4)
	subDeptName := importCell(row, 5)
	subDept2Name := importCell(row, 6)
	deptRespName := importCell(row, 7)

	// Insert into APP.M_EMPLOYEE directly (stored proc not available)
	if mergeErr := importUpsertMEmployee(db, employeeID, personalCardID, prefixName, firstName, lastName,
		email, empType, position, positionType, departmentName, subDeptName, subDept2Name, deptRespName, prefixID); mergeErr != nil {
		return fmt.Errorf("บันทึกข้อมูลพนักงานไม่สำเร็จ: %v", mergeErr)
	}

	emp := lookupEmployee(db, personalCardID)

	// Use prefix from M_EMPLOYEE if available, otherwise use validated prefix
	finalPrefixID := nullStr(emp.PrefixID)
	if finalPrefixID == nil {
		finalPrefixID = prefixID
	}

	userName := email
	if idx := strings.Index(email, "@"); idx > 0 {
		userName = email[:idx]
	}

	iamxUserID := utils.NewCUID()
	// ref_user_id = user_id — คีย์ที่ไหลไปเป็น claim USERINFO.REF_USER_ID ให้ปลายทางใช้
	// (ดูเหตุผลเต็มใน CreateUser — เดิมนำเข้าแล้ว REF_USER_ID เป็น NULL)
	_, err := db.Exec(`
		INSERT INTO user_info (user_id, ref_user_id, first_name, last_name, email, user_name, status, personal_card_id, user_type,
		                      employee_id, user_department_id, user_position_id, prefix, created_date)
		VALUES (:1, :2, :3, :4, :5, :6, 'active', :7, :12, :8, :9, :10, :11, SYSTIMESTAMP)`,
		iamxUserID, iamxUserID, firstName, lastName, email, userName, personalCardID,
		nullStr(emp.EmpCode), nullStr(emp.DepartmentID), nullStr(emp.PositionID), finalPrefixID, empType,
	)
	if err != nil {
		return fmt.Errorf("บันทึกข้อมูลผู้ใช้งานไม่สำเร็จ: %v", err)
	}

	// ออกใบรับรอง DTS ให้ผู้ใช้ที่นำเข้าด้วย (non-blocking, ล้มไม่กระทบการนำเข้า)
	go IssueDTSCertificate(iamxUserID, email, strings.TrimSpace(firstName+" "+lastName))

	return importSyncKeycloakAndRole(db, email, firstName, lastName, personalCardID, iamxUserID, "")
}

func importProcessAgency(db *sql.DB, row []string, prefixName, firstName, lastName, personalCardID, email, employeeID, empType string, oldFormat bool) error {
	var ministryCode, agencyCode, operationCode, dataLevel, sendFlag string
	if oldFormat {
		// Old: col 2=ministry, col 4=agency, col 6=operation, col 8=dataLevel, col 10=sendFlag
		ministryCode = importCellCode(row, 2)
		agencyCode = importCellCode(row, 4)
		operationCode = importCellCode(row, 6)
		dataLevel = importCell(row, 8)
		sendFlag = importCell(row, 10)
	} else {
		// New: col 3=ministry, col 5=agency, col 7=operation, col 9=dataLevel, col 10=sendFlag
		ministryCode = importCellCode(row, 3)
		agencyCode = importCellCode(row, 5)
		operationCode = importCellCode(row, 7)
		dataLevel = importCell(row, 9)
		sendFlag = importCell(row, 10)
	}

	ministryID := importLookupAgcID(db, ministryCode)
	agencyID := importLookupAgcID(db, agencyCode)
	operationID := importLookupAgcID(db, operationCode)

	userName := email
	if idx := strings.Index(email, "@"); idx > 0 {
		userName = email[:idx]
	}

	iamxUserID := utils.NewCUID()
	// ref_user_id = user_id (ดูเหตุผลใน CreateUser)
	_, err := db.Exec(`
		INSERT INTO user_info (user_id, ref_user_id, first_name, last_name, email, user_name, status, personal_card_id,
		                      user_ministry_id, user_agency_id, user_operation_id, user_type, created_date)
		VALUES (:1, :2, :3, :4, :5, :6, 'active', :7, NULLIF(:8,''), NULLIF(:9,''), NULLIF(:10,''), :11, SYSTIMESTAMP)`,
		iamxUserID, iamxUserID, firstName, lastName, email, userName, personalCardID,
		ministryID, agencyID, operationID, empType,
	)
	if err != nil {
		return fmt.Errorf("บันทึกข้อมูลผู้ใช้งานไม่สำเร็จ: %v", err)
	}

	// ออกใบรับรอง DTS ให้ผู้ใช้ที่นำเข้าด้วย (non-blocking, ล้มไม่กระทบการนำเข้า)
	go IssueDTSCertificate(iamxUserID, email, strings.TrimSpace(firstName+" "+lastName))

	// Non-fatal: store send_flag in IAMX.user_info (column may not exist yet)
	if sendFlag != "" {
		if _, sfErr := db.Exec(`UPDATE user_info SET send_flag = :1 WHERE user_id = :2`, sendFlag, iamxUserID); sfErr != nil {
			log.Printf("importAgency: send_flag update skipped (column may not exist): %v", sfErr)
		}
	}

	return importSyncKeycloakAndRole(db, email, firstName, lastName, personalCardID, iamxUserID, dataLevel)
}

// importSyncKeycloakAndRole returns a non-nil error only for role assignment failure.
// User creation in IAMX is already committed before this runs; caller should treat this as a warning.
func importSyncKeycloakAndRole(db *sql.DB, email, firstName, lastName, personalCardID string, iamxUserID string, dataLevel string) error {
	keycloakConfig := config.LoadKeycloakConfig()
	if keycloakConfig.Enabled {
		kcAdmin := config.NewKeycloakAdminClient()

		// Skip create if user already exists by email or pid attribute
		existingID, _ := kcAdmin.FindUserByEmail(email)
		if existingID == "" && personalCardID != "" {
			existingID, _ = kcAdmin.FindUserByPID(personalCardID)
		}

		var kcID string
		// 28/10/69 (security): รหัสสุ่มต่อบัญชี + บังคับเปลี่ยนครั้งแรก (เลิกรหัสตายตัว)
		pw := generateTempPassword()
		created := false
		if existingID != "" {
			log.Printf("importSync: Keycloak user already exists (%s), skipping create for %s", existingID, email)
			kcID = existingID
		} else {
			var kcErr error
			kcID, kcErr = kcAdmin.CreateUser(email, firstName, lastName, email, pw, true)
			created = kcErr == nil && kcID != ""
			if kcErr != nil {
				log.Printf("importSync: Keycloak error for %s: %v", email, kcErr)
			}
		}

		if kcID != "" {
			if _, storeErr := db.Exec(`UPDATE user_info SET keycloak_id = :1 WHERE user_id = :2`, kcID, iamxUserID); storeErr != nil {
				log.Printf("importSync: failed to store keycloak_id: %v", storeErr)
			}
		}
		if created {
			website := os.Getenv("APP_BASE_URL")
			go sendRegistrationEmail(email, firstName, lastName, email, pw, website)
		}
	}

	var roleErr error
	if dataLevel != "" {
		roleErr = importAssignRoleByDataLevel(db, iamxUserID, dataLevel)
		if roleErr != nil {
			log.Printf("importSyncKeycloakAndRole: role assign failed for user %s dataLevel=%q: %v", iamxUserID, dataLevel, roleErr)
		}
	} else {
		assignDefaultRole(db, iamxUserID)
	}

	return roleErr
}

func importAssignRoleByDataLevel(db *sql.DB, userID string, dataLevel string) error {
	roleCodeMap := map[string]string{
		"MIN":     "MIN-UNIT",
		"AGC":     "DEPT-UNIT",
		"SUB_AGC": "OPER-UNIT",
	}
	roleCode, ok := roleCodeMap[strings.ToUpper(strings.TrimSpace(dataLevel))]
	if !ok {
		assignDefaultRole(db, userID)
		return nil
	}
	// Match by code OR name so either convention works
	var roleID string
	if err := db.QueryRow(
		`SELECT id FROM role WHERE (code = :1 OR name = :1) AND is_active = 1 AND ROWNUM = 1`,
		roleCode,
	).Scan(&roleID); err != nil {
		assignDefaultRole(db, userID)
		return fmt.Errorf("บทบาท %q ไม่พบในระบบ ใช้บทบาทเริ่มต้นแทน", roleCode)
	}
	_, mapErr := db.Exec(`
		MERGE INTO user_role_mapping t
		USING (SELECT :1 AS user_id, :2 AS role_id FROM dual) src
		ON (t.user_id = src.user_id AND t.role_id = src.role_id)
		WHEN NOT MATCHED THEN INSERT (user_id, role_id, effective_date, is_active, created_at)
		VALUES (src.user_id, src.role_id, TRUNC(SYSDATE), 1, SYSTIMESTAMP)
	`, userID, roleID)
	if mapErr != nil {
		return fmt.Errorf("กำหนดบทบาท %q ไม่สำเร็จ: %v", roleCode, mapErr)
	}
	return nil
}

func importLookupAgcID(db *sql.DB, agcCode string) string {
	if agcCode == "" {
		return ""
	}
	var agcID string
	if err := db.QueryRow(`SELECT AGC_ID FROM APP.M_AGC WHERE AGC_CODE = :1 AND ROWNUM = 1`, agcCode).Scan(&agcID); err != nil {
		return ""
	}
	return agcID
}

// importParseThaiName splits a Thai full name (with optional prefix) into prefix, first, last.
// Checks "นางสาว" before "นาง" to avoid partial match.
func importParseThaiName(fullName string) (prefix, firstName, lastName string) {
	for _, p := range []string{"นางสาว", "นาย", "นาง"} {
		if strings.HasPrefix(fullName, p) {
			prefix = p
			remainder := strings.TrimSpace(fullName[len(p):])
			parts := strings.SplitN(remainder, " ", 2)
			if len(parts) >= 1 {
				firstName = strings.TrimSpace(parts[0])
			}
			if len(parts) >= 2 {
				lastName = strings.TrimSpace(parts[1])
			}
			return
		}
	}
	parts := strings.SplitN(fullName, " ", 2)
	if len(parts) >= 1 {
		firstName = strings.TrimSpace(parts[0])
	}
	if len(parts) >= 2 {
		lastName = strings.TrimSpace(parts[1])
	}
	return
}

func importCell(row []string, col int) string {
	if col < len(row) {
		return strings.TrimSpace(row[col])
	}
	return ""
}

// importUpsertMEmployee merges full employee data into APP.M_EMPLOYEE.
// Each bind variable (:1..:19) appears exactly once in USING SELECT to avoid ORA-01008.
// Only inserts when no active (non-deleted) record for the PID already exists.
func importUpsertMEmployee(db *sql.DB, empID, personalCardID, prefixName, firstName, lastName,
	email, empType, position, positionType, departmentName, subDeptName, subDept2Name, deptRespName string,
	prefixID interface{}) error {

	deptID := importLookupDeptID(db, departmentName)
	positionID := importLookupPositionID(db, position)
	subDeptID := importLookupDeptID(db, subDeptName)
	subDept2ID := importLookupDeptID(db, subDept2Name)
	empTypeID := importLookupEmpTypeCode(db, position)

	_, err := db.ExecContext(context.Background(), `
		MERGE INTO APP.M_EMPLOYEE emp
		USING (
			SELECT :1  AS PID,   :2  AS EID,    :3  AS ECODE,  :4  AS PFXID,
			       :5  AS PFX,   :6  AS FNAME,  :7  AS LNAME,  :8  AS ETYPE,
			       :9  AS POSID, :10 AS POSN,   :11 AS POST,   :12 AS DEPTID,
			       :13 AS DEPTN, :14 AS SDID1,  :15 AS SDEP1,  :16 AS SDID2,
			       :17 AS SDEP2, :18 AS DRESP,  :19 AS MAIL
			FROM DUAL
		) src
		ON (emp.PERSONAL_CARD_ID = src.PID AND emp.DELETED_DATE IS NULL)
		WHEN NOT MATCHED THEN INSERT (
			EMP_ID,    EMP_CODE,  PREFIX_ID,         PREFIX,
			NAME,      SURNAME,   PERSONAL_CARD_ID,  EMP_TYPE,
			POSITION_ID,       POSITION_NAME,     POSITION_TYPE,
			DEPARTMENT_ID,     DEPARTMENT_NAME,
			SUB_DEPARTMENT_ID, SUB_DEPARTMENT_NAME,
			SUB_DEPARTMENT2_ID, SUB_DEPARTMENT2_NAME,
			DEPARTMENT_RESPON_NAME,
			EMAIL,     STATUS,    CREATED_DATE
		) VALUES (
			src.EID,   src.ECODE, src.PFXID,         src.PFX,
			src.FNAME, src.LNAME, src.PID,            src.ETYPE,
			src.POSID, src.POSN,  src.POST,
			src.DEPTID, src.DEPTN,
			src.SDID1, src.SDEP1,
			src.SDID2, src.SDEP2,
			src.DRESP,
			src.MAIL,  'active',  CURRENT_TIMESTAMP
		)
	`,
		personalCardID, // :1  PID
		empID,          // :2  EID
		"",             // :3  ECODE (blank per spec)
		prefixID,       // :4  PFXID
		prefixName,     // :5  PFX
		firstName,      // :6  FNAME
		lastName,       // :7  LNAME
		empTypeID,      // :8  ETYPE (COMMON_DATA_ID from REF_COMMON_DATA EMP_TYPE_CODE)
		positionID,     // :9  POSID
		position,       // :10 POSN
		positionType,   // :11 POST
		deptID,         // :12 DEPTID
		departmentName, // :13 DEPTN
		subDeptID,      // :14 SDID1
		subDeptName,    // :15 SDEP1
		subDept2ID,     // :16 SDID2
		subDept2Name,   // :17 SDEP2
		deptRespName,   // :18 DRESP
		email,          // :19 MAIL
	)
	return err
}

// importLookupDeptID returns DEPARTMENT_ID from APP.M_DEPARTMENT by exact name match.
func importLookupDeptID(db *sql.DB, deptName string) string {
	if deptName == "" {
		return ""
	}
	var deptID string
	if err := db.QueryRowContext(context.Background(),
		`SELECT DEPARTMENT_ID FROM APP.M_DEPARTMENT WHERE DEPARTMENT_NAME = :1 AND ROWNUM = 1`,
		deptName,
	).Scan(&deptID); err != nil {
		return ""
	}
	return deptID
}

// importLookupPositionID returns POSITION_ID from APP.M_POSITION by exact name match.
func importLookupPositionID(db *sql.DB, positionName string) string {
	if positionName == "" {
		return ""
	}
	var posID string
	if err := db.QueryRowContext(context.Background(),
		`SELECT POSITION_ID FROM APP.M_POSITION WHERE POSITION_NAME = :1 AND ROWNUM = 1`,
		positionName,
	).Scan(&posID); err != nil {
		return ""
	}
	return posID
}

// importLookupEmpTypeCode returns COMMON_DATA_ID from APP.REF_COMMON_DATA
// where COMMON_DATA_TYPE='EMP_TYPE_CODE' and COMMON_DATA_LABEL matches positionName.
func importLookupEmpTypeCode(db *sql.DB, positionName string) string {
	if positionName == "" {
		return ""
	}
	var id string
	if err := db.QueryRowContext(context.Background(),
		`SELECT COMMON_DATA_ID FROM APP.REF_COMMON_DATA
		 WHERE COMMON_DATA_TYPE = 'EMP_TYPE_CODE' AND COMMON_DATA_LABEL = :1 AND ROWNUM = 1`,
		positionName,
	).Scan(&id); err != nil {
		return ""
	}
	return id
}

// importCellCode reads a cell that should be a numeric code (e.g. PID, AGC code).
// Excel may store large integers as scientific notation ("5.0102E+11").
// This converts back to the plain integer string ("501020000001").
func importCellCode(row []string, col int) string {
	val := importCell(row, col)
	if val == "" {
		return ""
	}
	if f, err := strconv.ParseFloat(val, 64); err == nil && strings.ContainsAny(val, "eE") {
		return strconv.FormatInt(int64(math.Round(f)), 10)
	}
	return val
}
