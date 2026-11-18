package handlers

import (
	"api/core"
	"api/core/services"
	"log"
)

// invalidateCacheForRole invalidates menu cache for all users with the given role
func invalidateCacheForRole(roleID string) {
	cacheService := getCacheService()
	if cacheService == nil {
		return
	}

	// Get all users (ref_user_id) that have this role via responsibility_role_mapping
	pgDB := core.GetDB()
	if pgDB == nil {
		return
	}

	query := `
		SELECT DISTINCT u.ref_user_id
		FROM user_info u
		JOIN user_responsibility_mapping ur ON u.user_id = ur.user_id
		JOIN responsibility_role_mapping rrm ON ur.responsibility_id = rrm.responsibility_id
		WHERE rrm.role_id = :1
		  AND ur.is_active = 1
	`

	rows, err := pgDB.Query(query, roleID)
	if err != nil {
		log.Printf("[Cache] Failed to get users for role %s: %v", roleID, err)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var refUserID string
		if err := rows.Scan(&refUserID); err != nil {
			continue
		}
		cacheService.InvalidateMenu(refUserID)
		count++
	}

	if count > 0 {
		log.Printf("[Cache] Invalidated menu cache for %d users with role %s", count, roleID)
	}
}

// invalidateCacheForMapping invalidates cache for users affected by a role-object mapping
// This looks up the role_id from the mapping_id and invalidates cache for all users with that role
func invalidateCacheForMapping(mappingID string) {
	pgDB := core.GetDB()
	if pgDB == nil {
		return
	}

	var roleID string
	err := pgDB.QueryRow(`SELECT role_id FROM role_object_mapping WHERE id = :1`, mappingID).Scan(&roleID)
	if err != nil {
		log.Printf("[Cache] Failed to get role_id for mapping %s: %v", mappingID, err)
		return
	}

	invalidateCacheForRole(roleID)
}

// invalidateCacheForUser invalidates cache for a specific user by user_id
func invalidateCacheForUser(userID string) {
	cacheService := getCacheService()
	if cacheService == nil {
		return
	}

	pgDB := core.GetDB()
	if pgDB == nil {
		return
	}

	// Get ref_user_id from user_id
	var refUserID string
	err := pgDB.QueryRow(`SELECT ref_user_id FROM user WHERE id = :1`, userID).Scan(&refUserID)
	if err != nil {
		log.Printf("[Cache] Failed to get ref_user_id for user %s: %v", userID, err)
		return
	}

	cacheService.InvalidateMenu(refUserID)
	log.Printf("[Cache] Invalidated menu cache for user %s", refUserID)
}

// invalidateCacheForUserCustomDataAccess invalidates cache for user with custom data access
func invalidateCacheForUserCustomDataAccess(dataAccessID string) {
	cacheService := getCacheService()
	if cacheService == nil {
		return
	}

	pgDB := core.GetDB()
	if pgDB == nil {
		return
	}

	// Get ref_user_id from user_custom_data_access
	var refUserID string
	err := pgDB.QueryRow(`
		SELECT u.ref_user_id 
		FROM user_custom_data_access ucda
		JOIN user u ON ucda.user_id = u.id
		WHERE ucda.id = :1
	`, dataAccessID).Scan(&refUserID)

	if err != nil {
		log.Printf("[Cache] Failed to get user for data access %s: %v", dataAccessID, err)
		return
	}

	cacheService.InvalidateMenu(refUserID)
	log.Printf("[Cache] Invalidated menu cache for user %s (custom data access)", refUserID)
}

// invalidateCacheForResponsibility invalidates cache for all users with the given responsibility
func invalidateCacheForResponsibility(responsibilityID string) {
	cacheService := getCacheService()
	if cacheService == nil {
		return
	}

	pgDB := core.GetDB()
	if pgDB == nil {
		return
	}

	// Get all users with this responsibility
	query := `
		SELECT DISTINCT u.ref_user_id
		FROM user u
		JOIN user_responsibility ur ON u.id = ur.user_id
		WHERE ur.responsibility_id = :1
		  AND ur.is_active = 1
		  AND u.is_active = true
	`

	rows, err := pgDB.Query(query, responsibilityID)
	if err != nil {
		log.Printf("[Cache] Failed to get users for responsibility %s: %v", responsibilityID, err)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var refUserID string
		if err := rows.Scan(&refUserID); err != nil {
			continue
		}
		cacheService.InvalidateMenu(refUserID)
		count++
	}

	if count > 0 {
		log.Printf("[Cache] Invalidated menu cache for %d users with responsibility %s", count, responsibilityID)
	}
}

// getCacheService returns the global cache service instance
// This is set during route initialization
var globalCacheSvc *services.CacheService

func SetCacheService(cs *services.CacheService) {
	globalCacheSvc = cs
}

func getCacheService() *services.CacheService {
	return globalCacheSvc
}
