package routes

import (
	"api/core"
	"api/core/config"
	"api/core/handlers"
	"api/core/middleware"
	"api/core/services"
	"log"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// SetupRoutes configures all routes for the application
func SetupRoutes(app *fiber.App) {
	// API group
	api := app.Group("/iamx/api")

	// Authentication gate. Registered before every route below so it covers all of
	// them, including any added later — the previous setupAuthMiddleware() was never
	// called, leaving all 230 routes open. The public allowlist lives in
	// middleware.RequireAuthUnlessPublic.
	api.Use(middleware.RequireAuthUnlessPublic())

	// 14/11/69: หน้า Activity — บันทึกว่าใครแก้อะไร + การเข้า console (IAMX.ADMIN_ACTIVITY_LOG)
	api.Use(middleware.ActivityLog())
	// 14/11/69: ข้อความตอบกลับ (message/error) เป็นภาษาอังกฤษ
	api.Use(middleware.TranslateMessages())

	// ทุกคำขอที่เปลี่ยนข้อมูล (POST/PUT/PATCH/DELETE) และสำเร็จ (2xx) → ล้างแคชเมนู/สิทธิ์ · ยกเว้น login/แชท/ล้างแคชเอง
	api.Use(func(c *fiber.Ctx) error {
		err := c.Next()
		switch c.Method() {
		case fiber.MethodPost, fiber.MethodPut, fiber.MethodPatch, fiber.MethodDelete:
		default:
			return err
		}
		if err != nil || c.Response().StatusCode() < 200 || c.Response().StatusCode() >= 300 {
			return err
		}
		p := c.Path()
		for _, skip := range []string{"/auth", "/login", "/logout", "/chat", "/cache/clear", "/register", "/menu-logs", "/preferences", "/pins"} {
			if strings.Contains(p, skip) {
				return err
			}
		}
		if cs := GetCacheService(); cs != nil {
			cs.ClearAll()
		}
		handlers.ClearHierarchyCache()
		return err
	})

	// Health check (public)
	// Legacy: /iamx/api/health  |  New canonical: /iamx/api/system/health
	// Both wired; legacy will retire in a separate sunset PR.
	api.Get("/health", handlers.HealthCheck)
	api.Get("/system/health", handlers.HealthCheck)

	// Auth routes (public - for JWT login)
	auth := api.Group("/auth")
	auth.Post("/login", func(c *fiber.Ctx) error {
		c.Request().Header.Del("Cookie")
		return c.Next()
	}, handlers.Login)
	// 14/11/69 (security): ออกจากระบบ = ยกเลิก token นี้ (ใช้ต่อไม่ได้แม้ยังไม่หมดอายุ)
	auth.Post("/logout", func(c *fiber.Ctx) error {
		token := strings.TrimPrefix(c.Get("Authorization"), "Bearer ")
		if token != "" && token != c.Get("Authorization") {
			ip := c.IP()
			if f := c.Get("X-Forwarded-For"); f != "" {
				ip = strings.TrimSpace(strings.Split(f, ",")[0])
			}
			middleware.RevokeToken(token, "", ip)
		}
		return c.JSON(fiber.Map{"success": true})
	})

	// Registration route (public - for ThaiD user registration)
	api.Post("/register", handlers.RegisterHandler)

	// Keycloak event webhook (internal)
	// Legacy: /iamx/api/internal/keycloak-event  |  New: /iamx/api/system/webhooks/keycloak-event
	api.Post("/internal/keycloak-event", handlers.KeycloakEventHandler)
	api.Post("/system/webhooks/keycloak-event", handlers.KeycloakEventHandler)

	// Setup RBAC routes (public cache routes)
	setupRBACRoutes(api)

	// === ALL PUBLIC ROUTES (no authentication) ===
	// Register directly on api to avoid any middleware

	// User data endpoint (public)
	api.Get("/user-data", handlers.GetUserDataByUsername)

	// User routes (public)
	// Also mounted at /directory/users: the UAT/PROD edge WAF refuses any path under
	// /iamx/api/users (and /admin/roles, /admin/domains — those already have /directory/*
	// aliases), so the console reaches users through the alias. Both paths sit
	// behind RequireAuthUnlessPublic, so the alias exposes nothing new.
	users := newMultiGroup(api, "/users", "/directory/users")
	users.Get("/", handlers.GetUsers)
	users.Post("/import", handlers.ImportUsersHandler)
	users.Get("/import/template", handlers.ImportTemplateHandler)
	users.Get("/avatar-ids", handlers.ListUserAvatarIDs)
	users.Get("/:id", handlers.GetUser)
	users.Post("/", handlers.CreateUser)
	users.Put("/:id", handlers.UpdateUser)
	users.Delete("/:id", handlers.DeleteUser)
	users.Get("/:id/avatar", handlers.GetUserAvatarAdmin)
	users.Put("/:id/avatar", handlers.UpdateUserAvatarAdmin)
	users.Delete("/:id/avatar", handlers.DeleteUserAvatarAdmin)

	// App routes (IAMX.APP) (public)
	apps := api.Group("/apps")
	apps.Get("/", handlers.GetApps)
	apps.Get("/:id", handlers.GetApp)
	apps.Post("/", handlers.CreateApp)
	apps.Put("/:id", handlers.UpdateApp)
	apps.Delete("/:id", handlers.DeleteApp)

	// Access Type routes (IAMX.MS_ACCESS_TYPE) (public)
	accessTypes := api.Group("/access-types")
	accessTypes.Get("/", handlers.GetAccessTypes)
	accessTypes.Get("/:id", handlers.GetAccessType)
	accessTypes.Post("/", handlers.CreateAccessType)
	accessTypes.Put("/:id", handlers.UpdateAccessType)
	accessTypes.Delete("/:id", handlers.DeleteAccessType)

	// ปิดไว้: route V1 เรียกตารางที่ไม่มีแล้ว (ORA-00942) ได้ 500 ทุกครั้ง; หน้าที่เรียกไม่มีเมนูลิงก์ไป
	// // Permission routes (IAMX.PERMISSION) (public)
	// permissions := api.Group("/permissions")
	// permissions.Get("/", handlers.GetPermissions)
	// permissions.Get("/:id", handlers.GetPermission)
	// permissions.Post("/", handlers.CreatePermission)
	// permissions.Put("/:id", handlers.UpdatePermission)
	// permissions.Delete("/:id", handlers.DeletePermission)

	// /object-type (V1 PG group) removed — V2 handlers live at /directory/object-types.

	// ปิดไว้: route V1 เรียกตารางที่ไม่มีแล้ว (ORA-00942) ได้ 500 ทุกครั้ง; หน้าที่เรียกไม่มีเมนูลิงก์ไป
	// // manage-menus routes (IAMX.manage-menus) (public)
	// manageMenu := api.Group("/manage-menus")
	// manageMenu.Get("/", handlers.GetManageMenus)
	// manageMenu.Get("/simple", handlers.GetManageMenusSimple)
	// manageMenu.Get("/menu-only", handlers.GetManageMenusMenuOnly)
	// manageMenu.Post("/", handlers.CreateManageMenu)
	// manageMenu.Post("/:id/move", handlers.MoveManageMenu)
	// manageMenu.Get("/:id", handlers.GetManageMenu)
	// manageMenu.Put("/:id", handlers.UpdateManageMenu)
	// manageMenu.Delete("/:id", handlers.DeleteManageMenu)

	ref := api.Group("/ref-processes")
	ref.Get("/", handlers.GetRefProcesses)
	ref.Post("/clone", handlers.CloneRefProcesses)
	ref.Put("/:processId/subprocess-order", handlers.UpdateSubprocessOrder)

	// Flow Step Routes (APP.M_FLOW_STEP)

	// Common Data routes — dropdown options.
	//
	// Phase 3: consolidate dropdown helpers under /admin/options/*. The legacy
	// root-level paths (/access-type-options, /system-options, …) keep working
	// for backward compatibility; the new canonical paths drop the redundant
	// "-options" suffix since they already live under /admin/options/*:
	//
	//   /iamx/api/access-type-options       ↔  /iamx/api/admin/options/access-types
	//   /iamx/api/system-type-options       ↔  /iamx/api/admin/options/system-types
	//   /iamx/api/object-type-options       ↔  /iamx/api/admin/options/object-types
	//   /iamx/api/system-options            ↔  /iamx/api/admin/options/systems
	//   /iamx/api/permission-options        ↔  /iamx/api/admin/options/permissions
	//   /iamx/api/main-process-options      ↔  /iamx/api/admin/options/main-processes
	//   /iamx/api/sub-process-options       ↔  /iamx/api/admin/options/ref-subprocesses
	//                                          (V1 reads N_REF_SUBPROCESS — external schema.
	//                                           Matches the /admin/ref-processes naming chosen
	//                                           in Phase 2. The ERP tree's IAMX-owned dropdown
	//                                           keeps its slot at /admin/options/sub-processes.)
	//   /iamx/api/parent-object-options     ↔  /iamx/api/admin/options/parent-objects
	//   /iamx/api/menu-parent-object-options ↔  /iamx/api/admin/options/menu-parent-objects
	//
	// /admin/options/* also already hosts hierarchy/list endpoints registered via the
	// directory multiGroup (domains, applications, modules, objects, object-tree,
	// object-hierarchy, app-hierarchy, processes, sub-processes).
	api.Get("/access-type-options", handlers.GetAccessTypeOptions)
	api.Get("/admin/options/access-types", handlers.GetAccessTypeOptions)

	api.Get("/system-type-options", handlers.GetSystemTypeOptions)
	api.Get("/admin/options/system-types", handlers.GetSystemTypeOptions)

	api.Get("/object-type-options", handlers.GetObjectTypeOptions)
	api.Get("/admin/options/object-types", handlers.GetObjectTypeOptions)

	// ปิดไว้: route V1 เรียกตารางที่ไม่มีแล้ว (ORA-00942) ได้ 500 ทุกครั้ง; หน้าที่เรียกไม่มีเมนูลิงก์ไป
	// api.Get("/system-options", handlers.GetsystemOptions)
	// api.Get("/admin/options/systems", handlers.GetsystemOptions)

	// api.Get("/permission-options", handlers.GetpermissionOptions)
	// api.Get("/admin/options/permissions", handlers.GetpermissionOptions)

	api.Get("/main-process-options", handlers.GetMainProcessOptions)
	api.Get("/admin/options/main-processes", handlers.GetMainProcessOptions)

	api.Get("/sub-process-options", handlers.GetSubProcessOptions)
	api.Get("/admin/options/ref-subprocesses", handlers.GetSubProcessOptions)

	api.Get("/parent-object-options", handlers.GetParentObjectOptions)
	api.Get("/admin/options/parent-objects", handlers.GetParentObjectOptions)

	api.Get("/menu-parent-object-options", handlers.GetMenuParentObjectOptions)
	api.Get("/admin/options/menu-parent-objects", handlers.GetMenuParentObjectOptions)

	api.Get("/common-data-debug", handlers.GetAllCommonData)

	// ERP admin routes (public)
	// Mounted under BOTH /directory (legacy) and /admin (new) during the rename
	// transition. multiGroup forwards every Get/Post/Put/Delete call to both
	// child groups, so the 102 route registrations below register twice — once
	// per prefix — without duplicating the call sites. Once FE has fully
	// migrated to /admin, drop /directory from the prefix list (or replace the
	// helper with a plain api.Group("/admin")).
	directory := newMultiGroup(api, "/directory", "/admin")

	// 14/11/69: หน้า Activity (อ่านอย่างเดียว)
	directory.Get("/activity/changes", handlers.GetActivityChanges)
	directory.Get("/activity/signins", handlers.GetActivitySignins)
	directory.Get("/activity/menu-usage", handlers.GetActivityMenuUsage)
	directory.Get("/menu-access/:id", handlers.GetMenuAccess) // 14/11/69 ใครเข้าเมนูนี้ได้
	// 15/11/69: กลุ่มบทบาท/ความรับผิดชอบ ตั้งค่าได้ (เลิก hardcode)
	directory.Get("/item-groups", handlers.ListItemGroups)
	directory.Post("/item-groups", handlers.CreateItemGroup)
	directory.Post("/item-groups/reorder", handlers.ReorderItemGroups)
	directory.Post("/item-groups/:id", handlers.UpdateItemGroup)
	directory.Delete("/item-groups/:id", handlers.DeleteItemGroup)
	directory.Get("/user-types", handlers.ListUserTypes)
	directory.Post("/user-types", handlers.CreateUserType)
	directory.Post("/user-types/reorder", handlers.ReorderUserTypes)
	directory.Post("/user-types/:code", handlers.UpdateUserType)
	directory.Delete("/user-types/:code", handlers.DeleteUserType)
	directory.Post("/roles/:id/group", handlers.SetRoleGroup)
	directory.Post("/resp-ux/:id/group", handlers.SetRespGroup)
	directory.Get("/domains", handlers.GetDomains)
	directory.Post("/domains", handlers.CreateDomain)
	directory.Put("/domains/:id", handlers.UpdateDomain)
	directory.Delete("/domains/:id", handlers.DeleteDomain)
	directory.Get("/domains/:id/applications", handlers.GetApplicationsByDomain)
	directory.Get("/applications", handlers.GetAllApplications)     // flat list (replaces V1 /apps)
	directory.Get("/applications/:id", handlers.GetApplicationByID) // single (replaces V1 /apps/:id)
	directory.Post("/applications", handlers.CreateApplication)
	directory.Put("/applications/:id", handlers.UpdateApplication)
	directory.Delete("/applications/:id", handlers.DeleteApplication) // soft delete (replaces V1 DELETE /apps/:id)
	directory.Get("/applications/:id/modules", handlers.GetModulesByApplication)
	directory.Post("/modules", handlers.CreateModule)
	directory.Put("/modules/:id", handlers.UpdateModule)
	directory.Delete("/modules/:id", handlers.DeleteModule)
	directory.Get("/modules/:id/objects/next-code", handlers.GetNextObjectCode)
	directory.Get("/modules/:id/objects", handlers.GetObjectsByModule)
	directory.Post("/modules/:id/objects", handlers.CreateObjectByModule)
	directory.Get("/objects", handlers.GetAllObjects) // flat ?type=MENU&module_id= (replaces V1 /manage-menus/simple, /menu-only)
	directory.Put("/objects/:id", handlers.UpdateObject)
	directory.Delete("/objects/:id", handlers.DeleteObject)
	directory.Post("/objects/:id/move", handlers.MoveObject) // tree move (replaces V1 /manage-menus/:id/move)
	// Batch reorder endpoints — legacy verb-y names kept as aliases.
	// New canonical: POST /admin/{applications,modules,objects}/reorder
	// Both serve the same handler.
	directory.Post("/batch-update-object-order", handlers.BatchUpdateObjectOrder)
	directory.Post("/batch-update-application-order", handlers.BatchUpdateApplicationOrder)
	directory.Post("/batch-update-module-order", handlers.BatchUpdateModuleOrder)
	directory.Post("/applications/reorder", handlers.BatchUpdateApplicationOrder)
	directory.Post("/modules/reorder", handlers.BatchUpdateModuleOrder)
	directory.Post("/objects/reorder", handlers.BatchUpdateObjectOrder)
	directory.Get("/object-types", handlers.GetObjectTypes)
	directory.Post("/object-types", handlers.CreateObjectType)
	directory.Put("/object-types/:id", handlers.UpdateObjectType)
	directory.Delete("/object-types/:id", handlers.DeleteObjectType)
	directory.Get("/process", handlers.GetProcesses)
	directory.Get("/process/:id", handlers.GetProcessByID)
	directory.Post("/process", handlers.CreateProcess)
	directory.Put("/process/:id", handlers.UpdateProcess)
	directory.Delete("/process/:id", handlers.DeleteProcess)
	directory.Get("/process/:id/sub", handlers.GetSubProcessesByProcess)
	directory.Post("/process/:id/sub", handlers.CreateSubProcess)
	directory.Get("/sub-process/:id", handlers.GetSubProcessByID)
	directory.Put("/sub-process/:id", handlers.UpdateSubProcess)
	directory.Delete("/sub-process/:id", handlers.DeleteSubProcess)

	// Roles Management Routes (public)
	directory.Get("/roles", handlers.GetRoles)
	directory.Get("/roles/active", handlers.GetActiveRoles)
	directory.Get("/roles/:id", handlers.GetRoleByID)
	directory.Post("/roles", handlers.CreateRole)
	directory.Put("/roles/:id", handlers.UpdateRole)
	directory.Delete("/roles/:id", handlers.DeleteRole)
	directory.Post("/roles/:id/set-default", handlers.SetDefaultRole)
	directory.Get("/roles/:id/users", handlers.GetRoleUsers)

	// Role Object Mapping Routes (public)
	directory.Get("/roles/:roleId/object-mappings", handlers.GetRoleObjectMappings)
	directory.Post("/role-object-mappings", handlers.CreateRoleObjectMapping)
	directory.Put("/role-object-mappings/:id", handlers.UpdateRoleObjectMapping)
	directory.Delete("/role-object-mappings/:id", handlers.DeleteRoleObjectMapping)

	// Role Object Permission Routes (action-array, JSON-based) (public)
	directory.Get("/roles/:roleId/permissions", handlers.GetPermissionsByRoleID)
	directory.Post("/role-object-permissions", handlers.CreateRoleObjectPermission)
	directory.Put("/role-object-permissions/:id", handlers.UpdateRoleObjectPermission)
	directory.Post("/role-object-mappings/:mappingId/toggle-permission", handlers.ToggleRolePermission)
	directory.Post("/roles/:roleId/objects/:objectId/set-permissions", handlers.SetRoleObjectPermissions)

	// Report Studio proxy + report mapping (role / user) (public)
	directory.Get("/reports", handlers.GetReports)
	directory.Get("/report-mappings/summary", handlers.GetReportMappingSummary)
	directory.Get("/reports/:reportCode/role-mappings", handlers.GetReportRoleMappings)
	directory.Get("/reports/:reportCode/user-mappings", handlers.GetReportUserMappings)
	directory.Get("/roles/:roleId/report-mappings", handlers.GetRoleReportMappings)
	directory.Post("/roles/:roleId/reports/:reportCode/set-permissions", handlers.SetRoleReportPermissions)
	directory.Get("/user-report-mappings", handlers.GetUserReportMappings)
	directory.Post("/users/:userId/reports/:reportCode/set-permissions", handlers.SetUserReportPermissions)

	// Permission Type Routes (for dynamic permission matrix) (public)
	directory.Get("/permission-types", handlers.GetPermissionTypes)
	directory.Post("/permission-types", handlers.CreatePermissionType)
	directory.Put("/permission-types/:id", handlers.UpdatePermissionType)
	directory.Delete("/permission-types/:id", handlers.DeletePermissionType)

	// ERP Options Routes (for dropdowns) (public)
	directory.Get("/options/domains", handlers.GetDomainOptions)
	directory.Get("/options/applications", handlers.GetApplicationOptions)
	directory.Get("/options/modules", handlers.GetModuleOptions)
	directory.Get("/options/objects", handlers.GetObjectOptions)
	directory.Get("/options/object-tree", handlers.GetObjectTree)
	directory.Get("/options/object-hierarchy", handlers.GetObjectHierarchy)
	directory.Get("/options/app-hierarchy", handlers.GetAppHierarchy)
	directory.Get("/structure/:type/:id/children-count", handlers.GetStructureChildrenCount)
	directory.Put("/structure/:type/:id/active", func(c *fiber.Ctx) error {
		err := handlers.SetStructureActive(c)
		if err == nil && c.Response().StatusCode() == fiber.StatusOK {
			if cs := GetCacheService(); cs != nil {
				cs.ClearAll()
			}
		}
		return err
	})
	directory.Get("/options/processes", handlers.GetProcessOptionsExt)
	directory.Get("/options/sub-processes", handlers.GetSubProcessOptionsExt)

	// Responsibility Management Routes (public)
	directory.Get("/responsibilities", handlers.GetResponsibilities)
	directory.Get("/responsibilities/:id", handlers.GetResponsibilityByID)
	directory.Post("/responsibilities", handlers.CreateResponsibility)
	directory.Put("/responsibilities/:id", handlers.UpdateResponsibility)
	directory.Delete("/responsibilities/:id", handlers.DeleteResponsibility)

	// Responsibility Role Mapping Routes (public)
	directory.Get("/responsibilities/:id/role-mappings", handlers.GetResponsibilityRoleMappings)
	directory.Get("/responsibility-role-mappings", handlers.GetAllResponsibilityRoleMappings)
	directory.Post("/responsibility-role-mappings", handlers.CreateResponsibilityRoleMapping)
	directory.Delete("/responsibility-role-mappings/:id", handlers.DeleteResponsibilityRoleMapping)

	// Permission Type Routes (public)
	directory.Get("/permission-types", handlers.GetPermissionTypes)
	directory.Get("/permission-types/groups", handlers.GetPermissionTypeGroups)

	// External-schema routes (read mostly from Oracle MV_*, M_AGC, N_REF_PROCESS).
	//
	// Phase 2: each handler is now reachable under BOTH /iamx/api/oracle/* (legacy)
	// AND /iamx/api/admin/* (new canonical). The URL no longer leaks the underlying
	// data source; schema separation lives in code (repository/external/* — to be
	// reorganized in a follow-up).
	//
	// Naming notes:
	//   • Oracle MV_PROCESS_MAPPING is exposed as /admin/oracle-processes (not just
	//     /admin/processes) to disambiguate from the IAMX-owned process tree
	//     mounted at /admin/processes (see further down).
	//   • /ref-processes/:processId/sub is renamed to /:processId/subprocesses
	//     under /admin/* (full noun, plural). Legacy /sub spelling kept under
	//     /oracle/* for transition.
	agencies := newMultiGroup(api, "/oracle/agencies", "/admin/agencies")
	agencies.Get("/ministries", handlers.GetMinistries)
	agencies.Get("/children", handlers.GetAgencyChildren)
	agencies.Get("/types", handlers.GetAgencyTypesByParent)
	agencies.Get("/all", handlers.GetAllAgencies)
	agencies.Get("/filtered", handlers.GetFilteredAgencies)
	agencies.Get("/departments", handlers.GetDepartments)

	// Geo reference lookups (REF_REGION, REF_PROVINCE_DISTRICT, REF_PROVINCE, REF_DISTRICT, REF_SUBDISTRICT)
	geoRef := newMultiGroup(api, "/oracle/ref", "/admin/ref")
	geoRef.Get("/regions", handlers.GetRefRegions)
	geoRef.Get("/province-districts", handlers.GetRefProvinceDistricts)
	geoRef.Get("/provinces", handlers.GetRefProvinces)
	geoRef.Get("/districts", handlers.GetRefDistricts)
	geoRef.Get("/subdistricts", handlers.GetRefSubdistricts)

	oracleProcesses := newMultiGroup(api, "/oracle/processes", "/admin/oracle-processes")
	oracleProcesses.Get("/", handlers.GetOracleProcesses)
	oracleProcesses.Get("/fiscal-year", handlers.GetCurrentThaiFiscalYear)

	refProc := newMultiGroup(api, "/oracle/ref-processes", "/admin/ref-processes")
	refProc.Get("/", handlers.GetRefProcessesOracle)
	refProc.Post("/", handlers.CreateRefProcessOracle)
	refProc.Put("/:id", handlers.UpdateRefProcessOracle)
	refProc.Post("/clone", handlers.CloneRefProcessesOracle)
	refProc.Delete("/:id", handlers.DeleteRefProcessOracle)

	// Ref-subprocess create — rename /sub → /subprocesses under /admin only.
	// Legacy /oracle/ref-processes/:processId/sub still served via direct call.
	api.Post("/oracle/ref-processes/:processId/sub", handlers.CreateRefSubprocessOracle)
	api.Post("/admin/ref-processes/:processId/subprocesses", handlers.CreateRefSubprocessOracle)

	refSub := newMultiGroup(api, "/oracle/ref-subprocesses", "/admin/ref-subprocesses")
	refSub.Put("/:id", handlers.UpdateRefSubprocessOracle)
	refSub.Delete("/:id", handlers.DeleteRefSubprocessOracle)

	// IAMX-owned process tree — rename to plural under /admin only.
	// Existing /directory/process and /admin/process (registered above via directory multiGroup)
	// keep serving the same handlers for legacy callers; the new canonical /admin/processes
	// and /admin/subprocesses are additive.
	admin := api.Group("/admin")
	admin.Get("/processes", handlers.GetProcesses)
	admin.Get("/processes/:id", handlers.GetProcessByID)
	admin.Post("/processes", handlers.CreateProcess)
	admin.Put("/processes/:id", handlers.UpdateProcess)
	admin.Delete("/processes/:id", handlers.DeleteProcess)
	admin.Get("/processes/:id/subprocesses", handlers.GetSubProcessesByProcess)
	admin.Post("/processes/:id/subprocesses", handlers.CreateSubProcess)
	admin.Get("/subprocesses/:id", handlers.GetSubProcessByID)
	admin.Put("/subprocesses/:id", handlers.UpdateSubProcess)
	admin.Delete("/subprocesses/:id", handlers.DeleteSubProcess)

	// Process Mapper Routes (mapping Oracle processes to Module/Object) (public)
	directory.Get("/process-mappers", handlers.GetProcessMappers)
	directory.Post("/process-mappers", handlers.CreateProcessMapper)
	directory.Post("/process-mappers/batch", handlers.CreateProcessMapperBatch)
	directory.Delete("/process-mappers/:id", handlers.DeleteProcessMapper)
	directory.Delete("/process-mappers", handlers.DeleteProcessMapperByCodes)

	// User Mapping Routes (public)
	// หน้าตั้งค่า IAM-X เท่านั้น (18/10/69) — สรุป role ทุกคน + สิทธิ์ที่มีผลจริงรายคน
	directory.Get("/user-role-summary", handlers.GetUserRoleSummary)
	directory.Get("/dashboard-summary", handlers.GetDashboardSummary) // 13/11/69 หน้าแรก IAM-X
	directory.Get("/effective-permissions", handlers.GetUserEffectivePermissions)
	directory.Get("/two-factor", handlers.GetTwoFactor)
	// หน้าความรับผิดชอบ (19/10/69) — ชุด role เดิม ใส่คน = สร้าง USER_ROLE_MAPPING
	// ผู้ดูแล IAM-X Console (IAMX.ADMIN) — 20/10/69
	api.Get("/console-admins", handlers.ListConsoleAdmins)
	api.Post("/console-admins", handlers.CreateConsoleAdmin)
	api.Post("/console-admins/me/password", handlers.ChangeMyConsolePassword)
	api.Post("/console-admins/:id/reset-password", handlers.ResetConsoleAdminPassword)
	api.Post("/console-admins/:id/status", handlers.SetConsoleAdminStatus)
	api.Post("/console-admins/:id/role", handlers.SetConsoleAdminRole)
	directory.Get("/resp-ux", handlers.GetRespList)
	directory.Get("/resp-ux/agency-options", handlers.GetRespAgencyOptions)
	directory.Get("/resp-ux/by-user/:userId", handlers.GetRespByUser)
	directory.Get("/resp-ux/:id", handlers.GetRespDetail)
	directory.Delete("/resp-ux/:id", handlers.DeleteResp)
	directory.Get("/resp-ux/:id/history", handlers.GetRespHistory)
	directory.Put("/resp-ux/:id/register", handlers.SetRespRegister)
	directory.Get("/resp-ux/:id/agencies", handlers.GetRespAgencies)
	directory.Put("/resp-ux/:id/agencies", handlers.SetRespAgencies)
	directory.Post("/resp-ux/:id/roles", handlers.AddRespRole)
	directory.Delete("/resp-ux/:id/roles/:roleId", handlers.RemoveRespRole)
	directory.Post("/resp-ux/:id/users", handlers.AddRespUser)
	directory.Delete("/resp-ux/:id/users/:userId", handlers.RemoveRespUser)
	directory.Post("/two-factor", handlers.SetTwoFactor)
	directory.Get("/user-role-mappings", handlers.GetUserRoleMappings)
	directory.Post("/user-role-mappings", handlers.CreateUserRoleMapping)
	directory.Delete("/user-role-mappings/:id", handlers.DeleteUserRoleMapping)

	directory.Get("/user-responsibility-mappings", handlers.GetUserResponsibilityMappings)
	directory.Post("/user-responsibility-mappings", handlers.CreateUserResponsibilityMapping)
	directory.Delete("/user-responsibility-mappings/:id", handlers.DeleteUserResponsibilityMapping)

	directory.Get("/user-custom-object-mappings", handlers.GetUserCustomObjectMappings)
	directory.Post("/user-custom-object-mappings/toggle", handlers.ToggleUserCustomObjectPermission)
	directory.Post("/users/:userId/objects/:objectId/set-permissions", handlers.SetUserCustomObjectPermissions)

	directory.Get("/user-custom-data-accesses", handlers.GetUserCustomDataAccesses)
	directory.Post("/user-custom-data-accesses", handlers.CreateUserCustomDataAccess)
	directory.Post("/user-custom-data-accesses/batch", handlers.BatchReplaceUserCustomDataAccess)
	directory.Post("/user-custom-data-accesses/upsert-output", handlers.UpsertUserOutputAccess)
	directory.Post("/user-custom-data-accesses/:id/toggle-permission", handlers.ToggleUserCustomDataAccessPermission)
	directory.Delete("/user-custom-data-accesses/:id", handlers.DeleteUserCustomDataAccess)

	// === PUBLIC PER-USER ENDPOINTS (Keycloak Bearer) ===
	// /iamx/api/public/me/* — userInfo, menu, domains, roles, permissions,
	// profile update, menu-logs. See setupPublicMeRoutes() below.
	setupPublicMeRoutes(api)

	log.Println("✅ All routes configured successfully")
}

// setupAuthMiddleware applies authentication middleware based on configuration.
//
// DEAD CODE — never called. It reads as though the API is authenticated, which it
// was not: every route was reachable without a token. The live gate is
// middleware.RequireAuthUnlessPublic, wired at the top of SetupRoutes. Kept only
// because it also documents the Keycloak/JWT switch; delete once that is settled.
func setupAuthMiddleware(api fiber.Router) {
	keycloakEnabled := os.Getenv("KEYCLOAK_ENABLED") == "true"

	log.Printf("🔐 Auth Configuration - Keycloak Enabled: %v", keycloakEnabled)

	if keycloakEnabled {
		log.Println("🔐 Using Keycloak authentication middleware")
		api.Use(middleware.KeycloakAuth())
	} else {
		log.Println("🔐 Using JWT authentication middleware")
		api.Use(middleware.JWTAuth())
	}
}

// Global cache service instance
var globalCacheService *services.CacheService

// GetCacheService returns the global cache service instance
func GetCacheService() *services.CacheService {
	return globalCacheService
}

// setupRBACRoutes configures the RBAC Menu API routes with caching
func setupRBACRoutes(api fiber.Router) {
	if core.GetDB() == nil {
		log.Println("⚠️  Oracle not available, RBAC API routes will not be initialized")
		return
	}

	// Initialize cache service
	globalCacheService = services.NewCacheService()
	handlers.SetCacheService(globalCacheService)
	log.Println("✅ Cache service initialized")

	// Initialize handlers
	cacheHandler := handlers.NewCacheHandler(globalCacheService)

	// Cache management routes (public)
	// Mounted under BOTH /iamx/api/cache/* (legacy) and /iamx/api/system/cache/*
	// (new canonical). Legacy retires in a separate sunset PR.
	cache := newMultiGroup(api, "/cache", "/system/cache")
	cache.Get("/stats", cacheHandler.GetStats)
	cache.Post("/clear", cacheHandler.ClearAll)
	cache.Post("/invalidate/menu/:refUserId", cacheHandler.InvalidateUserMenu)
	cache.Post("/invalidate/menu", cacheHandler.InvalidateUserMenuByUsername)

	log.Println("✅ RBAC API routes initialized at /iamx/api (with caching)")
}

// setupPublicMeRoutes wires the per-user RBAC endpoints under
// /iamx/api/public/me/*. Authentication uses the Keycloak access_token
// from the Authorization header (resolveRefUserID() inside each handler).
//
// Round 3: legacy POST /iamx/api/login, /token, PUT /user/profile, POST
// /menu-logs are gone. Portal callers must use /public/me/* now.
func setupPublicMeRoutes(api fiber.Router) {
	if core.GetDB() == nil {
		log.Println("⚠️  Oracle not available, /public/me/* routes will not be initialized")
		return
	}

	menuService := services.NewMenuService(core.GetDB(), globalCacheService)
	menuHandler := handlers.NewMenuHandler(menuService)

	// User portal endpoints — Keycloak bearer required, returns data of the
	// caller themselves (resolveRefUserID() resolves from access_token).
	// Mounted at BOTH /iamx/api/public/me/* (legacy) and /iamx/api/me/*
	// (new canonical) — alias retires in a separate sunset PR after FE migration.
	me := newMultiGroup(api, "/public/me", "/me")
	me.Get("/", menuHandler.GetMyProfile)                         // userInfo only
	me.Get("/bootstrap", menuHandler.GetMyBootstrap)              // userInfo + menu + domains + roles (one round-trip; ?include=permissions adds data-access claims with graceful degrade)
	me.Get("/menu", menuHandler.GetMyMenu)                        // applications only
	me.Get("/domains", menuHandler.GetMyDomains)                  // domains only
	me.Get("/roles", menuHandler.GetMyRoles)                      // roles only
	me.Get("/permissions", menuHandler.GetMyPermissions)          // v_user_effective_data_access
	me.Get("/reports", menuHandler.GetMyReports)                  // reports granted via role or direct
	me.Get("/page-permissions", menuHandler.GetMyPagePermissions) // BUTTON/TAB/etc. effective permissions
	me.Put("/", menuHandler.UpdateMyProfile)                      // update profile
	me.Get("/avatar", menuHandler.GetMyAvatar)                    // รูปโปรไฟล์ (404 ถ้ายังไม่เคยอัปโหลด)
	me.Put("/avatar", menuHandler.UpdateMyAvatar)                 // อัปโหลด/ทับรูปโปรไฟล์
	me.Delete("/avatar", menuHandler.DeleteMyAvatar)              // ลบรูปโปรไฟล์
	me.Post("/menu-logs", menuHandler.CreateMyMenuAccessLog)      // audit menu access
	log.Println("✅ Public per-user RBAC endpoints initialized at /iamx/api/{me,public/me}/*")
}

// multiGroup registers each route on multiple parent groups so a single
// call site can serve more than one URL prefix. We use it for the ERP
// admin tree's /directory → /admin rename: every directory.Get/Post/Put/Delete in
// SetupRoutes fans out to both child groups, so the same handler is reachable
// at /iamx/api/directory/... and /iamx/api/admin/... simultaneously.
//
// Only the four HTTP verbs the ERP tree uses are wired up. Add more if a
// future caller needs Patch/Options/Head etc.
type multiGroup struct {
	routers []fiber.Router
}

// newMultiGroup creates one child group on parent for each given prefix.
// Order of prefixes doesn't matter for routing — Fiber resolves each
// independently — but it does control the order of route registration,
// which only matters when prefixes overlap (they don't here).
func newMultiGroup(parent fiber.Router, prefixes ...string) *multiGroup {
	routers := make([]fiber.Router, 0, len(prefixes))
	for _, p := range prefixes {
		routers = append(routers, parent.Group(p))
	}
	return &multiGroup{routers: routers}
}

func (m *multiGroup) Get(path string, handlers ...fiber.Handler) {
	for _, r := range m.routers {
		r.Get(path, handlers...)
	}
}

func (m *multiGroup) Post(path string, handlers ...fiber.Handler) {
	for _, r := range m.routers {
		r.Post(path, handlers...)
	}
}

func (m *multiGroup) Put(path string, handlers ...fiber.Handler) {
	for _, r := range m.routers {
		r.Put(path, handlers...)
	}
}

func (m *multiGroup) Delete(path string, handlers ...fiber.Handler) {
	for _, r := range m.routers {
		r.Delete(path, handlers...)
	}
}

// LoadConfig loads application configuration
func LoadConfig() *config.KeycloakConfig {
	return config.LoadKeycloakConfig()
}
