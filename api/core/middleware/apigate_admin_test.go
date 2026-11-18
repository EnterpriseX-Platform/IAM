package middleware

import (
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

func TestIsAdminPath(t *testing.T) {
	admin := []string{"/iamx/api/admin/roles", "/iamx/api/directory/users", "/iamx/api/users", "/iamx/api/users/1", "/iamx/api/console-admins", "/iamx/api/cache/clear", "/iamx/api/system/cache/clear", "/iamx/api/admin/activity/changes"}
	notAdmin := []string{"/iamx/api/public/me/roles", "/iamx/api/me/bootstrap", "/iamx/api/user-data", "/iamx/api/usersx", "/iamx/api/menu-logs", "/iamx/api/health"}
	for _, p := range admin {
		if !isAdminPath(p) {
			t.Errorf("%s should be admin-only", p)
		}
	}
	for _, p := range notAdmin {
		if isAdminPath(p) {
			t.Errorf("%s should not be admin-only", p)
		}
	}
}

func TestAdminPathAcceptsConsoleTokenOnly(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret")
	app := fiber.New()
	app.Use(RequireAuthUnlessPublic())
	app.Get("/iamx/api/admin/roles", func(c *fiber.Ctx) error { return c.SendString("ok") })

	tok, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"username": "admin", "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte("test-secret"))
	cases := []struct {
		auth string
		want int
	}{
		{"Bearer " + tok, 200},      // console token
		{"Bearer not-a-token", 401}, // garbage
		{"", 401},                   // none
	}
	for _, tc := range cases {
		req := httptest.NewRequest("GET", "/iamx/api/admin/roles", nil)
		if tc.auth != "" {
			req.Header.Set("Authorization", tc.auth)
		}
		resp, _ := app.Test(req)
		if resp.StatusCode != tc.want {
			t.Errorf("auth=%q got %d want %d", tc.auth, resp.StatusCode, tc.want)
		}
	}
}
