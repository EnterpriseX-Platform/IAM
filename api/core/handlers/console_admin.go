package handlers

import (
	"api/core"
	"crypto/rand"
	"database/sql"
	"log"
	"math/big"
	"os"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// รหัสผ่านเดิมเก็บเป็นข้อความตรง ๆ → เก็บเป็น bcrypt (login แปลงให้เองเมื่อเข้าด้วยรหัสเดิม)
// ทุก endpoint ต้องเป็น token ของ Console (ไม่รับ token Keycloak ของผู้ใช้ทั่วไป)

func consoleClaims(c *fiber.Ctx) jwt.MapClaims {
	tok := strings.TrimPrefix(c.Get("Authorization"), "Bearer ")
	secret := os.Getenv("JWT_SECRET")
	if tok == "" || secret == "" {
		return nil
	}
	t, err := jwt.Parse(tok, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.ErrUnauthorized
		}
		return []byte(secret), nil
	})
	if err != nil || !t.Valid {
		return nil
	}
	m, _ := t.Claims.(jwt.MapClaims)
	return m
}

func requireConsoleAdmin(c *fiber.Ctx) (jwt.MapClaims, error) {
	m := consoleClaims(c)
	// 28/10/69 (security): เดิมคืน c.Status().JSON() ซึ่งเป็น error nil เมื่อเขียนสำเร็จ → ผู้เรียกที่เช็ค err != nil
	// ทำงานต่อได้ทุกคน (ด่านไม่เคยกันจริง) · ต้องคืน *fiber.Error เพื่อให้หยุดจริง
	if m == nil {
		return nil, fiber.NewError(fiber.StatusUnauthorized, "กรุณาเข้าสู่ระบบ IAM-X ใหม่")
	}
	if r, _ := m["role"].(string); r != "admin" {
		return nil, fiber.NewError(fiber.StatusForbidden, "เฉพาะผู้ดูแลระบบ")
	}
	return m, nil
}

var asciiOnly = regexp.MustCompile(`^[\x21-\x7E]+$`)

// กติกาเดียวกับหน้าสมัคร (10 ตัว ภาษาอังกฤษ พิมพ์ใหญ่/เล็ก ตัวเลข อักขระพิเศษ ไม่มีชื่อผู้ใช้ ไม่ใช่คำเดาง่าย)
func consolePasswordError(pw, username string) string {
	low := strings.ToLower(pw)
	switch {
	case len(pw) < 10:
		return "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร"
	case !asciiOnly.MatchString(pw):
		return "รหัสผ่านใช้ได้เฉพาะภาษาอังกฤษ ตัวเลข และอักขระพิเศษ"
	case !regexp.MustCompile(`[A-Z]`).MatchString(pw), !regexp.MustCompile(`[a-z]`).MatchString(pw),
		!regexp.MustCompile(`[0-9]`).MatchString(pw), !regexp.MustCompile(`[^A-Za-z0-9]`).MatchString(pw):
		return "รหัสผ่านต้องมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ"
	case username != "" && strings.Contains(low, strings.ToLower(username)):
		return "รหัสผ่านห้ามมีชื่อผู้ใช้"
	}
	for _, w := range []string{"password", "passw0rd", "p@ss", "admin", "qwerty", "1234", "abcd", "iamx"} {
		if strings.Contains(low, w) {
			return "รหัสผ่านคาดเดาง่าย กรุณาเลี่ยงคำทั่วไปหรือตัวเรียง"
		}
	}
	return ""
}

func hashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func tempConsolePassword() string {
	sets := []string{"ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!#$%&*?"}
	all := strings.Join(sets, "")
	pick := func(s string) byte { n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(s)))); return s[n.Int64()] }
	pw := []byte{}
	for _, s := range sets {
		pw = append(pw, pick(s))
	}
	for len(pw) < 14 {
		pw = append(pw, pick(all))
	}
	for i := len(pw) - 1; i > 0; i-- {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		j := int(n.Int64())
		pw[i], pw[j] = pw[j], pw[i]
	}
	return string(pw)
}

// GET /console-admins
func ListConsoleAdmins(c *fiber.Ctx) error {
	if _, err := requireConsoleAdmin(c); err != nil {
		return err
	}
	rows, err := core.GetDB().Query(`SELECT USER_ID, USERNAME, FIRST_NAME, LAST_NAME, NVL(STATUS,'Y'), NVL(ROLE,'admin'),
		TO_CHAR(UPDATE_DATE,'YYYY-MM-DD"T"HH24:MI:SS'), CASE WHEN LENGTH(PASSWORD) = 60 AND PASSWORD LIKE '$2%' THEN 1 ELSE 0 END
		FROM IAMX.ADMIN ORDER BY USERNAME`)
	if err != nil {
		log.Printf("ListConsoleAdmins: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "โหลดไม่สำเร็จ"})
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id, un, st, role string
		var fn, ln, upd sql.NullString
		var hashed int
		if rows.Scan(&id, &un, &fn, &ln, &st, &role, &upd, &hashed) == nil {
			out = append(out, fiber.Map{"id": id, "username": un, "first_name": fn.String, "last_name": ln.String,
				"active": st == "Y" || st == "1" || st == "A", "role": role, "updated_at": upd.String, "hashed": hashed == 1})
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

// POST /console-admins {username, first_name, last_name, role} → คืนรหัสชั่วคราว (แสดงครั้งเดียว)
func CreateConsoleAdmin(c *fiber.Ctx) error {
	if _, err := requireConsoleAdmin(c); err != nil {
		return err
	}
	var in struct {
		Username  string `json:"username"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Role      string `json:"role"`
	}
	if c.BodyParser(&in) != nil || !regexp.MustCompile(`^[A-Za-z0-9._@-]{3,40}$`).MatchString(in.Username) {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "ชื่อผู้ใช้ 3–40 ตัว ภาษาอังกฤษ ตัวเลข . _ @ -"})
	}
	// 14/11/69: ระดับผู้ดูแล admin / access_manager / auditor (ค่าอื่น = admin เหมือนเดิม)
	if !validConsoleRole(in.Role) {
		in.Role = "admin"
	}
	db := core.GetDB()
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM IAMX.ADMIN WHERE LOWER(USERNAME) = LOWER(:1)`, in.Username).Scan(&n)
	if n > 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "มีชื่อผู้ใช้นี้แล้ว"})
	}
	pw := tempConsolePassword()
	h, _ := hashPassword(pw)
	if _, err := db.Exec(`INSERT INTO IAMX.ADMIN (USER_ID, USERNAME, PASSWORD, FIRST_NAME, LAST_NAME, STATUS, ROLE, CREATE_DATE, UPDATE_DATE)
		VALUES (LOWER(RAWTOHEX(SYS_GUID())), :1, :2, :3, :4, 'Y', :5, SYSTIMESTAMP, SYSTIMESTAMP)`,
		in.Username, h, in.FirstName, in.LastName, in.Role); err != nil {
		log.Printf("CreateConsoleAdmin: %v", err)
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "เพิ่มไม่สำเร็จ"})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"temp_password": pw}})
}

// POST /console-admins/:id/reset-password → รหัสชั่วคราวใหม่ (แสดงครั้งเดียว)
func ResetConsoleAdminPassword(c *fiber.Ctx) error {
	if _, err := requireConsoleAdmin(c); err != nil {
		return err
	}
	pw := tempConsolePassword()
	h, _ := hashPassword(pw)
	res, err := core.GetDB().Exec(`UPDATE IAMX.ADMIN SET PASSWORD = :1, UPDATE_DATE = SYSTIMESTAMP WHERE USER_ID = :2`, h, c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "รีเซ็ตไม่สำเร็จ"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "ไม่พบผู้ใช้"})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"temp_password": pw}})
}

// POST /console-admins/:id/status {active} — ห้ามปิดตัวเอง และต้องเหลือผู้ดูแลที่ใช้งานอย่างน้อย 1 คน
func SetConsoleAdminStatus(c *fiber.Ctx) error {
	m, err := requireConsoleAdmin(c)
	if err != nil {
		return err
	}
	var in struct {
		Active bool `json:"active"`
	}
	c.BodyParser(&in)
	id := c.Params("id")
	if !in.Active {
		if me, _ := m["userId"].(string); me == id {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "ปิดบัญชีตัวเองไม่ได้"})
		}
		var n int
		core.GetDB().QueryRow(`SELECT COUNT(*) FROM IAMX.ADMIN WHERE NVL(STATUS,'Y') = 'Y' AND NVL(ROLE,'admin') = 'admin' AND USER_ID <> :1`, id).Scan(&n)
		if n == 0 {
			return c.Status(400).JSON(fiber.Map{"success": false, "message": "ต้องมีผู้ดูแลที่ใช้งานอย่างน้อย 1 คน"})
		}
	}
	st := "N"
	if in.Active {
		st = "Y"
	}
	if _, err := core.GetDB().Exec(`UPDATE IAMX.ADMIN SET STATUS = :1, UPDATE_DATE = SYSTIMESTAMP WHERE USER_ID = :2`, st, id); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "บันทึกไม่สำเร็จ"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// POST /console-admins/me/password {current, new} — เปลี่ยนรหัสผ่านตัวเอง
func ChangeMyConsolePassword(c *fiber.Ctx) error {
	m := consoleClaims(c)
	if m == nil {
		return c.Status(401).JSON(fiber.Map{"success": false, "message": "กรุณาเข้าสู่ระบบ IAM-X ใหม่"})
	}
	var in struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	c.BodyParser(&in)
	id, _ := m["userId"].(string)
	db := core.GetDB()
	var un, stored string
	if err := db.QueryRow(`SELECT USERNAME, PASSWORD FROM IAMX.ADMIN WHERE USER_ID = :1`, id).Scan(&un, &stored); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "ไม่พบผู้ใช้"})
	}
	if !verifyPassword(stored, in.Current) {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "รหัสผ่านปัจจุบันไม่ถูกต้อง"})
	}
	if msg := consolePasswordError(in.New, un); msg != "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": msg})
	}
	if in.New == in.Current {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม"})
	}
	h, _ := hashPassword(in.New)
	if _, err := db.Exec(`UPDATE IAMX.ADMIN SET PASSWORD = :1, UPDATE_DATE = SYSTIMESTAMP WHERE USER_ID = :2`, h, id); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "เปลี่ยนรหัสผ่านไม่สำเร็จ"})
	}
	return c.JSON(fiber.Map{"success": true})
}

func validConsoleRole(r string) bool { return r == "admin" || r == "access_manager" || r == "auditor" }

// POST /console-admins/:id/role {role} — เปลี่ยนระดับผู้ดูแล · ลดระดับตัวเองไม่ได้ (กันไม่มีผู้ดูแลระบบเหลือ)
func SetConsoleAdminRole(c *fiber.Ctx) error {
	claims, err := requireConsoleAdmin(c)
	if err != nil {
		return err
	}
	me, _ := claims["username"].(string)
	var in struct {
		Role string `json:"role"`
	}
	if c.BodyParser(&in) != nil || !validConsoleRole(in.Role) {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "Role must be admin, access_manager or auditor"})
	}
	db := core.GetDB()
	var uname string
	if err := db.QueryRow(`SELECT USERNAME FROM IAMX.ADMIN WHERE USER_ID = :1`, c.Params("id")).Scan(&uname); err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "message": "Admin not found"})
	}
	if strings.EqualFold(uname, me) && in.Role != "admin" {
		return c.Status(400).JSON(fiber.Map{"success": false, "message": "You can't lower your own level"})
	}
	if _, err := db.Exec(`UPDATE IAMX.ADMIN SET ROLE = :1, UPDATE_DATE = SYSTIMESTAMP WHERE USER_ID = :2`, in.Role, c.Params("id")); err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "message": "Couldn't change the level"})
	}
	return c.JSON(fiber.Map{"success": true})
}
