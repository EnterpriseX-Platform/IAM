package middleware

// และบันทึกการเข้า IAMX console (สำเร็จ/ไม่สำเร็จ) ลง IAMX.ADMIN_ACTIVITY_LOG · เขียนแบบไม่รอ (goroutine) ไม่ให้คำขอช้าลง

import (
	"api/core"
	"encoding/json"
	"log"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var activitySkip = []string{"/auth/logout", "/menu-logs", "/register", "/chat", "/preferences", "/pins", "/internal/", "/system/webhooks", "/cache/clear", "/public/"}
var secretKey = regexp.MustCompile(`(?i)pass|secret|token|otp|pin`)

func actorFromBearer(c *fiber.Ctx) string {
	h := c.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	// ตัวกรองหลัก (RequireAuthUnlessPublic) ตรวจลายเซ็นแล้ว ที่นี่อ่านชื่ออย่างเดียว
	claims := jwt.MapClaims{}
	if _, _, err := jwt.NewParser().ParseUnverified(strings.TrimPrefix(h, "Bearer "), claims); err != nil {
		return ""
	}
	for _, k := range []string{"username", "preferred_username", "email", "sub"} {
		if v, ok := claims[k].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

func scrubBody(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return ""
	}
	var walk func(x interface{}) interface{}
	walk = func(x interface{}) interface{} {
		switch t := x.(type) {
		case map[string]interface{}:
			for k, val := range t {
				if secretKey.MatchString(k) {
					t[k] = "***"
				} else {
					t[k] = walk(val)
				}
			}
			return t
		case []interface{}:
			for i := range t {
				t[i] = walk(t[i])
			}
			return t
		}
		return x
	}
	b, _ := json.Marshal(walk(v))
	s := string(b)
	if r := []rune(s); len(r) > 1900 {
		s = string(r[:1900]) + "…"
	}
	return s
}

func ActivityLog() fiber.Handler {
	return func(c *fiber.Ctx) error {
		m := c.Method()
		if m != fiber.MethodPost && m != fiber.MethodPut && m != fiber.MethodPatch && m != fiber.MethodDelete {
			return c.Next()
		}
		p := c.Path()
		for _, s := range activitySkip {
			if strings.Contains(p, s) {
				return c.Next()
			}
		}
		body := append([]byte(nil), c.Body()...)
		actor := actorFromBearer(c)
		err := c.Next()
		status := c.Response().StatusCode()
		action := m
		if strings.HasSuffix(p, "/auth/login") {
			var lb struct {
				Username string `json:"username"`
			}
			_ = json.Unmarshal(body, &lb)
			actor = lb.Username
			action = "LOGIN"
			if status < 200 || status >= 300 {
				action = "LOGIN_FAILED"
			}
			body = nil
		}
		ip := c.IP()
		if f := c.Get("X-Forwarded-For"); f != "" {
			ip = strings.TrimSpace(strings.Split(f, ",")[0])
		}
		summary := scrubBody(body)
		go func() {
			db := core.GetDB()
			if db == nil {
				return
			}
			if _, e := db.Exec(`INSERT INTO IAMX.ADMIN_ACTIVITY_LOG (ACTOR, ACTION, PATH, STATUS, SUMMARY, IP_ADDRESS) VALUES (:1, :2, :3, :4, :5, :6)`,
				actor, action, p, status, summary, ip); e != nil {
				log.Printf("activity log insert: %v", e)
			}
		}()
		return err
	}
}
