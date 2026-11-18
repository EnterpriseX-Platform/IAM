// โหลดจากฐานข้อมูล เก็บไว้ 1 นาที · Clear() เมื่อมีการแก้ค่าตั้ง
// ค่าสำรองตอนฐานข้อมูลยังไม่มีตาราง = internal (บุคลากร) / agency (ภายนอก, alias external) เหมือนเดิม
package usertypes

import (
	"api/core"
	"database/sql"
	"strings"
	"sync"
	"time"
)

type Type struct {
	Code     string   `json:"code"`
	Name     string   `json:"name"`
	IsStaff  bool     `json:"is_staff"`
	Aliases  []string `json:"aliases"`
	Sort     int      `json:"sort_order"`
	IsActive bool     `json:"is_active"`
}

var (
	mu       sync.Mutex
	cached   []Type
	loadedAt time.Time
	fallback = []Type{
		{Code: "internal", Name: "Internal user", IsStaff: true, Sort: 10, IsActive: true},
		{Code: "agency", Name: "External user / agency", Aliases: []string{"external"}, Sort: 20, IsActive: true},
	}
)

func Clear() {
	mu.Lock()
	loadedAt = time.Time{}
	mu.Unlock()
}

// All คืนทุกประเภท (รวมที่ปิด) เรียงตามลำดับ
func All() []Type {
	mu.Lock()
	defer mu.Unlock()
	if cached != nil && time.Since(loadedAt) < time.Minute {
		return cached
	}
	db := core.GetDB()
	if db == nil {
		return fallback
	}
	rows, err := db.Query(`SELECT CODE, NAME, IS_STAFF, NVL(ALIASES, ' '), SORT_ORDER, IS_ACTIVE FROM IAMX.USER_TYPE ORDER BY SORT_ORDER, CODE`)
	if err != nil {
		if cached != nil {
			return cached
		}
		return fallback
	}
	defer rows.Close()
	out := []Type{}
	for rows.Next() {
		var t Type
		var staff, active int
		var aliases sql.NullString
		if rows.Scan(&t.Code, &t.Name, &staff, &aliases, &t.Sort, &active) != nil {
			continue
		}
		t.IsStaff, t.IsActive = staff == 1, active == 1
		for _, a := range strings.Split(aliases.String, ",") {
			if a = strings.TrimSpace(a); a != "" {
				t.Aliases = append(t.Aliases, a)
			}
		}
		out = append(out, t)
	}
	if len(out) == 0 {
		out = fallback
	}
	cached, loadedAt = out, time.Now()
	return out
}

// Valid — รหัสนี้เป็นประเภทที่เปิดใช้งานอยู่
func Valid(code string) bool {
	for _, t := range All() {
		if t.IsActive && t.Code == code {
			return true
		}
	}
	return false
}

// Normalize — แปลงค่าเก่า/alias เป็นรหัสประเภท · ว่างหรือไม่รู้จัก = ประเภทบุคลากร (เหมือนพฤติกรรมเดิม)
func Normalize(code string) string {
	c := strings.TrimSpace(code)
	for _, t := range All() {
		if t.Code == c {
			return t.Code
		}
		for _, a := range t.Aliases {
			if a == c {
				return t.Code
			}
		}
	}
	return StaffCode()
}

// StaffCode — ประเภทบุคลากรจากทะเบียน HR (ตัวแรกที่ตั้ง IS_STAFF)
func StaffCode() string {
	for _, t := range All() {
		if t.IsStaff && t.IsActive {
			return t.Code
		}
	}
	return "internal"
}

// ExternalCode — ประเภทสำหรับคนที่ไม่ได้อยู่ในทะเบียน HR (ตัวแรกที่ไม่ใช่บุคลากร)
func ExternalCode() string {
	for _, t := range All() {
		if !t.IsStaff && t.IsActive {
			return t.Code
		}
	}
	return "agency"
}

func IsStaff(code string) bool {
	n := Normalize(code)
	for _, t := range All() {
		if t.Code == n {
			return t.IsStaff
		}
	}
	return false
}

// SQLNormalize — นิพจน์ SQL ที่แปลงคอลัมน์เป็นรหัสประเภท (ใช้ในหน้าแรกนับ "บทบาทไม่ตรงประเภท")
// สร้างจากค่าตั้ง · ค่าเป็นรหัสที่ผู้ดูแลตั้ง (ผ่านการตรวจรูปแบบตอนบันทึก) จึงใส่เป็น literal ได้
func SQLNormalize(col string) string {
	var b strings.Builder
	b.WriteString("CASE")
	for _, t := range All() {
		vals := append([]string{t.Code}, t.Aliases...)
		q := make([]string, len(vals))
		for i, v := range vals {
			q[i] = "'" + strings.ReplaceAll(v, "'", "''") + "'"
		}
		b.WriteString(" WHEN " + col + " IN (" + strings.Join(q, ",") + ") THEN '" + strings.ReplaceAll(t.Code, "'", "''") + "'")
	}
	b.WriteString(" ELSE '" + strings.ReplaceAll(StaffCode(), "'", "''") + "' END")
	return b.String()
}

// SQLStaffList คืนรายการรหัสประเภทที่เป็นบุคลากรในรูป 'a','b' สำหรับ IN (...)
func SQLStaffList() string {
	q := []string{}
	for _, t := range All() {
		if t.IsStaff {
			q = append(q, "'"+strings.ReplaceAll(t.Code, "'", "''")+"'")
		}
	}
	if len(q) == 0 {
		q = append(q, "'"+strings.ReplaceAll(StaffCode(), "'", "''")+"'")
	}
	return strings.Join(q, ",")
}

// SQLStaff คืนรหัสบุคลากรหลักแบบ quote แล้ว สำหรับ NVL(col, ...)
func SQLStaff() string { return "'" + strings.ReplaceAll(StaffCode(), "'", "''") + "'" }
