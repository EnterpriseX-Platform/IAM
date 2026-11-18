package middleware

// 14/11/69 (security): token ของ IAMX console ยกเลิกได้เมื่อกดออกจากระบบ
// เก็บ hash ของ token ใน IAMX.ADMIN_ACTIVITY_LOG (action LOGOUT) · ทุก pod โหลดรายการทุก 30 วินาที
// pod ที่รับคำขอออกจากระบบตัดทันที · token หมดอายุเองใน 24 ชม. จึงโหลดย้อนหลังแค่ 1 วัน

import (
	"api/core"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"sync"
	"time"
)

var (
	revokedMu   sync.RWMutex
	revoked     = map[string]struct{}{}
	revokedOnce sync.Once
)

func TokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func isRevoked(token string) bool {
	startRevokedLoader()
	revokedMu.RLock()
	defer revokedMu.RUnlock()
	_, ok := revoked[TokenHash(token)]
	return ok
}

// RevokeToken ตัด token ทันทีในเครื่องนี้ และบันทึกให้ pod อื่นรู้
func RevokeToken(token, actor, ip string) {
	hash := TokenHash(token)
	revokedMu.Lock()
	revoked[hash] = struct{}{}
	revokedMu.Unlock()
	if db := core.GetDB(); db != nil {
		if _, err := db.Exec(`INSERT INTO IAMX.ADMIN_ACTIVITY_LOG (ACTOR, ACTION, PATH, STATUS, SUMMARY, IP_ADDRESS) VALUES (:1, 'LOGOUT', '/iamx/api/auth/logout', 200, :2, :3)`, actor, hash, ip); err != nil {
			log.Printf("revoke token insert: %v", err)
		}
	}
}

func loadRevoked() {
	db := core.GetDB()
	if db == nil {
		return
	}
	rows, err := db.Query(`SELECT SUMMARY FROM IAMX.ADMIN_ACTIVITY_LOG WHERE ACTION = 'LOGOUT' AND CREATED_AT > SYSTIMESTAMP - 1`)
	if err != nil {
		log.Printf("load revoked tokens: %v", err)
		return
	}
	defer rows.Close()
	next := map[string]struct{}{}
	for rows.Next() {
		var h string
		if rows.Scan(&h) == nil && h != "" {
			next[h] = struct{}{}
		}
	}
	revokedMu.Lock()
	for h := range revoked { // คงของที่เพิ่งตัดในเครื่องนี้ไว้ เผื่อ insert ยังไม่เห็น
		next[h] = struct{}{}
	}
	revoked = next
	revokedMu.Unlock()
}

func startRevokedLoader() {
	revokedOnce.Do(func() {
		loadRevoked()
		go func() {
			for range time.Tick(30 * time.Second) {
				loadRevoked()
			}
		}()
	})
}
