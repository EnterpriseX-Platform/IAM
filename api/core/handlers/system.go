package handlers

import (
	"api/core"
	"api/core/models"

	"database/sql"

	"github.com/gofiber/fiber/v2"
)

func GetSystems(c *fiber.Ctx) error {
	db := core.GetDB()

	// Get pagination parameters
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	search := c.Query("search", "")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	offset := (page - 1) * limit

	// Build WHERE clause for search
	whereClause := ""
	searchParam := ""
	if search != "" {
		whereClause = `WHERE UPPER(SYSTEM_NAME) LIKE :1
		               OR UPPER(SYSTEM_ABV) LIKE :1
		               OR UPPER(SYSTEM_DESC) LIKE :1`
		searchParam = "%" + search + "%"
	}

	// Count total records
	countQuery := `SELECT COUNT(*) FROM IAMX.SYSTEM ` + whereClause
	var total int
	if search != "" {
		err := db.QueryRow(countQuery, searchParam).Scan(&total)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to count systems",
				"message": err.Error(),
			})
		}
	} else {
		err := db.QueryRow(countQuery).Scan(&total)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to count systems",
				"message": err.Error(),
			})
		}
	}

	// Fetch paginated data
	query := `SELECT SYSTEM_ID, SYSTEM_NAME, SYSTEM_ABV, SYSTEM_DESC,
	                 SYSTEM_TYPE_MAIN_ID, SYSTEM_LOGO, STATUS
	          FROM IAMX.SYSTEM ` + whereClause + `
	          ORDER BY SYSTEM_ID
	          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`

	var rows *sql.Rows
	var err error
	if search != "" {
		rows, err = db.Query(query, searchParam, offset, limit)
	} else {
		rows, err = db.Query(query, offset, limit)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch systems",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	systems := []models.SystemResponse{}
	for rows.Next() {
		var s models.System
		err := rows.Scan(
			&s.SystemID,
			&s.SystemName,
			&s.SystemABV,
			&s.SystemDesc,
			&s.SystemTypeMainID,
			&s.SystemLogo,
			&s.Status,
		)
		if err != nil {
			continue
		}
		systems = append(systems, s.ToResponse())
	}

	// Return paginated response
	return c.JSON(fiber.Map{
		"data":       systems,
		"total":      total,
		"page":       page,
		"limit":      limit,
		"totalPages": (total + limit - 1) / limit,
	})
}

func GetSystem(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()

	query := `SELECT SYSTEM_ID, SYSTEM_NAME, SYSTEM_ABV, SYSTEM_DESC,
	                 SYSTEM_TYPE_MAIN_ID, SYSTEM_LOGO, STATUS
	          FROM IAMX.SYSTEM
	          WHERE SYSTEM_ID = :1`

	var s models.System
	err := db.QueryRow(query, id).Scan(
		&s.SystemID,
		&s.SystemName,
		&s.SystemABV,
		&s.SystemDesc,
		&s.SystemTypeMainID,
		&s.SystemLogo,
		&s.Status,
	)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "System not found",
			"message": "No system found with the given ID",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch system",
			"message": err.Error(),
		})
	}

	return c.JSON(s.ToResponse())
}

func CreateSystem(c *fiber.Ctx) error {
	var req models.CreateSystemRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	db := core.GetDB()

	// Convert pointers to values for database
	var systemABV, systemDesc, systemTypeMainID, systemLogo, status interface{}
	if req.SystemABV != nil {
		systemABV = *req.SystemABV
	} else {
		systemABV = nil
	}
	if req.SystemDesc != nil {
		systemDesc = *req.SystemDesc
	} else {
		systemDesc = nil
	}
	if req.SystemTypeMainID != nil {
		systemTypeMainID = *req.SystemTypeMainID
	} else {
		systemTypeMainID = nil
	}
	if req.SystemLogo != nil {
		systemLogo = *req.SystemLogo
	} else {
		systemLogo = nil
	}
	if req.Status != nil {
		status = *req.Status
	} else {
		status = nil
	}

	// Get next ID from sequence or max+1
	var nextID int
	seqQuery := `SELECT NVL(MAX(SYSTEM_ID), 0) + 1 FROM IAMX.SYSTEM`
	err := db.QueryRow(seqQuery).Scan(&nextID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get next ID",
			"message": err.Error(),
		})
	}

	query := `INSERT INTO IAMX.SYSTEM
	          (SYSTEM_ID, SYSTEM_NAME, SYSTEM_ABV, SYSTEM_DESC, SYSTEM_TYPE_MAIN_ID, SYSTEM_LOGO, STATUS, CREATE_DATE)
	          VALUES (:1, :2, :3, :4, :5, :6, :7, SYSTIMESTAMP)`

	_, err = db.Exec(
		query,
		nextID,
		req.SystemName,
		systemABV,
		systemDesc,
		systemTypeMainID,
		systemLogo,
		status,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create system",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "System created successfully",
	})
}

func UpdateSystem(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.UpdateSystemRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	db := core.GetDB()
	query := `UPDATE IAMX.SYSTEM
	          SET SYSTEM_NAME = :1, SYSTEM_ABV = :2, SYSTEM_DESC = :3,
	              SYSTEM_TYPE_MAIN_ID = :4, SYSTEM_LOGO = :5, STATUS = :6, UPDATE_DATE = SYSTIMESTAMP
	          WHERE SYSTEM_ID = :7`

	result, err := db.Exec(
		query,
		req.SystemName,
		req.SystemABV,
		req.SystemDesc,
		req.SystemTypeMainID,
		req.SystemLogo,
		req.Status,
		id,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update system",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "System not found",
			"message": "No system found with the given ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "System updated successfully",
	})
}

func DeleteSystem(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()

	result, err := db.Exec("DELETE FROM IAMX.SYSTEM WHERE SYSTEM_ID = :1", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete system",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "System not found",
			"message": "No system found with the given ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "System deleted successfully",
	})
}
