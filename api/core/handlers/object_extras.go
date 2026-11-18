package handlers

import (
	"api/core"
	"database/sql"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type objectFlatRow struct {
	ID             int64          `json:"id"`
	ModuleID       int64          `json:"module_id"`
	ObjectTypeID   int64          `json:"object_type_id"`
	ObjectTypeCode sql.NullString `json:"object_type_code"`
	ParentID       sql.NullInt64  `json:"parent_id"`
	Code           string         `json:"code"`
	Name           string         `json:"name"`
	Path           sql.NullString `json:"path"`
	ObjectLevel    int            `json:"object_level"`
	SortOrder      int            `json:"sort_order"`
	IsActive       int            `json:"is_active"`
}

// GET /directory/objects
//
//	?type=MENU         filter by object_type.code (replaces V1 /manage-menus/menu-only)
//	?module_id=X       filter by module
//	no params          flat list of all active objects (replaces V1 /manage-menus/simple)
func GetAllObjects(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	typeCode := strings.ToUpper(strings.TrimSpace(c.Query("type")))
	moduleID := c.Query("module_id")

	q := `SELECT o.id, o.module_id, o.object_type_id, ot.code AS type_code,
		         o.parent_id, o.code, o.name, o.path,
		         o.object_level, o.sort_order, o.is_active
		  FROM object o
		  LEFT JOIN object_type ot ON ot.id = o.object_type_id
		  WHERE o.is_active = 1`
	args := []interface{}{}
	idx := 1
	if typeCode != "" {
		q += ` AND ot.code = :` + itoa(idx)
		args = append(args, typeCode)
		idx++
	}
	if moduleID != "" {
		q += ` AND o.module_id = :` + itoa(idx)
		args = append(args, moduleID)
	}
	q += ` ORDER BY o.module_id, o.object_level, o.sort_order, o.id`

	rows, err := db.Query(q, args...)
	if err != nil {
		log.Printf("GetAllObjects error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch objects",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	out := []objectFlatRow{}
	for rows.Next() {
		var r objectFlatRow
		if err := rows.Scan(&r.ID, &r.ModuleID, &r.ObjectTypeID, &r.ObjectTypeCode,
			&r.ParentID, &r.Code, &r.Name, &r.Path,
			&r.ObjectLevel, &r.SortOrder, &r.IsActive); err != nil {
			continue
		}
		out = append(out, r)
	}
	return c.JSON(fiber.Map{"data": out})
}

type moveObjectRequest struct {
	NewParentID *int64 `json:"new_parent_id"` // nil = move to root
	SortOrder   *int   `json:"sort_order"`    // nil = keep
}

// POST /directory/objects/:id/move
// Re-parents the object node and optionally re-orders.
// Replaces V1 POST /manage-menus/:id/move.
func MoveObject(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oracle database not connected"})
	}

	id := c.Params("id")
	var req moveObjectRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// Reject moving a node under itself or under one of its descendants.
	// Oracle: walk descendants of the node being moved via CONNECT BY,
	// then check whether the proposed parent is in that set.
	if req.NewParentID != nil {
		var hits int
		err := db.QueryRow(`
			SELECT COUNT(*)
			  FROM (
			    SELECT id FROM object
			    START WITH id = :1
			    CONNECT BY PRIOR id = parent_id
			  )
			 WHERE id = :2
		`, id, *req.NewParentID).Scan(&hits)
		if err != nil {
			log.Printf("MoveObject cycle check error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to verify move",
				"message": err.Error(),
			})
		}
		if hits > 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "cannot move object under itself or one of its descendants",
			})
		}
	}

	var res sql.Result
	var err error
	if req.SortOrder != nil {
		res, err = db.Exec(`
			UPDATE object
			   SET parent_id = :1, sort_order = :2, updated_at = SYSTIMESTAMP
			 WHERE id = :3
		`, req.NewParentID, *req.SortOrder, id)
	} else {
		res, err = db.Exec(`
			UPDATE object
			   SET parent_id = :1, updated_at = SYSTIMESTAMP
			 WHERE id = :2
		`, req.NewParentID, id)
	}
	if err != nil {
		log.Printf("MoveObject error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to move object",
			"message": err.Error(),
		})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "object not found"})
	}
	return c.JSON(fiber.Map{"message": "Object moved"})
}

// itoa converts int to string for :N placeholder building.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
