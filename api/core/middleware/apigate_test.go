package middleware

import (
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

func appWithGate() *fiber.App {
	app := fiber.New()
	api := app.Group("/iamx/api")
	api.Use(RequireAuthUnlessPublic())
	api.Get("/health", func(c *fiber.Ctx) error { return c.SendString("ok") })
	api.Get("/users", func(c *fiber.Ctx) error { return c.SendString("USER LIST") })
	api.Get("/admin/roles", func(c *fiber.Ctx) error { return c.SendString("ROLES") })
	api.Get("/me/bootstrap", func(c *fiber.Ctx) error { return c.SendString("me") })
	api.Post("/register", func(c *fiber.Ctx) error { return c.SendString("registered") })
	return app
}

func status(t *testing.T, app *fiber.App, method, path, auth string) int {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	return res.StatusCode
}

func consoleToken(t *testing.T, secret string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"username": "admin",
		"exp":      time.Now().Add(time.Hour).Unix(),
	})
	s, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestGateBlocksAdminSurface(t *testing.T) {
	app := appWithGate()

	// The two paths the WAF currently has to block, and the reason it must:
	// /users leaks personal_card_id for every active user.
	for _, p := range []string{"/iamx/api/users", "/iamx/api/admin/roles"} {
		if got := status(t, app, "GET", p, ""); got != 401 {
			t.Errorf("%s = %d, want 401 with no token", p, got)
		}
		if got := status(t, app, "GET", p, "NotBearer abc"); got != 401 {
			t.Errorf("%s malformed header = %d, want 401", p, got)
		}
		if got := status(t, app, "GET", p, "Bearer not-a-real-token"); got != 401 {
			t.Errorf("%s bad token = %d, want 401", p, got)
		}
	}
}

func TestPublicRoutesStayOpen(t *testing.T) {
	app := appWithGate()

	// Login, registration, health and the self-service /me/* endpoints have no
	// session yet (or resolve the bearer themselves), so they must stay reachable.
	cases := []struct{ method, path string }{
		{"GET", "/iamx/api/health"},
		{"POST", "/iamx/api/register"},
		{"GET", "/iamx/api/me/bootstrap"},
	}
	for _, tc := range cases {
		if got := status(t, app, tc.method, tc.path, ""); got != 200 {
			t.Errorf("%s %s = %d, want 200 (public)", tc.method, tc.path, got)
		}
	}
}

func TestConsoleJWTIsAccepted(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret")
	defer os.Unsetenv("JWT_SECRET")
	app := appWithGate()

	if got := status(t, app, "GET", "/iamx/api/users", "Bearer "+consoleToken(t, "test-secret")); got != 200 {
		t.Errorf("console token = %d, want 200 — the IAM-X console signs in against IAMX.ADMIN, not Keycloak", got)
	}
	if got := status(t, app, "GET", "/iamx/api/users", "Bearer "+consoleToken(t, "wrong-secret")); got != 401 {
		t.Errorf("token signed with the wrong secret = %d, want 401", got)
	}
}
