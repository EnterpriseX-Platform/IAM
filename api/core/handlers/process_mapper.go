package handlers

import (
	"api/core"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ProcessMapper - ตารางเชื่อมโยง Process จาก Oracle กับ Module/Object
type ProcessMapper struct {
	ID               int64     `json:"id"`
	ModuleID         *int64    `json:"module_id"`
	ObjectID         *int64    `json:"object_id"`
	FiscalYear       int       `json:"fiscal_year"`
	ProcessID        string    `json:"process_id"`
	SubProcessID     string    `json:"subprocess_id"`
	DisplayComponent string    `json:"display_component"`
	ProcessCode      string    `json:"process_code"`
	SubProcessCode   string    `json:"subprocess_code"`
	DisplayText      string    `json:"display_text"`
	URL              string    `json:"url"`
	AllowedRoleIDs   []string  `json:"allowed_role_ids"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// CreateProcessMapperRequest - Request สำหรับสร้าง mapping
type CreateProcessMapperRequest struct {
	ModuleID         *int64   `json:"module_id"`
	ObjectID         *int64   `json:"object_id"`
	FiscalYear       int      `json:"fiscal_year" validate:"required"`
	ProcessID        string   `json:"process_id"`
	SubProcessID     string   `json:"subprocess_id"`
	DisplayComponent string   `json:"display_component" validate:"required"`
	ProcessCode      string   `json:"process_code" validate:"required"`
	SubProcessCode   string   `json:"subprocess_code" validate:"required"`
	DisplayText      string   `json:"display_text" validate:"required"`
	URL              string   `json:"url"`
	AllowedRoleIDs   []string `json:"allowed_role_ids"`
}

// GetProcessMappers - ดึง Process mappings ตาม module_id หรือ object_id และ fiscal_year
// GET /directory/process-mappers?module_id=xxx&object_id=xxx&fiscal_year=2569
func GetProcessMappers(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	moduleID := c.Query("module_id")
	objectID := c.Query("object_id")
	fiscalYear := c.Query("fiscal_year")

	// Default to current Thai year if not provided
	if fiscalYear == "" {
		fiscalYear = fmt.Sprintf("%d", time.Now().Year()+543)
	}

	var query string
	var rows *sql.Rows
	var err error

	baseQuery := `
		SELECT id, module_id, object_id, fiscal_year, process_id, subprocess_id, display_component, process_code, subprocess_code, display_text, url, allowed_role_ids, created_at, updated_at
		FROM V_PROCESS_MAPPER_ROLES
		WHERE (fiscal_year = :1 OR fiscal_year = 0)
	`

	if moduleID != "" {
		query = baseQuery + ` AND module_id = :2 ORDER BY display_component, process_code, subprocess_code`
		rows, err = db.Query(query, fiscalYear, moduleID)
	} else if objectID != "" {
		query = baseQuery + ` AND object_id = :2 ORDER BY display_component, process_code, subprocess_code`
		rows, err = db.Query(query, fiscalYear, objectID)
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Either module_id or object_id is required",
		})
	}

	if err != nil {
		log.Printf("Error querying process mappers: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch process mappers",
		})
	}
	defer rows.Close()

	var mappers []ProcessMapper
	for rows.Next() {
		var m ProcessMapper
		var moduleID, objectID sql.NullInt64
		var processID, subProcessID, displayComponent, processCode, subProcessCode, displayText, urlVal, allowedRoleIDs sql.NullString

		err := rows.Scan(
			&m.ID,
			&moduleID,
			&objectID,
			&m.FiscalYear,
			&processID,
			&subProcessID,
			&displayComponent,
			&processCode,
			&subProcessCode,
			&displayText,
			&urlVal,
			&allowedRoleIDs,
			&m.CreatedAt,
			&m.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning process mapper row: %v", err)
			continue
		}

		if moduleID.Valid {
			m.ModuleID = &moduleID.Int64
		}
		if objectID.Valid {
			m.ObjectID = &objectID.Int64
		}
		m.ProcessID = processID.String
		m.SubProcessID = subProcessID.String
		m.DisplayComponent = displayComponent.String
		m.ProcessCode = processCode.String
		m.SubProcessCode = subProcessCode.String
		m.DisplayText = displayText.String
		m.URL = urlVal.String
		m.AllowedRoleIDs = []string{}
		if allowedRoleIDs.Valid && allowedRoleIDs.String != "" {
			m.AllowedRoleIDs = strings.Split(allowedRoleIDs.String, ",")
		}

		mappers = append(mappers, m)
	}

	if mappers == nil {
		mappers = []ProcessMapper{}
	}

	return c.JSON(fiber.Map{
		"data": mappers,
	})
}

// CreateProcessMapper - สร้าง Process mapping ใหม่
// POST /directory/process-mappers
func CreateProcessMapper(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	var req CreateProcessMapperRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validation
	if req.FiscalYear == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "fiscal_year is required",
		})
	}
	if req.DisplayComponent == "" || req.ProcessCode == "" || req.SubProcessCode == "" || req.DisplayText == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "display_component, process_code, subprocess_code, and display_text are required",
		})
	}

	// ตรวจสอบว่ามี module_id หรือ object_id อย่างน้อยหนึ่งอย่าง
	if req.ModuleID == nil && req.ObjectID == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Either module_id or object_id is required",
		})
	}

	// ตรวจสอบ duplicate
	var existingID int64
	checkQuery := `
		SELECT id FROM process_mapper
		WHERE fiscal_year = :1 AND process_code = :2 AND subprocess_code = :3
		AND (
			(module_id IS NOT NULL AND module_id = :4) OR
			(object_id IS NOT NULL AND object_id = :5)
		)
	`
	err := db.QueryRow(checkQuery, req.FiscalYear, req.ProcessCode, req.SubProcessCode, req.ModuleID, req.ObjectID).Scan(&existingID)
	if err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "This process/sub-process is already mapped to this module/object for this fiscal year",
		})
	}

	query := `
		INSERT INTO process_mapper
		(module_id, object_id, fiscal_year, process_id, subprocess_id, display_component, process_code, subprocess_code, display_text, url, created_at, updated_at)
		VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9, :10, SYSTIMESTAMP, SYSTIMESTAMP)
		RETURNING id INTO :11
	`

	var newID int64
	_, err = db.Exec(query, req.ModuleID, req.ObjectID, req.FiscalYear, req.ProcessID, req.SubProcessID, req.DisplayComponent, req.ProcessCode, req.SubProcessCode, req.DisplayText, req.URL, &newID)
	if err != nil {
		log.Printf("Error creating process mapper: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create process mapper",
		})
	}

	if err := replaceProcessMapperRoles(db, newID, req.AllowedRoleIDs); err != nil {
		log.Printf("Error setting process mapper roles: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Process mapper created but failed to set allowed roles",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Process mapper created successfully",
		"id":      newID,
	})
}

// replaceProcessMapperRoles resets the set of roles allowed to see a process
// mapper. An empty roleIDs means unrestricted (visible to everyone).
func replaceProcessMapperRoles(db *sql.DB, processMapperID int64, roleIDs []string) error {
	if _, err := db.Exec(`DELETE FROM process_mapper_role WHERE process_mapper_id = :1`, processMapperID); err != nil {
		return err
	}
	for _, roleID := range roleIDs {
		if roleID == "" {
			continue
		}
		if _, err := db.Exec(`INSERT INTO process_mapper_role (process_mapper_id, role_id) VALUES (:1, :2)`, processMapperID, roleID); err != nil {
			return err
		}
	}
	return nil
}

// CreateProcessMapperBatch - สร้างหลาย mappings พร้อมกัน (สำหรับ multi-select)
// POST /directory/process-mappers/batch
func CreateProcessMapperBatch(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	// Get Oracle DB for fetching process names
	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	var req struct {
		ModuleID   *int64                       `json:"module_id"`
		ObjectID   *int64                       `json:"object_id"`
		FiscalYear int                          `json:"fiscal_year" validate:"required"`
		Items      []CreateProcessMapperRequest `json:"items" validate:"required,min=1"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.ModuleID == nil && req.ObjectID == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Either module_id or object_id is required",
		})
	}

	if len(req.Items) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "At least one item is required",
		})
	}

	// If object_id is provided but module_id is not, look up the module_id from object
	moduleID := req.ModuleID
	if req.ObjectID != nil && req.ModuleID == nil {
		var objModuleID int64
		err := db.QueryRow(`SELECT module_id FROM object WHERE id = :1`, *req.ObjectID).Scan(&objModuleID)
		if err != nil {
			log.Printf("Error looking up module_id for object %d: %v", *req.ObjectID, err)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Failed to find module for the specified object",
			})
		}
		moduleID = &objModuleID
	}

	// Pre-fetch process names from MV_PROCESS_MAPPING for all items
	processNames := make(map[string]struct {
		ProcessName    string
		SubProcessName string
	})

	for _, item := range req.Items {
		key := item.ProcessID + "|" + item.SubProcessID
		if _, exists := processNames[key]; !exists {
			var pName, spName sql.NullString
			err := oracleDB.QueryRow(`
				SELECT DISPLAY_PROCESS_NAME, DISPLAY_SUBPROCESS_NAME 
				FROM APP.MV_PROCESS_MAPPING 
				WHERE PROCESS_ID = :1 AND SUBPROCESS_ID = :2 AND FISCAL_YEAR = :3
				FETCH FIRST 1 ROWS ONLY
			`, item.ProcessID, item.SubProcessID, req.FiscalYear).Scan(&pName, &spName)

			if err != nil {
				log.Printf("Warning: Could not fetch process names for %s/%s: %v", item.ProcessID, item.SubProcessID, err)
			}

			processName := pName.String
			if processName == "" {
				processName = item.ProcessCode
			}
			subProcessName := spName.String
			if subProcessName == "" {
				subProcessName = item.SubProcessCode
			}
			processNames[key] = struct {
				ProcessName    string
				SubProcessName string
			}{
				ProcessName:    processName,
				SubProcessName: subProcessName,
			}
		}
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to start transaction",
		})
	}
	defer tx.Rollback()

	// Upsert on the unique index: uq_process_mapper (fiscal_year, process_code, subprocess_code, COALESCE(module_id, 0), COALESCE(object_id, 0)).
	// WHEN MATCHED updates the editable columns — without it, re-saving an existing
	query := `
		MERGE INTO process_mapper t
		USING (SELECT
		         :1  AS module_id,        :2  AS object_id,
		         :3  AS fiscal_year,
		         :4  AS process_id,       :5  AS subprocess_id,
		         :6  AS process_name,     :7  AS subprocess_name,
		         :8  AS display_component,
		         :9  AS process_code,     :10 AS subprocess_code,
		         :11 AS display_text,     :12 AS url
		       FROM dual) src
		ON (
		         t.fiscal_year       = src.fiscal_year
		     AND t.process_code      = src.process_code
		     AND t.subprocess_code   = src.subprocess_code
		     AND NVL(t.module_id, 0) = NVL(src.module_id, 0)
		     AND NVL(t.object_id, 0) = NVL(src.object_id, 0)
		)
		WHEN MATCHED THEN UPDATE SET
		     t.process_id        = src.process_id,
		     t.subprocess_id     = src.subprocess_id,
		     t.process_name      = src.process_name,
		     t.subprocess_name   = src.subprocess_name,
		     t.display_component = src.display_component,
		     t.display_text      = src.display_text,
		     t.url               = src.url,
		     t.updated_at        = SYSTIMESTAMP
		WHEN NOT MATCHED THEN INSERT
		     (module_id, object_id, fiscal_year, process_id, subprocess_id,
		      process_name, subprocess_name, display_component,
		      process_code, subprocess_code, display_text, url,
		      created_at, updated_at)
		VALUES
		     (src.module_id, src.object_id, src.fiscal_year, src.process_id, src.subprocess_id,
		      src.process_name, src.subprocess_name, src.display_component,
		      src.process_code, src.subprocess_code, src.display_text, src.url,
		      SYSTIMESTAMP, SYSTIMESTAMP)
	`

	roleQuery := `
		SELECT id FROM process_mapper
		WHERE fiscal_year = :1 AND process_code = :2 AND subprocess_code = :3
		  AND NVL(module_id, 0) = NVL(:4, 0) AND NVL(object_id, 0) = NVL(:5, 0)
	`

	createdCount := 0
	updatedCount := 0
	for _, item := range req.Items {
		key := item.ProcessID + "|" + item.SubProcessID
		names := processNames[key]

		// Decide created-vs-updated before the MERGE: MERGE reports rows-affected
		// for both branches, so it cannot tell them apart on its own.
		var existingID int64
		existed := tx.QueryRow(roleQuery, req.FiscalYear, item.ProcessCode, item.SubProcessCode, moduleID, req.ObjectID).Scan(&existingID) == nil

		if _, err := tx.Exec(query, moduleID, req.ObjectID, req.FiscalYear, item.ProcessID, item.SubProcessID, names.ProcessName, names.SubProcessName, item.DisplayComponent, item.ProcessCode, item.SubProcessCode, item.DisplayText, item.URL); err != nil {
			log.Printf("Error saving process mapper for %s/%s: %v", item.ProcessCode, item.SubProcessCode, err)
			continue
		}
		if existed {
			updatedCount++
		} else {
			createdCount++
		}

		var mapperID int64
		if err := tx.QueryRow(roleQuery, req.FiscalYear, item.ProcessCode, item.SubProcessCode, moduleID, req.ObjectID).Scan(&mapperID); err != nil {
			log.Printf("Error looking up process mapper id for %s/%s: %v", item.ProcessCode, item.SubProcessCode, err)
			continue
		}
		if _, err := tx.Exec(`DELETE FROM process_mapper_role WHERE process_mapper_id = :1`, mapperID); err != nil {
			log.Printf("Error clearing process mapper roles for id %d: %v", mapperID, err)
			continue
		}
		for _, roleID := range item.AllowedRoleIDs {
			if roleID == "" {
				continue
			}
			if _, err := tx.Exec(`INSERT INTO process_mapper_role (process_mapper_id, role_id) VALUES (:1, :2)`, mapperID, roleID); err != nil {
				log.Printf("Error inserting process mapper role (mapper=%d, role=%s): %v", mapperID, roleID, err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to commit transaction",
		})
	}

	msg := fmt.Sprintf("Created %d process mapper(s)", createdCount)
	if updatedCount > 0 {
		msg += fmt.Sprintf(", updated %d existing", updatedCount)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": msg,
		"count":   createdCount,
		"updated": updatedCount,
	})
}

// DeleteProcessMapper - ลบ Process mapping
// DELETE /directory/process-mappers/:id
func DeleteProcessMapper(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "ID is required",
		})
	}

	query := `DELETE FROM process_mapper WHERE id = :1`
	_, err := db.Exec(query, id)
	if err != nil {
		log.Printf("Error deleting process mapper: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete process mapper",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Process mapper deleted successfully",
	})
}

// DeleteProcessMapperByCodes - ลบ Process mapping โดยใช้ codes (สำหรับ remove from UI)
// DELETE /directory/process-mappers?module_id=xxx&process_code=xxx&subprocess_code=xxx
func DeleteProcessMapperByCodes(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	moduleID := c.Query("module_id")
	objectID := c.Query("object_id")
	processCode := c.Query("process_code")
	subProcessCode := c.Query("subprocess_code")

	if processCode == "" || subProcessCode == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "process_code and subprocess_code are required",
		})
	}

	var query string
	var err error

	if moduleID != "" {
		query = `DELETE FROM process_mapper WHERE module_id = :1 AND process_code = :2 AND subprocess_code = :3`
		_, err = db.Exec(query, moduleID, processCode, subProcessCode)
	} else if objectID != "" {
		query = `DELETE FROM process_mapper WHERE object_id = :1 AND process_code = :2 AND subprocess_code = :3`
		_, err = db.Exec(query, objectID, processCode, subProcessCode)
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Either module_id or object_id is required",
		})
	}

	if err != nil {
		log.Printf("Error deleting process mapper: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete process mapper",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Process mapper deleted successfully",
	})
}
