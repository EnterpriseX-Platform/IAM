package models

import (
	"database/sql"
	"time"
)

type ObjectType struct {
	ObjectTypeID   int            `json:"object_type_id"`
	ObjectTypeCode sql.NullString `json:"object_type_code"`
	ObjectTypeName sql.NullString `json:"object_type_name"`
	ObjectTypeDesc sql.NullString `json:"object_type_desc"`
	IsCustom       sql.NullString `json:"is_custom"` // default 'N'
	Protect        sql.NullString `json:"protect"`

	UpdateDate sql.NullTime  `json:"update_date,omitempty"`
	UpdateBy   sql.NullInt64 `json:"update_by,omitempty"`
	CreateDate sql.NullTime  `json:"create_date,omitempty"`
	CreateBy   sql.NullInt64 `json:"create_by,omitempty"`
}

type ObjectTypeResponse struct {
	ObjectTypeID   int        `json:"objectTypeId"`
	ObjectTypeCode *string    `json:"objectTypeCode"`
	ObjectTypeName *string    `json:"objectTypeName"`
	ObjectTypeDesc *string    `json:"objectTypeDesc"`
	IsCustom       *string    `json:"isCustom"`
	Protect        *string    `json:"protect"`
	UpdateDate     *time.Time `json:"update_date,omitempty"`
	UpdateBy       *int       `json:"update_by,omitempty"`
	CreateDate     *time.Time `json:"create_date,omitempty"`
	CreateBy       *int       `json:"create_by,omitempty"`
}

type CreateObjectTypeRequest struct {
	ObjectTypeCode *string `json:"object_type_code"`
	ObjectTypeName *string `json:"object_type_name"` // ถ้าต้อง required ใส่ validate:"required"
	ObjectTypeDesc *string `json:"object_type_desc"`
	IsCustom       *string `json:"is_custom"` // ไม่ส่งมา => 'N'
	Protect        *string `json:"protect"`
	CreateBy       *int    `json:"create_by"`
}

type UpdateObjectTypeRequest struct {
	ObjectTypeCode *string `json:"object_type_code"`
	ObjectTypeName *string `json:"object_type_name"`
	ObjectTypeDesc *string `json:"object_type_desc"`
	IsCustom       *string `json:"is_custom"`
	Protect        *string `json:"protect"`
	UpdateBy       *int    `json:"update_by"`
}

// ToResponse แปลง ObjectType เป็น ObjectTypeResponse
func (o *ObjectType) ToResponse() ObjectTypeResponse {
	resp := ObjectTypeResponse{
		ObjectTypeID: o.ObjectTypeID,
	}

	if o.ObjectTypeCode.Valid {
		resp.ObjectTypeCode = &o.ObjectTypeCode.String
	}
	if o.ObjectTypeName.Valid {
		resp.ObjectTypeName = &o.ObjectTypeName.String
	}
	if o.ObjectTypeDesc.Valid {
		resp.ObjectTypeDesc = &o.ObjectTypeDesc.String
	}
	if o.IsCustom.Valid {
		resp.IsCustom = &o.IsCustom.String
	}
	if o.Protect.Valid {
		resp.Protect = &o.Protect.String
	}
	if o.UpdateDate.Valid {
		resp.UpdateDate = &o.UpdateDate.Time
	}
	if o.UpdateBy.Valid {
		v := int(o.UpdateBy.Int64)
		resp.UpdateBy = &v
	}
	if o.CreateDate.Valid {
		resp.CreateDate = &o.CreateDate.Time
	}
	if o.CreateBy.Valid {
		v := int(o.CreateBy.Int64)
		resp.CreateBy = &v
	}

	return resp
}
