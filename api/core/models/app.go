package models

import (
	"database/sql"
	"time"
)

type App struct {
	AppID          int            `json:"app_id"`
	AppName        sql.NullString `json:"app_name"`
	AppABV         sql.NullString `json:"app_abv"`
	AppDesc        sql.NullString `json:"app_desc"`
	AppLogo        sql.NullString `json:"app_logo"`
	Status         sql.NullString `json:"status"`
	AppCode        sql.NullString `json:"app_code"`
	AppTypeMst     sql.NullString `json:"app_type_mst"`
	ClientID       sql.NullString `json:"client_id"`
	AppSecret      sql.NullString `json:"app_secret"`
	Protect        sql.NullString `json:"protect"`
	LogFlag        sql.NullString `json:"log_flag"`
	GroupID        sql.NullInt64  `json:"group_id"`
	AppSeq         sql.NullInt64  `json:"app_seq"`
	PermissionData sql.NullString `json:"permission_data"`
	UpdateDate     sql.NullTime   `json:"update_date,omitempty"`
	UpdateBy       sql.NullInt64  `json:"update_by,omitempty"`
	CreateDate     sql.NullTime   `json:"create_date,omitempty"`
	CreateBy       sql.NullInt64  `json:"create_by,omitempty"`
	DeletedDate    sql.NullTime   `json:"deleted_date,omitempty"`
	DeletedBy      sql.NullString `json:"deleted_by,omitempty"`
}

type AppResponse struct {
	AppID          int        `json:"appId"`
	AppName        *string    `json:"appName"`
	AppABV         *string    `json:"appAbv"`
	AppDesc        *string    `json:"appDesc"`
	AppLogo        *string    `json:"appLogo"`
	Status         *string    `json:"status"`
	AppCode        *string    `json:"appCode"`
	AppTypeMst     *string    `json:"appTypeMst"`
	ClientID       *string    `json:"clientId"`
	GroupID        *int       `json:"groupId"`
	AppSeq         *int       `json:"appSeq"`
	PermissionData *string    `json:"permissionData"`
	CreateDate     *time.Time `json:"createDate,omitempty"`
}

type CreateAppRequest struct {
	AppName  string  `json:"appName" validate:"required"`
	AppABV   *string `json:"appAbv"`
	AppDesc  *string `json:"appDesc"`
	AppLogo  *string `json:"appLogo"`
	Status   *string `json:"status"`
	AppCode  *string `json:"appCode"`
	ClientID *string `json:"clientId"`
}

type UpdateAppRequest struct {
	AppName  *string `json:"appName"`
	AppABV   *string `json:"appAbv"`
	AppDesc  *string `json:"appDesc"`
	AppLogo  *string `json:"appLogo"`
	Status   *string `json:"status"`
	AppCode  *string `json:"appCode"`
	ClientID *string `json:"clientId"`
}

// ToResponse แปลง App เป็น AppResponse
func (a *App) ToResponse() AppResponse {
	resp := AppResponse{
		AppID: a.AppID,
	}

	if a.AppName.Valid {
		resp.AppName = &a.AppName.String
	}
	if a.AppABV.Valid {
		resp.AppABV = &a.AppABV.String
	}
	if a.AppDesc.Valid {
		resp.AppDesc = &a.AppDesc.String
	}
	if a.AppLogo.Valid {
		resp.AppLogo = &a.AppLogo.String
	}
	if a.Status.Valid {
		resp.Status = &a.Status.String
	}
	if a.AppCode.Valid {
		resp.AppCode = &a.AppCode.String
	}
	if a.AppTypeMst.Valid {
		resp.AppTypeMst = &a.AppTypeMst.String
	}
	if a.ClientID.Valid {
		resp.ClientID = &a.ClientID.String
	}
	if a.GroupID.Valid {
		groupID := int(a.GroupID.Int64)
		resp.GroupID = &groupID
	}
	if a.AppSeq.Valid {
		appSeq := int(a.AppSeq.Int64)
		resp.AppSeq = &appSeq
	}
	if a.PermissionData.Valid {
		resp.PermissionData = &a.PermissionData.String
	}
	if a.CreateDate.Valid {
		resp.CreateDate = &a.CreateDate.Time
	}

	return resp
}
