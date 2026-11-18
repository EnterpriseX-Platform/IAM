package models

// ===== Subprocess =====
type SubprocessItem struct {
	SubprocessID   *string `json:"subprocessId,omitempty"`
	SubprocessCode *string `json:"subprocessCode,omitempty"`
	SubprocessName *string `json:"subprocessName,omitempty"`
}

// ===== Process + Subprocess =====
type ProcessWithSubprocess struct {
	ProcessID    *string          `json:"processId,omitempty"`
	DisplayCode  *string          `json:"displayCode,omitempty"`
	DisplayName  *string          `json:"displayName,omitempty"`
	Subprocesses []SubprocessItem `json:"subprocesses"`
}
