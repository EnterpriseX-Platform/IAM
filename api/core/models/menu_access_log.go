package models

// MenuAccessLogRequest - Request สำหรับบันทึก log การเข้าถึงเมนู
type MenuAccessLogRequest struct {
	ObjId      string `json:"objId"`
	ObjName    string `json:"objName"`
	ModuleCode string `json:"moduleCode"`
	URL        string `json:"url"`
}
