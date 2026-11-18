export interface Domain {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: number;
}

export interface ApplicationExt {
  id: number;
  domain_id: number;
  code: string;
  name: string;
  description?: string;
  icon?: string | null;
  sort_order: number;
  is_active: number;
}

export interface ModuleExt {
  id: number;
  application_id: number;
  code: string;
  name: string;
  description?: string;
  icon?: string | null;
  sort_order: number;
  is_active: number;
}

export interface ObjectItemExt {
  objectId?: number | null;
  objectName?: string | null;
  path?: string | null;
  parentObjectId?: number | null;
  objectTypeName?: string | null;
  objectTypeId?: number | null;
  icon?: string | null;
  children?: ObjectItemExt[];
}

export interface ObjectType {
  value: string;
  label: string;
}

// Process and SubProcess types
export interface ProcessExt {
  id: number;
  module_id: number;
  object_id?: number | null;
  code: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: number;
  created_by?: number;
  updated_by?: number;
  created_at?: string;
  updated_at?: string;
  module_name?: string;
  object_name?: string;
  sub_processes?: SubProcessExt[];
}

export interface SubProcessExt {
  id: number;
  process_id: number;
  code: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: number;
  created_by?: number;
  updated_by?: number;
  created_at?: string;
  updated_at?: string;
  process_name?: string;
}

// Tree item types
export interface TreeItemData {
  id: number;
  name: string;
  code?: string;
  type: "domain" | "application" | "module" | "object";
  children?: TreeItemData[];
  parentId?: number;
  domainId?: number;
  applicationId?: number;
  moduleId?: number;
  isLoaded?: boolean;
  data?: any;
}

export interface SelectedItem {
  type: "domain" | "application" | "module" | "object";
  id: number;
  name: string;
  code?: string;
  data?: any;
}
