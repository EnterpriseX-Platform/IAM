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

// GET /manage-permission/roles
// ดึงข้อมูล IAMX ROLE พร้อม UAM ROLE ที่ผูก
func GetManagePermissionRoles(c *fiber.Ctx) error {
	db := core.GetDB()

	query := `
		SELECT
			r.ROLE_ID,
			r.ROLE_NAME,
			r.ROLE_DESC,
			rm.ROLE_MANAGE_ID,
			rm.ROLE_UAM,
			r2.ROLE_NAME AS UAM_ROLE_NAME,
			r2.ROLE_DESC AS UAM_ROLE_DESC
		FROM IAMX."ROLE" r
		LEFT JOIN IAMX.ROLE_MANAGE rm ON r.ROLE_ID = rm.ROLE_IAMX
		LEFT JOIN IAM3."ROLE" r2 ON TO_CHAR(r2.ROLE_ID) = rm.ROLE_UAM
		ORDER BY r.ROLE_ID, rm.ROLE_MANAGE_ID
	`

	rows, err := db.Query(query)
	if err != nil {
		log.Printf("GetManagePermissionRoles query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch manage permission roles",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	// map สำหรับรวม role (แม่)
	roleMap := map[string]*models.ManagePermissionRoleResponse{}
	roleOrder := make([]string, 0)

	for rows.Next() {
		var (
			roleID       sql.NullString
			roleName     sql.NullString
			roleDesc     sql.NullString
			roleManageID sql.NullString
			roleUAM      sql.NullInt64
			uamRoleName  sql.NullString
			uamRoleDesc  sql.NullString
		)

		if err := rows.Scan(
			&roleID,
			&roleName,
			&roleDesc,
			&roleManageID,
			&roleUAM,
			&uamRoleName,
			&uamRoleDesc,
		); err != nil {
			log.Printf("GetManagePermissionRoles scan error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to scan rows",
				"message": err.Error(),
			})
		}

		// ถ้า ROLE_ID เป็น null ข้ามเพื่อกัน panic
		if !roleID.Valid {
			continue
		}
		rid := roleID.String

		// สร้างแม่ถ้ายังไม่มี
		parent, ok := roleMap[rid]
		if !ok {
			parent = &models.ManagePermissionRoleResponse{
				UAMRoles: make([]models.ManagePermissionChild, 0),
			}

			v := rid
			parent.RoleID = &v

			if roleName.Valid {
				parent.RoleName = &roleName.String
			}
			if roleDesc.Valid {
				parent.RoleDesc = &roleDesc.String
			}

			roleMap[rid] = parent
			roleOrder = append(roleOrder, rid)
		}

		// ถ้าไม่มี role_manage จริงๆ (LEFT JOIN แล้วเป็น null) ก็ไม่ต้อง append ลูก
		if !roleManageID.Valid {
			continue
		}

		child := models.ManagePermissionChild{}

		if roleManageID.Valid {
			child.RoleManageID = &roleManageID.String
		}
		if roleUAM.Valid {
			v := int(roleUAM.Int64)
			child.RoleUAM = &v
		}
		if uamRoleName.Valid {
			child.UAMRoleName = &uamRoleName.String
		}
		if uamRoleDesc.Valid {
			child.UAMRoleDesc = &uamRoleDesc.String
		}

		parent.UAMRoles = append(parent.UAMRoles, child)
	}

	if err := rows.Err(); err != nil {
		log.Printf("GetManagePermissionRoles rows.Err: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Row iteration error",
			"message": err.Error(),
		})
	}

	// สร้าง array ตามลำดับเดิม
	out := make([]models.ManagePermissionRoleResponse, 0, len(roleOrder))
	for _, rid := range roleOrder {
		out = append(out, *roleMap[rid])
	}

	return c.JSON(out)
}

// GET /manage-permission/uam-roles
// ดึงข้อมูล IAM3.ROLE ทั้งหมด
func GetUAMRoles(c *fiber.Ctx) error {
	db := core.GetDB()

	query := `
		SELECT
			ROLE_ID,
			ROLE_NAME,
			ROLE_DESC
		FROM IAM3."ROLE"
		ORDER BY ROLE_ID
	`

	rows, err := db.Query(query)
	if err != nil {
		log.Printf("GetUAMRoles query error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to fetch UAM roles",
			"message": err.Error(),
		})
	}
	defer rows.Close()

	results := make([]models.UAMRoleResponse, 0)

	for rows.Next() {
		var (
			roleID   sql.NullInt64
			roleName sql.NullString
			roleDesc sql.NullString
		)

		if err := rows.Scan(&roleID, &roleName, &roleDesc); err != nil {
			log.Printf("GetUAMRoles scan error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Failed to scan rows",
				"message": err.Error(),
			})
		}

		out := models.UAMRoleResponse{}

		if roleID.Valid {
			v := int(roleID.Int64)
			out.RoleID = &v
		}
		if roleName.Valid {
			out.RoleName = &roleName.String
		}
		if roleDesc.Valid {
			out.RoleDesc = &roleDesc.String
		}

		results = append(results, out)
	}

	if err := rows.Err(); err != nil {
		log.Printf("GetUAMRoles rows.Err: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Row iteration error",
			"message": err.Error(),
		})
	}

	return c.JSON(results)
}

// PUT /manage-permission/roles/:roleId/bindings
// บันทึกการผูก IAMX-UAM Role (DELETE old + INSERT new)
func SaveManagePermissionBindings(c *fiber.Ctx) error {
	db := core.GetDB()

	// roleId จาก path param
	roleIdStr := strings.TrimSpace(c.Params("roleId"))
	if roleIdStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleId is required in path",
		})
	}

	var req models.SaveManagePermissionBindingsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid JSON body",
			"error":   err.Error(),
		})
	}

	if strings.TrimSpace(req.CreatedBy) == "" {
		req.CreatedBy = "SYSTEM"
	}

	tx, err := db.Begin()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Begin transaction failed",
			"error":   err.Error(),
		})
	}
	defer func() { _ = tx.Rollback() }()

	// 1) ลบ role_manage เดิมทั้งหมดของ ROLE_IAMX
	delSQL := `
		DELETE FROM IAMX.ROLE_MANAGE
		WHERE ROLE_IAMX = :1
	`

	roleIAMXStr := roleIdStr
	log.Printf("DEBUG SaveManagePermissionBindings: Deleting old bindings for ROLE_IAMX=%s", roleIAMXStr)

	if _, err := tx.Exec(delSQL, roleIAMXStr); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Delete old role bindings failed",
			"error":   err.Error(),
		})
	}

	// 2) insert ใหม่
	if len(req.RoleUAMs) > 0 {
		insSQL := `
			INSERT INTO IAMX.ROLE_MANAGE (
				ROLE_MANAGE_ID,
				ROLE_UAM,
				ROLE_IAMX,
				CREATED_DATE,
				CREATED_BY
			) VALUES (
				RAWTOHEX(SYS_GUID()),
				:1,
				:2,
				SYSTIMESTAMP,
				:3
			)
		`

		stmt, err := tx.Prepare(insSQL)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Prepare insert failed",
				"error":   err.Error(),
			})
		}
		defer stmt.Close()

		for _, uamRoleId := range req.RoleUAMs {
			if uamRoleId == 0 {
				continue
			}

			// Convert to string for VARCHAR2 columns
			roleUAMStr := strconv.Itoa(uamRoleId)
			roleIAMXStr := roleIdStr

			log.Printf("DEBUG SaveManagePermissionBindings: Inserting ROLE_UAM=%s, ROLE_IAMX=%s, CREATED_BY=%s",
				roleUAMStr, roleIAMXStr, req.CreatedBy)

			if _, err := stmt.Exec(
				roleUAMStr,    // :1 -> ROLE_UAM (VARCHAR2)
				roleIAMXStr,   // :2 -> ROLE_IAMX (VARCHAR2)
				req.CreatedBy, // :3 -> CREATED_BY
			); err != nil {
				log.Printf("ERROR SaveManagePermissionBindings: %v", err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"success": false,
					"message": "Insert role binding failed",
					"error":   err.Error(),
				})
			}
		}
	}

	if err := tx.Commit(); err != nil && err != sql.ErrTxDone {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Commit failed",
			"error":   err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Saved role bindings",
		"data": fiber.Map{
			"roleId": roleIdStr,
			"count":  len(req.RoleUAMs),
		},
	})
}

// DELETE /manage-permission/roles/:roleId/bindings/:bindingId
// ลบการผูก IAMX-UAM Role
func DeleteManagePermissionBinding(c *fiber.Ctx) error {
	db := core.GetDB()

	roleIdStr := strings.TrimSpace(c.Params("roleId"))
	bindingIdStr := strings.TrimSpace(c.Params("bindingId"))

	if roleIdStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "roleId is required in path",
		})
	}

	if bindingIdStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "bindingId is required in path",
		})
	}

	delSQL := `
		DELETE FROM IAMX.ROLE_MANAGE
		WHERE ROLE_IAMX = :1 AND ROLE_MANAGE_ID = :2
	`

	log.Printf("DEBUG DeleteManagePermissionBinding: ROLE_IAMX=%s, ROLE_MANAGE_ID=%s", roleIdStr, bindingIdStr)

	result, err := db.Exec(delSQL, roleIdStr, bindingIdStr)
	if err != nil {
		log.Printf("DeleteManagePermissionBinding error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Delete role binding failed",
			"error":   err.Error(),
		})
	}

	rowsAffected, _ := result.RowsAffected()

	return c.JSON(fiber.Map{
		"success":      true,
		"message":      "Deleted role binding",
		"rowsAffected": rowsAffected,
		"data": fiber.Map{
			"roleId":    roleIdStr,
			"bindingId": bindingIdStr,
		},
	})
}
