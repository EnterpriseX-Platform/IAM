package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"
	"log"

	"github.com/gofiber/fiber/v2"
)

// GET /directory/applications  (flat list, optional ?domain_id= filter)
// Replaces V1 GET /iamx/api/apps which returned a flat list of all apps.
func GetAllApplications(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	domainID := c.Query("domain_id")

	query := `SELECT id, domain_id, code, name, description, sort_order, is_active, icon, created_by, updated_by, created_at, updated_at
			  FROM application
			  WHERE is_active = 1`
	args := []interface{}{}
	if domainID != "" {
		query += ` AND domain_id = :1`
		args = append(args, domainID)
	}
	query += ` ORDER BY domain_id, sort_order, id`

	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("GetAllApplications error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch applications",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	applications := []models.ApplicationResponse{}
	for rows.Next() {
		var a models.Application
		if err := rows.Scan(&a.ID, &a.DomainID, &a.Code, &a.Name, &a.Description, &a.SortOrder, &a.IsActive, &a.Icon, &a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt); err != nil {
			continue
		}
		applications = append(applications, a.ToResponse())
	}
	return c.JSON(fiber.Map{"data": applications})
}

// GET /directory/applications/:id   (single)
func GetApplicationByID(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}
	id := c.Params("id")

	var a models.Application
	err := db.QueryRow(`
		SELECT id, domain_id, code, name, description, sort_order, is_active, icon, created_by, updated_by, created_at, updated_at
		FROM application
		WHERE id = :1
	`, id).Scan(&a.ID, &a.DomainID, &a.Code, &a.Name, &a.Description, &a.SortOrder, &a.IsActive, &a.Icon, &a.CreatedBy, &a.UpdatedBy, &a.CreatedAt, &a.UpdatedAt)
	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "application not found"})
	}
	if err != nil {
		log.Printf("GetApplicationByID error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch application",
			"message": err.Error(),
		})
	}
	return c.JSON(fiber.Map{"data": a.ToResponse()})
}

// DELETE /directory/applications/:id   (soft delete)
func DeleteApplication(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}
	id := c.Params("id")

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start transaction", "message": err.Error()})
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE application
		   SET is_active = 0, updated_at = SYSTIMESTAMP
		 WHERE id = :1
	`, id)
	if err != nil {
		log.Printf("DeleteApplication error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete application",
			"message": err.Error(),
		})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "application not found"})
	}

	// Cascade: deactivate all child objects under this application's modules
	if _, err := tx.Exec(`
		UPDATE IAMX.OBJECT SET is_active = 0, updated_at = SYSTIMESTAMP
		 WHERE module_id IN (SELECT id FROM IAMX.MODULE WHERE application_id = :1)
		   AND is_active = 1
	`, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to deactivate child objects", "message": err.Error()})
	}
	// Cascade: deactivate all child modules under this application
	if _, err := tx.Exec(`UPDATE IAMX.MODULE SET is_active = 0, updated_at = SYSTIMESTAMP WHERE application_id = :1 AND is_active = 1`, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to deactivate child modules", "message": err.Error()})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit", "message": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Application deleted"})
}
