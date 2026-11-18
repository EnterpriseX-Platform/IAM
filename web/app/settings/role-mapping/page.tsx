"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import ThaiDatePicker from "@/app/components/ThaiDatePicker";
import { showConfirm } from "@/lib/swal";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Shield,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  effective_date?: string;
  expire_date?: string;
  is_active: number;
}

interface RoleObjectMapping {
  id: number;
  role_id: string;
  domain_id?: number;
  application_id?: number;
  module_id?: number;
  object_id?: number;
  process_id?: number;
  sub_process_id?: number;
  effective_date?: string;
  expire_date?: string;
  is_active: number;
  domain_name?: string;
  application_name?: string;
  module_name?: string;
  object_name?: string;
  object_path?: string;
  process_name?: string;
  sub_process_name?: string;
}

// Permission Type from database
interface PermissionType {
  id: number;
  permission_type: string[]; // Now it's an array of permission names
}

// V2 Permission format (JSON array)
interface RoleObjectPermissionV2 {
  id?: number;
  role_object_mapping_id: number;
  permissions: string[];
  scope_filter?: string;
}

interface PermissionWithObjectInfoV2 {
  id: number;
  role_object_mapping_id: number;
  permissions: string[];
  scope_filter?: string;
  object_name?: string;
  object_path?: string;
  domain_name?: string;
  application_name?: string;
  module_name?: string;
}

// Unique Object identifier for columns
interface UniqueObject {
  key: string;
  object_id: number;
  object_name: string;
  object_path?: string;
  domain_name?: string;
  application_name?: string;
  module_id?: number;
  module_name?: string;
}

// Matrix cell data
interface MatrixCell {
  mapping?: RoleObjectMapping;
  permission?: RoleObjectPermissionV2;
  hasAccess: boolean;
}

// Matrix row (Role)
interface MatrixRow {
  role: Role;
  cells: Map<string, MatrixCell>; // key = object key
}

interface Option {
  value: string | number;
  label: string;
}

interface TreeNode {
  id: number;
  label: string;
  code: string;
  path: string;
  level: number;
  children: TreeNode[];
}

// Permission types will be loaded from API
// const PERMISSION_TYPES = [
//   { key: "can_view", label: "View", short: "V" },
//   { key: "can_create", label: "Create", short: "C" },
//   { key: "can_edit", label: "Edit", short: "E" },
//   { key: "can_delete", label: "Delete", short: "D" },
//   { key: "can_approve", label: "Approve", short: "A" },
//   { key: "can_export", label: "Export", short: "Ex" },
//   { key: "can_print", label: "Print", short: "P" },
// ];

// Searchable Select Component
interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  useFixedPosition?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = "เลือก...",
  useFixedPosition = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value.toString() === value);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optValue: string | number) => {
    onChange(optValue.toString());
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-2 block text-sm font-semibold text-gray-700">
          {label}
        </label>
      )}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white flex items-center justify-between cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all duration-200"
      >
        <span className={selectedOption ? "text-gray-900" : "text-gray-400"}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen && (
        <div className={`${useFixedPosition ? 'fixed z-[9999] w-[220px]' : 'absolute z-50 w-full'} mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-hidden`} style={useFixedPosition ? { 
          top: containerRef.current ? containerRef.current.getBoundingClientRect().bottom + 4 : 0,
          left: containerRef.current ? containerRef.current.getBoundingClientRect().left : 0
        } : {}}>
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหา..."
                className="input-minimal w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-48">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400 text-center">
                ไม่พบข้อมูล
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-blue-50 ${
                    opt.value.toString() === value
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700"
                  }`}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Tree Multi Select Component
interface TreeMultiSelectProps {
  label: string;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  treeData: TreeNode[];
  placeholder?: string;
}

const TreeMultiSelect: React.FC<TreeMultiSelectProps> = ({
  label,
  selectedIds,
  onChange,
  treeData,
  placeholder = "เลือก Objects...",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    return nodes.reduce<TreeNode[]>((acc, node) => {
      const matches =
        node.label.toLowerCase().includes(query.toLowerCase()) ||
        node.code.toLowerCase().includes(query.toLowerCase());
      const filteredChildren = filterTree(node.children, query);
      if (matches || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
      return acc;
    }, []);
  };

  const filteredTree = filterTree(treeData, searchQuery);

  const toggleNode = (nodeId: number) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) newSet.delete(nodeId);
      else newSet.add(nodeId);
      return newSet;
    });
  };

  const toggleSelection = (nodeId: number) => {
    onChange(
      selectedIds.includes(nodeId)
        ? selectedIds.filter((id) => id !== nodeId)
        : [...selectedIds, nodeId],
    );
  };

  const getAllNodeIds = (nodes: TreeNode[]): number[] => {
    return nodes.reduce<number[]>((acc, node) => {
      acc.push(node.id);
      if (node.children.length > 0) acc.push(...getAllNodeIds(node.children));
      return acc;
    }, []);
  };

  const selectAllFiltered = () => {
    const allIds = getAllNodeIds(filteredTree);
    onChange([...new Set([...selectedIds, ...allIds])]);
  };

  const clearSelection = () => onChange([]);

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedIds.includes(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
          style={{ paddingLeft: `${12 + depth * 20}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <label className="flex items-center gap-2 flex-1 cursor-pointer">
            <Checkbox
              
              checked={isSelected}
              onChange={() => toggleSelection(node.id)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 truncate" title={node.label}>
              {node.label}
            </span>
          </label>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const selectedCount = selectedIds.length;

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </label>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white flex items-center justify-between cursor-pointer hover:border-gray-300"
      >
        <span className={selectedCount > 0 ? "text-gray-900" : "text-gray-400"}>
          {selectedCount > 0 ? `เลือก ${selectedCount} รายการ` : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-hidden">
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="input-minimal w-full pl-9 pr-10 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="absolute right-2 flex items-center gap-1">
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAllFiltered}
                className="flex-1 text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-center"
              >
                เลือกทั้งหมด
              </button>
              <button
                onClick={clearSelection}
                className="flex-1 text-xs px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 text-center"
              >
                ล้างการเลือก
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-60 pb-4">
            {filteredTree.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400 text-center">
                ไม่พบข้อมูล
              </div>
            ) : (
              filteredTree.map((node) => renderTreeNode(node))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function RoleMappingMatrixPage() {
  // Data states
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionTypes, setPermissionTypes] = useState<PermissionType[]>([]);
  const [, setAllMappings] = useState<RoleObjectMapping[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionWithObjectInfoV2[]>([]);
  const [loading, setLoading] = useState(true);

  // Matrix data
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);
  const [uniqueObjects, setUniqueObjects] = useState<UniqueObject[]>([]);

  // UI states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>("");
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error";
  }>({ isOpen: false, title: "", message: "", type: "success" });

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedRoleForAdd, setSelectedRoleForAdd] = useState<Role | null>(
    null,
  );

  // Form states
  const [, setDomainOptions] = useState<Option[]>([]);
  const [, setAppOptions] = useState<Option[]>([]);
  const [moduleOptions, setModuleOptions] = useState<Option[]>([]);
  const [objectTree, setObjectTree] = useState<TreeNode[]>([]);
  const [formData, setFormData] = useState({
    domain_id: "",
    application_id: "",
    module_id: "",
    selected_object_ids: [] as number[],
    effective_date: "",
    expire_date: "",
    is_active: 1,
  });

  // State for adding custom permission
  const [addingPermissionCell, setAddingPermissionCell] = useState<string | null>(null);
  const [newPermissionName, setNewPermissionName] = useState("");

  // Show notification
  const showNotification = (
    title: string,
    message: string,
    type: "success" | "error",
  ) => {
    setNotification({ isOpen: true, title, message, type });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, isOpen: false }));
    }, 3000);
  };

  // Fetch all data
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch permission types first
      const permTypesRes = await fetch(`${API_BASE}/admin/permission-types`);
      const permTypesData = permTypesRes.ok ? (await permTypesRes.json()).data || [] : [];
      // Fallback to default permission types if API returns empty
      const finalPermTypes = permTypesData.length > 0 ? permTypesData : [
        { id: 1, permission_type: ["Create", "Read", "Update", "Delete"] },
      ];
      setPermissionTypes(finalPermTypes);

      // Fetch roles
      const rolesRes = await fetch(`${API_BASE}/admin/roles`);
      const rolesData = rolesRes.ok ? (await rolesRes.json()).data || [] : [];
      setRoles(rolesData);

      // Fetch all mappings for all roles
      const allMappingsArray: RoleObjectMapping[] = [];
      for (const role of rolesData) {
        const mappingsRes = await fetch(
          `${API_BASE}/admin/roles/${role.id}/object-mappings`,
        );
        if (mappingsRes.ok) {
          const mappings = (await mappingsRes.json()).data || [];
          allMappingsArray.push(...mappings);
        }
      }
      setAllMappings(allMappingsArray);

      // Fetch all permissions (V2 format)
      const allPermsArray: PermissionWithObjectInfoV2[] = [];
      for (const role of rolesData) {
        const permsRes = await fetch(
          `${API_BASE}/admin/roles/${role.id}/permissions`,
        );
        if (permsRes.ok) {
          const perms = (await permsRes.json()).data || [];
          allPermsArray.push(...perms);
        }
      }
      setAllPermissions(allPermsArray);

      // Build matrix
      buildMatrix(rolesData, allMappingsArray, allPermsArray);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      showNotification("เกิดข้อผิดพลาด", "ไม่สามารถโหลดข้อมูลได้", "error");
    } finally {
      setLoading(false);
    }
  };

  // Build matrix from data (V2 format)
  const buildMatrix = (
    rolesData: Role[],
    mappingsData: RoleObjectMapping[],
    permissionsData: PermissionWithObjectInfoV2[],
  ) => {
    // Extract unique objects
    const objectMap = new Map<string, UniqueObject>();
    mappingsData.forEach((mapping) => {
      const key = `${mapping.object_id || mapping.id}`;
      if (!objectMap.has(key)) {
        objectMap.set(key, {
          key,
          object_id: mapping.object_id || mapping.id,
          object_name: mapping.object_name || `Object #${mapping.object_id}`,
          object_path: mapping.object_path,
          domain_name: mapping.domain_name,
          application_name: mapping.application_name,
          module_id: mapping.module_id,
          module_name: mapping.module_name,
        });
      }
    });
    const objects = Array.from(objectMap.values());
    setUniqueObjects(objects);

    // Build rows
    const rows: MatrixRow[] = rolesData.map((role) => {
      const roleMappings = mappingsData.filter((m) => m.role_id === role.id);
      const cells = new Map<string, MatrixCell>();

      objects.forEach((obj) => {
        const mapping = roleMappings.find(
          (m) => (m.object_id || m.id).toString() === obj.key,
        );

        if (mapping) {
          const permission = permissionsData.find(
            (p) => p.role_object_mapping_id === mapping.id,
          );
          cells.set(obj.key, {
            mapping,
            permission,
            hasAccess: true,
          });
        } else {
          cells.set(obj.key, { hasAccess: false });
        }
      });

      return { role, cells };
    });

    setMatrixRows(rows);
  };

  // Fetch options for add modal
  const fetchOptions = async () => {
    try {
      const [domainsRes, appsRes, modulesRes, treeRes] = await Promise.all([
        fetch(`${API_BASE}/admin/options/domains`),
        fetch(`${API_BASE}/admin/options/applications`),
        fetch(`${API_BASE}/admin/options/modules`),
        fetch(`${API_BASE}/admin/options/object-tree`),
      ]);

      if (domainsRes.ok) {
        const data = await domainsRes.json();
        setDomainOptions(data.data || []);
      }
      if (appsRes.ok) {
        const data = await appsRes.json();
        setAppOptions(data.data || []);
      }
      if (modulesRes.ok) {
        const data = await modulesRes.json();
        setModuleOptions(data.data || []);
      }
      if (treeRes.ok) {
        const data = await treeRes.json();
        setObjectTree(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch options:", error);
    }
  };

  useEffect(() => {
    fetchAllData();
    fetchOptions();
  }, []);

  // Filtered data - search both Role and Object
  const filteredRoles = matrixRows.filter((row) => {
    // Filter by selected role
    if (selectedRoleFilter && row.role.id.toString() !== selectedRoleFilter) {
      return false;
    }

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    // Match role name or code
    const roleMatch =
      row.role.name.toLowerCase().includes(query) ||
      row.role.code.toLowerCase().includes(query);
    // Match any object that this role has access to
    const objectMatch = uniqueObjects.some((obj) => {
      const cell = row.cells.get(obj.key);
      return (
        cell?.hasAccess &&
        (obj.object_name.toLowerCase().includes(query) ||
          (obj.object_path?.toLowerCase().includes(query) ?? false))
      );
    });
    return roleMatch || objectMatch;
  });

  const filteredObjects = uniqueObjects.filter((obj) => {
    // Filter by selected module
    if (
      selectedModuleFilter &&
      obj.module_id?.toString() !== selectedModuleFilter
    ) {
      return false;
    }

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    // Match object name or path
    const objectMatch =
      obj.object_name.toLowerCase().includes(query) ||
      (obj.object_path?.toLowerCase().includes(query) ?? false);
    // Match any role that has access to this object
    const roleMatch = matrixRows.some((row) => {
      const cell = row.cells.get(obj.key);
      return (
        cell?.hasAccess &&
        (row.role.name.toLowerCase().includes(query) ||
          row.role.code.toLowerCase().includes(query))
      );
    });
    return objectMatch || roleMatch;
  });

  // Toggle permission checkbox

  // V2 Permission Toggle Handler
  const handleTogglePermissionV2 = async (
    row: MatrixRow,
    obj: UniqueObject,
    permissionName: string,
    checked: boolean,
  ) => {
    const cell = row.cells.get(obj.key);
    let mappingId = cell?.mapping?.id;

    if (!mappingId) {
      try {
        const today = new Date().toISOString().split("T")[0];
        const createRes = await fetch(`${API_BASE}/admin/role-object-mappings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_id: row.role.id,
            domain_id: null,
            application_id: null,
            module_id: null,
            object_id: obj.object_id,
            process_id: null,
            sub_process_id: null,
            effective_date: today,
            expire_date: null,
            is_active: 1,
          }),
        });

        if (!createRes.ok) throw new Error("Failed to create mapping");
        const newMapping = (await createRes.json()).data;
        mappingId = newMapping.id;

        const permRes = await fetch(`${API_BASE}/admin/role-object-permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_object_mapping_id: mappingId,
            permissions: checked ? [permissionName] : [],
            permission_level: null,
            scope_filter: null,
          }),
        });

        let defaultPermission;
        if (permRes.ok) {
          defaultPermission = (await permRes.json()).data;
        }

        const newCell: MatrixCell = {
          mapping: newMapping,
          permission: defaultPermission,
          hasAccess: true,
        };
        row.cells.set(obj.key, newCell);
        setMatrixRows([...matrixRows]);
        showNotification("สำเร็จ", "สร้าง Mapping และ Permission เรียบร้อย", "success");
        return;
      } catch (error) {
        showNotification("เกิดข้อผิดพลาด", "ไม่สามารถสร้าง Mapping ได้", "error");
        return;
      }
    }

    const cell2 = row.cells.get(obj.key);
    const permission = cell2?.permission;

    try {
      const response = await fetch(
        `${API_BASE}/admin/role-object-mappings/${mappingId}/toggle-permission`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            permission: permissionName,
            enabled: checked,
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to toggle permission");
      const result = await response.json();

      if (cell2) {
        cell2.permission = {
          ...permission,
          permissions: result.data.permissions,
          role_object_mapping_id: permission?.role_object_mapping_id || cell2.mapping?.id || 0,
        } as RoleObjectPermissionV2;
      }
      setMatrixRows([...matrixRows]);
    } catch (error) {
      showNotification("เกิดข้อผิดพลาด", "ไม่สามารถเปลี่ยนสิทธิ์ Permission ได้", "error");
    }
  };
  // Handle add mapping
  const handleAddMapping = async () => {
    if (!selectedRoleForAdd || formData.selected_object_ids.length === 0)
      return;

    try {
      for (const objectId of formData.selected_object_ids) {
        const payload = {
          role_id: selectedRoleForAdd.id,
          domain_id: formData.domain_id ? parseInt(formData.domain_id) : null,
          application_id: formData.application_id
            ? parseInt(formData.application_id)
            : null,
          module_id: formData.module_id ? parseInt(formData.module_id) : null,
          object_id: objectId,
          process_id: null,
          sub_process_id: null,
          effective_date:
            formData.effective_date || new Date().toISOString().split("T")[0],
          expire_date: formData.expire_date || null,
          is_active: formData.is_active,
        };

        const response = await fetch(`${API_BASE}/admin/role-object-mappings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error("Failed to create mapping");

        const newMapping = (await response.json()).data;

        // Create default permission for the new mapping
        await fetch(`${API_BASE}/admin/role-object-permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_object_mapping_id: newMapping.id,
            can_view: 1,
            can_create: 0,
            can_edit: 0,
            can_delete: 0,
            can_approve: 0,
            can_export: 0,
            can_print: 0,
            permission_level: null,
            scope_filter: null,
          }),
        });
      }

      showNotification(
        "สำเร็จ",
        "เพิ่ม Mapping และ Permission เรียบร้อย",
        "success",
      );
      setIsAddModalOpen(false);
      fetchAllData();
    } catch (error) {
      showNotification("เกิดข้อผิดพลาด", "ไม่สามารถเพิ่ม Mapping ได้", "error");
    }
  };

  // Handle delete mapping
  const handleDeleteMapping = async (row: MatrixRow, obj: UniqueObject) => {
    const cell = row.cells.get(obj.key);
    if (!cell?.mapping) return;

    const confirmed = await showConfirm("ยืนยันการลบ", "ต้องการลบ Mapping นี้ใช่หรือไม่?");
    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API_BASE}/admin/role-object-mappings/${cell.mapping.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Failed to delete mapping");

      // Update local state
      cell.mapping = undefined;
      cell.permission = undefined;
      cell.hasAccess = false;
      setMatrixRows([...matrixRows]);

      showNotification("สำเร็จ", "ลบ Mapping เรียบร้อย", "success");
    } catch (error) {
      showNotification("เกิดข้อผิดพลาด", "ไม่สามารถลบ Mapping ได้", "error");
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Role-Object Matrix
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              จัดการสิทธิ์การเข้าถึง Object ตาม Role (แนวตั้ง = Role, แนวนอน =
              Object)
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedRoleForAdd(roles[0] || null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            เพิ่ม Mapping
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative w-[280px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหา Role หรือ Object..."
              className="input-minimal block w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-gray-300 rounded-xl leading-5 placeholder-gray-400 focus:outline-none focus:placeholder-gray-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 shadow-sm"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Role</span>
            <div className="w-[180px]">
              <SearchableSelect
                label=""
                value={selectedRoleFilter}
                onChange={setSelectedRoleFilter}
                options={[{ value: "", label: "ทุก Role" }, ...roles.map((r) => ({ value: r.id.toString(), label: `${r.name} (${r.code})` }))]}
                placeholder="-- เลือก Role --"
              />
            </div>
          </div>
          
          {/* Module Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Module</span>
            <div className="w-[180px]">
              <SearchableSelect
                label=""
                value={selectedModuleFilter}
                onChange={setSelectedModuleFilter}
                options={[{ value: "", label: "ทุก Module" }, ...moduleOptions.map((m) => ({ value: m.value.toString(), label: m.label }))]}
                placeholder="-- เลือก Module --"
              />
            </div>
          </div>
          
          {/* Clear Filters -->
          {(selectedRoleFilter || selectedModuleFilter || searchQuery) && (
            <button
              onClick={() => {
                setSelectedRoleFilter("");
                setSelectedModuleFilter("");
                setSearchQuery("");
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400 transition-all duration-200 shadow-sm"
            >
              <X className="w-4 h-4" />
              ล้างตัวกรอง
            </button>
          )}
        </div>
        
        {/* Active Filters Badge */}
          {(selectedRoleFilter || selectedModuleFilter) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200/60">
              <span className="text-xs text-gray-500">ตัวกรองที่ใช้:</span>
              {selectedRoleFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                  Role:{" "}
                  {roles.find((r) => r.id.toString() === selectedRoleFilter)
                    ?.name || selectedRoleFilter}
                  <button
                    onClick={() => setSelectedRoleFilter("")}
                    className="hover:text-purple-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedModuleFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                  Module:{" "}
                  {moduleOptions.find(
                    (m) => m.value.toString() === selectedModuleFilter,
                  )?.label || selectedModuleFilter}
                  <button
                    onClick={() => setSelectedModuleFilter("")}
                    className="hover:text-emerald-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Matrix Table */}
        <div className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
              {/* Scrollable container */}
              <div className="overflow-auto flex-1">
                <table className="cds--data-table cds--data-table--sm w-auto min-w-full">
                  <thead className="bg-gray-50 sticky top-0 z-20">
                    {/* Row 1: Column labels */}
                    <tr>
                      {/* Role column header - sticky left */}
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-r border-gray-200 w-[220px] min-w-[220px] sticky left-0 bg-gray-50 z-30"
                      >
                        Role / Permission
                      </th>
                      {/* Object column headers */}
                      {filteredObjects.map((obj) => (
                        <th
                          key={obj.key}
                          className="px-2 py-2 text-left text-xs font-medium text-gray-600 border-b border-r border-gray-200 w-[300px] min-w-[300px] bg-gray-50 align-top"
                        >
                          <div className="truncate" title={obj.object_name}>
                            {obj.object_name}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate mt-0.5">
                            {obj.object_path?.split("/").pop()}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoles.map((row, rowIndex) => (
                      <tr
                        key={row.role.id}
                        className={
                          rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                        }
                      >
                        {/* Role cell - sticky left */}
                        <td className="px-4 py-3 border-b border-r border-gray-200 sticky left-0 bg-inherit z-10 w-[220px] min-w-[220px]">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Shield className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-gray-900 truncate">
                                {row.role.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {row.role.code}
                              </div>
                            </div>
                          </div>
                        </td>
                        {/* Object cells */}
                        {filteredObjects.map((obj) => {
                          const cell = row.cells.get(obj.key);

                          return (
                            <td
                              key={obj.key}
                              className="px-2 py-2 border-b border-r border-gray-200 w-[300px] min-w-[300px]"
                            >
                              <div className="flex gap-1 items-center">
                                {/* Get all unique permissions from both permissionTypes and cell data */}
                                {(() => {
                                  // Get base permissions from permissionTypes
                                  const basePermissions = permissionTypes.flatMap(pt => pt.permission_type || []);
                                  // Get existing permissions from cell
                                  const cellPermissions = cell?.permission?.permissions || [];
                                  // Merge and remove duplicates
                                  const allPermissions = [...new Set([...basePermissions, ...cellPermissions])];
                                  
                                  return allPermissions.map((permName, idx) => {
                                    const hasPermission = cellPermissions.includes(permName);

                                    return (
                                      <button
                                        key={idx}
                                        onClick={() =>
                                          handleTogglePermissionV2(
                                            row,
                                            obj,
                                            permName,
                                            !hasPermission,
                                          )
                                        }
                                        disabled={false}
                                        className={`w-8 h-8 rounded border transition-all flex-shrink-0 text-[10px] font-medium ${
                                          hasPermission
                                            ? "bg-emerald-500 border-emerald-500 text-white"
                                            : cell?.hasAccess
                                              ? "bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500"
                                              : "bg-gray-100 border-gray-200 cursor-pointer hover:bg-white hover:border-gray-300 text-gray-400"
                                        }`}
                                        title={`${permName}: ${hasPermission ? "มีสิทธิ์" : "ไม่มีสิทธิ์"}`}
                                      >
                                        {hasPermission ? (
                                          <div className="flex flex-col items-center leading-none">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span className="text-[8px] mt-0.5 truncate max-w-[28px]">{permName.slice(0, 4)}</span>
                                          </div>
                                        ) : (
                                          <span className="text-[9px] truncate max-w-[28px] px-0.5">{permName.slice(0, 4)}</span>
                                        )}
                                      </button>
                                    );
                                  });
                                })()}

                                {/* Add custom permission button */}
                                {cell?.hasAccess && (
                                  <>
                                    {addingPermissionCell === `${row.role.id}-${obj.key}` ? (
                                      <div className="flex items-center gap-1 ml-1">
                                        <input
                                          type="text"
                                          value={newPermissionName}
                                          onChange={(e) => setNewPermissionName(e.target.value)}
                                          placeholder="ชื่อสิทธิ์"
                                          className="input-minimal w-16 h-8 text-xs border border-gray-300 rounded px-1"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newPermissionName.trim()) {
                                              handleTogglePermissionV2(row, obj, newPermissionName.trim(), true);
                                              setNewPermissionName("");
                                              setAddingPermissionCell(null);
                                            } else if (e.key === 'Escape') {
                                              setAddingPermissionCell(null);
                                              setNewPermissionName("");
                                            }
                                          }}
                                        />
                                        <button
                                          onClick={() => {
                                            if (newPermissionName.trim()) {
                                              handleTogglePermissionV2(row, obj, newPermissionName.trim(), true);
                                              setNewPermissionName("");
                                              setAddingPermissionCell(null);
                                            }
                                          }}
                                          className="w-6 h-8 flex items-center justify-center text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                                          title="บันทึก"
                                        >
                                          <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setAddingPermissionCell(null);
                                            setNewPermissionName("");
                                          }}
                                          className="w-6 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                          title="ยกเลิก"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setAddingPermissionCell(`${row.role.id}-${obj.key}`);
                                          setNewPermissionName("");
                                        }}
                                        className="ml-1 w-6 h-8 flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded flex-shrink-0"
                                        title="เพิ่มสิทธิ์ใหม่"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    )}
                                  </>
                                )}

                                {/* Delete button if has mapping */}
                                {cell?.hasAccess && (
                                  <button
                                    onClick={() =>
                                      handleDeleteMapping(row, obj)
                                    }
                                    className="ml-1 w-6 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0"
                                    title="ลบ Mapping"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="bg-white border-t border-gray-200 px-6 py-3">
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <span className="font-medium text-gray-500">สิทธิ์:</span>
            {/* Display active permissions from allPermissions state */}
            {(() => {
              // Get all unique permissions from allPermissions
              const allPerms = new Set<string>();
              allPermissions.forEach(p => {
                if (p.permissions) {
                  p.permissions.forEach(perm => allPerms.add(perm));
                }
              });
              // Also add from permissionTypes
              permissionTypes.forEach(pt => {
                (pt.permission_type || []).forEach(p => allPerms.add(p));
              });
              
              return Array.from(allPerms).map((permName, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="w-5 h-5 bg-gray-200 rounded text-[10px] flex items-center justify-center text-gray-600 font-medium">
                    {permName.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-gray-600">{permName}</span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Add Mapping Modal */}
        {isAddModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
            onClick={() => setIsAddModalOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                เพิ่ม Mapping ใหม่
              </h3>

              <div className="space-y-4">
                <SearchableSelect
                  label="Role"
                  value={selectedRoleForAdd?.id.toString() || ""}
                  onChange={(v) => {
                    const role = roles.find((r) => r.id.toString() === v);
                    setSelectedRoleForAdd(role || null);
                  }}
                  options={roles.map((r) => ({
                    value: r.id,
                    label: `${r.name} (${r.code})`,
                  }))}
                  placeholder="เลือก Role..."
                />

                <TreeMultiSelect
                  label="Objects"
                  selectedIds={formData.selected_object_ids}
                  onChange={(ids) =>
                    setFormData((p) => ({ ...p, selected_object_ids: ids }))
                  }
                  treeData={objectTree}
                  placeholder="เลือก Objects..."
                />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      วันที่เริ่มต้น
                    </label>
                    <ThaiDatePicker
                      value={formData.effective_date}
                      onChange={(iso) => setFormData((p) => ({ ...p, effective_date: iso }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      วันที่สิ้นสุด
                    </label>
                    <ThaiDatePicker
                      value={formData.expire_date}
                      onChange={(iso) => setFormData((p) => ({ ...p, expire_date: iso }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.is_active}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        is_active: parseInt(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value={1}>ใช้งาน</option>
                    <option value={0}>ไม่ใช้งาน</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleAddMapping}
                  disabled={
                    !selectedRoleForAdd ||
                    formData.selected_object_ids.length === 0
                  }
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notification Modal */}
        {notification.isOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
            onClick={() => setNotification((p) => ({ ...p, isOpen: false }))}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                  notification.type === "error"
                    ? "bg-red-100"
                    : "bg-emerald-100"
                }`}
              >
                {notification.type === "error" ? (
                  <X className="h-7 w-7 text-red-600" />
                ) : (
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                )}
              </div>
              <h3 className="mb-2 text-lg font-bold text-gray-900">
                {notification.title}
              </h3>
              <p className="mb-6 text-sm text-gray-500">
                {notification.message}
              </p>
              <button
                onClick={() =>
                  setNotification((p) => ({ ...p, isOpen: false }))
                }
                className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
                  notification.type === "error"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                ตกลง
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
