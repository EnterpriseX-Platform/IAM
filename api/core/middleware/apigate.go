package middleware

import (
	"context"
	"os"
	"strings"

	"api/core/config"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// publicPrefixes are the ONLY paths that may be reached without a token.
//
// Everything else under /iamx/api is console/admin surface. The split matters:
// the API had no authentication of any kind (setupAuthMiddleware existed but was
// never called), so GET /iamx/api/users returned every row of USER_INFO —
// including personal_card_id — to any caller that could reach the service. Only
// the edge WAF stood in front of it, which is also why the console's user screen
// shows "0 users": the WAF blocks /users and /admin/roles, and blocking there is
// the correct behaviour while the endpoint is unauthenticated.
//
// Each entry is public for a reason that holds before a session exists:
var publicPrefixes = []string{
	"/iamx/api/health",                         // liveness
	"/iamx/api/system/health",                  // liveness (canonical)
	"/iamx/api/auth/login",                     // issues the console token
	"/iamx/api/register",                       // ThaiD self-registration
	"/iamx/api/internal/keycloak-event",        // Keycloak webhook (no user context)
	"/iamx/api/system/webhooks/keycloak-event", // same, canonical path
	"/iamx/api/public/me",                      // caller's own data; handler resolves the bearer itself
	"/iamx/api/me",                             // same, canonical path
}

// adminPrefixes = กลุ่ม API จัดการสิทธิ์/ผู้ใช้/โครงสร้าง ที่ใช้จากหน้าจอ IAMX console เท่านั้น
var adminPrefixes = []string{
	"/iamx/api/admin", "/iamx/api/directory", "/iamx/api/users", "/iamx/api/console-admins",
	"/iamx/api/apps", "/iamx/api/access-types", "/iamx/api/ref-processes",
	"/iamx/api/oracle", "/iamx/api/cache", "/iamx/api/system/cache",
}

func isAdminPath(path string) bool {
	for _, p := range adminPrefixes {
		if path == p || strings.HasPrefix(path, p+"/") {
			return true
		}
	}
	return false
}

// RequireAuthUnlessPublic rejects unauthenticated calls to every non-public route.
//
// Always on — there is no switch. Accepts EITHER identity the platform issues: the
// console's own HMAC JWT from /auth/login, or a Keycloak access token. Requiring only
// one would lock out the other half of the platform — the console signs in against
// IAMX.ADMIN, while module traffic carries Keycloak tokens (and reaches /me/*, which
// is public and resolves the bearer in its handler).
//
// The console attaches its token to every /iamx/api call in one place
// (web/app/MethodOverrideClient.tsx), because many pages call fetch() directly.
func RequireAuthUnlessPublic() fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := c.Path()
		for _, p := range publicPrefixes {
			if path == p || strings.HasPrefix(path, p+"/") {
				return c.Next()
			}
		}
		if c.Method() == fiber.MethodOptions { // CORS preflight carries no token
			return c.Next()
		}

		token := strings.TrimPrefix(c.Get("Authorization"), "Bearer ")
		if token == "" || token == c.Get("Authorization") {
			return unauthorized(c, "Missing or malformed Authorization header")
		}
		if validConsoleJWT(token) {
			if isRevoked(token) {
				return unauthorized(c, "Signed out")
			}
			if msg := consoleRoleDenies(consoleRole(token), c.Method(), c.Path()); msg != "" {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": msg})
			}
			return c.Next()
		}
		// 14/11/69 (security): API จัดการสิทธิ์รับเฉพาะ token ของ IAMX console (ผู้ดูแล)
		// เดิมรับ token Keycloak ของใครก็ได้ → ผู้ใช้ ERP ทั่วไปเรียก /admin/* ผูกบทบาทให้ตัวเองได้
		// ระบบอื่นใช้แค่ /public/me/* (public) และ /user-data · ตรวจจากโค้ดทุก repo ใน ~/Works แล้ว 14/11
		if isAdminPath(c.Path()) {
			if validKeycloakToken(token) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "IAMX admin sign-in required"})
			}
			return unauthorized(c, "Invalid or expired token")
		}
		if validKeycloakToken(token) {
			return c.Next()
		}
		return unauthorized(c, "Invalid or expired token")
	}
}

func unauthorized(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"success": false,
		"message": msg,
	})
}

// validConsoleJWT checks the HMAC token minted by /iamx/api/auth/login.
func validConsoleJWT(tokenString string) bool {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return false
	}
	tok, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.ErrUnauthorized
		}
		return []byte(secret), nil
	})
	return err == nil && tok.Valid
}

// validKeycloakToken checks an access token issued by the platform realm.
func validKeycloakToken(tokenString string) bool {
	provider, err := config.GetKeycloakProvider()
	if err != nil {
		return false
	}
	_, err = provider.VerifyToken(context.Background(), tokenString)
	return err == nil
}

// 14/11/69 (security): ระดับผู้ดูแล IAMX (คอลัมน์ IAMX.ADMIN.ROLE → claim "role" ใน token console)
//
//	admin          = ผู้ดูแลระบบ ทำได้ทุกอย่าง
//	access_manager = จัดการผู้ใช้/บทบาท/ความรับผิดชอบ/สิทธิ์ ได้ · แก้โครงสร้างเมนู โดเมน ขั้นดำเนินการ และผู้ดูแล IAMX ไม่ได้
//	auditor        = ดูอย่างเดียว
var structurePrefixes = []string{
	"/iamx/api/console-admins", "/iamx/api/directory/domains", "/iamx/api/admin/domains", "/iamx/api/directory/applications", "/iamx/api/admin/applications",
	"/iamx/api/directory/modules", "/iamx/api/admin/modules", "/iamx/api/directory/objects", "/iamx/api/admin/objects", "/iamx/api/directory/object-types", "/iamx/api/admin/object-types",
	"/iamx/api/directory/process", "/iamx/api/admin/process", "/iamx/api/admin/processes", "/iamx/api/admin/subprocesses", "/iamx/api/directory/sub-process",
	"/iamx/api/apps", "/iamx/api/access-types", "/iamx/api/ref-processes", "/iamx/api/directory/permission-types", "/iamx/api/admin/permission-types",
	"/iamx/api/oracle", "/iamx/api/admin/ref-processes", "/iamx/api/admin/ref-subprocesses",
	"/iamx/api/admin/user-types", "/iamx/api/directory/user-types", "/iamx/api/admin/item-groups", "/iamx/api/directory/item-groups",
}

func consoleRole(token string) string {
	claims := jwt.MapClaims{}
	if _, _, err := jwt.NewParser().ParseUnverified(token, claims); err != nil {
		return ""
	}
	r, _ := claims["role"].(string)
	return r
}

func consoleRoleDenies(role, method, path string) string {
	write := method != fiber.MethodGet && method != fiber.MethodHead && method != fiber.MethodOptions
	if !write || strings.HasSuffix(path, "/auth/logout") || strings.HasSuffix(path, "/auth/login") || strings.HasSuffix(path, "/console-admins/me/password") {
		return ""
	}
	switch role {
	case "auditor":
		return "Read-only access (Auditor)"
	case "access_manager":
		for _, p := range structurePrefixes {
			if path == p || strings.HasPrefix(path, p+"/") || strings.HasPrefix(path, p+"-") {
				return "Not allowed for Access manager"
			}
		}
	}
	return ""
}
