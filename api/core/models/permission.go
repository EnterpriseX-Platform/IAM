package models

import (
	"database/sql"
	"time"
)

type Permission struct {
	PermissionID   int            `json:"permission_id"`
	PermissionName string         `json:"permission_name"`
	PermissionDesc sql.NullString `json:"permission_desc"`
	Status         sql.NullString `json:"status"`
	SystemID       sql.NullInt64  `json:"system_id"`
	CreateDate     sql.NullTime   `json:"create_date,omitempty"`
	CreateBy       sql.NullInt64  `json:"create_by,omitempty"`
	UpdateDate     sql.NullTime   `json:"update_date,omitempty"`
	UpdateBy       sql.NullInt64  `json:"update_by,omitempty"`
}

type PermissionResponse struct {
	PermissionID   int        `json:"permissionId"`
	PermissionName string     `json:"permissionName"`
	PermissionDesc *string    `json:"permissionDesc"`
	Status         *string    `json:"status"`
	SystemID       *int       `json:"systemId"`
	SystemName     *string    `json:"systemName"`
	CreateDate     *time.Time `json:"createDate,omitempty"`
	CreateBy       *int       `json:"createBy,omitempty"`
	UpdateDate     *time.Time `json:"updateDate,omitempty"`
	UpdateBy       *int       `json:"updateBy,omitempty"`
}

type CreatePermissionRequest struct {
	PermissionName string  `json:"permission_name" validate:"required"`
	PermissionDesc *string `json:"permission_desc"`
	Status         *string `json:"status"`
	SystemID       *int    `json:"system_id"`
}

type UpdatePermissionRequest struct {
	PermissionName *string `json:"permission_name"`
	PermissionDesc *string `json:"permission_desc"`
	Status         *string `json:"status"`
	SystemID       *int    `json:"system_id"`
}

// ToResponse แปลง Permission เป็น PermissionResponse
func (p *Permission) ToResponse() PermissionResponse {
	resp := PermissionResponse{
		PermissionID:   p.PermissionID,
		PermissionName: p.PermissionName,
	}

	// if p.PermissionCode.Valid {
	// 	resp.PermissionCode = &p.PermissionCode.String
	// }
	if p.PermissionDesc.Valid {
		resp.PermissionDesc = &p.PermissionDesc.String
	}
	if p.Status.Valid {
		resp.Status = &p.Status.String
	}
	if p.SystemID.Valid {
		systemID := int(p.SystemID.Int64)
		resp.SystemID = &systemID
	}
	if p.CreateDate.Valid {
		resp.CreateDate = &p.CreateDate.Time
	}
	if p.CreateBy.Valid {
		createBy := int(p.CreateBy.Int64)
		resp.CreateBy = &createBy
	}
	if p.UpdateDate.Valid {
		resp.UpdateDate = &p.UpdateDate.Time
	}
	if p.UpdateBy.Valid {
		updateBy := int(p.UpdateBy.Int64)
		resp.UpdateBy = &updateBy
	}

	return resp
}
