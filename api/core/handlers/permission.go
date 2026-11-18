package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"

	"github.com/gofiber/fiber/v2"
)

func GetPermissions(c *fiber.Ctx) error {
	db := core.GetDB()

	// รับ system_id จาก query parameter (optional)
	systemID := c.Query("system_id")

	// Get pagination parameters
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 10)
	search := c.Query("search", "")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 10
	}

	offset := (page - 1) * limit

	// Build WHERE clause
	whereClause := ""
	var countParams []interface{}
	var queryParams []interface{}

	if systemID != "" && search != "" {
		whereClause = `WHERE p.SYSTEM_ID = :1
		               AND (UPPER(p.PERMISSION_NAME) LIKE :2
		                    OR UPPER(p.PERMISSION_DESC) LIKE :2
		                    OR UPPER(s.SYSTEM_NAME) LIKE :2)`
		searchParam := "%" + search + "%"
		countParams = []interface{}{systemID, searchParam}
		queryParams = []interface{}{systemID, searchParam}
	} else if systemID != "" {
		whereClause = `WHERE p.SYSTEM_ID = :1`
		countParams = []interface{}{systemID}
		queryParams = []interface{}{systemID}
	} else if search != "" {
		whereClause = `WHERE UPPER(p.PERMISSION_NAME) LIKE :1
		               OR UPPER(p.PERMISSION_DESC) LIKE :1
		               OR UPPER(s.SYSTEM_NAME) LIKE :1`
		searchParam := "%" + search + "%"
		countParams = []interface{}{searchParam}
		queryParams = []interface{}{searchParam}
	}

	// Count total records
	countQuery := `SELECT COUNT(*)
	               FROM IAMX.PERMISSION p
	               LEFT JOIN IAMX.SYSTEM s ON p.SYSTEM_ID = s.SYSTEM_ID ` + whereClause

	var total int
	var err error
	if len(countParams) > 0 {
		err = db.QueryRow(countQuery, countParams...).Scan(&total)
	} else {
		err = db.QueryRow(countQuery).Scan(&total)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to count permissions",
			"message": err.Error(),
		})
	}

	// Fetch paginated data
	query := `SELECT p.PERMISSION_ID, p.PERMISSION_NAME, p.PERMISSION_DESC,
	                 p.STATUS, p.SYSTEM_ID,
	                 p.CREATE_DATE, s.SYSTEM_NAME
	          FROM IAMX.PERMISSION p
	          LEFT JOIN IAMX.SYSTEM s ON p.SYSTEM_ID = s.SYSTEM_ID ` +
		whereClause + `
	          ORDER BY p.PERMISSION_ID
	          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`

	// Add offset and limit to params
	queryParams = append(queryParams, offset, limit)

	var rows *sql.Rows
	if len(queryParams) > 0 {
		rows, err = db.Query(query, queryParams...)
	} else {
		rows, err = db.Query(query, offset, limit)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch permissions",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	permissions := []models.PermissionResponse{}
	for rows.Next() {
		var p models.Permission
		var systemName sql.NullString

		err := rows.Scan(
			&p.PermissionID,
			&p.PermissionName,
			&p.PermissionDesc,
			&p.Status,
			&p.SystemID,
			&p.CreateDate,
			&systemName,
		)
		if err != nil {
			continue
		}

		resp := p.ToResponse()
		if systemName.Valid {
			resp.SystemName = &systemName.String
		}
		permissions = append(permissions, resp)
	}

	// Return paginated response
	return c.JSON(fiber.Map{
		"data":       permissions,
		"total":      total,
		"page":       page,
		"limit":      limit,
		"totalPages": (total + limit - 1) / limit,
	})
}

func GetPermission(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()

	query := `SELECT p.PERMISSION_ID, p.PERMISSION_CODE, p.PERMISSION_NAME, p.PERMISSION_DESC,
	                 p.STATUS, p.SYSTEM_ID, p.CREATE_DATE,
	                 s.SYSTEM_NAME
	          FROM IAMX.PERMISSION p
	          LEFT JOIN IAMX.SYSTEM s ON p.SYSTEM_ID = s.SYSTEM_ID
	          WHERE p.PERMISSION_ID = :1`

	var p models.Permission
	var systemName sql.NullString

	err := db.QueryRow(query, id).Scan(
		&p.PermissionID,
		// &p.PermissionCode,
		&p.PermissionName,
		&p.PermissionDesc,
		&p.Status,
		&p.SystemID,
		&p.CreateDate,
		&systemName,
	)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Permission not found",
			"message": "No permission found with the given ID",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch permission",
			"message": err.Error(),
		})
	}

	resp := p.ToResponse()
	if systemName.Valid {
		resp.SystemName = &systemName.String
	}

	return c.JSON(resp)
}

func CreatePermission(c *fiber.Ctx) error {
	var req models.CreatePermissionRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	db := core.GetDB()

	// Convert pointers to values for database
	var permissionDesc, status, systemID interface{}
	if req.PermissionDesc != nil {
		permissionDesc = *req.PermissionDesc
	} else {
		permissionDesc = nil
	}
	if req.Status != nil {
		status = *req.Status
	} else {
		status = "Y" // default status
	}
	if req.SystemID != nil {
		systemID = *req.SystemID
	} else {
		systemID = nil
	}

	// Get next ID from sequence or max+1
	var nextID int
	seqQuery := `SELECT NVL(MAX(PERMISSION_ID), 0) + 1 FROM IAMX.PERMISSION`
	err := db.QueryRow(seqQuery).Scan(&nextID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get next ID",
			"message": err.Error(),
		})
	}

	query := `INSERT INTO IAMX.PERMISSION
	          (PERMISSION_ID, PERMISSION_NAME, PERMISSION_DESC, STATUS, SYSTEM_ID, CREATE_DATE)
	          VALUES (:1, :2, :3, :4, :5, SYSTIMESTAMP)`

	_, err = db.Exec(
		query,
		nextID,
		req.PermissionName,
		permissionDesc,
		status,
		systemID,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create permission",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":       "Permission created successfully",
		"permission_id": nextID,
	})
}

func UpdatePermission(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.UpdatePermissionRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	db := core.GetDB()
	query := `UPDATE IAMX.PERMISSION
	          SET PERMISSION_NAME = :1, PERMISSION_DESC = :2, STATUS = :3,
	              SYSTEM_ID = :4, UPDATE_DATE = SYSTIMESTAMP
	          WHERE PERMISSION_ID = :5`

	result, err := db.Exec(
		query,
		req.PermissionName,
		req.PermissionDesc,
		req.Status,
		req.SystemID,
		id,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update permission",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Permission not found",
			"message": "No permission found with the given ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Permission updated successfully",
	})
}

func DeletePermission(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()

	result, err := db.Exec("DELETE FROM IAMX.PERMISSION WHERE PERMISSION_ID = :1", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete permission",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Permission not found",
			"message": "No permission found with the given ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Permission deleted successfully",
	})
}
