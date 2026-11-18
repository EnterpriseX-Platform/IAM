package models

// ReportMapping คือแถวการผูกรายงานเข้ากับ role หรือ user
// รายงานอยู่ที่ Report Studio (คนละฐานข้อมูล) — อ้างอิงด้วย report_code
// permission เก็บเป็น JSON array ในคอลัมน์เดียว (["VIEW","EXPORT"])
type ReportMapping struct {
	ID            int64    `json:"id"`
	RoleID        *string  `json:"role_id,omitempty"`
	UserID        *string  `json:"user_id,omitempty"`
	ReportCode    string   `json:"report_code"`
	Permissions   []string `json:"permissions"`
	EffectiveDate *string  `json:"effective_date,omitempty"`
	ExpireDate    *string  `json:"expire_date,omitempty"`
	IsActive      int16    `json:"is_active"`
}
