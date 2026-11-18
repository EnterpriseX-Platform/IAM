package handlers

import (
	"api/core"
	"api/core/models"
	"database/sql"
	"log"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// GET /manage-menus?system_id=1
// func GetManageMenus(c *fiber.Ctx) error {
// 	db := core.GetDB()
// 	systemID := c.Query("system_id")

// 	var (
// 		rows *sql.Rows
// 		err  error
// 	)

// 	// ✅ ห้ามมี // ใน SQL string
// 	baseQuery := `
// 		SELECT
// 			s.SYSTEM_ID,
// 			s.SYSTEM_NAME,
// 			o.OBJECT_ID,
// 			o.OBJECT_NAME,
// 			o.OBJECT_CODE,
// 			o.PATH,
// 			ot.OBJECT_TYPE_NAME,
// 			o.STATUS,
// 			o.CREATE_DATE,
// 			o.CREATE_BY,
// 			o.UPDATE_DATE,
// 			o.UPDATE_BY
// 		FROM IAMX.SYSTEM s
// 		LEFT JOIN IAMX.OBJECT o
// 			ON s.SYSTEM_ID = o.SYSTEM_ID
// 		LEFT JOIN IAMX.OBJECT_TYPE ot
// 			ON o.OBJECT_TYPE_ID = ot.OBJECT_TYPE_ID
// 	`

// 	if systemID != "" {
// 		rows, err = db.Query(baseQuery+` WHERE s.SYSTEM_ID = :1 ORDER BY o.OBJECT_ID`, systemID)
// 	} else {
// 		rows, err = db.Query(baseQuery + ` ORDER BY s.SYSTEM_ID, o.OBJECT_ID`)
// 	}

// 	if err != nil {
// 		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
// 			"error":   "Failed to fetch manage menus",
// 			"message": err.Error(),
// 		})
// 	}
// 	defer rows.Close()

// 	res := []models.ManageMenuResponse{}

// 	for rows.Next() {
// 		var (
// 			sid      sql.NullInt64
// 			snm      sql.NullString
// 			m        models.ManageMenu
// 			objectID sql.NullInt64
// 		)

// 		err := rows.Scan(
// 			&sid,
// 			&snm,
// 			&objectID,
// 			&m.ObjectName,
// 			&m.ObjectCode,
// 			&m.Path,
// 			&m.ObjectTypeName, // ✅ ชื่อประเภท
// 			&m.Status,
// 			&m.CreateDate,
// 			&m.CreateBy,
// 			&m.UpdateDate,
// 			&m.UpdateBy,
// 		)
// 		if err != nil {
// 			continue
// 		}

// 		// LEFT JOIN -> ถ้าไม่มี OBJECT ให้ข้าม
// 		if !objectID.Valid {
// 			continue
// 		}

// 		m.ObjectID = int(objectID.Int64)
// 		m.SystemID = sid

// 		resp := m.ToResponse()
// 		if snm.Valid {
// 			resp.SystemName = &snm.String
// 		}

// 		res = append(res, resp)
// 	}

// 	return c.JSON(res)
// }

// GET /manage-menus/:id  (OBJECT_ID)
func GetManageMenu(c *fiber.Ctx) error {
	db := core.GetDB()
	id := c.Params("id")

	// ✅ ห้ามมี // ใน SQL string
	query := `
		SELECT
			s.SYSTEM_ID,
			s.SYSTEM_NAME,
			o.OBJECT_ID,
			o.OBJECT_NAME,
			o.OBJECT_CODE,
			o.PATH,
			ot.OBJECT_TYPE_NAME,
			o.STATUS,
			o.CREATE_DATE,
			o.CREATE_BY,
			o.UPDATE_DATE,
			o.UPDATE_BY
		FROM IAMX.OBJECT o
		LEFT JOIN IAMX.SYSTEM s
			ON s.SYSTEM_ID = o.SYSTEM_ID
		LEFT JOIN IAMX.OBJECT_TYPE ot
			ON o.OBJECT_TYPE_ID = ot.OBJECT_TYPE_ID
		WHERE o.OBJECT_ID = :1
	`

	var (
		sid sql.NullInt64
		snm sql.NullString
		m   models.ManageMenu
	)

	err := db.QueryRow(query, id).Scan(
		&sid,
		&snm,
		&m.ObjectID,
		&m.ObjectName,
		&m.ObjectCode,
		&m.Path,
		&m.ObjectTypeName, // ✅ ชื่อประเภท
		&m.Status,
		&m.CreateDate,
		&m.CreateBy,
		&m.UpdateDate,
		&m.UpdateBy,
	)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Manage menu not found",
			"message": "No object found with the given OBJECT_ID",
		})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch manage menu",
			"message": err.Error(),
		})
	}

	m.SystemID = sid
	resp := m.ToResponse()
	if snm.Valid {
		resp.SystemName = &snm.String
	}

	return c.JSON(resp)
}

func GetManageMenus(c *fiber.Ctx) error {
	db := core.GetDB()
	systemID := c.Query("system_id")

	var (
		rows *sql.Rows
		err  error
	)

	// ✅ ตัด SYSTEM ออก: query จาก OBJECT + OBJECT_TYPE เท่านั้น
	baseQuery := `
		SELECT
			o.SYSTEM_ID,
			o.OBJECT_ID,
			o.PARENT_OBJECT_ID,
			o.OBJECT_SEQ,
			o.OBJECT_NAME,
			o.OBJECT_CODE,
			o.PATH,
			ot.OBJECT_TYPE_NAME,
			o.STATUS,
			o.CREATE_DATE,
			o.CREATE_BY,
			o.UPDATE_DATE,
			o.UPDATE_BY
		FROM IAMX.OBJECT o
		LEFT JOIN IAMX.OBJECT_TYPE ot
			ON o.OBJECT_TYPE_ID = ot.OBJECT_TYPE_ID
	`

	orderBy := ` ORDER BY o.SYSTEM_ID, o.PARENT_OBJECT_ID NULLS FIRST, o.OBJECT_SEQ NULLS LAST, o.OBJECT_ID`

	if systemID != "" {
		rows, err = db.Query(baseQuery+` WHERE o.SYSTEM_ID = :1 `+orderBy, systemID)
	} else {
		rows, err = db.Query(baseQuery + orderBy)
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch manage menus",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	res := []models.ManageMenuResponse{}

	for rows.Next() {
		var (
			m            models.ManageMenu
			systemIDCol  sql.NullInt64
			objectIDCol  sql.NullInt64
			parentIDCol  sql.NullInt64
			objectSeqCol sql.NullInt64
		)

		err := rows.Scan(
			&systemIDCol,
			&objectIDCol,
			&parentIDCol,
			&objectSeqCol,
			&m.ObjectName,
			&m.ObjectCode,
			&m.Path,
			&m.ObjectTypeName,
			&m.Status,
			&m.CreateDate,
			&m.CreateBy,
			&m.UpdateDate,
			&m.UpdateBy,
		)
		if err != nil {
			continue
		}

		if !objectIDCol.Valid {
			continue
		}

		m.ObjectID = int(objectIDCol.Int64)
		m.SystemID = systemIDCol
		m.ParentObjectID = parentIDCol
		m.ObjectSeq = objectSeqCol

		resp := m.ToResponse()

		// ❌ ไม่มี systemName แล้ว (ไม่ join SYSTEM)
		// resp.SystemName = nil

		res = append(res, resp)
	}

	return c.JSON(res)
}

// POST /manage-menus
func CreateManageMenu(c *fiber.Ctx) error {
	db := core.GetDB()
	var req models.CreateManageMenuRequest

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	// pointer -> interface{} (กัน driver error)
	var (
		objectCode   interface{}
		path         interface{}
		objectTypeID interface{}
		status       interface{}
		systemID     interface{}
	)

	if req.ObjectCode != nil {
		objectCode = *req.ObjectCode
	}
	if req.Path != nil {
		path = *req.Path
	}
	if req.ObjectTypeID != nil {
		objectTypeID = *req.ObjectTypeID
	}
	if req.Status != nil {
		status = *req.Status
	} else {
		status = "Y"
	}
	if req.SystemID != nil {
		systemID = *req.SystemID
	}

	// next id (ถ้ามี sequence ให้เปลี่ยนเป็น sequence ได้)
	var nextID int
	if err := db.QueryRow(`SELECT NVL(MAX(OBJECT_ID), 0) + 1 FROM IAMX.OBJECT`).Scan(&nextID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get next OBJECT_ID",
			"message": err.Error(),
		})
	}

	insert := `
		INSERT INTO IAMX.OBJECT
			(OBJECT_ID, OBJECT_NAME, OBJECT_CODE, PATH, OBJECT_TYPE_ID, STATUS, SYSTEM_ID, CREATE_DATE)
		VALUES
			(:1, :2, :3, :4, :5, :6, :7, SYSTIMESTAMP)
	`

	_, err := db.Exec(
		insert,
		nextID,
		req.ObjectName,
		objectCode,
		path,
		objectTypeID,
		status,
		systemID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to create manage menu",
			"message": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":   "Manage menu created successfully",
		"object_id": nextID,
	})
}

// PUT /manage-menus/:id
func UpdateManageMenu(c *fiber.Ctx) error {
	db := core.GetDB()
	id := c.Params("id")

	var req models.UpdateManageMenuRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid request body",
			"message": err.Error(),
		})
	}

	// pointer -> interface{} เพื่อใช้กับ COALESCE
	var (
		objectName   interface{}
		objectCode   interface{}
		path         interface{}
		objectTypeID interface{}
		status       interface{}
		systemID     interface{}
	)

	if req.ObjectName != nil {
		objectName = *req.ObjectName
	}
	if req.ObjectCode != nil {
		objectCode = *req.ObjectCode
	}
	if req.Path != nil {
		path = *req.Path
	}
	if req.ObjectTypeID != nil {
		objectTypeID = *req.ObjectTypeID
	}
	if req.Status != nil {
		status = *req.Status
	}
	if req.SystemID != nil {
		systemID = *req.SystemID
	}

	query := `
		UPDATE IAMX.OBJECT
		SET
			OBJECT_NAME    = COALESCE(:1, OBJECT_NAME),
			OBJECT_CODE    = COALESCE(:2, OBJECT_CODE),
			PATH           = COALESCE(:3, PATH),
			OBJECT_TYPE_ID = COALESCE(:4, OBJECT_TYPE_ID),
			STATUS         = COALESCE(:5, STATUS),
			SYSTEM_ID      = COALESCE(:6, SYSTEM_ID),
			UPDATE_DATE    = SYSTIMESTAMP
		WHERE OBJECT_ID = :7
	`

	result, err := db.Exec(
		query,
		objectName,
		objectCode,
		path,
		objectTypeID,
		status,
		systemID,
		id,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to update manage menu",
			"message": err.Error(),
		})
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Manage menu not found",
			"message": "No object found with the given OBJECT_ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Manage menu updated successfully",
	})
}

// DELETE /manage-menus/:id
func DeleteManageMenu(c *fiber.Ctx) error {
	db := core.GetDB()
	id := c.Params("id")

	result, err := db.Exec(`DELETE FROM IAMX.OBJECT WHERE OBJECT_ID = :1`, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to delete manage menu",
			"message": err.Error(),
		})
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Manage menu not found",
			"message": "No object found with the given OBJECT_ID",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Manage menu deleted successfully",
	})
}

func GetManageMenusSimple(c *fiber.Ctx) error {
	db := core.GetDB()
	systemIDStr := c.Query("system_id")

	query := `
		SELECT
			s.SYSTEM_ID,
			o.OBJECT_ID,
			s.SYSTEM_NAME,
			o.OBJECT_NAME,
			o.OBJECT_SEQ
		FROM IAMX.SYSTEM s
		LEFT JOIN IAMX.OBJECT o
			ON s.SYSTEM_ID = o.SYSTEM_ID
		LEFT JOIN IAMX.OBJECT_TYPE ot
			ON o.OBJECT_TYPE_ID = ot.OBJECT_TYPE_ID
		WHERE ot.OBJECT_TYPE_NAME IN ('MAIN_MENU', 'MENU')
	`

	var (
		rows *sql.Rows
		err  error
	)

	if systemIDStr != "" {
		systemID, convErr := strconv.Atoi(systemIDStr)
		if convErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid system_id",
				"message": "system_id must be numeric",
			})
		}
		rows, err = db.Query(query+` AND s.SYSTEM_ID = :1 ORDER BY o.OBJECT_SEQ NULLS LAST, o.OBJECT_ID`, systemID)
	} else {
		rows, err = db.Query(query + ` ORDER BY s.SYSTEM_ID, o.OBJECT_SEQ NULLS LAST, o.OBJECT_ID`)
	}

	if err != nil {
		log.Printf("GetManageMenusSimple query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch manage menus simple",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	res := []models.MenuSimpleResponse{}

	for rows.Next() {
		var (
			sid sql.NullInt64
			oid sql.NullInt64
			snm sql.NullString
			onm sql.NullString
			seq sql.NullInt64
		)

		// ✅ ต้อง Scan ให้ครบ 5 คอลัมน์
		if err := rows.Scan(&sid, &oid, &snm, &onm, &seq); err != nil {
			log.Printf("GetManageMenusSimple scan error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to scan rows",
				"message": err.Error(),
			})
		}

		if !oid.Valid {
			continue
		}

		out := models.MenuSimpleResponse{}

		if sid.Valid {
			v := int(sid.Int64)
			out.SystemID = &v
		}
		if oid.Valid {
			v := int(oid.Int64)
			out.ObjectID = &v
		}
		if snm.Valid {
			out.SystemName = &snm.String
		}
		if onm.Valid {
			out.ObjectName = &onm.String
		}
		if seq.Valid {
			v := int(seq.Int64)
			out.ObjectSeq = &v
		}

		res = append(res, out)
	}

	if err := rows.Err(); err != nil {
		log.Printf("GetManageMenusSimple rows.Err: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Row iteration error",
			"message": err.Error(),
		})
	}

	return c.JSON(res)
}

func GetManageMenusMenuOnly(c *fiber.Ctx) error {
	db := core.GetDB()
	systemIDStr := c.Query("system_id")

	query := `
		SELECT
			s.SYSTEM_ID,
			o.OBJECT_ID,
			s.SYSTEM_NAME,
			o.OBJECT_NAME,
			o.OBJECT_SEQ
		FROM IAMX.SYSTEM s
		LEFT JOIN IAMX.OBJECT o
			ON s.SYSTEM_ID = o.SYSTEM_ID
		LEFT JOIN IAMX.OBJECT_TYPE ot
			ON o.OBJECT_TYPE_ID = ot.OBJECT_TYPE_ID
		WHERE ot.OBJECT_TYPE_NAME IN ('MENU')
	`

	var (
		rows *sql.Rows
		err  error
	)

	if systemIDStr != "" {
		systemID, convErr := strconv.Atoi(systemIDStr)
		if convErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid system_id",
				"message": "system_id must be numeric",
			})
		}
		rows, err = db.Query(query+` AND s.SYSTEM_ID = :1 ORDER BY o.OBJECT_SEQ NULLS LAST, o.OBJECT_ID`, systemID)
	} else {
		rows, err = db.Query(query + ` ORDER BY s.SYSTEM_ID, o.OBJECT_SEQ NULLS LAST, o.OBJECT_ID`)
	}

	if err != nil {
		log.Printf("GetManageMenusMenuOnly query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch menu only",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	res := []models.MenuSimpleResponse{}

	for rows.Next() {
		var (
			sid sql.NullInt64
			oid sql.NullInt64
			snm sql.NullString
			onm sql.NullString
			seq sql.NullInt64
		)

		if err := rows.Scan(&sid, &oid, &snm, &onm, &seq); err != nil {
			log.Printf("GetManageMenusMenuOnly scan error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to scan rows",
				"message": err.Error(),
			})
		}

		if !oid.Valid {
			continue
		}

		out := models.MenuSimpleResponse{}

		if sid.Valid {
			v := int(sid.Int64)
			out.SystemID = &v
		}
		if oid.Valid {
			v := int(oid.Int64)
			out.ObjectID = &v
		}
		if snm.Valid {
			out.SystemName = &snm.String
		}
		if onm.Valid {
			out.ObjectName = &onm.String
		}
		if seq.Valid {
			v := int(seq.Int64)
			out.ObjectSeq = &v
		}

		res = append(res, out)
	}

	if err := rows.Err(); err != nil {
		log.Printf("GetManageMenusMenuOnly rows.Err: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Row iteration error",
			"message": err.Error(),
		})
	}

	return c.JSON(res)
}

// POST /manage-menus/:id/move?new_parent_id=123&system_id=1(optional)
func MoveManageMenu(c *fiber.Ctx) error {
	db := core.GetDB()

	// :id = OBJECT_ID ของเมนูที่จะย้าย
	idStr := c.Params("id")
	objectID, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid id",
			"message": "id must be numeric",
		})
	}

	// query: new_parent_id (required)
	newParentStr := c.Query("new_parent_id")
	if newParentStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Missing new_parent_id",
			"message": "new_parent_id is required",
		})
	}
	newParentID, err := strconv.Atoi(newParentStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid new_parent_id",
			"message": "new_parent_id must be numeric",
		})
	}

	// query: system_id (optional, ใช้กับ SUB_MENU)
	systemIDStr := c.Query("system_id")
	var systemID *int
	if systemIDStr != "" {
		v, convErr := strconv.Atoi(systemIDStr)
		if convErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid system_id",
				"message": "system_id must be numeric",
			})
		}
		systemID = &v
	}

	// 1) หา type ของ object ที่จะย้าย
	var movingType sql.NullString
	err = db.QueryRow(`
		SELECT ot.OBJECT_TYPE_NAME
		FROM IAMX.OBJECT o
		LEFT JOIN IAMX.OBJECT_TYPE ot ON o.OBJECT_TYPE_ID = ot.OBJECT_TYPE_ID
		WHERE o.OBJECT_ID = :1
	`, objectID).Scan(&movingType)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Object not found",
			"message": "No object found with the given OBJECT_ID",
		})
	}
	if err != nil {
		log.Printf("MoveManageMenu movingType error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to read object type",
			"message": err.Error(),
		})
	}

	moveType := ""
	if movingType.Valid {
		moveType = strings.ToUpper(strings.TrimSpace(movingType.String))
	}

	// 2) อ่านข้อมูล parent เป้าหมาย
	var parentType sql.NullString
	var parentSystemID sql.NullInt64
	err = db.QueryRow(`
		SELECT ot.OBJECT_TYPE_NAME, o.SYSTEM_ID
		FROM IAMX.OBJECT o
		LEFT JOIN IAMX.OBJECT_TYPE ot ON o.OBJECT_TYPE_ID = ot.OBJECT_TYPE_ID
		WHERE o.OBJECT_ID = :1
	`, newParentID).Scan(&parentType, &parentSystemID)

	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid parent",
			"message": "new_parent_id not found",
		})
	}
	if err != nil {
		log.Printf("MoveManageMenu parent lookup error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to read parent",
			"message": err.Error(),
		})
	}

	pt := ""
	if parentType.Valid {
		pt = strings.ToUpper(strings.TrimSpace(parentType.String))
	}

	// 3) Validate rule
	if moveType == "MENU" {
		if pt != "MAIN_MENU" && pt != "MENU" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid move",
				"message": "MENU can be moved under MAIN_MENU or MENU only",
			})
		}
		// MENU: ไม่ต้องใช้ system_id
	} else if moveType == "SUB_MENU" {
		if pt != "MENU" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid move",
				"message": "SUB_MENU can be moved under MENU only",
			})
		}
		// ถ้ามี system_id ต้องตรงกับ parent
		if systemID != nil && parentSystemID.Valid && int(parentSystemID.Int64) != *systemID {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid system",
				"message": "parent is not in the requested system_id",
			})
		}
	} else {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid type",
			"message": "Only MENU and SUB_MENU are allowed to move",
		})
	}

	// 4) Update: ลง PARENT_OBJECT_ID
	if parentSystemID.Valid {
		_, err = db.Exec(`
			UPDATE IAMX.OBJECT
			SET
				PARENT_OBJECT_ID = :1,
				SYSTEM_ID        = :2,
				UPDATE_DATE      = SYSTIMESTAMP
			WHERE OBJECT_ID = :3
		`, newParentID, parentSystemID, objectID)
	} else {
		_, err = db.Exec(`
			UPDATE IAMX.OBJECT
			SET
				PARENT_OBJECT_ID = :1,
				UPDATE_DATE      = SYSTIMESTAMP
			WHERE OBJECT_ID = :2
		`, newParentID, objectID)
	}

	if err != nil {
		log.Printf("MoveManageMenu update error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to move menu",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success":       true,
		"message":       "Moved successfully",
		"object_id":     objectID,
		"new_parent_id": newParentID,
		"system_id":     systemIDStr,
	})
}
