package models

// ManagePermissionChild - ข้อมูล UAM Role ที่ผูกกับ IAMX Role
type ManagePermissionChild struct {
	RoleManageID *string `json:"roleManageId,omitempty"`
	RoleUAM      *int    `json:"roleUam,omitempty"`
	UAMRoleName  *string `json:"uamRoleName,omitempty"`
	UAMRoleDesc  *string `json:"uamRoleDesc,omitempty"`
}

// ManagePermissionRoleResponse - Response สำหรับ IAMX Role พร้อม UAM Role bindings
type ManagePermissionRoleResponse struct {
	RoleID   *string                 `json:"roleId,omitempty"`
	RoleName *string                 `json:"roleName,omitempty"`
	RoleDesc *string                 `json:"roleDesc,omitempty"`
	UAMRoles []ManagePermissionChild `json:"uamRoles"`
}

// UAMRoleResponse - Response สำหรับ IAM3.ROLE (UAM Roles)
type UAMRoleResponse struct {
	RoleID   *int    `json:"roleId,omitempty"`
	RoleName *string `json:"roleName,omitempty"`
	RoleDesc *string `json:"roleDesc,omitempty"`
}

// SaveManagePermissionBindingsRequest - Request สำหรับบันทึกการผูก IAMX-UAM Role
type SaveManagePermissionBindingsRequest struct {
	RoleIAMX  string `json:"roleIamx"`
	RoleUAMs  []int  `json:"roleUams"`  // UAM Role IDs ที่เลือก
	CreatedBy string `json:"createdBy"` // optional
}
