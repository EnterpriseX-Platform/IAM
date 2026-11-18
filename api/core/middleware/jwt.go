package middleware

import (
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// JWTClaims represents the JWT claims structure
type JWTClaims struct {
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	jwt.RegisteredClaims
}

// JWTAuth middleware validates JWT tokens and extracts user info
func JWTAuth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Extract token from Authorization header
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Missing Authorization header",
			})
		}

		// Remove "Bearer " prefix
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid Authorization header format",
			})
		}

		// Parse and validate the token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// Validate signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(os.Getenv("JWT_SECRET")), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid or expired token",
			})
		}

		// Extract claims
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid token claims",
			})
		}

		// Store user info in context
		if username, ok := claims["username"].(string); ok {
			c.Locals("username", username)
		}
		if userID, ok := claims["userId"].(string); ok {
			c.Locals("userId", userID)
		}
		if refUserID, ok := claims["refUserId"].(string); ok {
			c.Locals("refUserId", refUserID)
		}
		if firstName, ok := claims["firstName"].(string); ok {
			c.Locals("firstName", firstName)
		}
		if lastName, ok := claims["lastName"].(string); ok {
			c.Locals("lastName", lastName)
		}
		if role, ok := claims["role"].(string); ok {
			c.Locals("role", role)
		}

		return c.Next()
	}
}
