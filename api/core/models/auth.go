package models

// LoginRequest - Request สำหรับ login
type LoginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

// LoginResponse - Response หลัง login สำเร็จ
type LoginResponse struct {
	Token        string                       `json:"token"`
	User         AuthUser                     `json:"user"`
	Domains      []DomainInfo                 `json:"domains,omitempty"`
	Applications []MenuApplicationWithModules `json:"applications,omitempty"`
	ExpiresIn    int                          `json:"expiresIn"` // seconds
}

// UserLoginRole - Role structure for login response
type UserLoginRole struct {
	RoleID       *string `json:"roleId"`
	RoleName     *string `json:"roleName"`
	RoleDesc     *string `json:"roleDesc"`
	RoleType     *string `json:"roleType"` // IAMX.ROLE.ROLE_TYPE: 'internal' (องค์กร) | 'agency' (หน่วยรับงบ) — FE gates internal/external by this
	ParentRole   *string `json:"parentRole"`
	DomainID     *int    `json:"domainId"`
	AppID        *int    `json:"appId"`
	ModuleID     *int    `json:"moduleId"`
	ParentRoleID *string `json:"parentRoleId"`
}

// UserLoginResponsibility - Responsibility structure for login response
type UserLoginResponsibility struct {
	ResponsibilityID   *int    `json:"responsibilityId"`
	ResponsibilityCode *string `json:"responsibilityCode"`
	ResponsibilityName *string `json:"responsibilityName"`
	Priority           *int    `json:"priority"`
}

// AuthUser - ข้อมูล user สำหรับ authentication
type AuthUser struct {
	UserID       string          `json:"userId"`
	Username     string          `json:"username"`
	FirstName    string          `json:"firstName"`
	LastName     string          `json:"lastName"`
	Email        string          `json:"email"`
	Role         string          `json:"role"`
	Roles        []UserLoginRole `json:"roles"`
	Status       string          `json:"status"`
	OutputAccess []string        `json:"outputAccess,omitempty"`
}

// AdminUser - โครงสร้างตาราง IAMX.ADMIN
type AdminUser struct {
	UserID     string `db:"USER_ID"`
	Username   string `db:"USERNAME"`
	Password   string `db:"PASSWORD"`
	FirstName  string `db:"FIRST_NAME"`
	LastName   string `db:"LAST_NAME"`
	Status     string `db:"STATUS"`
	Role       string `db:"ROLE"`
	CreateDate string `db:"CREATE_DATE"`
	UpdateDate string `db:"UPDATE_DATE"`
}
