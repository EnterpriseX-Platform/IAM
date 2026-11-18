// Per-user report endpoint under /iamx/api/{me,public/me}/reports
//
// Auth is identical to the rest of the /me/* family: h.resolveRefUserID(c)
// verifies the Keycloak bearer token and resolves REF_USER_ID, emitting the
// same 401 / 403 USER_INCOMPLETE / 404 USER_NOT_FOUND bodies. No middleware.
//
// A report reaches the caller two ways, and both are returned in one list:
//
//	ROLE   — granted to a role the caller holds (IAMX.ROLE_REPORT_MAPPING)
//	DIRECT — granted to the caller personally (IAMX.USER_REPORT_MAPPING)
//
// If both apply, `via` is BOTH and the permission arrays are unioned.
package handlers

import (
	"api/core"
	"api/core/services"
	"log"
	"sort"

	"github.com/gofiber/fiber/v2"
)

// MyReport is one report the caller may access, with its effective permissions.
type MyReport struct {
	ReportCode  string   `json:"report_code"`
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
	Via         string   `json:"via"` // ROLE | DIRECT | BOTH
}

// GetMyReports handles GET /iamx/api/public/me/reports
// Returns the reports the authenticated caller can access, via role or direct grant.
func (h *MenuHandler) GetMyReports(c *fiber.Ctx) error {
	refUserID, _, _, errResp := h.resolveRefUserID(c)
	if errResp != nil {
		return nil // response already written by resolveRefUserID
	}
	if refUserID == "" {
		return userIncompleteResponse(c)
	}

	db := core.GetDB()
	if db == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "message": "Oracle database not connected",
		})
	}

	// Role grants join through USER_ROLE_MAPPING exactly like menu_service
	// getUserRoles does (is_active only — role window intentionally not
	// filtered here so /me/reports and /me/roles agree on which roles apply).
	// The report grant itself IS date-filtered: expired grants must not leak.
	rows, err := db.Query(`
		SELECT rrm.report_code, NVL(rrm.permission, '[]') AS permission, 'ROLE' AS via
		FROM IAMX.USER_ROLE_MAPPING urm
		JOIN IAMX.ROLE_REPORT_MAPPING rrm ON rrm.role_id = urm.role_id
		WHERE urm.user_id = :1
		  AND urm.is_active = 1
		  AND rrm.is_active = 1
		  AND TRUNC(SYSDATE) >= rrm.effective_date
		  AND (rrm.expire_date IS NULL OR TRUNC(SYSDATE) <= rrm.expire_date)
		UNION ALL
		SELECT urpm.report_code, NVL(urpm.permission, '[]') AS permission, 'DIRECT' AS via
		FROM IAMX.USER_REPORT_MAPPING urpm
		WHERE urpm.user_id = :2
		  AND urpm.is_active = 1
		  AND TRUNC(SYSDATE) >= urpm.effective_date
		  AND (urpm.expire_date IS NULL OR TRUNC(SYSDATE) <= urpm.expire_date)
	`, refUserID, refUserID)
	if err != nil {
		log.Printf("[/me/reports] query failed for refUserID=%q: %v", refUserID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to get reports",
			"details": err.Error(),
		})
	}
	defer rows.Close()

	merged := map[string]*MyReport{}
	for rows.Next() {
		var code, permJSON, via string
		if err := rows.Scan(&code, &permJSON, &via); err != nil {
			log.Printf("[/me/reports] scan error: %v", err)
			continue
		}

		entry, ok := merged[code]
		if !ok {
			entry = &MyReport{ReportCode: code, Permissions: []string{}, Via: via}
			merged[code] = entry
		} else if entry.Via != via {
			entry.Via = "BOTH"
		}
		entry.Permissions = unionPermissions(entry.Permissions, parsePermissionJSON(permJSON))
	}

	// Names live in Report Studio. If it is unreachable the caller still gets
	// their codes and permissions — an outage upstream must not deny access.
	source := services.ReportSource()
	if catalog, err := services.FetchReports(""); err != nil {
		log.Printf("[/me/reports] report name lookup failed: %v", err)
		source = "unavailable"
	} else {
		names := make(map[string]string, len(catalog))
		for _, r := range catalog {
			names[r.Code] = r.Name
		}
		for code, entry := range merged {
			entry.Name = names[code]
		}
	}

	reports := make([]MyReport, 0, len(merged))
	for _, entry := range merged {
		reports = append(reports, *entry)
	}
	sort.Slice(reports, func(i, j int) bool { return reports[i].ReportCode < reports[j].ReportCode })

	return c.JSON(fiber.Map{
		"success": true,
		"source":  source,
		"reports": reports,
	})
}

// unionPermissions merges two permission lists, keeping first-seen order.
func unionPermissions(a, b []string) []string {
	seen := make(map[string]struct{}, len(a)+len(b))
	out := make([]string, 0, len(a)+len(b))

	for _, list := range [][]string{a, b} {
		for _, p := range list {
			if _, dup := seen[p]; dup {
				continue
			}
			seen[p] = struct{}{}
			out = append(out, p)
		}
	}
	return out
}
