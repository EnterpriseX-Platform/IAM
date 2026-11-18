package services

import (
	"api/core/models"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// CacheItem represents a cached item with TTL
type CacheItem struct {
	Data      interface{}
	ExpiresAt time.Time
}

// IsExpired checks if the cache item has expired
func (i *CacheItem) IsExpired() bool {
	return time.Now().After(i.ExpiresAt)
}

// CacheService provides in-memory caching with TTL support
type CacheService struct {
	mu sync.RWMutex

	// Menu cache: key = "menu:{refUserID}:{domainURL}:{applicationID}"
	menuCache map[string]*CacheItem

	// Default TTL
	menuTTL time.Duration

	// Cleanup interval
	cleanupInterval time.Duration
	stopCleanup     chan bool
}

// NewCacheService creates a new CacheService with default TTL values
func NewCacheService() *CacheService {
	cs := &CacheService{
		menuCache: make(map[string]*CacheItem),
		// Menu changes infrequently, cache for 15 minutes
		menuTTL:         15 * time.Minute,
		cleanupInterval: 5 * time.Minute,
		stopCleanup:     make(chan bool),
	}

	// Start background cleanup goroutine
	go cs.cleanupExpired()

	return cs
}

// Stop stops the background cleanup goroutine
func (cs *CacheService) Stop() {
	close(cs.stopCleanup)
}

// cleanupExpired periodically removes expired items from all caches
func (cs *CacheService) cleanupExpired() {
	ticker := time.NewTicker(cs.cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cs.removeExpired()
		case <-cs.stopCleanup:
			return
		}
	}
}

// removeExpired removes expired items from all caches
func (cs *CacheService) removeExpired() {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	removed := 0
	for key, item := range cs.menuCache {
		if item.IsExpired() {
			delete(cs.menuCache, key)
			removed++
		}
	}

	if removed > 0 {
		log.Printf("[Cache] Cleaned up %d expired items", removed)
	}
}

// GetMenu retrieves cached menu data
func (cs *CacheService) GetMenu(refUserID, domainURL string, applicationID *int64) (*models.UserDataResponse, bool) {
	key := cs.buildMenuKey(refUserID, domainURL, applicationID)

	cs.mu.RLock()
	defer cs.mu.RUnlock()

	item, exists := cs.menuCache[key]
	if !exists || item.IsExpired() {
		return nil, false
	}

	data, ok := item.Data.(*models.UserDataResponse)
	if !ok {
		return nil, false
	}

	return cs.copyMenuResponse(data), true
}

// SetMenu caches menu data
func (cs *CacheService) SetMenu(refUserID, domainURL string, applicationID *int64, data *models.UserDataResponse) {
	key := cs.buildMenuKey(refUserID, domainURL, applicationID)

	cs.mu.Lock()
	defer cs.mu.Unlock()

	cs.menuCache[key] = &CacheItem{
		Data:      cs.copyMenuResponse(data),
		ExpiresAt: time.Now().Add(cs.menuTTL),
	}

	log.Printf("[Cache] Menu cached for user %s, domain %s", refUserID, domainURL)
}

// InvalidateMenu removes menu cache for a specific user
func (cs *CacheService) InvalidateMenu(refUserID string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	prefix := fmt.Sprintf("menu:%s:", refUserID)
	removed := 0
	for key := range cs.menuCache {
		if len(key) >= len(prefix) && key[:len(prefix)] == prefix {
			delete(cs.menuCache, key)
			removed++
		}
	}

	if removed > 0 {
		log.Printf("[Cache] Invalidated %d menu entries for user %s", removed, refUserID)
	}
}

// buildMenuKey creates a cache key for menu data
func (cs *CacheService) buildMenuKey(refUserID, domainURL string, applicationID *int64) string {
	if applicationID != nil {
		return fmt.Sprintf("menu:%s:%s:%d", refUserID, domainURL, *applicationID)
	}
	return fmt.Sprintf("menu:%s:%s:all", refUserID, domainURL)
}

// copyMenuResponse creates a deep copy of menu response
func (cs *CacheService) copyMenuResponse(original *models.UserDataResponse) *models.UserDataResponse {
	data, _ := json.Marshal(original)
	var copied models.UserDataResponse
	json.Unmarshal(data, &copied)
	return &copied
}

// ClearAll clears all caches
func (cs *CacheService) ClearAll() {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	cs.menuCache = make(map[string]*CacheItem)
	log.Println("[Cache] All caches cleared")
}

// GetStats returns cache statistics
func (cs *CacheService) GetStats() map[string]interface{} {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	return map[string]interface{}{
		"menu": len(cs.menuCache),
	}
}
