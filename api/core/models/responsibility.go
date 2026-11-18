package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

// Responsibility à¹‚à¸¡à¹€à¸”à¸¥à¸ªà¸³à¸«à¸£à¸±à¸šà¸•à¸²à¸£à¸²à¸‡ responsibility
type Responsibility struct {
	ID            int64          `json:"id"`
	Code          string         `json:"code"`
	Name          string         `json:"name"`
	Description   sql.NullString `json:"description"`
	EffectiveDate sql.NullTime   `json:"effective_date"`
	ExpireDate    sql.NullTime   `json:"expire_date"`
	IsActive      int16          `json:"is_active"`
	Permissions   string         `json:"-"` // raw JSON stored in DB
	CreatedBy     sql.NullString `json:"created_by"`
	UpdatedBy     sql.NullString `json:"updated_by"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

// ResponsibilityResponse à¹‚à¸¡à¹€à¸”à¸¥à¸ªà¸³à¸«à¸£à¸±à¸šà¸ªà¹ˆà¸‡à¸à¸¥à¸±à¸šà¹„à¸›à¸¢à¸±à¸‡ frontend
type ResponsibilityResponse struct {
	ID            int64     `json:"id"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	Description   *string   `json:"description,omitempty"`
	EffectiveDate *string   `json:"effective_date,omitempty"`
	ExpireDate    *string   `json:"expire_date,omitempty"`
	IsActive      int16     `json:"is_active"`
	Permissions   []string  `json:"permissions"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ToResponse à¹à¸›à¸¥à¸‡ Responsibility à¹€à¸›à¹‡à¸™ ResponsibilityResponse
func (r *Responsibility) ToResponse() ResponsibilityResponse {
	resp := ResponsibilityResponse{
		ID:          r.ID,
		Code:        r.Code,
		Name:        r.Name,
		IsActive:    r.IsActive,
		Permissions: parsePermissionsJSON(r.Permissions),
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
	if r.Description.Valid {
		resp.Description = &r.Description.String
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

func parsePermissionsJSON(raw string) []string {
	if raw == "" || raw == "[]" {
		return []string{}
	}
	var perms []string
	if err := json.Unmarshal([]byte(raw), &perms); err != nil {
		return []string{}
	}
	return perms
}

func MarshalPermissionsJSON(perms []string) string {
	if len(perms) == 0 {
		return "[]"
	}
	b, err := json.Marshal(perms)
	if err != nil {
		return "[]"
	}
	return string(b)
}

// CreateResponsibilityRequest à¹‚à¸¡à¹€à¸”à¸¥à¸ªà¸³à¸«à¸£à¸±à¸šà¸ªà¸£à¹‰à¸²à¸‡ responsibility à¹ƒà¸«à¸¡à¹ˆ
type CreateResponsibilityRequest struct {
	Code          string   `json:"code" validate:"required"`
	Name          string   `json:"name" validate:"required"`
	Description   *string  `json:"description"`
	EffectiveDate *string  `json:"effective_date"`
	ExpireDate    *string  `json:"expire_date"`
	IsActive      int16    `json:"is_active"`
	Permissions   []string `json:"permissions"`
}

// UpdateResponsibilityRequest à¹‚à¸¡à¹€à¸”à¸¥à¸ªà¸³à¸«à¸£à¸±à¸šà¸­à¸±à¸›à¹€à¸”à¸• responsibility
type UpdateResponsibilityRequest struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Description   *string  `json:"description"`
	EffectiveDate *string  `json:"effective_date"`
	ExpireDate    *string  `json:"expire_date"`
	IsActive      int16    `json:"is_active"`
	Permissions   []string `json:"permissions"`
}

// CreateResponsibilityRoleMappingRequest à¹‚à¸¡à¹€à¸”à¸¥à¸ªà¸³à¸«à¸£à¸±à¸šà¸ªà¸£à¹‰à¸²à¸‡ responsibility role mapping
type CreateResponsibilityRoleMappingRequest struct {
	ResponsibilityID int64   `json:"responsibility_id" validate:"required"`
	RoleID           string  `json:"role_id" validate:"required"`
	EffectiveDate    *string `json:"effective_date"`
	ExpireDate       *string `json:"expire_date"`
	IsActive         int16   `json:"is_active"`
}

// ResponsibilityRoleMapping à¹‚à¸¡à¹€à¸”à¸¥à¸ªà¸³à¸«à¸£à¸±à¸šà¸•à¸²à¸£à¸²à¸‡ responsibility_role_mapping
type ResponsibilityRoleMapping struct {
	ID               int64          `json:"id"`
	ResponsibilityID int64          `json:"responsibility_id"`
	RoleID           string         `json:"role_id"`
	EffectiveDate    sql.NullTime   `json:"effective_date"`
	ExpireDate       sql.NullTime   `json:"expire_date"`
	IsActive         int16          `json:"is_active"`
	CreatedBy        sql.NullString `json:"created_by"`
	UpdatedBy        sql.NullString `json:"updated_by"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}
