package middleware

import (
	"api/core/i18n"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// TranslateMessages แปลข้อความตอบกลับของ API เป็นภาษาอังกฤษ (14/11/69)
func TranslateMessages() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// แปลเฉพาะ API ของ IAMX console · ระบบอื่น (/public/me/*, /user-data) จอเป็นภาษาไทย ไม่แตะ
		if !isAdminPath(c.Path()) && !strings.HasPrefix(c.Path(), "/iamx/api/auth/") {
			return c.Next()
		}
		err := c.Next()
		var fe *fiber.Error
		if errors.As(err, &fe) {
			fe.Message = i18n.T(fe.Message)
			return err
		}
		if strings.Contains(string(c.Response().Header.ContentType()), "json") {
			if nb := i18n.Body(c.Response().Body()); nb != nil {
				c.Response().SetBodyRaw(nb)
			}
		}
		return err
	}
}
