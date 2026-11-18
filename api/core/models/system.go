package models

import (
	"database/sql"
	"time"
)

type System struct {
	SystemID         int            `json:"system_id"`
	SystemName       string         `json:"system_name"`
	SystemABV        sql.NullString `json:"system_abv"`
	SystemDesc       sql.NullString `json:"system_desc"`
	SystemTypeMainID sql.NullString `json:"system_type_main_id"`
	SystemLogo       sql.NullString `json:"system_logo"`
	Status           sql.NullString `json:"status"`
	UpdateDate       sql.NullTime   `json:"update_date,omitempty"`
	UpdateBy         sql.NullInt64  `json:"update_by,omitempty"`
	CreateDate       sql.NullTime   `json:"create_date,omitempty"`
	CreateBy         sql.NullInt64  `json:"create_by,omitempty"`
}

type SystemResponse struct {
	SystemID         int        `json:"systemId"`
	SystemName       string     `json:"systemName"`
	SystemABV        *string    `json:"systemAbv"`
	SystemDesc       *string    `json:"systemDesc"`
	SystemTypeMainID *string    `json:"systemTypeMainId"`
	SystemLogo       *string    `json:"systemLogo"`
	Status           *string    `json:"status"`
	UpdateDate       *time.Time `json:"update_date,omitempty"`
	UpdateBy         *int       `json:"update_by,omitempty"`
	CreateDate       *time.Time `json:"create_date,omitempty"`
	CreateBy         *int       `json:"create_by,omitempty"`
}

type CreateSystemRequest struct {
	SystemName       string  `json:"system_name" validate:"required"`
	SystemABV        *string `json:"system_abv"`
	SystemDesc       *string `json:"system_desc"`
	SystemTypeMainID *string `json:"system_type_main_id"`
	SystemLogo       *string `json:"system_logo"`
	Status           *string `json:"status"`
}

type UpdateSystemRequest struct {
	SystemName       *string `json:"system_name"`
	SystemABV        *string `json:"system_abv"`
	SystemDesc       *string `json:"system_desc"`
	SystemTypeMainID *string `json:"system_type_main_id"`
	SystemLogo       *string `json:"system_logo"`
	Status           *string `json:"status"`
}

// ToResponse แปลง System เป็น SystemResponse
func (s *System) ToResponse() SystemResponse {
	resp := SystemResponse{
		SystemID:   s.SystemID,
		SystemName: s.SystemName,
	}

	if s.SystemABV.Valid {
		resp.SystemABV = &s.SystemABV.String
	}
	if s.SystemDesc.Valid {
		resp.SystemDesc = &s.SystemDesc.String
	}
	if s.SystemTypeMainID.Valid {
		resp.SystemTypeMainID = &s.SystemTypeMainID.String
	}
	if s.SystemLogo.Valid {
		resp.SystemLogo = &s.SystemLogo.String
	}
	if s.Status.Valid {
		resp.Status = &s.Status.String
	}
	if s.UpdateDate.Valid {
		resp.UpdateDate = &s.UpdateDate.Time
	}
	if s.UpdateBy.Valid {
		updateBy := int(s.UpdateBy.Int64)
		resp.UpdateBy = &updateBy
	}
	if s.CreateDate.Valid {
		resp.CreateDate = &s.CreateDate.Time
	}
	if s.CreateBy.Valid {
		createBy := int(s.CreateBy.Int64)
		resp.CreateBy = &createBy
	}

	return resp
}
