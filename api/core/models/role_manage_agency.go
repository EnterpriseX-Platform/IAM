package models

// RoleManageAgency - ข้อมูลการผูกบทบาทกับหน่วยงาน
type RoleManageAgency struct {
	RoleManageID   *string `json:"roleManageId,omitempty"`
	RoleAgcType    *string `json:"roleAgcType,omitempty"`
	RoleAgcID      *string `json:"roleAgcId,omitempty"`
	Seq            *int    `json:"seq,omitempty"`
	EffectiveDate  *string `json:"effectiveDate,omitempty"`
	ExpireDate     *string `json:"expireDate,omitempty"`
	Status         *string `json:"status,omitempty"`
	PermissionData *string `json:"permissionData,omitempty"`
	CreatedDate    *string `json:"createdDate,omitempty"`
	CreatedBy      *string `json:"createdBy,omitempty"`
	UpdatedDate    *string `json:"updatedDate,omitempty"`
	UpdatedBy      *string `json:"updatedBy,omitempty"`
}

// SaveRoleManageAgencyRequest - Request สำหรับบันทึก/แก้ไข ROLE_MANAGE_AGENCY
type SaveRoleManageAgencyRequest struct {
	RoleManageID   string `json:"roleManageId"`
	RoleAgcType    string `json:"roleAgcType"`
	RoleAgcID      string `json:"roleAgcId"`
	EffectiveDate  string `json:"effectiveDate"`
	ExpireDate     string `json:"expireDate,omitempty"`
	Status         string `json:"status"`
	PermissionData string `json:"permissionData,omitempty"`
	CreatedBy      string `json:"createdBy,omitempty"`
}

// AgencyOption - ตัวเลือกหน่วยงาน
type AgencyOption struct {
	ID   *string `json:"id,omitempty"`
	Name *string `json:"name,omitempty"`
	Type *string `json:"type,omitempty"`
}
