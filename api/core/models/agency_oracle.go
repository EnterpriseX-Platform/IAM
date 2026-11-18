package models

// MAgc - ข้อมูลหน่วยงานจาก Oracle M_AGC
type MAgc struct {
	AgcID    string `json:"agcId" db:"AGC_ID"`
	AgcCode  string `json:"agcCode" db:"AGC_CODE"`
	AgcName  string `json:"agcName" db:"AGC_NAME"`
	AgcType  string `json:"agcType" db:"AGC_TYPE"`
	ParentID string `json:"parentId" db:"PARENT_ID"`
}

// CommonDataOption - ตัวเลือกจาก REF_COMMON_DATA
type CommonDataOption struct {
	ID    int    `json:"id"`
	Value string `json:"value"`
	Label string `json:"label"`
	Code  string `json:"code"`
}

// ResponsibilityDataAccessRequest - Request สำหรับบันทึกข้อมูลสิทธิ์เข้าถึง
type ResponsibilityDataAccessRequest struct {
	ResponsibilityID int    `json:"responsibility_id"`
	AgencyID         string `json:"agency_id"`   // AGC_ID จาก M_AGC
	AgencyType       string `json:"agency_type"` // AGC_TYPE
	EffectiveDate    string `json:"effective_date"`
	ExpireDate       string `json:"expire_date"`
	IsActive         int    `json:"is_active"`
}

// UserDataAccessRequest - Request สำหรับบันทึกข้อมูลสิทธิ์เข้าถึงของ User
type UserDataAccessRequest struct {
	UserID        string `json:"user_id"`     // REF_USER_ID
	AgencyID      string `json:"agency_id"`   // AGC_ID จาก M_AGC
	AgencyType    string `json:"agency_type"` // AGC_TYPE
	EffectiveDate string `json:"effective_date"`
	ExpireDate    string `json:"expire_date"`
	IsActive      int    `json:"is_active"`
}
