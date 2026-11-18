package handlers

import (
	"api/core/config"
	"log"

	"github.com/gofiber/fiber/v2"
)

func kcUserID(kc *config.KeycloakAdminClient, username, email string) (string, error) {
	if username != "" {
		if id, err := kc.FindUserByUsername(username); err == nil && id != "" {
			return id, nil
		}
	}
	return kc.FindUserByEmail(email)
}

// GET /directory/two-factor?username=&email=
func GetTwoFactor(c *fiber.Ctx) error {
	kc := config.NewKeycloakAdminClient()
	id, err := kcUserID(kc, c.Query("username"), c.Query("email"))
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "ไม่พบบัญชีนี้ในระบบ login"})
	}
	st, err := kc.GetTwoFactorStatus(id)
	if err != nil {
		log.Printf("GetTwoFactor error: %v", err)
		return c.Status(502).JSON(fiber.Map{"success": false, "message": "อ่านสถานะยืนยัน 2 ขั้นตอนไม่สำเร็จ"})
	}
	return c.JSON(fiber.Map{"success": true, "data": st})
}

// POST /directory/two-factor {username, email, enabled}
func SetTwoFactor(c *fiber.Ctx) error {
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Enabled  bool   `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "ข้อมูลไม่ถูกต้อง"})
	}
	kc := config.NewKeycloakAdminClient()
	id, err := kcUserID(kc, req.Username, req.Email)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "ไม่พบบัญชีนี้ในระบบ login"})
	}
	if err := kc.SetTwoFactor(id, req.Enabled); err != nil {
		log.Printf("SetTwoFactor error: %v", err)
		return c.Status(502).JSON(fiber.Map{"success": false, "message": "ตั้งค่ายืนยัน 2 ขั้นตอนไม่สำเร็จ"})
	}
	st, _ := kc.GetTwoFactorStatus(id)
	log.Printf("[2FA] %s enabled=%v", id, req.Enabled)
	return c.JSON(fiber.Map{"success": true, "data": st})
}
