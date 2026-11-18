package handlers

import (
	"api/core"
	"api/core/services"

	"github.com/gofiber/fiber/v2"
)

// CacheHandler handles cache management HTTP requests
type CacheHandler struct {
	cacheService *services.CacheService
}

// NewCacheHandler creates a new CacheHandler
func NewCacheHandler(cacheService *services.CacheService) *CacheHandler {
	return &CacheHandler{cacheService: cacheService}
}

// GetStats handles GET /api/v1/cache/stats
func (h *CacheHandler) GetStats(c *fiber.Ctx) error {
	stats := h.cacheService.GetStats()
	return c.JSON(fiber.Map{
		"success": true,
		"data":    stats,
	})
}

// ClearAll handles POST /api/v1/cache/clear
func (h *CacheHandler) ClearAll(c *fiber.Ctx) error {
	h.cacheService.ClearAll()
	return c.JSON(fiber.Map{
		"success": true,
		"message": "All caches cleared successfully",
	})
}

// InvalidateUserMenu handles POST /api/v1/cache/invalidate/menu/:refUserId
func (h *CacheHandler) InvalidateUserMenu(c *fiber.Ctx) error {
	refUserID := c.Params("refUserId")
	if refUserID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "refUserId is required",
		})
	}

	h.cacheService.InvalidateMenu(refUserID)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Menu cache for user invalidated",
		"data": fiber.Map{
			"refUserId": refUserID,
		},
	})
}

// InvalidateUserMenuByUsernameRequest - Request body for username-based cache invalidation
type InvalidateUserMenuByUsernameRequest struct {
	Username string `json:"username"` // Can be email or ref_user_id
}

// InvalidateUserMenuByUsername handles POST /api/v1/cache/invalidate/menu
// Accepts username/email in JSON body - useful for external projects
func (h *CacheHandler) InvalidateUserMenuByUsername(c *fiber.Ctx) error {
	var req InvalidateUserMenuByUsernameRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request body",
		})
	}

	if req.Username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "username is required",
		})
	}

	// Try to look up ref_user_id from username/email
	oracleDB := core.GetDB()
	if oracleDB != nil {
		var refUserID string
		err := oracleDB.QueryRow(
			`SELECT REF_USER_ID FROM IAMX.USER_INFO WHERE EMAIL = :1 OR REF_USER_ID = :1 AND ROWNUM = 1`,
			req.Username,
		).Scan(&refUserID)

		if err == nil && refUserID != "" {
			h.cacheService.InvalidateMenu(refUserID)
			return c.JSON(fiber.Map{
				"success": true,
				"message": "Menu cache for user invalidated",
				"data": fiber.Map{
					"username":  req.Username,
					"refUserId": refUserID,
				},
			})
		}
	}

	// If lookup failed or DB not available, use username directly as ref_user_id
	h.cacheService.InvalidateMenu(req.Username)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Menu cache for user invalidated (username used as refUserId)",
		"data": fiber.Map{
			"username": req.Username,
		},
	})
}
