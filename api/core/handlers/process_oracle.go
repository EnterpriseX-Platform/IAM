package handlers

import (
	"api/core"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
)

// OracleProcess - ข้อมูล Process/Sub-process จาก Oracle
type OracleProcess struct {
	ProcessID        string `json:"process_id"`
	SubProcessID     string `json:"subprocess_id"`
	DisplayText      string `json:"display_text"`
	ProcessCode      string `json:"process_code"`
	SubProcessCode   string `json:"subprocess_code"`
	DisplayComponent string `json:"display_component"`
}

// GetOracleProcesses - ดึง Process/Sub-process จาก Oracle ตามปีงบประมาณไทย
// GET /oracle/processes?fiscal_year=2569
func GetOracleProcesses(c *fiber.Ctx) error {
	// ดึงปีงบประมาณจาก query param (ค่าเริ่มต้นคือปีปัจจุบัน + 543)
	fiscalYear := c.Query("fiscal_year")
	if fiscalYear == "" {
		// คำนวณปีไทยจากปีปัจจุบัน
		fiscalYear = fmt.Sprintf("%d", time.Now().Year()+543)
	}

	// ตรวจสอบ Oracle connection
	oracleDB := core.GetDB()
	if oracleDB == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oracle database not connected",
		})
	}

	query := `
		SELECT DISTINCT 
			PROCESS_ID,
			SUBPROCESS_ID,
			DISPLAY_COMPONENT || ': ' || DISPLAY_PROCESS_NAME || ' ' || DISPLAY_SUBPROCESS_NAME AS DISPLAY_TEXT, 
			PROCESS_CODE, 
			SUBPROCESS_CODE,
			DISPLAY_COMPONENT
		FROM APP.MV_PROCESS_MAPPING
		WHERE FISCAL_YEAR = :1
		ORDER BY DISPLAY_COMPONENT ASC
	`

	rows, err := oracleDB.Query(query, fiscalYear)
	if err != nil {
		log.Printf("Error querying Oracle processes: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch processes from Oracle",
			"details": err.Error(),
		})
	}
	defer rows.Close()

	var processes []OracleProcess
	for rows.Next() {
		var proc OracleProcess
		var processID, subProcessID, displayText, processCode, subProcessCode, displayComponent sql.NullString

		err := rows.Scan(&processID, &subProcessID, &displayText, &processCode, &subProcessCode, &displayComponent)
		if err != nil {
			log.Printf("Error scanning Oracle process row: %v", err)
			continue
		}

		proc.ProcessID = processID.String
		proc.SubProcessID = subProcessID.String
		proc.DisplayText = displayText.String
		proc.ProcessCode = processCode.String
		proc.SubProcessCode = subProcessCode.String
		proc.DisplayComponent = displayComponent.String

		processes = append(processes, proc)
	}

	return c.JSON(fiber.Map{
		"data": processes,
	})
}

// GetCurrentThaiFiscalYear - คำนวณปีงบประมาณไทยปัจจุบัน
// GET /oracle/processes/fiscal-year
func GetCurrentThaiFiscalYear(c *fiber.Ctx) error {
	currentYear := time.Now().Year() + 543
	return c.JSON(fiber.Map{
		"fiscal_year": fmt.Sprintf("%d", currentYear),
	})
}
