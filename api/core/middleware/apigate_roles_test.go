package middleware

import "testing"

func TestConsoleRoleDenies(t *testing.T) {
	cases := []struct {
		role, method, path string
		denied             bool
	}{
		{"admin", "POST", "/iamx/api/console-admins", false},
		{"admin", "DELETE", "/iamx/api/directory/applications/4", false},
		{"auditor", "GET", "/iamx/api/directory/users", false},
		{"auditor", "PUT", "/iamx/api/directory/users/1", true},
		{"auditor", "POST", "/iamx/api/console-admins/me/password", false},
		{"auditor", "POST", "/iamx/api/auth/logout", false},
		{"access_manager", "POST", "/iamx/api/directory/user-role-mappings", false},
		{"access_manager", "PUT", "/iamx/api/directory/roles/9/permissions", false},
		{"access_manager", "POST", "/iamx/api/console-admins", true},
		{"access_manager", "POST", "/iamx/api/directory/applications", true},
		{"access_manager", "POST", "/iamx/api/directory/process-mappers", true},
		{"access_manager", "GET", "/iamx/api/directory/applications", false},
	}
	for _, tc := range cases {
		got := consoleRoleDenies(tc.role, tc.method, tc.path) != ""
		if got != tc.denied {
			t.Errorf("%s %s %s: denied=%v want %v", tc.role, tc.method, tc.path, got, tc.denied)
		}
	}
}
