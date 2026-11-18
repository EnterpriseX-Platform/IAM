// Slim per-user RBAC endpoints under /iamx/api/public/me/*
//
// These handlers expose individual slices of the same data that
// GetMyBootstrap (/iamx/api/public/me/bootstrap) returns in one shot.
// Portal callers can:
//   - Hit /me/bootstrap once on session start (one round-trip)
//   - Hit /me/menu, /me/domains, /me/roles, /me/permissions individually
//     when they only need to refresh one slice (cheaper than re-fetching
//     the whole bootstrap)
//
// All handlers reuse h.resolveRefUserID(c) for Keycloak Bearer auth — no
// separate middleware needed; the same USER_INCOMPLETE / 403 path applies.
package handlers

import (
	"context"
	"fmt"

	"github.com/gofiber/fiber/v2"
)

// userIncompleteResponse is the shared 403 body emitted when Keycloak
// gives us a valid token but no IAMX REF_USER_ID is wired to that subject.
// Inlined in GetMyBootstrap historically — extracted here so the four
// /me/* handlers don't drift.
func userIncompleteResponse(c *fiber.Ctx) error {
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"success":   false,
		"error":     "USER_INCOMPLETE",
		"errorCode": "REF_USER_ID_MISSING",
		"message":   "ไม่พบ REF_USER_ID ของผู้ใช้ — โปรดติดต่อผู้ดูแลระบบเพื่อเปิดใช้งาน",
	})
}

// GetMyMenu returns the menu tree (applications) the caller is permitted to see.
//
// Authentication: Keycloak access_token in the Authorization header.
// resolveRefUserID() pulls REF_USER_ID from the token's claims.
//
// @Summary      My menu
// @Description  Returns the applications the caller is permitted to access. Auth: Keycloak Bearer.
// @Tags         Me
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  map[string]interface{}  "menu tree"
// @Failure      401  {object}  map[string]string       "Missing or invalid token"
// @Failure      403  {object}  map[string]string       "Token valid but REF_USER_ID not provisioned"
// @Failure      500  {object}  map[string]string       "menuService failure"
// @Router       /me/menu [get]
func (h *MenuHandler) GetMyMenu(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}
	if refUserID == "" {
		return userIncompleteResponse(c)
	}

	menuData, err := h.menuService.GetUserMenu(context.Background(), refUserID)
	if err != nil {
		fmt.Printf("[/me/menu] GetUserMenu failed for refUserID=%q: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get user menu",
			"details": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"applications": menuData.Applications,
	})
}

// GetMyDomains handles GET /iamx/api/public/me/domains
// Returns just the domains the user has access to.
func (h *MenuHandler) GetMyDomains(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}
	if refUserID == "" {
		return userIncompleteResponse(c)
	}

	menuData, err := h.menuService.GetUserMenu(context.Background(), refUserID)
	if err != nil {
		fmt.Printf("[/me/domains] GetUserMenu failed for refUserID=%q: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get domains",
			"details": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"domains": menuData.Domains,
	})
}

// GetMyRoles handles GET /iamx/api/public/me/roles
// Returns the roles assigned to the authenticated user.
func (h *MenuHandler) GetMyRoles(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}
	if refUserID == "" {
		return userIncompleteResponse(c)
	}

	menuData, err := h.menuService.GetUserMenu(context.Background(), refUserID)
	if err != nil {
		fmt.Printf("[/me/roles] GetUserMenu failed for refUserID=%q: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get roles",
			"details": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"roles": menuData.Roles,
	})
}

// GetMyPagePermissions handles GET /iamx/api/public/me/page-permissions
// Returns effective permissions for non-menu objects (BUTTON, TAB, etc.) for the authenticated user.
// Optional query param: parentCode — filter to children of the given menu object code.
func (h *MenuHandler) GetMyPagePermissions(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil
	}
	if refUserID == "" {
		return userIncompleteResponse(c)
	}

	parentCode := c.Query("parentCode")

	result, err := h.menuService.GetPagePermissions(context.Background(), refUserID, parentCode)
	if err != nil {
		fmt.Printf("[/me/page-permissions] GetPagePermissions failed for refUserID=%q: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get page permissions",
			"details": err.Error(),
		})
	}

	return c.JSON(result)
}

// GetMyPermissions handles GET /iamx/api/public/me/permissions
// Returns the v_user_effective_data_access rows for the authenticated user.
// This is the data that used to be embedded in the legacy HMAC iamxToken
// (Phase 4 dropped that token; consumers now fetch the data directly).
func (h *MenuHandler) GetMyPermissions(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}
	if refUserID == "" {
		return userIncompleteResponse(c)
	}

	dataAccess, err := h.getDataAccess(context.Background(), refUserID)
	if err != nil {
		fmt.Printf("[/me/permissions] getDataAccess failed for refUserID=%q: %v\n", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get data access",
			"details": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"v_user_effective_data_access": dataAccess,
	})
}
