package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"

	"github.com/gofiber/fiber/v2"
)

func GetApps(c *fiber.Ctx) error {
	db := core.GetDB()

	// Get pagination parameters
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	search := c.Query("search", "")
	status := c.Query("status", "")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	offset := (page - 1) * limit

	// Build WHERE clause for search and filter
	whereClause := "WHERE DELETED_DATE IS NULL"
	searchParam := ""

	if search != "" {
		whereClause += ` AND (UPPER(APP_NAME) LIKE :1
		               OR UPPER(APP_ABV) LIKE :1
		               OR UPPER(APP_DESC) LIKE :1)`
		searchParam = "%" + search + "%"
	}

	if status != "" && status != "All" {
		if search != "" {
			whereClause += ` AND STATUS = :2`
		} else {
			whereClause += ` AND STATUS = :1`
		}
	}

	// Count total records
	countQuery := `SELECT COUNT(*) FROM IAMX.APP ` + whereClause
	var total int
	var err error

	if search != "" && status != "" && status != "All" {
		err = db.QueryRow(countQuery, searchParam, status).Scan(&total)
	} else if search != "" {
		err = db.QueryRow(countQuery, searchParam).Scan(&total)
	} else if status != "" && status != "All" {
		err = db.QueryRow(countQuery, status).Scan(&total)
	} else {
		err = db.QueryRow(countQuery).Scan(&total)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to count apps",
			"message": err.Error(),
		})
	}

	// Fetch paginated data
	query := `SELECT APP_ID, APP_NAME, APP_ABV, APP_DESC, APP_LOGO, STATUS,
	                 APP_CODE, APP_TYPE_MST, CLIENT_ID, GROUP_ID, APP_SEQ,
	                 PERMISSION_DATA, CREATE_DATE
	          FROM IAMX.APP ` + whereClause + `
	          ORDER BY APP_ID DESC
	          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`

	var rows *sql.Rows
	if search != "" && status != "" && status != "All" {
		rows, err = db.Query(query, searchParam, status, offset, limit)
	} else if search != "" {
		rows, err = db.Query(query, searchParam, offset, limit)
	} else if status != "" && status != "All" {
		rows, err = db.Query(query, status, offset, limit)
	} else {
		rows, err = db.Query(query, offset, limit)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch apps",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	apps := []models.AppResponse{}
	for rows.Next() {
		var a models.App
		err := rows.Scan(
			&a.AppID,
			&a.AppName,
			&a.AppABV,
			&a.AppDesc,
			&a.AppLogo,
			&a.Status,
			&a.AppCode,
			&a.AppTypeMst,
			&a.ClientID,
			&a.GroupID,
			&a.AppSeq,
			&a.PermissionData,
			&a.CreateDate,
		)
		if err != nil {
			continue
		}
		apps = append(apps, a.ToResponse())
	}

	// Return paginated response
	return c.JSON(fiber.Map{
		"data":       apps,
		"total":      total,
		"page":       page,
		"limit":      limit,
		"totalPages": (total + limit - 1) / limit,
	})
}

func GetApp(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()

	query := `SELECT APP_ID, APP_NAME, APP_ABV, APP_DESC, APP_LOGO, STATUS,
	                 APP_CODE, APP_TYPE_MST, CLIENT_ID, GROUP_ID, APP_SEQ,
	                 PERMISSION_DATA, CREATE_DATE
	          FROM IAMX.APP
	          WHERE APP_ID = :1 AND DELETED_DATE IS NULL`

	var a models.App
	err := db.QueryRow(query, id).Scan(
		&a.AppID,
		&a.AppName,
		&a.AppABV,
		&a.AppDesc,
		&a.AppLogo,
		&a.Status,
		&a.AppCode,
		&a.AppTypeMst,
		&a.ClientID,
		&a.GroupID,
		&a.AppSeq,
		&a.PermissionData,
		&a.CreateDate,
	)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "App not found",
			"message": "No app found with the given ID",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch app",
			"message": err.Error(),
		})
	}

	return c.JSON(a.ToResponse())
}

func CreateApp(c *fiber.Ctx) error {
	var req models.CreateAppRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	db := core.GetDB()

	// Get next ID from sequence
	var nextID int
	seqQuery := `SELECT NVL(MAX(APP_ID), 0) + 1 FROM IAMX.APP`
	err := db.QueryRow(seqQuery).Scan(&nextID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get next ID",
			"message": err.Error(),
		})
	}

	// Convert pointers to values for database
	var appABV, appDesc, appLogo, status, appCode, clientID interface{}
	if req.AppABV != nil {
		appABV = *req.AppABV
	}
	if req.AppDesc != nil {
		appDesc = *req.AppDesc
	}
	if req.AppLogo != nil {
		appLogo = *req.AppLogo
	}
	if req.Status != nil {
		status = *req.Status
	} else {
		status = "Active" // Default status
	}
	if req.AppCode != nil {
		appCode = *req.AppCode
	}
	if req.ClientID != nil {
		clientID = *req.ClientID
	}

	query := `INSERT INTO IAMX.APP
	          (APP_ID, APP_NAME, APP_ABV, APP_DESC, APP_LOGO, STATUS,
	           APP_CODE, CLIENT_ID, CREATE_DATE)
	          VALUES (:1, :2, :3, :4, :5, :6, :7, :8, SYSTIMESTAMP)`

	_, err = db.Exec(
		query,
		nextID,
		req.AppName,
		appABV,
		appDesc,
		appLogo,
		status,
		appCode,
		clientID,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create app",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "App created successfully",
		"appId":   nextID,
	})
}

func UpdateApp(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.UpdateAppRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	db := core.GetDB()
	query := `UPDATE IAMX.APP
	          SET APP_NAME = :1, APP_ABV = :2, APP_DESC = :3,
	              APP_LOGO = :4, STATUS = :5, APP_CODE = :6,
	              CLIENT_ID = :7, UPDATE_DATE = SYSTIMESTAMP
	          WHERE APP_ID = :8 AND DELETED_DATE IS NULL`

	result, err := db.Exec(
		query,
		req.AppName,
		req.AppABV,
		req.AppDesc,
		req.AppLogo,
		req.Status,
		req.AppCode,
		req.ClientID,
		id,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update app",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "App not found",
			"message": "No app found with the given ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "App updated successfully",
	})
}

func DeleteApp(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()

	// Soft delete
	query := `UPDATE IAMX.APP
	          SET DELETED_DATE = SYSTIMESTAMP
	          WHERE APP_ID = :1 AND DELETED_DATE IS NULL`

	result, err := db.Exec(query, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete app",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "App not found",
			"message": "No app found with the given ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "App deleted successfully",
	})
}
