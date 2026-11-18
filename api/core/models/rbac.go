package models

import (
	"database/sql"
	"encoding/json"
)

// NullableString wraps sql.NullString for cleaner JSON output
type NullableString struct {
	sql.NullString
}

// MarshalJSON returns the string value or empty string for null
func (ns NullableString) MarshalJSON() ([]byte, error) {
	if ns.Valid {
		return json.Marshal(ns.String)
	}
	return json.Marshal("")
}

// UnmarshalJSON parses string into NullableString
func (ns *NullableString) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	ns.String = s
	ns.Valid = s != ""
	return nil
}

// MenuUser represents user information for menu service
// Oracle-compatible: uses NullableString for cleaner JSON output
type MenuUser struct {
	UserInfoID       NullableString `json:"userInfoId" db:"user_info_id"`
	RefUserID        NullableString `json:"refUserId" db:"ref_user_id"`
	UserName         NullableString `json:"userName" db:"user_name"`
	FirstName        NullableString `json:"firstName" db:"first_name"`
	LastName         NullableString `json:"lastName" db:"last_name"`
	FullName         NullableString `json:"fullName" db:"full_name"`
	Phone            NullableString `json:"phone" db:"phone"`
	Mobile           NullableString `json:"mobile" db:"mobile"`
	Email            NullableString `json:"email" db:"email"`
	AgencyID         NullableString `json:"agencyId" db:"agency_id"`
	AgencyCode       NullableString `json:"agencyCode" db:"agency_code"`
	AgencyType       NullableString `json:"agencyType" db:"agency_type"`
	AgencyName       NullableString `json:"agencyName" db:"agency_name"`
	AgcShortName     NullableString `json:"agcShortName" db:"agc_shortname"`
	MinistryID       NullableString `json:"ministryId" db:"ministry_id"`
	MinistryCode     NullableString `json:"ministryCode" db:"ministry_code"`
	MinistryName     NullableString `json:"ministryName" db:"ministry_name"`
	AgencySPFlag     NullableString `json:"agencySpFlag" db:"agency_sp_flag"`
	ProvinceName     NullableString `json:"provinceName" db:"province_name"`
	DistrictName     NullableString `json:"districtName" db:"district_name"`
	SubdistrictName  NullableString `json:"subdistrictName" db:"subdistrict_name"`
	AgcLGOFlag       NullableString `json:"agcLgoFlag" db:"agc_lgo_flag"`
	UserDepartmentID NullableString `json:"userDepartmentId" db:"user_department_id"`
	UserOperationID  NullableString `json:"userOperationId" db:"user_operation_id"`
	SubagencyCode    NullableString `json:"subagencyCode" db:"subagency_code"`
	DepartmentName   NullableString `json:"departmentName" db:"department_name"`
	DepartmentABV    NullableString `json:"departmentAbv" db:"department_abv"`
	DepartmentColor  NullableString `json:"departmentColor" db:"department_color"`
	Tel              NullableString `json:"tel" db:"tel"`
	PositionName     NullableString `json:"positionName" db:"position_name"`
	IsEmployee       bool           `json:"isEmployee" db:"is_employee"`
}

// UserInfoResponse represents user info with uppercase field names for /login endpoint
type UserInfoResponse struct {
	USER_INFO_ID       *string `json:"USER_INFO_ID,omitempty"`
	AGENCY_ID          *string `json:"AGENCY_ID,omitempty"`
	USER_OPERATION_ID  *string `json:"USER_OPERATION_ID,omitempty"`
	AGC_SP_FLAG        *string `json:"AGC_SP_FLAG,omitempty"`
	USER_DEPARTMENT_ID *string `json:"USER_DEPARTMENT_ID,omitempty"`
	DEPARTMENT_NAME    *string `json:"DEPARTMENT_NAME,omitempty"`
	PHONE              *string `json:"PHONE,omitempty"`
	MINISTRY_NAME      *string `json:"MINISTRY_NAME,omitempty"`
	LAST_NAME          *string `json:"LAST_NAME,omitempty"`
	EMAIL              *string `json:"EMAIL,omitempty"`
	FIRST_NAME         *string `json:"FIRST_NAME,omitempty"`
	DEPARTMENT_ABV     *string `json:"DEPARTMENT_ABV,omitempty"`
	MINISTRY_CODE      *string `json:"MINISTRY_CODE,omitempty"`
	DISTRICT_NAME      *string `json:"DISTRICT_NAME,omitempty"`
	FULL_NAME          *string `json:"FULL_NAME,omitempty"`
	REF_USER_ID        *string `json:"REF_USER_ID,omitempty"`
	SUBDISTRICT_NAME   *string `json:"SUBDISTRICT_NAME,omitempty"`
	AGENCY_CODE        *string `json:"AGENCY_CODE,omitempty"`
	DEPARTMENT_COLOR   *string `json:"DEPARTMENT_COLOR,omitempty"`
	AGC_SHORTNAME      *string `json:"AGC_SHORTNAME,omitempty"`
	SUBAGENCY_CODE     *string `json:"SUBAGENCY_CODE,omitempty"`
	USER_NAME          *string `json:"USER_NAME,omitempty"`
	PROVINCE_NAME      *string `json:"PROVINCE_NAME,omitempty"`
	MINISTRY_ID        *string `json:"MINISTRY_ID,omitempty"`
	AGENCY_TYPE        *string `json:"AGENCY_TYPE,omitempty"`
	AGENCY_NAME        *string `json:"AGENCY_NAME,omitempty"`
	AGC_LGO_FLAG       *string `json:"AGC_LGO_FLAG,omitempty"`
	MOBILE             *string `json:"MOBILE,omitempty"`
	TEL                *string `json:"TEL,omitempty"`
	POSITION_NAME      *string `json:"POSITION_NAME,omitempty"`
	IS_EMPLOYEE        bool    `json:"IS_EMPLOYEE"`
}

// MenuDomain represents a top-level domain with URL for menu service
type MenuDomain struct {
	ID        int64  `json:"id" db:"id"`
	Code      string `json:"code" db:"code"`
	Name      string `json:"name" db:"name"`
	DomainURL string `json:"domainUrl" db:"domain_url"`
}

// MenuApplication represents an application under a domain for menu service
type MenuApplication struct {
	ID         int64  `json:"id" db:"id"`
	Code       string `json:"code" db:"code"`
	Name       string `json:"name" db:"name"`
	Icon       string `json:"icon,omitempty" db:"icon"`    // SVG content, URL, or icon identifier
	SortOrder  int    `json:"sortOrder" db:"sort_order"`   // Sort order within domain
	DomainID   int64  `json:"domainId" db:"domain_id"`     // Domain ID for filtering
	DomainCode string `json:"domainCode" db:"domain_code"` // Domain code for filtering
}

// MenuApplicationWithModules represents an application with its modules for menu service
type MenuApplicationWithModules struct {
	MenuApplication
	Modules []MenuModuleWithObjects `json:"modules"`
}

// MenuModule represents a menu grouping under an application for menu service
type MenuModule struct {
	ID        int64  `json:"id" db:"id"`
	Code      string `json:"code" db:"code"`
	Name      string `json:"name" db:"name"`
	Icon      string `json:"icon,omitempty" db:"icon"` // SVG content, URL, or icon identifier
	SortOrder int    `json:"sortOrder" db:"sort_order"`
	// ContextPath is the app prefix every path under this module is relative to.
	// An object may override it. Empty means paths are stored whole.
	ContextPath string `json:"contextPath,omitempty" db:"context_path"`
}

// MenuSubProcess represents a subprocess attached to a menu node.
type MenuSubProcess struct {
	ID          int64  `json:"id" db:"id"`
	Code        string `json:"code" db:"code"`
	Name        string `json:"name" db:"name"`
	Description string `json:"description,omitempty" db:"description"`
	SortOrder   int    `json:"sortOrder" db:"sort_order"`
}

// MenuProcess represents a process attached to a menu node.
type MenuProcess struct {
	ID             int64  `json:"id" db:"id"`
	ProcessID      string `json:"processId,omitempty" db:"process_id"`       // UUID from process_mapper
	SubProcessID   string `json:"subprocessId,omitempty" db:"subprocess_id"` // UUID from process_mapper
	ProcessCode    string `json:"processCode,omitempty" db:"process_code"`
	SubProcessCode string `json:"subprocessCode,omitempty" db:"subprocess_code"`
	ProcessName    string `json:"processName,omitempty" db:"process_name"`       // From MV_PROCESS_MAPPING
	SubProcessName string `json:"subprocessName,omitempty" db:"subprocess_name"` // From MV_PROCESS_MAPPING
	Code           string `json:"code" db:"code"`                                // Legacy: same as process_code
	Name           string `json:"name" db:"name"`
	Description    string `json:"description,omitempty" db:"description"`
	Path           string `json:"path,omitempty" db:"path"` // URL from process_mapper
	// Ownership, so callers never have to infer which menu node a stage belongs to.
	// ownerObjectId is null for module-level rows; scope says which level it came from.
	OwnerObjectID   *int64           `json:"ownerObjectId"`
	OwnerObjectCode string           `json:"ownerObjectCode,omitempty"`
	ModuleID        *int64           `json:"moduleId,omitempty"`
	ModuleCode      string           `json:"moduleCode,omitempty"`
	Scope           string           `json:"scope"`        // "object" | "module"
	ResolvedPath    string           `json:"resolvedPath"` // path with contextPath applied — use this to open the screen
	SortOrder       int              `json:"sortOrder" db:"sort_order"`
	FiscalYear      int              `json:"fiscalYear,omitempty" db:"fiscal_year"`
	SubProcesses    []MenuSubProcess `json:"subProcesses,omitempty"`
}

// MenuModuleWithObjects represents a module with its objects and processes for menu service
type MenuModuleWithObjects struct {
	MenuModule
	Objects   []MenuObjectNode `json:"objects"`
	Processes []MenuProcess    `json:"processes"`
}

// ExtraDataAccess is a single agency-scoped entry; its permission is inherited from the parent RoleDataAccess.
type ExtraDataAccess struct {
	AgencyPath  string  `json:"agencyPath"`
	ScopeFilter *string `json:"scopeFilter,omitempty"`
}

// RoleDataAccess holds the data access granted by one role for a given object.
// Permission comes from the role's object permission, not from a separate DA permission table.
type RoleDataAccess struct {
	RoleID            string            `json:"roleId"`
	RoleCode          string            `json:"roleCode,omitempty"`
	AllDataAccess     bool              `json:"allDataAccess"`
	Permission        []string          `json:"permission"`
	DefaultAgencyPath string            `json:"defaultAgencyPath,omitempty"`
	ExtraAccess       []ExtraDataAccess `json:"extraAccess,omitempty"`
}

// MenuObjectNode represents a menu item in the hierarchical tree for menu service
type MenuObjectNode struct {
	ID       int64  `json:"id" db:"id"`
	ParentID *int64 `json:"parentId,omitempty" db:"parent_id"`
	Code     string `json:"code" db:"code"`
	Name     string `json:"name" db:"name"`
	Icon     string `json:"icon,omitempty" db:"icon"`
	Path     string `json:"path" db:"path"`
	// PathNormalized is Path trimmed; IsNavigable says whether it can actually be
	// opened (leading "/" or an absolute http(s) URL) — folder nodes and buttons
	PathNormalized string           `json:"pathNormalized"`
	ContextPath    string           `json:"contextPath,omitempty"`
	ResolvedPath   string           `json:"resolvedPath"` // path with contextPath applied — use this to open the screen
	IsNavigable    bool             `json:"isNavigable"`
	NodeKind       string           `json:"nodeKind"` // "folder" | "screen"
	ObjectTypeCode string           `json:"objectTypeCode,omitempty" db:"object_type_code"`
	ObjectLevel    int              `json:"objectLevel" db:"object_level"`
	SortOrder      int              `json:"sortOrder" db:"sort_order"`
	Children       []MenuObjectNode `json:"children"`
	Processes      []MenuProcess    `json:"processes,omitempty"`
	Permission     []string         `json:"permission"`
	DataAccess     []RoleDataAccess `json:"dataAccess,omitempty"`
}

// ObjectPermission is one entry in PagePermissionsResponse.ObjectPermissions.
type ObjectPermission struct {
	Object      string   `json:"object"`
	Permissions []string `json:"permissions"`
}

// PagePermissionsResponse is the shape returned by GET /me/page-permissions.
type PagePermissionsResponse struct {
	Page              string             `json:"page"`
	Permissions       []string           `json:"permissions"`
	ObjectPermissions []ObjectPermission `json:"objectPermissions"`
}

// DomainInfo represents domain information for the response
type DomainInfo struct {
	ID   int64  `json:"id" db:"id"`
	Code string `json:"code" db:"code"`
	Name string `json:"name" db:"name"`
}

// UserDataRequest represents the request for getting user data and permissions
// Accepts username (email) and looks up ref_user_id
// Note: Password validation not implemented yet
type UserDataRequest struct {
	Username string `json:"username"` // Email
}

// KeycloakLoginRequest represents the request for Keycloak token-based login
type KeycloakLoginRequest struct {
	KeycloakToken string `json:"keycloakToken"` // Keycloak ID token
}

// IAMXCustomClaims represents the custom claims for IAMX JWT token
type IAMXCustomClaims struct {
	UserID     string                 `json:"userId"`
	Username   string                 `json:"username"`
	Email      string                 `json:"email"`
	FirstName  string                 `json:"firstName"`
	LastName   string                 `json:"lastName"`
	UserInfo   map[string]interface{} `json:"userinfo"`
	DataAccess []DataAccessClaim      `json:"v_user_effective_data_access"`
}

// DataAccessClaim represents a single data access entry
type DataAccessClaim struct {
	AgencyPath       string   `json:"agency_path"`
	Permission       []string `json:"permission"`
	ScopeFilter      *string  `json:"scope_filter"`
	PermissionSource string   `json:"permission_source"`
}

// UserDataResponse represents the response with user data and permissions
// Returns user info, all accessible domains, and applications with permissions
type UserDataResponse struct {
	UserInfo     UserInfoResponse             `json:"userInfo"`
	Token        string                       `json:"token"`
	Domains      []DomainInfo                 `json:"domains"`
	Applications []MenuApplicationWithModules `json:"applications"`
	Roles        []UserLoginRole              `json:"roles"`
}

// MenuNullableInt64 helps handle NULL values from database
func MenuNullableInt64(n sql.NullInt64) *int64 {
	if n.Valid {
		return &n.Int64
	}
	return nil
}
