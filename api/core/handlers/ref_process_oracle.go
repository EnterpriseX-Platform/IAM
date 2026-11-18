package handlers

import (
	"api/core"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
)

// RefProcess - ข้อมูล Process จาก Oracle N_REF_PROCESS
type RefProcess struct {
	ProcessID    string          `json:"process_id"`
	FiscalYear   string          `json:"fiscal_year"`
	ProcessCode  string          `json:"process_code"`
	ProcessName  string          `json:"process_name"`
	DisplayCode  string          `json:"display_code"`
	DisplayName  string          `json:"display_name"`
	ModuleName   string          `json:"module_name"`
	Status       string          `json:"status"`
	Seq          int             `json:"seq"`
	CreatedDate  time.Time       `json:"created_date"`
	CreatedBy    string          `json:"created_by"`
	UpdatedDate  *time.Time      `json:"updated_date"`
	UpdatedBy    string          `json:"updated_by"`
	Subprocesses []RefSubprocess `json:"subprocesses,omitempty"`
}

type RefSubprocess struct {
	SubprocessID   string     `json:"subprocess_id"`
	ProcessID      string     `json:"process_id"`
	SubprocessCode string     `json:"subprocess_code"`
	SubprocessName string     `json:"subprocess_name"`
	DisplayCode    string     `json:"display_code"`
	DisplayName    string     `json:"display_name"`
	Status         string     `json:"status"`
	EffectiveDate  *time.Time `json:"effective_date"`
	ExpireDate     *time.Time `json:"expire_date"`
	CreatedDate    time.Time  `json:"created_date"`
	CreatedBy      string     `json:"created_by"`
	UpdatedDate    *time.Time `json:"updated_date"`
	UpdatedBy      string     `json:"updated_by"`
	FiscalYear     string     `json:"fiscal_year"`
}

// scan helper for NULL handling
type refSubprocessScan struct {
	SubprocessID   sql.NullString
	ProcessID      sql.NullString
	SubprocessCode sql.NullString
	SubprocessName sql.NullString
	DisplayCode    sql.NullString
	DisplayName    sql.NullString
	Status         sql.NullString
	EffectiveDate  sql.NullTime
	ExpireDate     sql.NullTime
	CreatedDate    sql.NullTime
	CreatedBy      sql.NullString
	UpdatedDate    sql.NullTime
	UpdatedBy      sql.NullString
	FiscalYear     sql.NullString
}

// GetRefProcessesOracle - ดึง Process และ Sub-process จาก Oracle
// GET /oracle/ref-processes?fiscal_year=
func GetRefProcessesOracle(c *fiber.Ctx) error {

	fiscalYear := c.Query("fiscal_year")
	if fiscalYear == "" {
		fiscalYear = fmt.Sprintf("%d", time.Now().Year()+543)
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	processQuery := `
	SELECT 
		PROCESS_ID,
		FISCAL_YEAR,
		PROCESS_CODE,
		PROCESS_NAME,
		NVL(DISPLAY_CODE,'') DISPLAY_CODE,
		NVL(DISPLAY_NAME,'') DISPLAY_NAME,
		NVL(MODULE_NAME,'') MODULE_NAME,
		NVL(STATUS,'') STATUS,
		NVL(SEQ,0) SEQ,
		CREATED_DATE,
		NVL(CREATED_BY,'') CREATED_BY,
		UPDATED_DATE,
		NVL(UPDATED_BY,'') UPDATED_BY
	FROM APP.N_REF_PROCESS
	WHERE FISCAL_YEAR = :1
	AND (DELETED_DATE IS NULL OR DELETED_DATE > SYSDATE)
	AND UPPER(STATUS) in ('ACTIVE', 'INACTIVE')
	ORDER BY SEQ, PROCESS_CODE
	`

	rows, err := oracleDB.Query(processQuery, fiscalYear)
	if err != nil {
		log.Printf("Error querying N_REF_PROCESS: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch processes",
		})
	}
	defer rows.Close()

	var processes []RefProcess
	processMap := make(map[string]int) // map processID -> index in processes slice

	for rows.Next() {

		var p RefProcess

		var moduleName sql.NullString
		var status sql.NullString
		var createdBy sql.NullString
		var updatedBy sql.NullString
		var updatedDate sql.NullTime

		err := rows.Scan(
			&p.ProcessID,
			&p.FiscalYear,
			&p.ProcessCode,
			&p.ProcessName,
			&p.DisplayCode,
			&p.DisplayName,
			&moduleName,
			&status,
			&p.Seq,
			&p.CreatedDate,
			&createdBy,
			&updatedDate,
			&updatedBy,
		)

		if err != nil {
			log.Printf("Error scanning process row: %v", err)
			continue
		}

		if moduleName.Valid {
			p.ModuleName = moduleName.String
		} else {
			p.ModuleName = ""
		}

		if status.Valid {
			p.Status = status.String
		} else {
			p.Status = ""
		}

		if createdBy.Valid {
			p.CreatedBy = createdBy.String
		} else {
			p.CreatedBy = ""
		}

		if updatedBy.Valid {
			p.UpdatedBy = updatedBy.String
		} else {
			p.UpdatedBy = ""
		}

		if updatedDate.Valid {
			p.UpdatedDate = &updatedDate.Time
		}

		p.Subprocesses = []RefSubprocess{}

		processes = append(processes, p)
		processMap[p.ProcessID] = len(processes) - 1
	}

	subprocessQuery := `
	SELECT 
		s.SUBPROCESS_ID,
		s.PROCESS_ID,
		NVL(s.SUBPROCESS_CODE,'') SUBPROCESS_CODE,
		NVL(s.SUBPROCESS_NAME,'') SUBPROCESS_NAME,
		NVL(s.DISPLAY_CODE,'') DISPLAY_CODE,
		NVL(s.DISPLAY_NAME,'') DISPLAY_NAME,
		NVL(s.STATUS,'') STATUS,
		s.EFFECTIVE_DATE,
		s.EXPIRE_DATE,
		s.CREATED_DATE,
		NVL(s.CREATED_BY,'') CREATED_BY,
		s.UPDATED_DATE,
		NVL(s.UPDATED_BY,'') UPDATED_BY,
		p.FISCAL_YEAR
	FROM APP.N_REF_SUBPROCESS s
	JOIN APP.N_REF_PROCESS p
		ON p.PROCESS_ID = s.PROCESS_ID
	WHERE p.FISCAL_YEAR = :1
	AND (s.DELETED_DATE IS NULL OR s.DELETED_DATE > SYSDATE)
	AND UPPER(s.STATUS) in ('ACTIVE', 'INACTIVE')
	AND UPPER(p.STATUS) in ('ACTIVE', 'INACTIVE')
	ORDER BY s.SUBPROCESS_CODE
	`

	subRows, err := oracleDB.Query(subprocessQuery, fiscalYear)
	if err != nil {
		log.Printf("Error querying N_REF_SUBPROCESS: %v", err)
		return c.JSON(fiber.Map{"data": processes})
	}
	defer subRows.Close()

	for subRows.Next() {

		var scan refSubprocessScan

		err := subRows.Scan(
			&scan.SubprocessID,
			&scan.ProcessID,
			&scan.SubprocessCode,
			&scan.SubprocessName,
			&scan.DisplayCode,
			&scan.DisplayName,
			&scan.Status,
			&scan.EffectiveDate,
			&scan.ExpireDate,
			&scan.CreatedDate,
			&scan.CreatedBy,
			&scan.UpdatedDate,
			&scan.UpdatedBy,
			&scan.FiscalYear,
		)

		if err != nil {
			log.Printf("Error scanning subprocess row: %v", err)
			continue
		}

		// Convert scan to struct
		s := RefSubprocess{}
		if scan.SubprocessID.Valid {
			s.SubprocessID = scan.SubprocessID.String
		}
		if scan.ProcessID.Valid {
			s.ProcessID = scan.ProcessID.String
		}
		if scan.SubprocessCode.Valid {
			s.SubprocessCode = scan.SubprocessCode.String
		}
		if scan.SubprocessName.Valid {
			s.SubprocessName = scan.SubprocessName.String
		}
		if scan.DisplayCode.Valid {
			s.DisplayCode = scan.DisplayCode.String
		}
		if scan.DisplayName.Valid {
			s.DisplayName = scan.DisplayName.String
		}
		if scan.Status.Valid {
			s.Status = scan.Status.String
		}
		if scan.CreatedBy.Valid {
			s.CreatedBy = scan.CreatedBy.String
		}
		if scan.UpdatedBy.Valid {
			s.UpdatedBy = scan.UpdatedBy.String
		}
		if scan.FiscalYear.Valid {
			s.FiscalYear = scan.FiscalYear.String
		}
		if scan.EffectiveDate.Valid {
			s.EffectiveDate = &scan.EffectiveDate.Time
		}
		if scan.ExpireDate.Valid {
			s.ExpireDate = &scan.ExpireDate.Time
		}
		if scan.CreatedDate.Valid {
			s.CreatedDate = scan.CreatedDate.Time
		}
		if scan.UpdatedDate.Valid {
			s.UpdatedDate = &scan.UpdatedDate.Time
		}

		if idx, ok := processMap[s.ProcessID]; ok {
			processes[idx].Subprocesses = append(processes[idx].Subprocesses, s)
		}
	}

	return c.JSON(fiber.Map{
		"data": processes,
	})
}

// invalidateProcessMenuCache clears the cached menu after a stage (process /
// sub-process) is created, renamed or removed.
//
// name. Two copies had to be re-synced — APP.MV_PROCESS_MAPPING and
// IAMX.PROCESS_MAPPER's stored names (the latter now read live through
// V_PROCESS_MAPPER_ROLES). The third copy is in-process: buildMenuHierarchy
// caches the whole menu per user, so without this the portal keeps serving the
// old stage name until the entry expires.
//
// A stage name is global, so every user's menu is stale — clear all of it, not
// one user's.
func invalidateProcessMenuCache(what string) {
	cs := getCacheService()
	if cs == nil {
		return
	}
	cs.ClearAll()
	log.Printf("[Cache] Cleared menu cache after %s change", what)
}

// afterRefProcessWrite re-syncs the process/sub-process mapping and drops the
// cached menus, so a stage rename reaches the screens immediately.
//
// The refresh is a procedure call rather than SQL because the two environments
// hold APP.MV_PROCESS_MAPPING differently: on SIT it is a real materialized
// view (DEMAND/COMPLETE), on UAT a plain table fed by a MERGE. Both expose
// APP.PRC_SYNC_MV_PROCESS_MAPPING, so this one call is correct on either.
//
// UAT additionally syncs from triggers on the N_REF tables, which covers direct
// SQL and data migration; SIT cannot, because DBMS_MVIEW.REFRESH commits and a
// trigger that commits raises ORA-04092. Calling it here is what SIT relies on.
//
// 🪤 The call is UNQUALIFIED on purpose. IAMX owns a table literally named APP,
// and PL/SQL resolves the leading identifier against the current schema before
// treating it as a schema name — so `BEGIN APP.PRC_SYNC_MV_PROCESS_MAPPING; END;`
// raises PLS-00302 for the IAMX connection UAT uses, granted or not. A synonym
// IAMX.PRC_SYNC_MV_PROCESS_MAPPING makes the bare name resolve; on SIT the app
// connects as APP and owns the procedure outright. (Plain SQL is unaffected —
// APP.N_REF_SUBPROCESS elsewhere in this file resolves fine.)
func afterRefProcessWrite(db *sql.DB, what string) {
	if _, err := db.Exec(`BEGIN PRC_SYNC_MV_PROCESS_MAPPING; END;`); err != nil {
		log.Printf("Error refreshing APP.MV_PROCESS_MAPPING after %s change: %v", what, err)
	}
	invalidateProcessMenuCache(what)
}

// CreateRefProcessOracle - สร้าง Process ใหม่
// POST /oracle/ref-processes
func CreateRefProcessOracle(c *fiber.Ctx) error {
	var req struct {
		FiscalYear  string `json:"fiscal_year"`
		ProcessCode string `json:"process_code"`
		ProcessName string `json:"process_name"`
		DisplayCode string `json:"display_code"`
		DisplayName string `json:"display_name"`
		ModuleName  string `json:"module_name"`
		Status      string `json:"status"`
		Seq         int    `json:"seq"`
		CreatedBy   string `json:"created_by"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.FiscalYear == "" || req.ProcessCode == "" || req.ProcessName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "fiscal_year, process_code, and process_name are required"})
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `
		INSERT INTO APP.N_REF_PROCESS 
		(PROCESS_ID, FISCAL_YEAR, PROCESS_CODE, PROCESS_NAME, DISPLAY_CODE, DISPLAY_NAME, 
		 MODULE_NAME, STATUS, SEQ, CREATED_DATE, CREATED_BY)
		VALUES (LOWER(REGEXP_REPLACE(RAWTOHEX(SYS_GUID()),'(.{8})(.{4})(.{4})(.{4})(.{12})','\1-\2-\3-\4-\5')), 
		        :1, :2, :3, :4, :5, :6, :7, :8, CURRENT_TIMESTAMP, :9)
		RETURNING PROCESS_ID INTO :10
	`

	var newID string
	_, err := oracleDB.Exec(query, req.FiscalYear, req.ProcessCode, req.ProcessName,
		req.DisplayCode, req.DisplayName, req.ModuleName, req.Status, req.Seq, req.CreatedBy, &newID)
	if err != nil {
		log.Printf("Error creating process: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create process"})
	}

	afterRefProcessWrite(oracleDB, "process")

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":    "Process created successfully",
		"process_id": newID,
	})
}

// CreateRefSubprocessOracle - สร้าง Sub-process ใหม่
// POST /oracle/ref-processes/:processId/sub
func CreateRefSubprocessOracle(c *fiber.Ctx) error {
	processID := c.Params("processId")
	if processID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Process ID is required"})
	}

	var req struct {
		SubprocessCode string `json:"subprocess_code"`
		SubprocessName string `json:"subprocess_name"`
		DisplayCode    string `json:"display_code"`
		DisplayName    string `json:"display_name"`
		Status         string `json:"status"`
		FiscalYear     string `json:"fiscal_year"`
		CreatedBy      string `json:"created_by"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.SubprocessCode == "" || req.SubprocessName == "" || req.FiscalYear == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subprocess_code, subprocess_name, and fiscal_year are required"})
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `
		INSERT INTO APP.N_REF_SUBPROCESS 
		(SUBPROCESS_ID, PROCESS_ID, SUBPROCESS_CODE, SUBPROCESS_NAME, DISPLAY_CODE, DISPLAY_NAME, 
		 STATUS, FISCAL_YEAR, CREATED_DATE, CREATED_BY)
		VALUES (LOWER(REGEXP_REPLACE(RAWTOHEX(SYS_GUID()),'(.{8})(.{4})(.{4})(.{4})(.{12})','\1-\2-\3-\4-\5')), 
		        :1, :2, :3, :4, :5, :6, :7, CURRENT_TIMESTAMP, :8)
		RETURNING SUBPROCESS_ID INTO :9
	`

	var newID string
	_, err := oracleDB.Exec(query, processID, req.SubprocessCode, req.SubprocessName,
		req.DisplayCode, req.DisplayName, req.Status, req.FiscalYear, req.CreatedBy, &newID)
	if err != nil {
		log.Printf("Error creating subprocess: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create subprocess"})
	}

	afterRefProcessWrite(oracleDB, "subprocess")

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":       "Subprocess created successfully",
		"subprocess_id": newID,
	})
}

// CloneRefProcessesOracle - Clone processes from source year to target year
// POST /oracle/ref-processes/clone
func CloneRefProcessesOracle(c *fiber.Ctx) error {
	var req struct {
		SourceFiscalYear string `json:"source_fiscal_year"`
		TargetFiscalYear string `json:"target_fiscal_year"`
		CreatedBy        string `json:"created_by"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.SourceFiscalYear == "" || req.TargetFiscalYear == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "source_fiscal_year and target_fiscal_year are required"})
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	// Check if target year already has data
	var count int
	checkQuery := `SELECT COUNT(*) FROM APP.N_REF_PROCESS WHERE FISCAL_YEAR = :1 AND DELETED_DATE IS NULL`
	err := oracleDB.QueryRow(checkQuery, req.TargetFiscalYear).Scan(&count)
	if err != nil {
		log.Printf("Error checking target year: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to check target year"})
	}

	if count > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": fmt.Sprintf("Target fiscal year %s already has data", req.TargetFiscalYear),
			"code":  "DUPLICATE",
		})
	}

	// Clone processes
	cloneProcessQuery := `
		INSERT INTO APP.N_REF_PROCESS 
		(PROCESS_ID, FISCAL_YEAR, PROCESS_CODE, PROCESS_NAME, DISPLAY_CODE, DISPLAY_NAME, 
		 MODULE_NAME, STATUS, SEQ, CREATED_DATE, CREATED_BY)
		SELECT LOWER(REGEXP_REPLACE(RAWTOHEX(SYS_GUID()),'(.{8})(.{4})(.{4})(.{4})(.{12})','\1-\2-\3-\4-\5')),
		       :1, PROCESS_CODE, PROCESS_NAME, DISPLAY_CODE, DISPLAY_NAME,
		       MODULE_NAME, STATUS, SEQ, CURRENT_TIMESTAMP, :2
		FROM APP.N_REF_PROCESS
		WHERE FISCAL_YEAR = :3
		  AND DELETED_DATE IS NULL
	`

	_, err = oracleDB.Exec(cloneProcessQuery, req.TargetFiscalYear, req.CreatedBy, req.SourceFiscalYear)
	if err != nil {
		log.Printf("Error cloning processes: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to clone processes"})
	}

	// Build mapping from old process_id to new process_id
	type ProcessMapping struct {
		OldID string
		NewID string
	}

	var mappings []ProcessMapping
	mapQuery := `
		SELECT a.PROCESS_ID as old_id, b.PROCESS_ID as new_id
		FROM APP.N_REF_PROCESS a
		JOIN APP.N_REF_PROCESS b ON a.PROCESS_CODE = b.PROCESS_CODE
		WHERE a.FISCAL_YEAR = :1 AND b.FISCAL_YEAR = :2
		  AND a.DELETED_DATE IS NULL AND b.DELETED_DATE IS NULL
	`
	mapRows, err := oracleDB.Query(mapQuery, req.SourceFiscalYear, req.TargetFiscalYear)
	if err != nil {
		log.Printf("Error building process mapping: %v", err)
	} else {
		defer mapRows.Close()
		for mapRows.Next() {
			var m ProcessMapping
			mapRows.Scan(&m.OldID, &m.NewID)
			mappings = append(mappings, m)
		}
	}

	// Clone subprocesses for each mapping
	for _, m := range mappings {
		cloneSubprocessQuery := `
			INSERT INTO APP.N_REF_SUBPROCESS 
			(SUBPROCESS_ID, PROCESS_ID, SUBPROCESS_CODE, SUBPROCESS_NAME, DISPLAY_CODE, DISPLAY_NAME,
			 STATUS, FISCAL_YEAR, CREATED_DATE, CREATED_BY)
			SELECT LOWER(REGEXP_REPLACE(RAWTOHEX(SYS_GUID()),'(.{8})(.{4})(.{4})(.{4})(.{12})','\1-\2-\3-\4-\5')),
			       :1, SUBPROCESS_CODE, SUBPROCESS_NAME, DISPLAY_CODE, DISPLAY_NAME,
			       STATUS, :2, CURRENT_TIMESTAMP, :3
			FROM APP.N_REF_SUBPROCESS
			WHERE PROCESS_ID = :4
			  AND DELETED_DATE IS NULL
		`
		_, err = oracleDB.Exec(cloneSubprocessQuery, m.NewID, req.TargetFiscalYear, req.CreatedBy, m.OldID)
		if err != nil {
			log.Printf("Error cloning subprocesses for process %s: %v", m.OldID, err)
		}
	}

	return c.JSON(fiber.Map{
		"message":     fmt.Sprintf("Successfully cloned data from %s to %s", req.SourceFiscalYear, req.TargetFiscalYear),
		"source_year": req.SourceFiscalYear,
		"target_year": req.TargetFiscalYear,
	})
}

// DeleteRefProcessOracle - Soft delete process
// DELETE /oracle/ref-processes/:id
func DeleteRefProcessOracle(c *fiber.Ctx) error {
	processID := c.Params("id")
	if processID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Process ID is required"})
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `UPDATE APP.N_REF_PROCESS SET DELETED_DATE = SYSDATE WHERE PROCESS_ID = :1`
	_, err := oracleDB.Exec(query, processID)
	if err != nil {
		log.Printf("Error deleting process: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete process"})
	}

	// Also delete subprocesses
	subQuery := `UPDATE APP.N_REF_SUBPROCESS SET DELETED_DATE = SYSDATE WHERE PROCESS_ID = :1`
	oracleDB.Exec(subQuery, processID)

	afterRefProcessWrite(oracleDB, "process")

	return c.JSON(fiber.Map{"message": "Process deleted successfully"})
}

// DeleteRefSubprocessOracle - Soft delete subprocess
// DELETE /oracle/ref-subprocesses/:id
func DeleteRefSubprocessOracle(c *fiber.Ctx) error {
	subprocessID := c.Params("id")
	if subprocessID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Subprocess ID is required"})
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `UPDATE APP.N_REF_SUBPROCESS SET DELETED_DATE = SYSDATE WHERE SUBPROCESS_ID = :1`
	_, err := oracleDB.Exec(query, subprocessID)
	if err != nil {
		log.Printf("Error deleting subprocess: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete subprocess"})
	}

	afterRefProcessWrite(oracleDB, "subprocess")

	return c.JSON(fiber.Map{"message": "Subprocess deleted successfully"})
}

// UpdateRefProcessOracle - แก้ไข Process
// PUT /oracle/ref-processes/:id
func UpdateRefProcessOracle(c *fiber.Ctx) error {
	processID := c.Params("id")
	if processID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Process ID is required"})
	}

	var req struct {
		ProcessCode string `json:"process_code"`
		ProcessName string `json:"process_name"`
		DisplayCode string `json:"display_code"`
		DisplayName string `json:"display_name"`
		ModuleName  string `json:"module_name"`
		Status      string `json:"status"`
		Seq         int    `json:"seq"`
		UpdatedBy   string `json:"updated_by"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.ProcessCode == "" || req.ProcessName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "process_code and process_name are required"})
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `
		UPDATE APP.N_REF_PROCESS
		SET PROCESS_CODE = :1, PROCESS_NAME = :2, DISPLAY_CODE = :3, DISPLAY_NAME = :4,
		    MODULE_NAME = :5, STATUS = :6, SEQ = :7,
		    UPDATED_DATE = CURRENT_TIMESTAMP, UPDATED_BY = :8
		WHERE PROCESS_ID = :9 AND DELETED_DATE IS NULL
	`

	result, err := oracleDB.Exec(query, req.ProcessCode, req.ProcessName, req.DisplayCode, req.DisplayName,
		req.ModuleName, req.Status, req.Seq, req.UpdatedBy, processID)
	if err != nil {
		log.Printf("Error updating process: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update process"})
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Process not found"})
	}

	afterRefProcessWrite(oracleDB, "process")

	return c.JSON(fiber.Map{"message": "Process updated successfully"})
}

// UpdateRefSubprocessOracle - แก้ไข Sub-process
// PUT /oracle/ref-subprocesses/:id
func UpdateRefSubprocessOracle(c *fiber.Ctx) error {
	subprocessID := c.Params("id")
	if subprocessID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Subprocess ID is required"})
	}

	var req struct {
		SubprocessCode string `json:"subprocess_code"`
		SubprocessName string `json:"subprocess_name"`
		DisplayCode    string `json:"display_code"`
		DisplayName    string `json:"display_name"`
		Status         string `json:"status"`
		UpdatedBy      string `json:"updated_by"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.SubprocessCode == "" || req.SubprocessName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subprocess_code and subprocess_name are required"})
	}

	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	query := `
		UPDATE APP.N_REF_SUBPROCESS
		SET SUBPROCESS_CODE = :1, SUBPROCESS_NAME = :2, DISPLAY_CODE = :3, DISPLAY_NAME = :4,
		    STATUS = :5, UPDATED_DATE = CURRENT_TIMESTAMP, UPDATED_BY = :6
		WHERE SUBPROCESS_ID = :7 AND DELETED_DATE IS NULL
	`

	result, err := oracleDB.Exec(query, req.SubprocessCode, req.SubprocessName, req.DisplayCode, req.DisplayName,
		req.Status, req.UpdatedBy, subprocessID)
	if err != nil {
		log.Printf("Error updating subprocess: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update subprocess"})
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Subprocess not found"})
	}

	afterRefProcessWrite(oracleDB, "subprocess")

	return c.JSON(fiber.Map{"message": "Subprocess updated successfully"})
}
