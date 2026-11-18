package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// GET /ref-processes?fiscal_year=2569
func GetRefProcesses(c *fiber.Ctx) error {
	db := core.GetDB()

	fy := strings.TrimSpace(c.Query("fiscal_year"))
	if fy == "" {
		fy = "2569" // default
	}

	query := `
		SELECT
			rp.PROCESS_ID,
			rp.DISPLAY_CODE,
			rp.DISPLAY_NAME,
			rs.SUBPROCESS_ID,
			rs.SUBPROCESS_CODE,
			rs.SUBPROCESS_NAME
		FROM app.N_REF_PROCESS rp
		LEFT JOIN app.N_REF_SUBPROCESS rs
			ON rp.PROCESS_ID = rs.PROCESS_ID
		WHERE rp.FISCAL_YEAR = :1
		ORDER BY
			rp.DISPLAY_CODE,
			rp.PROCESS_ID,
			rs.SUBPROCESS_CODE,
			rs.SUBPROCESS_ID
	`

	rows, err := db.Query(query, fy)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch ref processes",
			"error":   err.Error(),
		})
	}
	defer rows.Close()

	// ✅ ใช้ models.*
	processMap := map[string]*models.ProcessWithSubprocess{}
	orderedKeys := make([]string, 0, 64)

	for rows.Next() {
		var (
			pid sql.NullString
			pcd sql.NullString
			pnm sql.NullString
			sid sql.NullString
			scd sql.NullString
			snm sql.NullString
		)

		if err := rows.Scan(&pid, &pcd, &pnm, &sid, &scd, &snm); err != nil {
			continue
		}
		if !pid.Valid {
			continue
		}

		key := pid.String

		if _, ok := processMap[key]; !ok {
			node := &models.ProcessWithSubprocess{
				Subprocesses: []models.SubprocessItem{},
			}
			if pid.Valid {
				node.ProcessID = &pid.String
			}
			if pcd.Valid {
				node.DisplayCode = &pcd.String
			}
			if pnm.Valid {
				node.DisplayName = &pnm.String
			}

			processMap[key] = node
			orderedKeys = append(orderedKeys, key)
		}

		// append subprocess ถ้ามีจริง
		if sid.Valid || scd.Valid || snm.Valid {
			item := models.SubprocessItem{}
			if sid.Valid {
				item.SubprocessID = &sid.String
			}
			if scd.Valid {
				item.SubprocessCode = &scd.String
			}
			if snm.Valid {
				item.SubprocessName = &snm.String
			}
			processMap[key].Subprocesses = append(processMap[key].Subprocesses, item)
		}
	}

	if err := rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Row iteration error",
			"error":   err.Error(),
		})
	}

	// preserve order
	out := make([]models.ProcessWithSubprocess, 0, len(orderedKeys))
	for _, k := range orderedKeys {
		out = append(out, *processMap[k])
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    out,
		"message": "Retrieved processes and subprocesses",
	})
}

// CloneRefProcesses - Clone data from source fiscal year to target fiscal year
// POST /api/ref-processes/clone
func CloneRefProcesses(c *fiber.Ctx) error {
	type CloneRequest struct {
		SourceFiscalYear string `json:"sourceFiscalYear"`
		TargetFiscalYear string `json:"targetFiscalYear"`
	}

	var req CloneRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
			"error":   err.Error(),
		})
	}

	sourceFY := strings.TrimSpace(req.SourceFiscalYear)
	targetFY := strings.TrimSpace(req.TargetFiscalYear)

	if sourceFY == "" || targetFY == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "sourceFiscalYear and targetFiscalYear are required",
		})
	}

	if sourceFY == targetFY {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Source and target fiscal years must be different",
		})
	}

	db := core.GetDB()

	// ตรวจสอบว่ามีข้อมูลในปีปลายทางอยู่แล้วหรือไม่
	checkQuery := `SELECT COUNT(*) FROM app.N_REF_PROCESS WHERE FISCAL_YEAR = :1`
	var count int
	err := db.QueryRow(checkQuery, targetFY).Scan(&count)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to check existing data",
			"error":   err.Error(),
		})
	}

	if count > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("ปี %s มีข้อมูลอยู่แล้ว", targetFY),
			"code":    "DUPLICATE",
		})
	}

	// เริ่ม transaction
	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to start transaction",
			"error":   err.Error(),
		})
	}
	defer tx.Rollback()

	// สร้าง temporary table เพื่อเก็บ mapping ระหว่าง old และ new PROCESS_ID
	createTempTableQuery := `
		CREATE GLOBAL TEMPORARY TABLE TEMP_PROCESS_MAPPING (
			OLD_PROCESS_ID VARCHAR2(100),
			NEW_PROCESS_ID VARCHAR2(100),
			DISPLAY_CODE VARCHAR2(100),
			DISPLAY_NAME VARCHAR2(500)
		) ON COMMIT PRESERVE ROWS
	`
	_, _ = tx.Exec(createTempTableQuery) // Ignore error if table already exists

	// Clear temp table
	_, _ = tx.Exec("DELETE FROM TEMP_PROCESS_MAPPING")

	// Insert mapping ด้วย PROCESS_ID ใหม่
	insertMappingQuery := `
		INSERT INTO TEMP_PROCESS_MAPPING (OLD_PROCESS_ID, NEW_PROCESS_ID, DISPLAY_CODE, DISPLAY_NAME)
		SELECT
			PROCESS_ID AS OLD_PROCESS_ID,
			SYS_GUID() AS NEW_PROCESS_ID,
			DISPLAY_CODE,
			DISPLAY_NAME
		FROM app.N_REF_PROCESS
		WHERE FISCAL_YEAR = :1
	`
	_, err = tx.Exec(insertMappingQuery, sourceFY)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create process mapping",
			"error":   err.Error(),
		})
	}

	// Clone N_REF_PROCESS ด้วย NEW_PROCESS_ID
	cloneProcessQuery := `
		INSERT INTO app.N_REF_PROCESS (
			PROCESS_ID,
			DISPLAY_CODE,
			DISPLAY_NAME,
			FISCAL_YEAR
		)
		SELECT
			NEW_PROCESS_ID,
			DISPLAY_CODE,
			DISPLAY_NAME,
			:1 AS FISCAL_YEAR
		FROM TEMP_PROCESS_MAPPING
	`
	_, err = tx.Exec(cloneProcessQuery, targetFY)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to clone processes",
			"error":   err.Error(),
		})
	}

	// Clone N_REF_SUBPROCESS โดยใช้ NEW_PROCESS_ID จาก mapping
	cloneSubprocessQuery := `
		INSERT INTO app.N_REF_SUBPROCESS (
			SUBPROCESS_ID,
			PROCESS_ID,
			SUBPROCESS_CODE,
			SUBPROCESS_NAME,
			STATUS,
			USER_ON,
			SYSTEM_FLAG
		)
		SELECT
			SYS_GUID() AS SUBPROCESS_ID,
			m.NEW_PROCESS_ID,
			rs.SUBPROCESS_CODE,
			rs.SUBPROCESS_NAME,
			rs.STATUS,
			rs.USER_ON,
			rs.SYSTEM_FLAG
		FROM app.N_REF_SUBPROCESS rs
		INNER JOIN TEMP_PROCESS_MAPPING m
			ON rs.PROCESS_ID = m.OLD_PROCESS_ID
	`
	_, err = tx.Exec(cloneSubprocessQuery)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to clone subprocesses",
			"error":   err.Error(),
		})
	}

	// Clean up temp table
	_, _ = tx.Exec("DELETE FROM TEMP_PROCESS_MAPPING")

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to commit transaction",
			"error":   err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Clone ข้อมูลจากปี %s ไปยังปี %s สำเร็จ", sourceFY, targetFY),
	})
}

// UpdateSubprocessOrder - อัพเดทลำดับของ subprocess หลัง drag and drop
// PUT /api/ref-processes/:processId/subprocess-order
func UpdateSubprocessOrder(c *fiber.Ctx) error {
	processId := c.Params("processId")
	if processId == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "processId is required",
		})
	}

	type SubprocessOrderItem struct {
		SubprocessID   string `json:"subprocessId"`
		SubprocessCode string `json:"subprocessCode"`
	}

	type OrderRequest struct {
		Subprocesses []SubprocessOrderItem `json:"subprocesses"`
	}

	var req OrderRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
			"error":   err.Error(),
		})
	}

	if len(req.Subprocesses) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "subprocesses array is required",
		})
	}

	db := core.GetDB()

	// เริ่ม transaction
	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to start transaction",
			"error":   err.Error(),
		})
	}
	defer tx.Rollback()

	// อัพเดทลำดับ subprocess ทีละตัว
	updateQuery := `
		UPDATE app.N_REF_SUBPROCESS
		SET SUBPROCESS_CODE = :1
		WHERE SUBPROCESS_ID = :2
		AND PROCESS_ID = :3
	`

	for _, sub := range req.Subprocesses {
		_, err := tx.Exec(updateQuery, sub.SubprocessCode, sub.SubprocessID, processId)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to update subprocess order",
				"error":   err.Error(),
			})
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to commit transaction",
			"error":   err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "อัพเดทลำดับ subprocess สำเร็จ",
	})
}
