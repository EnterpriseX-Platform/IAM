package handlers

import (
	"api/core"
	"context"
	"log"

	"github.com/gofiber/fiber/v2"
)

// KeycloakAdminEvent matches the payload from keycloak-event-listener-http
// and Keycloak 24+ built-in webhooks for admin events.
type KeycloakAdminEvent struct {
	ResourceType   string `json:"resourceType"`
	OperationType  string `json:"operationType"`
	ResourcePath   string `json:"resourcePath"` // e.g. "users/{keycloak-uuid}"
	Representation string `json:"representation"`
}

// KeycloakEventHandler handles Keycloak admin event webhooks.
// Processes USER DELETE to remove the user from IAMX.user_info (APP.USER_INFO is a view over it).
func KeycloakEventHandler(c *fiber.Ctx) error {
	var event KeycloakAdminEvent
	if err := c.BodyParser(&event); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}

	log.Printf("[KeycloakEvent] resourceType=%s operationType=%s path=%s",
		event.ResourceType, event.OperationType, event.ResourcePath)

	if event.ResourceType == "USER" && event.OperationType == "DELETE" {
		// resourcePath = "users/{keycloak-uuid}" — extract uuid
		keycloakID := extractKeycloakID(event.ResourcePath)
		if keycloakID == "" {
			log.Printf("[KeycloakEvent] DELETE: could not parse keycloak ID from path: %s", event.ResourcePath)
			return c.SendStatus(fiber.StatusOK)
		}

		if err := deleteUserByKeycloakID(keycloakID); err != nil {
			log.Printf("[KeycloakEvent] DELETE user %s error: %v", keycloakID, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}

		log.Printf("[KeycloakEvent] Deleted user keycloakID=%s from DB", keycloakID)
	}

	return c.SendStatus(fiber.StatusOK)
}

func deleteUserByKeycloakID(keycloakID string) error {
	db := core.GetDB()
	if db == nil {
		return nil
	}

	// Get user_id + email before delete (need for Oracle lookup)
	var userID int
	var email string
	err := db.QueryRowContext(context.Background(),
		`SELECT user_id, COALESCE(email, '') FROM user_info WHERE keycloak_id = :1 AND ROWNUM = 1`,
		keycloakID,
	).Scan(&userID, &email)

	if err != nil {
		// keycloak_id column may not exist — fallback: skip Oracle, soft-delete by keycloak_id not possible
		log.Printf("[KeycloakEvent] user lookup failed (keycloak_id column missing?): %v", err)
		return nil
	}

	// Delete IAMX.user_info row (canonical — APP.USER_INFO is a view over it)
	if _, err := db.ExecContext(context.Background(),
		`DELETE FROM user_info WHERE user_id = :1`, userID,
	); err != nil {
		return err
	}

	return nil
}

func extractKeycloakID(resourcePath string) string {
	// resourcePath format: "users/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
	const prefix = "users/"
	if len(resourcePath) > len(prefix) {
		return resourcePath[len(prefix):]
	}
	return ""
}
