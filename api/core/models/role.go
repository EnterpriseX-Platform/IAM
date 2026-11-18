package models

import (
	"database/sql"
	"time"
)

// Role โมเดลสำหรับตาราง role
type Role struct {
	ID            string         `json:"id"`
	Code          string         `json:"code"`
	Name          string         `json:"name"`
	Description   sql.NullString `json:"description"`
	RoleType      sql.NullString `json:"role_type"`
	EffectiveDate sql.NullTime   `json:"effective_date"`
	ExpireDate    sql.NullTime   `json:"expire_date"`
	IsActive      int16          `json:"is_active"`
	DefaultRole   int16          `json:"default_role"`
	AllDataAccess int16          `json:"all_data_access"`
	CreatedBy     sql.NullString `json:"created_by"`
	UpdatedBy     sql.NullString `json:"updated_by"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

// RoleResponse โมเดลสำหรับส่งกลับไปยัง frontend
type RoleResponse struct {
	ID            string    `json:"id"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	Description   *string   `json:"description,omitempty"`
	RoleType      string    `json:"role_type"`
	EffectiveDate *string   `json:"effective_date,omitempty"`
	ExpireDate    *string   `json:"expire_date,omitempty"`
	IsActive      int16     `json:"is_active"`
	DefaultRole   int16     `json:"default_role"`
	AllDataAccess int16     `json:"all_data_access"`
	UserCount     int64     `json:"user_count,omitempty"`
	MenuCount     *int64    `json:"menu_count,omitempty"`
	GroupCode     string    `json:"group_code"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ToResponse แปลง Role เป็น RoleResponse
func (r *Role) ToResponse() RoleResponse {
	resp := RoleResponse{
		ID:            r.ID,
		Code:          r.Code,
		Name:          r.Name,
		RoleType:      "internal",
		IsActive:      r.IsActive,
		DefaultRole:   r.DefaultRole,
		AllDataAccess: r.AllDataAccess,
		CreatedAt:     r.CreatedAt,
		UpdatedAt:     r.UpdatedAt,
	}
	if r.Description.Valid {
		resp.Description = &r.Description.String
	}
	if r.RoleType.Valid && r.RoleType.String != "" {
		resp.RoleType = r.RoleType.String
	}
	if r.EffectiveDate.Valid {
		dateStr := r.EffectiveDate.Time.Format("2006-01-02")
		resp.EffectiveDate = &dateStr
	}
	if r.ExpireDate.Valid {
		dateStr := r.ExpireDate.Time.Format("2006-01-02")
		resp.ExpireDate = &dateStr
	}
	return resp
}

// CreateRoleRequest โมเดลสำหรับสร้าง role ใหม่
type CreateRoleRequest struct {
	Code          string  `json:"code" validate:"required"`
	Name          string  `json:"name" validate:"required"`
	Description   *string `json:"description"`
	RoleType      string  `json:"role_type"`
	EffectiveDate *string `json:"effective_date"`
	ExpireDate    *string `json:"expire_date"`
	IsActive      int16   `json:"is_active"`
	DefaultRole   int16   `json:"default_role"`
	AllDataAccess int16   `json:"all_data_access"`
}

// UpdateRoleRequest โมเดลสำหรับอัปเดต role
type UpdateRoleRequest struct {
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	Description   *string `json:"description"`
	RoleType      string  `json:"role_type"`
	EffectiveDate *string `json:"effective_date"`
	ExpireDate    *string `json:"expire_date"`
	IsActive      int16   `json:"is_active"`
	DefaultRole   int16   `json:"default_role"`
	AllDataAccess int16   `json:"all_data_access"`
}
