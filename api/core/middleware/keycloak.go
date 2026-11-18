package middleware

import (
	"context"
	"encoding/json"
	"log"
	"strings"

	"api/core/config"

	"github.com/gofiber/fiber/v2"
)

// KeycloakClaims represents the claims from a Keycloak ID token
type KeycloakClaims struct {
	Email             string `json:"email"`
	PreferredUsername string `json:"preferred_username"`
	Sub               string `json:"sub"`
	Name              string `json:"name"`
	GivenName         string `json:"given_name"`
	FamilyName        string `json:"family_name"`
}

// KeycloakAuth middleware validates Keycloak tokens and extracts user info
func KeycloakAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Get Keycloak provider
		provider, err := config.GetKeycloakProvider()
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Keycloak authentication not configured",
			})
		}

		// Extract token from Authorization header
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Missing Authorization header",
			})
		}

		// Remove "Bearer " prefix
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid Authorization header format",
			})
		}

		// Verify the token
		ctx := context.Background()
		idToken, err := provider.VerifyToken(ctx, token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid or expired token",
			})
		}

		// Parse claims
		var claims KeycloakClaims
		if err := idToken.Claims(&claims); err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Failed to parse token claims",
			})
		}

		var rawClaims map[string]interface{}
		if err := idToken.Claims(&rawClaims); err == nil {
			if b, err := json.MarshalIndent(rawClaims, "", "  "); err == nil {
				log.Printf("[Keycloak] token claims:\n%s", string(b))
			}
		}

		// Store user info in context for handlers to use
		// Use preferred_username as primary identifier, fallback to email
		username := claims.PreferredUsername
		if username == "" {
			username = claims.Email
		}

		c.Locals("username", username)
		c.Locals("email", claims.Email)
		c.Locals("keycloakId", claims.Sub)
		c.Locals("fullName", claims.Name)
		c.Locals("firstName", claims.GivenName)
		c.Locals("lastName", claims.FamilyName)

		return c.Next()
	}
}
