package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// ออกใบรับรองอิเล็กทรอนิกส์ (DTS) ให้ผู้ใช้ทันทีที่สร้างบัญชี
//
// ทำไมต้องอยู่ตรงนี้: DTS ไม่มีทางออกใบให้คนที่ยังไม่เคยมีเลย ผู้ใช้ใหม่จึงเข้าจอ
// เซ็นเอกสารแล้วเจอ "คุณยังไม่มี Certificate ไม่สามารถลงลายมือชื่อได้" ตลอด
//
// คีย์ที่ผูกใบ = USER_ID (cuid) ตัวเดียวกับที่ลง REF_USER_ID และไหลไปเป็น claim
// USERINFO.REF_USER_ID ให้ DTS ใช้ค้นใบ — ห้ามส่งเป็นเลข IAM3 เก่าเด็ดขาด
//
// ล้มเหลวไม่ทำให้การสร้างผู้ใช้ล้ม: แค่ log ไว้ แล้วให้แอดมินกดออกใบเองได้ที่จอ
// ใบรับรองของ DTS ภายหลัง

const dtsCertTimeout = 20 * time.Second

// dtsBaseURL คืน base URL ของ DTS backend (เช่น http://directory-dts-frontend:8080)
// ค่าว่าง = ปิดฟีเจอร์ ไม่ต้องยิงอะไรเลย
func dtsBaseURL() string {
	return strings.TrimRight(os.Getenv("DTS_API_URL"), "/")
}

// dtsCertTTL คืน TTL แบบ Go duration ที่ DTS รับ (ดีฟอลต์ 1 ปี)
func dtsCertTTL() string {
	if v := strings.TrimSpace(os.Getenv("DTS_CERT_TTL")); v != "" {
		return v
	}
	return "8760h"
}

// IssueDTSCertificate สั่ง DTS ออกใบรับรองให้ผู้ใช้ (ไม่คืน error ให้ผู้เรียก —
// เป็นงานเสริมที่ห้ามทำให้การสร้างผู้ใช้ล้มเหลว)
func IssueDTSCertificate(userID, email, fullName string) {
	base := dtsBaseURL()
	if base == "" {
		return // ไม่ได้ตั้งค่าไว้ (เช่น local dev) — ข้ามเงียบ ๆ
	}
	if userID == "" || email == "" {
		log.Printf("[DTS] ข้ามการออกใบรับรอง: ไม่มี user_id หรือ email (user_id=%q email=%q)", userID, email)
		return
	}

	name := strings.TrimSpace(fullName)
	if name == "" {
		name = email
	}

	body, err := json.Marshal(map[string]string{
		"email":       email,
		"username":    name,
		"employee_id": userID, // = IAM-X USER_ID (cuid) คีย์ที่จอเซ็นใช้ค้นใบ
		"ttl":         dtsCertTTL(),
	})
	if err != nil {
		log.Printf("[DTS] สร้าง payload ออกใบรับรองไม่สำเร็จ (%s): %v", email, err)
		return
	}

	client := &http.Client{Timeout: dtsCertTimeout}
	resp, err := client.Post(base+"/api/user-certificates/", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[DTS] เรียกออกใบรับรองไม่สำเร็จ (%s): %v — แอดมินออกใบเองได้ที่จอใบรับรอง", email, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// จำกัดขนาดที่อ่าน กัน log บวมเวลา gateway ตอบ HTML ยาว ๆ แทน JSON
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		log.Printf("[DTS] ออกใบรับรองไม่สำเร็จ (%s): HTTP %d %s", email, resp.StatusCode, strings.TrimSpace(string(msg)))
		return
	}

	var out struct {
		SerialNumber string `json:"serial_number"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		log.Printf("[DTS] ✅ ออกใบรับรองสำเร็จ (%s) แต่อ่านคำตอบไม่ได้: %v", email, err)
		return
	}
	log.Printf("[DTS] ✅ ออกใบรับรองให้ %s (user_id=%s) สำเร็จ S/N=%s", email, userID, out.SerialNumber)
}
