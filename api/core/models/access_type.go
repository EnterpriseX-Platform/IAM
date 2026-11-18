package models

import (
	"database/sql"
	"time"
)

type AccessType struct {
	AccessTypeID     int            `json:"access_type_id"`
	AccessTypeName   string         `json:"access_type_name"`
	AccessTypeMainID sql.NullString `json:"access_type_main_id"`
	AccessTypeMain   sql.NullString `json:"access_type_main"`
	AccessTypeDesc   sql.NullString `json:"access_type_desc"`
	Status           sql.NullString `json:"status"`
	CreateDate       sql.NullTime   `json:"create_date,omitempty"`
}

type AccessTypeResponse struct {
	AccessTypeID     int        `json:"accessTypeId"`
	AccessTypeName   string     `json:"accessTypeName"`
	AccessTypeMainID *string    `json:"accessTypeMainId"`
	AccessTypeMain   *string    `json:"accessTypeMain"`
	AccessTypeDesc   *string    `json:"accessTypeDesc"`
	Status           *string    `json:"status"`
	CreateDate       *time.Time `json:"createDate,omitempty"`
}

type CreateAccessTypeRequest struct {
	AccessTypeName   string  `json:"access_type_name" validate:"required"`
	AccessTypeMainID *string `json:"access_type_main_id"`
	AccessTypeDesc   *string `json:"access_type_desc"`
	Status           *string `json:"status"`
}

type UpdateAccessTypeRequest struct {
	AccessTypeName   *string `json:"access_type_name"`
	AccessTypeMainID *string `json:"access_type_main_id"`
	AccessTypeDesc   *string `json:"access_type_desc"`
	Status           *string `json:"status"`
}

// ToResponse แปลง AccessType เป็น AccessTypeResponse
func (a *AccessType) ToResponse() AccessTypeResponse {
	resp := AccessTypeResponse{
		AccessTypeID:   a.AccessTypeID,
		AccessTypeName: a.AccessTypeName,
	}

	if a.AccessTypeMainID.Valid {
		resp.AccessTypeMainID = &a.AccessTypeMainID.String
	}
	if a.AccessTypeMain.Valid {
		resp.AccessTypeMain = &a.AccessTypeMain.String
	}
	if a.AccessTypeDesc.Valid {
		resp.AccessTypeDesc = &a.AccessTypeDesc.String
	}
	if a.Status.Valid {
		resp.Status = &a.Status.String
	}
	if a.CreateDate.Valid {
		resp.CreateDate = &a.CreateDate.Time
	}

	return resp
}
