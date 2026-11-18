package handlers

import (
	"api/core"
	"api/core/models"
	"log"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// CreateMyMenuAccessLog handles POST /iamx/api/public/me/menu-logs.
// Records an audit row in IAMX.menu_access_logs for the menu item the
// authenticated user just accessed. Accepts the Keycloak access_token
// in the Authorization header — same auth as the rest of /public/me/*.
//
// Renamed from CreateMenuAccessLog (Round 3): the legacy POST
// /iamx/api/menu-logs route is gone.
func (h *MenuHandler) CreateMyMenuAccessLog(c *fiber.Ctx) error {
	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Oracle database not connected",
		})
	}

	// Parse request body
	var req models.MenuAccessLogRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return errResp
	}

	// ดึง IP address
	ipAddress := getClientIP(c)

	// INSERT log
	query := `
		INSERT INTO menu_access_logs (user_id, obj_id, obj_name, module_code, url, ip_address)
		VALUES (:1, :2, :3, :4, :5, :6)
	`

	_, err := db.Exec(query, refUserID, req.ObjId, req.ObjName, req.ModuleCode, req.URL, ipAddress)
	if err != nil {
		log.Printf("Insert menu access log error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to save menu access log",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
	})
}

// getClientIP ดึง IP address ของ client (รองรับ reverse proxy)
func getClientIP(c *fiber.Ctx) string {
	// ตรวจสอบ X-Forwarded-For (กรณีอยู่หลัง reverse proxy)
	xff := c.Get("X-Forwarded-For")
	if xff != "" {
		// X-Forwarded-For อาจมีหลาย IP คั่นด้วย comma
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}

	// ตรวจสอบ X-Real-IP
	xri := c.Get("X-Real-IP")
	if xri != "" {
		return xri
	}

	// ใช้ IP ที่ Fiber ตรวจจับได้
	return c.IP()
}
