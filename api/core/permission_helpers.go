package core

import "strings"

// PermissionFlagsToActions converts the 7 boolean perm columns on
// role_object_permission / responsibility_role_permission /
// user_custom_object_permission into a string slice — the shape PG
// JSONB queries returned. Order is fixed for stable JSON output.
func PermissionFlagsToActions(canView, canCreate, canEdit, canDelete, canApprove, canExport, canPrint int) []string {
	out := make([]string, 0, 7)
	if canView == 1 {
		out = append(out, "VIEW")
	}
	if canCreate == 1 {
		out = append(out, "CREATE")
	}
	if canEdit == 1 {
		out = append(out, "EDIT")
	}
	if canDelete == 1 {
		out = append(out, "DELETE")
	}
	if canApprove == 1 {
		out = append(out, "APPROVE")
	}
	if canExport == 1 {
		out = append(out, "EXPORT")
	}
	if canPrint == 1 {
		out = append(out, "PRINT")
	}
	return out
}

// PermissionActionsToFlags is the inverse — accepts an array like
// ["VIEW","CREATE","EDIT"] and returns the seven flags in fixed order.
func PermissionActionsToFlags(actions []string) (view, create, edit, del, approve, export, prnt int) {
	for _, a := range actions {
		switch strings.ToUpper(strings.TrimSpace(a)) {
		case "VIEW":
			view = 1
		case "CREATE":
			create = 1
		case "EDIT":
			edit = 1
		case "DELETE":
			del = 1
		case "APPROVE":
			approve = 1
		case "EXPORT":
			export = 1
		case "PRINT":
			prnt = 1
		}
	}
	return
}

// DataAccessFlagsToActions for the 4-flag data_access permission tables.
func DataAccessFlagsToActions(canView, canExport, canShare, canPrint int) []string {
	out := make([]string, 0, 4)
	if canView == 1 {
		out = append(out, "VIEW")
	}
	if canExport == 1 {
		out = append(out, "EXPORT")
	}
	if canShare == 1 {
		out = append(out, "SHARE")
	}
	if canPrint == 1 {
		out = append(out, "PRINT")
	}
	return out
}

// DataAccessActionsToFlags is the inverse for data_access perms.
func DataAccessActionsToFlags(actions []string) (view, export, share, prnt int) {
	for _, a := range actions {
		switch strings.ToUpper(strings.TrimSpace(a)) {
		case "VIEW":
			view = 1
		case "EXPORT":
			export = 1
		case "SHARE":
			share = 1
		case "PRINT":
			prnt = 1
		}
	}
	return
}
