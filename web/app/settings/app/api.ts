import {
  Domain,
  ApplicationExt,
  ModuleExt,
  ObjectItemExt,
  ObjectType,
  ProcessExt,
  SubProcessExt,
} from "./types";

// Re-export types for backward compatibility
export type { Domain, ApplicationExt, ModuleExt, ObjectItemExt, ObjectType, ProcessExt, SubProcessExt };

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080'}/iamx/api`;
// const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

// Domain APIs
export async function fetchDomains(): Promise<Domain[]> {
  const response = await fetch(`${API_BASE}/admin/domains`);
  if (!response.ok) throw new Error("Failed to fetch domains");
  const result = await response.json();
  return result.data || [];
}

export async function createDomain(data: {
  code: string;
  name: string;
  description?: string;
  is_active?: number;
}): Promise<Domain> {
  const response = await fetch(`${API_BASE}/admin/domains`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to create domain');
  }
  return response.json();
}

// Application APIs
export async function fetchApplications(domainId: number): Promise<ApplicationExt[]> {
  const response = await fetch(`${API_BASE}/admin/domains/${domainId}/applications`);
  if (!response.ok) throw new Error("Failed to fetch applications");
  const result = await response.json();
  return result.data || [];
}

export async function createApplication(data: {
  domain_id: number;
  code: string;
  name: string;
  description?: string;
  is_active?: number;
  icon?: string | null;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create application');
}

export async function updateApplication(
  applicationId: number,
  data: {
    code?: string;
    name?: string;
    description?: string;
    is_active?: number;
    icon?: string | null;
  }
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/applications/${applicationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    if (errorData?.message?.includes('duplicate key') || errorData?.message?.includes('unique constraint')) {
      throw new Error(`รหัสถูกใช้ไปแล้ว กรุณาใช้รหัสอื่น`);
    }
    throw new Error('Failed to update application');
  }
}

export async function deleteApplication(applicationId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/applications/${applicationId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete application');
}

// Module APIs
export async function fetchModules(applicationId: number): Promise<ModuleExt[]> {
  const response = await fetch(`${API_BASE}/admin/applications/${applicationId}/modules`);
  if (!response.ok) throw new Error("Failed to fetch modules");
  const result = await response.json();
  return result.data || [];
}

export async function createModule(data: {
  application_id: number;
  code: string;
  name: string;
  description?: string;
  icon?: string | null;
  sort_order?: number;
  is_active?: number;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/modules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create module');
}

export async function updateModule(
  moduleId: number,
  data: {
    code?: string;
    name?: string;
    description?: string;
    icon?: string | null;
    sort_order?: number;
    is_active?: number;
  }
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/modules/${moduleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    if (errorData?.message?.includes('duplicate key') || errorData?.message?.includes('unique constraint')) {
      throw new Error(`รหัสถูกใช้ไปแล้ว กรุณาใช้รหัสอื่น`);
    }
    throw new Error('Failed to update module');
  }
}

export async function deleteModule(moduleId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/modules/${moduleId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete module');
}

// Object APIs
export async function fetchObjects(moduleId?: number): Promise<ObjectItemExt[]> {
  if (moduleId) {
    const response = await fetch(`${API_BASE}/admin/modules/${moduleId}/objects`);
    if (!response.ok) throw new Error("Failed to fetch objects");
    const result = await response.json();
    return result.data || [];
  }
  
  // Fetch all objects from all modules
  const allObjects: ObjectItemExt[] = [];
  try {
    // Get all domains
    const domainsResponse = await fetch(`${API_BASE}/admin/domains`);
    if (!domainsResponse.ok) throw new Error("Failed to fetch domains");
    const domainsResult = await domainsResponse.json();
    const domains = domainsResult.data || [];
    
    for (const domain of domains) {
      // Get applications for this domain
      const appsResponse = await fetch(`${API_BASE}/admin/domains/${domain.id}/applications`);
      if (!appsResponse.ok) continue;
      const appsResult = await appsResponse.json();
      const applications = appsResult.data || [];
      
      for (const app of applications) {
        // Get modules for this application
        const modulesResponse = await fetch(`${API_BASE}/admin/applications/${app.id}/modules`);
        if (!modulesResponse.ok) continue;
        const modulesResult = await modulesResponse.json();
        const modules = modulesResult.data || [];
        
        for (const mod of modules) {
          // Get objects for this module
          const objectsResponse = await fetch(`${API_BASE}/admin/modules/${mod.id}/objects`);
          if (!objectsResponse.ok) continue;
          const objectsResult = await objectsResponse.json();
          const objects = objectsResult.data || [];
          
          // Add module and application info to each object
          const objectsWithInfo = objects.map((obj: any) => ({
            ...obj,
            moduleName: mod.name,
            moduleCode: mod.code,
            applicationName: app.name,
            applicationCode: app.code,
          }));
          
          allObjects.push(...objectsWithInfo);
        }
      }
    }
  } catch (error) {
    console.error("Failed to fetch all objects:", error);
  }
  
  return allObjects;
}

export async function createObject(
  moduleId: number,
  data: {
    code: string;
    name: string;
    path?: string;
    object_type_id: number;
    parent_id?: number | null;
    icon?: string | null;
    is_shortcut?: number;
  }
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/modules/${moduleId}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    if (errorData?.message?.includes("duplicate key") || errorData?.message?.includes("unique constraint")) {
      throw new Error(`รหัส "${data.code}" ถูกใช้ไปแล้ว กรุณาใช้รหัสอื่น`);
    }
    throw new Error(errorData?.message || "Failed to create object");
  }
}

export async function updateObject(
  objectId: number,
  data: {
    code: string;
    name: string;
    path?: string;
    object_type_id: number;
    parent_id?: number | null;
    icon?: string | null;
    is_shortcut?: number;
  }
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/objects/${objectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    if (errorData?.message?.includes("duplicate key") || errorData?.message?.includes("unique constraint")) {
      throw new Error(`รหัส "${data.code}" ถูกใช้ไปแล้ว กรุณาใช้รหัสอื่น`);
    }
    throw new Error(errorData?.message || "Failed to update object");
  }
}

export async function deleteObject(objectId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/objects/${objectId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete object");
}

export async function fetchNextObjectCode(moduleId: number, parentId?: number | null): Promise<string> {
  const params = parentId ? `?parent_id=${parentId}` : '';
  const response = await fetch(`${API_BASE}/admin/modules/${moduleId}/objects/next-code${params}`);
  if (!response.ok) throw new Error("Failed to fetch next object code");
  const result = await response.json();
  return result.code as string;
}

// Object Type APIs
export async function fetchObjectTypes(): Promise<ObjectType[]> {
  const response = await fetch(`${API_BASE}/admin/object-types`);
  if (!response.ok) throw new Error("Failed to fetch object types");
  const result = await response.json();
  return result.data || [];
}

export async function createObjectType(name: string): Promise<ObjectType> {
  const response = await fetch(`${API_BASE}/admin/object-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to create object type');
  }
  const result = await response.json();
  return result.data;
}

// ============================================================
// ORACLE N_REF_PROCESS APIs (Process/Sub-process Management)
// ============================================================

export interface RefProcess {
  process_id: string;
  fiscal_year: string;
  process_code: string;
  process_name: string;
  display_code: string;
  display_name: string;
  module_name: string;
  status: string;
  seq: number;
  created_date: string;
  created_by: string;
  updated_date?: string;
  updated_by: string;
  subprocesses?: RefSubprocess[];
}

export interface RefSubprocess {
  subprocess_id: string;
  process_id: string;
  subprocess_code: string;
  subprocess_name: string;
  display_code: string;
  display_name: string;
  status: string;
  effective_date?: string;
  expire_date?: string;
  created_date: string;
  created_by: string;
  updated_date?: string;
  updated_by: string;
  fiscal_year: string;
}

// Fetch processes and subprocesses from N_REF_PROCESS/N_REF_SUBPROCESS
export async function fetchRefProcesses(fiscalYear?: string): Promise<RefProcess[]> {
  const url = fiscalYear 
    ? `${API_BASE}/admin/ref-processes?fiscal_year=${fiscalYear}`
    : `${API_BASE}/admin/ref-processes`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch ref processes");
  const result = await response.json();
  return result.data || [];
}

// Create new process
export async function createRefProcess(data: {
  fiscal_year: string;
  process_code: string;
  process_name: string;
  display_code?: string;
  display_name?: string;
  module_name?: string;
  status?: string;
  seq?: number;
  created_by?: string;
}): Promise<{ process_id: string; message: string }> {
  const response = await fetch(`${API_BASE}/admin/ref-processes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to create process" }));
    throw new Error(error.error || "Failed to create process");
  }
  return response.json();
}

// Create new subprocess
export async function createRefSubprocess(processId: string, data: {
  subprocess_code: string;
  subprocess_name: string;
  display_code?: string;
  display_name?: string;
  status?: string;
  fiscal_year: string;
  created_by?: string;
}): Promise<{ subprocess_id: string; message: string }> {
  const response = await fetch(`${API_BASE}/admin/ref-processes/${processId}/subprocesses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to create subprocess" }));
    throw new Error(error.error || "Failed to create subprocess");
  }
  return response.json();
}

// Clone processes from source year to target year
export async function cloneRefProcesses(data: {
  source_fiscal_year: string;
  target_fiscal_year: string;
  created_by?: string;
}): Promise<{ message: string; source_year: string; target_year: string }> {
  const response = await fetch(`${API_BASE}/admin/ref-processes/clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to clone processes" }));
    throw new Error(error.error || "Failed to clone processes");
  }
  return response.json();
}

// Delete (soft delete) process
export async function deleteRefProcess(processId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/ref-processes/${processId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete process");
}

// Delete (soft delete) subprocess
export async function deleteRefSubprocess(subprocessId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/ref-subprocesses/${subprocessId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete subprocess");
}

// Update process
export async function updateRefProcess(processId: string, data: {
  process_code: string;
  process_name: string;
  display_code?: string;
  display_name?: string;
  module_name?: string;
  status?: string;
  seq?: number;
  updated_by?: string;
}): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/admin/ref-processes/${processId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to update process" }));
    throw new Error(error.error || "Failed to update process");
  }
  return response.json();
}

// Update subprocess
export async function updateRefSubprocess(subprocessId: string, data: {
  subprocess_code: string;
  subprocess_name: string;
  display_code?: string;
  display_name?: string;
  status?: string;
  updated_by?: string;
}): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/admin/ref-subprocesses/${subprocessId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to update subprocess" }));
    throw new Error(error.error || "Failed to update subprocess");
  }
  return response.json();
}

// ============================================================
// ORACLE MV_PROCESS_MAPPING APIs (for /app mapping)
// ============================================================

export interface OracleProcess {
  process_id: string;
  subprocess_id: string;
  display_text: string;
  process_code: string;
  subprocess_code: string;
  display_component: string;
}

// Get current Thai fiscal year (current year + 543)
export async function getCurrentThaiFiscalYear(): Promise<string> {
  const response = await fetch(`${API_BASE}/admin/oracle-processes/fiscal-year`);
  if (!response.ok) throw new Error("Failed to fetch fiscal year");
  const result = await response.json();
  return result.fiscal_year;
}

// Fetch processes from Oracle MV_PROCESS_MAPPING
export async function fetchOracleProcesses(fiscalYear?: string): Promise<OracleProcess[]> {
  const url = fiscalYear 
    ? `${API_BASE}/admin/oracle-processes?fiscal_year=${fiscalYear}`
    : `${API_BASE}/admin/oracle-processes`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch Oracle processes");
  const result = await response.json();
  return result.data || [];
}

// ============================================================
// PROCESS MAPPER APIs (mapping Oracle processes to Module/Object)
// ============================================================

export interface ProcessMapper {
  id: number;
  module_id?: number | null;
  object_id?: number | null;
  fiscal_year: number;
  process_id: string;
  subprocess_id: string;
  display_component: string;
  process_code: string;
  subprocess_code: string;
  display_text: string;
  /** per-stage iframe path; the menu API exposes this as processes[].path */
  url?: string | null;
  allowed_role_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface RoleOption {
  id: string;
  name: string;
}

// Fetch roles for the process-mapper role restriction picker
export async function fetchRoles(): Promise<RoleOption[]> {
  const response = await fetch(`${API_BASE}/admin/roles`);
  if (!response.ok) throw new Error("Failed to fetch roles");
  const result = await response.json();
  return result.data || [];
}

// Fetch process mappers for module or object
export async function fetchProcessMappers(params: {
  module_id?: number;
  object_id?: number;
  fiscal_year?: number;
}): Promise<ProcessMapper[]> {
  const searchParams = new URLSearchParams();
  if (params.module_id) searchParams.append("module_id", params.module_id.toString());
  if (params.object_id) searchParams.append("object_id", params.object_id.toString());
  if (params.fiscal_year) searchParams.append("fiscal_year", params.fiscal_year.toString());
  
  const response = await fetch(`${API_BASE}/admin/process-mappers?${searchParams.toString()}`);
  if (!response.ok) throw new Error("Failed to fetch process mappers");
  const result = await response.json();
  return result.data || [];
}

// Create single process mapper
export async function createProcessMapper(data: {
  module_id?: number | null;
  object_id?: number | null;
  fiscal_year: number;
  process_id: string;
  subprocess_id: string;
  display_component: string;
  process_code: string;
  subprocess_code: string;
  display_text: string;
  url?: string;
  allowed_role_ids?: string[];
}): Promise<{ id: number; message: string }> {
  const response = await fetch(`${API_BASE}/admin/process-mappers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to create process mapper" }));
    throw new Error(error.error || "Failed to create process mapper");
  }
  return response.json();
}

// Create multiple process mappers (batch)
export async function createProcessMapperBatch(data: {
  module_id?: number | null;
  object_id?: number | null;
  fiscal_year: number;
  items: Array<{
    process_id: string;
    subprocess_id: string;
    display_component: string;
    process_code: string;
    subprocess_code: string;
    display_text: string;
    url?: string;
    allowed_role_ids?: string[];
  }>;
}): Promise<{ count: number; updated?: number; message: string }> {
  const response = await fetch(`${API_BASE}/admin/process-mappers/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to create process mappers" }));
    throw new Error(error.error || "Failed to create process mappers");
  }
  return response.json();
}

// Delete process mapper by ID
export async function deleteProcessMapper(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/process-mappers/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete process mapper");
}

// Delete process mapper by codes
export async function deleteProcessMapperByCodes(params: {
  module_id?: number;
  object_id?: number;
  fiscal_year: number;
  process_code: string;
  subprocess_code: string;
}): Promise<void> {
  const searchParams = new URLSearchParams();
  if (params.module_id) searchParams.append("module_id", params.module_id.toString());
  if (params.object_id) searchParams.append("object_id", params.object_id.toString());
  searchParams.append("fiscal_year", params.fiscal_year.toString());
  searchParams.append("process_code", params.process_code);
  searchParams.append("subprocess_code", params.subprocess_code);
  
  const response = await fetch(`${API_BASE}/admin/process-mappers?${searchParams.toString()}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete process mapper");
}

// Batch update object order (sort_order, parent_id, object_level)
export async function batchUpdateObjectOrder(items: Array<{
  id: number;
  sort_order: number;
  parent_id: number | null;
  object_level: number;
}>): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/admin/objects/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to update object order" }));
    throw new Error(error.error || "Failed to update object order");
  }
  return response.json();
}

// Batch update application order (sort_order)
export async function batchUpdateApplicationOrder(items: Array<{
  id: number;
  sort_order: number;
}>): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/admin/applications/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to update application order" }));
    throw new Error(error.error || "Failed to update application order");
  }
  return response.json();
}

// Batch update module order (sort_order)
export async function batchUpdateModuleOrder(items: Array<{
  id: number;
  sort_order: number;
}>): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/admin/modules/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to update module order" }));
    throw new Error(error.error || "Failed to update module order");
  }
  return response.json();
}


// App Hierarchy types
export interface AppHierarchyObject {
  objectId: number;
  module_id: number;
  objectTypeId: number;
  parentObjectId: number | null;
  code: string;
  name: string;
  path: string | null;
  object_level: number;
  sort_order: number;
  objectTypeName: string;
  is_shortcut?: number;
  children: AppHierarchyObject[];
}

export interface AppHierarchyModule {
  id: number;
  application_id: number;
  code: string;
  name: string;
  description?: string;
  sort_order: number;
  icon?: string;
  objects: AppHierarchyObject[];
}

export interface AppHierarchyApplication {
  id: number;
  domain_id: number;
  code: string;
  name: string;
  description?: string;
  sort_order: number;
  icon?: string;
  modules: AppHierarchyModule[];
}

export interface AppHierarchyDomain {
  id: number;
  code: string;
  name: string;
  description?: string;
  applications: AppHierarchyApplication[];
}

export async function fetchAppHierarchy(): Promise<AppHierarchyDomain[]> {
  const response = await fetch(`${API_BASE}/admin/options/app-hierarchy?include_inactive=1`);
  if (!response.ok) throw new Error("Failed to fetch app hierarchy");
  const result = await response.json();
  return result.data || [];
}

// Invalidate user menu cache
export async function invalidateUserMenuCache(refUserId: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/cache/invalidate/menu/${refUserId}`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to invalidate cache" }));
    throw new Error(error.error || "Failed to invalidate cache");
  }
  return response.json();
}

export type StructureType = "domain" | "application" | "module" | "object";
export async function fetchStructureChildrenCount(type: StructureType, id: number): Promise<number> {
  const r = await fetch(`${API_BASE}/admin/structure/${type}/${id}/children-count`);
  const d = await r.json().catch(() => ({}));
  return Number(d?.data?.children || 0);
}
export async function setStructureActive(type: StructureType, id: number, isActive: boolean): Promise<void> {
  const r = await fetch(`${API_BASE}/admin/structure/${type}/${id}/active`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: isActive ? 1 : 0 }),
  });
  if (!r.ok) throw new Error("toggle failed");
}
