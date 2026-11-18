package handlers

import (
	"api/core"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"github.com/gofiber/fiber/v2"
)

// UpsertUserOutputAccess - POST /admin/user-custom-data-accesses/upsert-output
// Replaces APP.USER_PERMISSION_SPECIAL by storing selected OUTPUT codes
// directly into IAMX.USER_CUSTOM_DATA_ACCESS + USER_CUSTOM_DATA_ACCESS_PERMISSION.
// scope_filter holds a JSON array of OUTPUT_CODEs for the given agency_path.
func UpsertUserOutputAccess(c *fiber.Ctx) error {
	var req struct {
		UserID      string   `json:"user_id"`
		AgencyPath  string   `json:"agency_path"`
		OutputCodes []string `json:"output_codes"`
		Permissions []string `json:"permissions"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "Invalid request body",
		})
	}
	if req.UserID == "" || req.AgencyPath == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "message": "user_id and agency_path are required",
		})
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	scopeFilter, _ := json.Marshal(req.OutputCodes)
	perms := req.Permissions
	if len(perms) == 0 {
		perms = []string{"VIEW"}
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}
	defer tx.Rollback()

	// 1. Find existing row
	var existingID int
	err = tx.QueryRow(`
		SELECT id FROM IAMX.USER_CUSTOM_DATA_ACCESS
		WHERE user_id = :1 AND agency_path = :2 AND ROWNUM = 1`,
		req.UserID, req.AgencyPath,
	).Scan(&existingID)

	var ucdaID int
	if err == sql.ErrNoRows {
		_, err = tx.Exec(`
			INSERT INTO IAMX.USER_CUSTOM_DATA_ACCESS
			(user_id, agency_path, type, scope_filter, is_active, effective_date, created_at, updated_at)
			VALUES (:1, :2, 'OUTPUT', :3, 1, TRUNC(SYSDATE), SYSTIMESTAMP, SYSTIMESTAMP)
			RETURNING id INTO :out`,
			req.UserID, req.AgencyPath, string(scopeFilter),
			sql.Named("out", sql.Out{Dest: &ucdaID}),
		)
		if err != nil {
			log.Printf("UpsertUserOutputAccess insert error: %v", err)
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
	} else if err != nil {
		log.Printf("UpsertUserOutputAccess select error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	} else {
		ucdaID = existingID
		_, err = tx.Exec(`
			UPDATE IAMX.USER_CUSTOM_DATA_ACCESS
			SET scope_filter = :1, type = 'OUTPUT', updated_at = SYSTIMESTAMP
			WHERE id = :2`,
			string(scopeFilter), ucdaID,
		)
		if err != nil {
			log.Printf("UpsertUserOutputAccess update error: %v", err)
			return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
		}
		_, _ = tx.Exec(`DELETE FROM IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION WHERE user_custom_data_access_id = :1`, ucdaID)
	}

	// 2. Insert permissions
	permJSON, _ := json.Marshal(perms)
	_, err = tx.Exec(`
		INSERT INTO IAMX.USER_CUSTOM_DATA_ACCESS_PERMISSION
		(user_custom_data_access_id, permission, created_at, updated_at)
		VALUES (:1, :2, SYSTIMESTAMP, SYSTIMESTAMP)`,
		ucdaID, string(permJSON),
	)
	if err != nil {
		log.Printf("UpsertUserOutputAccess permission error: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	invalidateUserCacheByID(fmt.Sprint(req.UserID))

	return c.JSON(fiber.Map{
		"success": true,
		"data":    fiber.Map{"id": ucdaID, "scope_filter": string(scopeFilter)},
	})
}
