package models

import (
	"database/sql"
	"time"
)

// ============ Level 1: Domain ============

type Domain struct {
	ID          int64          `json:"id"`
	Code        string         `json:"code"`
	Name        string         `json:"name"`
	Description sql.NullString `json:"description"`
	MenuType    sql.NullString `json:"menu_type"`
	IsActive    int16          `json:"is_active"`
	CreatedBy   sql.NullString `json:"created_by"`
	UpdatedBy   sql.NullString `json:"updated_by"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type DomainResponse struct {
	ID          int64     `json:"id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	MenuType    string    `json:"menu_type"`
	IsActive    int16     `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (d *Domain) ToResponse() DomainResponse {
	resp := DomainResponse{
		ID:        d.ID,
		Code:      d.Code,
		Name:      d.Name,
		MenuType:  "internal",
		IsActive:  d.IsActive,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
	}
	if d.Description.Valid {
		resp.Description = &d.Description.String
	}
	if d.MenuType.Valid && d.MenuType.String != "" {
		resp.MenuType = d.MenuType.String
	}
	return resp
}

// ============ Level 2: Application (à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸à¸±à¸š Domain) ============

type Application struct {
	ID          int64          `json:"id"`
	DomainID    int64          `json:"domain_id"` // à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸à¸±à¸š Domain
	Code        string         `json:"code"`
	Name        string         `json:"name"`
	Description sql.NullString `json:"description"`
	SortOrder   int32          `json:"sort_order"`
	IsActive    int16          `json:"is_active"`
	Icon        sql.NullString `json:"icon"`
	CreatedBy   sql.NullString `json:"created_by"`
	UpdatedBy   sql.NullString `json:"updated_by"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type ApplicationResponse struct {
	ID          int64     `json:"id"`
	DomainID    int64     `json:"domain_id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	SortOrder   int32     `json:"sort_order"`
	IsActive    int16     `json:"is_active"`
	Icon        *string   `json:"icon,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (a *Application) ToResponse() ApplicationResponse {
	resp := ApplicationResponse{
		ID:        a.ID,
		DomainID:  a.DomainID,
		Code:      a.Code,
		Name:      a.Name,
		SortOrder: a.SortOrder,
		IsActive:  a.IsActive,
		CreatedAt: a.CreatedAt,
		UpdatedAt: a.UpdatedAt,
	}
	if a.Description.Valid {
		resp.Description = &a.Description.String
	}
	if a.Icon.Valid {
		resp.Icon = &a.Icon.String
	}
	return resp
}

// ============ Level 3: Module (à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸à¸±à¸š Application) ============

type Module struct {
	ID            int64          `json:"id"`
	ApplicationID int64          `json:"application_id"` // à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸à¸±à¸š Application
	Code          string         `json:"code"`
	Name          string         `json:"name"`
	Description   sql.NullString `json:"description"`
	SortOrder     int32          `json:"sort_order"`
	IsActive      int16          `json:"is_active"`
	Icon          sql.NullString `json:"icon"`
	ContextPath   sql.NullString `json:"context_path"`
	CreatedBy     sql.NullString `json:"created_by"`
	UpdatedBy     sql.NullString `json:"updated_by"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

type ModuleResponse struct {
	ID            int64     `json:"id"`
	ApplicationID int64     `json:"application_id"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	Description   *string   `json:"description,omitempty"`
	SortOrder     int32     `json:"sort_order"`
	IsActive      int16     `json:"is_active"`
	Icon          *string   `json:"icon,omitempty"`
	ContextPath   *string   `json:"context_path,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (m *Module) ToResponse() ModuleResponse {
	resp := ModuleResponse{
		ID:            m.ID,
		ApplicationID: m.ApplicationID,
		Code:          m.Code,
		Name:          m.Name,
		SortOrder:     m.SortOrder,
		IsActive:      m.IsActive,
		CreatedAt:     m.CreatedAt,
		UpdatedAt:     m.UpdatedAt,
	}
	if m.Description.Valid {
		resp.Description = &m.Description.String
	}
	if m.Icon.Valid {
		resp.Icon = &m.Icon.String
	}
	if m.ContextPath.Valid {
		resp.ContextPath = &m.ContextPath.String
	}
	return resp
}

// ============ Level 4: App Object (à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸à¸±à¸š Module) ============

type AppObject struct {
	ID           int64          `json:"id"`
	ModuleID     int64          `json:"module_id"` // à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸à¸±à¸š Module
	ObjectTypeID int32          `json:"object_type_id"`
	ParentID     sql.NullInt64  `json:"parent_id"`
	Code         string         `json:"code"`
	Name         string         `json:"name"`
	Path         sql.NullString `json:"path"`
	ObjectLevel  int32          `json:"object_level"`
	SortOrder    int32          `json:"sort_order"`
	IsActive     int16          `json:"is_active"`
	CreatedBy    sql.NullString `json:"created_by"`
	UpdatedBy    sql.NullString `json:"updated_by"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

type AppObjectResponse struct {
	ID           int64     `json:"id"`
	ModuleID     int64     `json:"module_id"`
	ObjectTypeID int32     `json:"object_type_id"`
	ParentID     *int64    `json:"parent_id,omitempty"`
	Code         string    `json:"code"`
	Name         string    `json:"name"`
	Path         *string   `json:"path,omitempty"`
	ObjectLevel  int32     `json:"object_level"`
	SortOrder    int32     `json:"sort_order"`
	IsActive     int16     `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (o *AppObject) ToResponse() AppObjectResponse {
	resp := AppObjectResponse{
		ID:           o.ID,
		ModuleID:     o.ModuleID,
		ObjectTypeID: o.ObjectTypeID,
		Code:         o.Code,
		Name:         o.Name,
		ObjectLevel:  o.ObjectLevel,
		SortOrder:    o.SortOrder,
		IsActive:     o.IsActive,
		CreatedAt:    o.CreatedAt,
		UpdatedAt:    o.UpdatedAt,
	}
	if o.ParentID.Valid {
		resp.ParentID = &o.ParentID.Int64
	}
	if o.Path.Valid {
		resp.Path = &o.Path.String
	}
	return resp
}

// ============ Nested Structure for Frontend ============

type ObjectItem struct {
	ObjectID       *int64        `json:"objectId"`
	ObjectName     *string       `json:"objectName"`
	Code           *string       `json:"code"`
	Path           *string       `json:"path"`
	ParentObjectID *int64        `json:"parentObjectId"`
	ObjectTypeName *string       `json:"objectTypeName"`
	ObjectTypeID   *int32        `json:"objectTypeId"`
	ObjectLevel    int32         `json:"object_level"`
	SortOrder      int32         `json:"sort_order"`
	Children       []*ObjectItem `json:"children"`
}

type ModuleWithObjects struct {
	ModuleID      *int64        `json:"moduleId"`
	ModuleName    *string       `json:"moduleName"`
	ModuleCode    *string       `json:"moduleCode"`
	Description   *string       `json:"description"`
	ApplicationID *int64        `json:"applicationId"`
	Objects       []*ObjectItem `json:"objects"`
}

type ApplicationWithModules struct {
	ApplicationID   *int64              `json:"applicationId"`
	ApplicationName *string             `json:"applicationName"`
	ApplicationCode *string             `json:"applicationCode"`
	Description     *string             `json:"description"`
	DomainID        *int64              `json:"domainId"`
	Modules         []ModuleWithObjects `json:"modules"`
}

type DomainWithApplications struct {
	DomainID     *int64                   `json:"domainId"`
	DomainCode   *string                  `json:"domainCode"`
	DomainName   *string                  `json:"domainName"`
	Description  *string                  `json:"description"`
	Applications []ApplicationWithModules `json:"applications"`
}

// ============ Request Models ============

type CreateApplicationRequest struct {
	DomainID    int64   `json:"domain_id" validate:"required"`
	Code        string  `json:"code" validate:"required"`
	Name        string  `json:"name" validate:"required"`
	Description *string `json:"description"`
	SortOrder   int32   `json:"sort_order"`
	IsActive    int16   `json:"is_active"`
	Icon        *string `json:"icon"`
}

type UpdateApplicationRequest struct {
	Code        *string `json:"code"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
	SortOrder   *int32  `json:"sort_order"`
	IsActive    *int16  `json:"is_active"`
	Icon        *string `json:"icon"`
}

type CreateModuleRequest struct {
	ApplicationID int64   `json:"application_id" validate:"required"`
	Code          string  `json:"code" validate:"required"`
	Name          string  `json:"name" validate:"required"`
	Description   *string `json:"description"`
	SortOrder     int32   `json:"sort_order"`
	IsActive      int16   `json:"is_active"`
	Icon          *string `json:"icon"`
}

type UpdateModuleRequest struct {
	ContextPath *string `json:"context_path"`
	Code        *string `json:"code"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
	SortOrder   *int32  `json:"sort_order"`
	IsActive    *int16  `json:"is_active"`
	Icon        *string `json:"icon"`
}

type CreateAppObjectRequest struct {
	ModuleID     int64   `json:"module_id" validate:"required"`
	ObjectTypeID int32   `json:"object_type_id" validate:"required"`
	ParentID     *int64  `json:"parent_id"`
	Code         string  `json:"code" validate:"required"`
	Name         string  `json:"name" validate:"required"`
	Path         *string `json:"path"`
	ObjectLevel  int32   `json:"object_level"`
	SortOrder    int32   `json:"sort_order"`
	IsActive     int16   `json:"is_active"`
}

type UpdateAppObjectRequest struct {
	ObjectTypeID *int32  `json:"object_type_id"`
	ParentID     *int64  `json:"parent_id"`
	Code         *string `json:"code"`
	Name         *string `json:"name"`
	Path         *string `json:"path"`
	ObjectLevel  *int32  `json:"object_level"`
	SortOrder    *int32  `json:"sort_order"`
	IsActive     *int16  `json:"is_active"`
}

// ============ Process (à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸à¸±à¸š Module à¹à¸¥à¸° Object) ============

type Process struct {
	ID          int64          `json:"id"`
	ModuleID    int64          `json:"module_id"`
	ObjectID    sql.NullInt64  `json:"object_id"`
	Code        string         `json:"code"`
	Name        string         `json:"name"`
	Description sql.NullString `json:"description"`
	SortOrder   int32          `json:"sort_order"`
	IsActive    int16          `json:"is_active"`
	CreatedBy   sql.NullString `json:"created_by"`
	UpdatedBy   sql.NullString `json:"updated_by"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type ProcessResponse struct {
	ID          int64     `json:"id"`
	ModuleID    int64     `json:"module_id"`
	ObjectID    *int64    `json:"object_id,omitempty"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	SortOrder   int32     `json:"sort_order"`
	IsActive    int16     `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (p *Process) ToResponse() ProcessResponse {
	resp := ProcessResponse{
		ID:        p.ID,
		ModuleID:  p.ModuleID,
		Code:      p.Code,
		Name:      p.Name,
		SortOrder: p.SortOrder,
		IsActive:  p.IsActive,
		CreatedAt: p.CreatedAt,
		UpdatedAt: p.UpdatedAt,
	}
	if p.ObjectID.Valid {
		resp.ObjectID = &p.ObjectID.Int64
	}
	if p.Description.Valid {
		resp.Description = &p.Description.String
	}
	return resp
}

type CreateProcessRequest struct {
	ModuleID    int64   `json:"module_id" validate:"required"`
	ObjectID    *int64  `json:"object_id"`
	Code        string  `json:"code" validate:"required"`
	Name        string  `json:"name" validate:"required"`
	Description *string `json:"description"`
	SortOrder   int32   `json:"sort_order"`
	IsActive    int16   `json:"is_active"`
}

type UpdateProcessRequest struct {
	ModuleID    *int64  `json:"module_id"`
	ObjectID    *int64  `json:"object_id"`
	Code        *string `json:"code"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
	SortOrder   *int32  `json:"sort_order"`
	IsActive    *int16  `json:"is_active"`
}

// ============ SubProcess (à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸à¸±à¸š Process) ============

type SubProcess struct {
	ID          int64          `json:"id"`
	ProcessID   int64          `json:"process_id"`
	Code        string         `json:"code"`
	Name        string         `json:"name"`
	Description sql.NullString `json:"description"`
	SortOrder   int32          `json:"sort_order"`
	IsActive    int16          `json:"is_active"`
	CreatedBy   sql.NullString `json:"created_by"`
	UpdatedBy   sql.NullString `json:"updated_by"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type SubProcessResponse struct {
	ID          int64     `json:"id"`
	ProcessID   int64     `json:"process_id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	SortOrder   int32     `json:"sort_order"`
	IsActive    int16     `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (s *SubProcess) ToResponse() SubProcessResponse {
	resp := SubProcessResponse{
		ID:        s.ID,
		ProcessID: s.ProcessID,
		Code:      s.Code,
		Name:      s.Name,
		SortOrder: s.SortOrder,
		IsActive:  s.IsActive,
		CreatedAt: s.CreatedAt,
		UpdatedAt: s.UpdatedAt,
	}
	if s.Description.Valid {
		resp.Description = &s.Description.String
	}
	return resp
}

type CreateSubProcessRequest struct {
	ProcessID   int64   `json:"process_id" validate:"required"`
	Code        string  `json:"code" validate:"required"`
	Name        string  `json:"name" validate:"required"`
	Description *string `json:"description"`
	SortOrder   int32   `json:"sort_order"`
	IsActive    int16   `json:"is_active"`
}

type UpdateSubProcessRequest struct {
	Code        *string `json:"code"`
	Name        *string `json:"name"`
	Description *string `json:"description"`
	SortOrder   *int32  `json:"sort_order"`
	IsActive    *int16  `json:"is_active"`
}
