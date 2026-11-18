package models

import (
	"database/sql"
	"time"
)

type ManageMenu struct {
	ObjectID       int            `json:"object_id"`
	ObjectName     sql.NullString `json:"object_name"`
	ObjectCode     sql.NullString `json:"object_code"`
	Path           sql.NullString `json:"path"`
	ObjectTypeName sql.NullString `json:"object_type_name"` // ✅ ให้ชัดว่าเป็นชื่อประเภท
	Status         sql.NullString `json:"status"`
	SystemID       sql.NullInt64  `json:"system_id"`
	ParentObjectID sql.NullInt64  `json:"parent_object_id"`
	ObjectSeq      sql.NullInt64  `json:"object_seq"`

	CreateDate sql.NullTime  `json:"create_date,omitempty"`
	CreateBy   sql.NullInt64 `json:"create_by,omitempty"`
	UpdateDate sql.NullTime  `json:"update_date,omitempty"`
	UpdateBy   sql.NullInt64 `json:"update_by,omitempty"`
}

type ManageMenuResponse struct {
	SystemID   *int    `json:"systemId"`
	SystemName *string `json:"systemName"`

	ObjectID       int     `json:"objectId"`
	ObjectName     *string `json:"objectName"`
	ObjectCode     *string `json:"objectCode"`
	Path           *string `json:"path"`
	ObjectTypeName *string `json:"objectTypeName"` // ✅ เพิ่มให้ตรงกับ query ใหม่
	Status         *string `json:"status"`
	ParentObjectID *int    `json:"parentObjectId,omitempty"`
	ObjectSeq      *int    `json:"objectSeq,omitempty"`

	CreateDate *time.Time `json:"createDate,omitempty"`
	CreateBy   *int       `json:"createBy,omitempty"`
	UpdateDate *time.Time `json:"updateDate,omitempty"`
	UpdateBy   *int       `json:"updateBy,omitempty"`
}

type CreateManageMenuRequest struct {
	ObjectName   string  `json:"object_name" validate:"required"`
	ObjectCode   *string `json:"object_code"`
	Path         *string `json:"path"`
	ObjectTypeID *int    `json:"object_type_id"`
	Status       *string `json:"status"`
	SystemID     *int    `json:"system_id" validate:"required"`
}

type UpdateManageMenuRequest struct {
	ObjectName   *string `json:"object_name"`
	ObjectCode   *string `json:"object_code"`
	Path         *string `json:"path"`
	ObjectTypeID *int    `json:"object_type_id"`
	Status       *string `json:"status"`
	SystemID     *int    `json:"system_id"`
}

type MenuSimpleResponse struct {
	SystemID   *int    `json:"systemId"`
	ObjectID   *int    `json:"objectId"`
	SystemName *string `json:"systemName"`
	ObjectName *string `json:"objectName"`
	ObjectSeq  *int    `json:"objectSeq,omitempty"`
}

func (m *ManageMenu) ToResponse() ManageMenuResponse {
	resp := ManageMenuResponse{
		ObjectID: m.ObjectID,
	}

	if m.ObjectName.Valid {
		resp.ObjectName = &m.ObjectName.String
	}
	if m.ObjectCode.Valid {
		resp.ObjectCode = &m.ObjectCode.String
	}
	if m.Path.Valid {
		resp.Path = &m.Path.String
	}
	if m.ObjectTypeName.Valid {
		resp.ObjectTypeName = &m.ObjectTypeName.String // ✅ ถูกต้อง: เป็นชื่อ ไม่ใช่ int
	}
	if m.Status.Valid {
		resp.Status = &m.Status.String
	}
	if m.SystemID.Valid {
		v := int(m.SystemID.Int64)
		resp.SystemID = &v
	}

	if m.ParentObjectID.Valid {
		v := int(m.ParentObjectID.Int64)
		resp.ParentObjectID = &v
	}
	if m.ObjectSeq.Valid {
		v := int(m.ObjectSeq.Int64)
		resp.ObjectSeq = &v
	}
	if m.CreateDate.Valid {
		resp.CreateDate = &m.CreateDate.Time
	}
	if m.CreateBy.Valid {
		v := int(m.CreateBy.Int64)
		resp.CreateBy = &v
	}
	if m.UpdateDate.Valid {
		resp.UpdateDate = &m.UpdateDate.Time
	}
	if m.UpdateBy.Valid {
		v := int(m.UpdateBy.Int64)
		resp.UpdateBy = &v
	}

	return resp
}
