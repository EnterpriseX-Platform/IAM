package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"

	"github.com/gofiber/fiber/v2"
)

func GetAccessTypes(c *fiber.Ctx) error {
	db := core.GetDB()

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

	// Build WHERE clause for search
	whereClause := ""
	searchParam := ""
	if search != "" {
		whereClause = `WHERE UPPER(MAT.ACCESS_TYPE_NAME) LIKE :1
		               OR UPPER(MAT.ACCESS_TYPE_DESC) LIKE :1
		               OR UPPER(RCD.COMMON_DATA_LABEL) LIKE :1`
		searchParam = "%" + search + "%"
	}

	// Count total records
	countQuery := `SELECT COUNT(*)
	               FROM IAMX.MS_ACCESS_TYPE MAT
	               LEFT JOIN APP.REF_COMMON_DATA RCD ON MAT.ACCESS_TYPE_MAIN_ID = RCD.COMMON_DATA_ID
	                        AND RCD.COMMON_DATA_TYPE = 'ACCESS_TYPE' ` + whereClause
	var total int
	if search != "" {
		err := db.QueryRow(countQuery, searchParam).Scan(&total)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to count access types",
				"message": err.Error(),
			})
		}
	} else {
		err := db.QueryRow(countQuery).Scan(&total)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to count access types",
				"message": err.Error(),
			})
		}
	}

	// Fetch paginated data
	query := `SELECT MAT.ACCESS_TYPE_ID, MAT.ACCESS_TYPE_NAME, MAT.ACCESS_TYPE_MAIN_ID,
	                 RCD.COMMON_DATA_LABEL AS ACCESS_TYPE_MAIN,
	                 MAT.ACCESS_TYPE_DESC, MAT.STATUS, MAT.CREATE_DATE
	          FROM IAMX.MS_ACCESS_TYPE MAT
	          LEFT JOIN APP.REF_COMMON_DATA RCD ON MAT.ACCESS_TYPE_MAIN_ID = RCD.COMMON_DATA_ID
	                   AND RCD.COMMON_DATA_TYPE = 'ACCESS_TYPE' ` + whereClause + `
	          ORDER BY MAT.ACCESS_TYPE_ID
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
			"error":   "Failed to fetch access types",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	accessTypes := []models.AccessTypeResponse{}
	for rows.Next() {
		var a models.AccessType
		err := rows.Scan(
			&a.AccessTypeID,
			&a.AccessTypeName,
			&a.AccessTypeMainID,
			&a.AccessTypeMain,
			&a.AccessTypeDesc,
			&a.Status,
			&a.CreateDate,
		)
		if err != nil {
			continue
		}
		accessTypes = append(accessTypes, a.ToResponse())
	}

	// Return paginated response
	return c.JSON(fiber.Map{
		"data":       accessTypes,
		"total":      total,
		"page":       page,
		"limit":      limit,
		"totalPages": (total + limit - 1) / limit,
	})
}

func GetAccessType(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()

	query := `SELECT MAT.ACCESS_TYPE_ID, MAT.ACCESS_TYPE_NAME, MAT.ACCESS_TYPE_MAIN_ID,
	                 RCD.COMMON_DATA_LABEL AS ACCESS_TYPE_MAIN,
	                 MAT.ACCESS_TYPE_DESC, MAT.STATUS, MAT.CREATE_DATE
	          FROM IAMX.MS_ACCESS_TYPE MAT
	          LEFT JOIN APP.REF_COMMON_DATA RCD ON MAT.ACCESS_TYPE_MAIN_ID = RCD.COMMON_DATA_ID
	                   AND RCD.COMMON_DATA_TYPE = 'ACCESS_TYPE'
	          WHERE MAT.ACCESS_TYPE_ID = :1`

	var a models.AccessType
	err := db.QueryRow(query, id).Scan(
		&a.AccessTypeID,
		&a.AccessTypeName,
		&a.AccessTypeMainID,
		&a.AccessTypeMain,
		&a.AccessTypeDesc,
		&a.Status,
		&a.CreateDate,
	)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Access type not found",
			"message": "No access type found with the given ID",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch access type",
			"message": err.Error(),
		})
	}

	return c.JSON(a.ToResponse())
}

func CreateAccessType(c *fiber.Ctx) error {
	var req models.CreateAccessTypeRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	db := core.GetDB()

	// Convert pointers to values for database
	var accessTypeMainID, accessTypeDesc, status interface{}
	if req.AccessTypeMainID != nil {
		accessTypeMainID = *req.AccessTypeMainID
	} else {
		accessTypeMainID = nil
	}
	if req.AccessTypeDesc != nil {
		accessTypeDesc = *req.AccessTypeDesc
	} else {
		accessTypeDesc = nil
	}
	if req.Status != nil {
		status = *req.Status
	} else {
		status = nil
	}

	// Get next ID from sequence or max+1
	var nextID int
	seqQuery := `SELECT NVL(MAX(ACCESS_TYPE_ID), 0) + 1 FROM IAMX.MS_ACCESS_TYPE`
	err := db.QueryRow(seqQuery).Scan(&nextID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get next ID",
			"message": err.Error(),
		})
	}

	query := `INSERT INTO IAMX.MS_ACCESS_TYPE
	          (ACCESS_TYPE_ID, ACCESS_TYPE_NAME, ACCESS_TYPE_MAIN_ID, ACCESS_TYPE_DESC, STATUS, CREATE_DATE)
	          VALUES (:1, :2, :3, :4, :5, SYSTIMESTAMP)`

	_, err = db.Exec(
		query,
		nextID,
		req.AccessTypeName,
		accessTypeMainID,
		accessTypeDesc,
		status,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create access type",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Access type created successfully",
	})
}

func UpdateAccessType(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.UpdateAccessTypeRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	db := core.GetDB()

	// Convert pointers to values for database
	var accessTypeMainID interface{}
	if req.AccessTypeMainID != nil {
		accessTypeMainID = *req.AccessTypeMainID
	} else {
		accessTypeMainID = nil
	}

	query := `UPDATE IAMX.MS_ACCESS_TYPE
	          SET ACCESS_TYPE_NAME = :1, ACCESS_TYPE_MAIN_ID = :2, ACCESS_TYPE_DESC = :3, STATUS = :4, UPDATE_DATE = SYSTIMESTAMP
	          WHERE ACCESS_TYPE_ID = :5`

	result, err := db.Exec(
		query,
		req.AccessTypeName,
		accessTypeMainID,
		req.AccessTypeDesc,
		req.Status,
		id,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update access type",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Access type not found",
			"message": "No access type found with the given ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Access type updated successfully",
	})
}

func DeleteAccessType(c *fiber.Ctx) error {
	id := c.Params("id")
	db := core.GetDB()

	result, err := db.Exec("DELETE FROM IAMX.MS_ACCESS_TYPE WHERE ACCESS_TYPE_ID = :1", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete access type",
			"message": err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Access type not found",
			"message": "No access type found with the given ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Access type deleted successfully",
	})
}
