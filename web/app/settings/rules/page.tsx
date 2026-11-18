"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import { showConfirm, showError, showSuccess } from "@/lib/swal";
import {
  ChevronDown,
  ChevronRight,
  Download,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  User,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

/** ===== API Type (ROLE with nested POLICIES) ===== */
type RolePolicyChild = {
  rolePolicyId?: string | null;
  objectId?: number | null;
  objectName?: string | null;
  parentObjectId?: number | null;
  objectTypeName?: string | null;
};

type RoleWithPoliciesResponse = {
  roleId: string;
  roleName: string;
  roleDesc?: string | null;
  systemId: number;
  policies: RolePolicyChild[];
};

/** ===== API Type (OBJECT ALL) ===== */
type ObjectApiRow = {
  systemId?: number | null;
  objectId?: number | null;
  parentObjectId?: number | null;
  objectSeq?: number | null;
  objectName?: string | null;
  objectTypeName?: string | null;
  status?: string | null;
};

type RoleNode = {
  id: string;
  name: string;
  desc?: string;
  systemId?: number;
};

type PermissionTreeNode = {
  id: number;
  name: string;
  parentObjectId: number | null;
  objectTypeName: string | null;
  children: PermissionTreeNode[];
  status?: string | null;
  rolePolicyId?: string | null;
};

/** ===== API Response Type สำหรับ Permission Objects (Nested Structure) ===== */
type PermissionObjectItem = {
  permissionObjectId?: string | null;
  objectId?: number | null;
  objectName?: string | null;
  parentObjectId?: number | null;
  objectTypeName?: string | null;
};

type SystemPermissionWithObjects = {
  systemPermissionId?: string | null;
  permissionName?: string | null;
  objects: PermissionObjectItem[];
};

type PolicyRow = {
  id: string;
  roleSystemId: string;
  mainProcessId: string;
  subProcessId: string;
  _status: "new" | "edited" | "deleted" | "clean";
};

type PermissionTypeRow = {
  id: string;
  systemPermissionId?: string; // เก็บ SYSTEM_PERMISSION_ID จาก API
  permissionTypeId: string;
  dataAccessId: string;
  status?: boolean; // สถานะ เปิด/ปิดใช้งาน
  condition?: string; // เงื่อนไขเพิ่มเติม
  _status: "new" | "edited" | "deleted" | "clean";
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type OptionType = {
  value: string;
  label: string;
};

type SubProcessWithParent = {
  value: string;
  label: string;
  parentId: string;
};

// ตัวอย่าง options สำหรับประเภทสิทธิ์ (เก็บไว้เป็น fallback)
// const permissionTypeOptions = [
//   { value: "READ", label: "อ่าน" },
//   { value: "WRITE", label: "เขียน" },
//   { value: "DELETE", label: "ลบ" },
//   { value: "APPROVE", label: "อนุมัติ" },
// ];

// const dataAccessOptionsByPermissionType: Record<
//   string,
//   { value: string; label: string }[]
// > = {
//   READ: [
//     { value: "ALL", label: "ทั้งหมด" },
//     { value: "OWN", label: "ของตนเอง" },
//     { value: "DEPARTMENT", label: "หน่วยงานเดียวกัน" },
//   ],
//   WRITE: [
//     { value: "ALL", label: "ทั้งหมด" },
//     { value: "OWN", label: "ของตนเอง" },
//   ],
//   DELETE: [
//     { value: "ALL", label: "ทั้งหมด" },
//     { value: "OWN", label: "ของตนเอง" },
//   ],
//   APPROVE: [{ value: "ALL", label: "ทั้งหมด" }],
// };

const norm = (s: any) =>
  String(s ?? "")
    .trim()
    .toLowerCase();

/** ===== Build role->object flat list (เฉพาะ OBJECT ที่ผูกกับ ROLE ผ่าน ROLE_SYSTEM) ===== */
function buildRoleObjectTree(
  roles: RoleWithPoliciesResponse[],
  roleIdNum: string,
): PermissionTreeNode[] {
  const role = roles.find((r) => r.roleId === roleIdNum);
  if (!role) return [];

  // สร้าง flat list ไม่มี parent-child relationship
  const list: PermissionTreeNode[] = [];

  for (const policy of role.policies) {
    if (!policy.objectId) continue;

    list.push({
      id: policy.objectId,
      name: policy.objectName ?? `OBJECT ${policy.objectId}`,
      parentObjectId: policy.parentObjectId ?? null,
      objectTypeName: policy.objectTypeName ?? null,
      rolePolicyId: policy.rolePolicyId ?? null,
      children: [], // ไม่มีลูก
    });
  }

  // เรียงตามชื่อ
  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

  return list;
}

/** ===== Build SYSTEM tree from ALL OBJECT ===== */
function buildMainMenuTree(objects: ObjectApiRow[]): PermissionTreeNode[] {
  // ตอนนี้ objects คือ systems ที่ไม่มี hierarchy
  // ส่ง flat list กลับไปโดยไม่ต้อง build tree
  const list: PermissionTreeNode[] = [];

  for (const o of objects) {
    if (!o.objectId) continue;
    list.push({
      id: o.objectId,
      name: o.objectName ?? `OBJECT ${o.objectId}`,
      parentObjectId: o.parentObjectId ?? null,
      objectTypeName: o.objectTypeName ?? null,
      status: o.status ?? null,
      children: [],
    });
  }

  // เรียงตามชื่อ
  list.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

  return list;
}

/** ===== Small Modal (no libs) ===== */
function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="font-semibold text-gray-800">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function RoleManagementPage() {
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null); // เก็บ roleSystemId ที่เลือก (ใช้ชื่อ selectedPolicyId เพื่อความเข้ากันได้กับ backend)

  const [roleSearch, setRoleSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");

  const [activePermTab, setActivePermTab] = useState<
    "process" | "permissionType"
  >("process");

  const [policyRows, setPolicyRows] = useState<PolicyRow[]>([]);
  const [permissionTypeRows, setPermissionTypeRows] = useState<
    PermissionTypeRow[]
  >([]);
  const [permissionMappingSaved, setPermissionMappingSaved] = useState(false); // เช็คว่า mapping ถูก save แล้วหรือยัง

  const [rolesData, setRolesData] = useState<RoleWithPoliciesResponse[]>([]);
  const [roles, setRoles] = useState<RoleNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [openPermModal, setOpenPermModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openAddModal, setOpenAddModal] = useState(false);
  // ✅ Modal สำหรับจัดการเมนูของแต่ละ permission
  const [openPermissionObjectModal, setOpenPermissionObjectModal] =
    useState(false);
  const [selectedPermissionGroup, setSelectedPermissionGroup] =
    useState<SystemPermissionWithObjects | null>(null);
  // ✅ เก็บรายการเมนูทั้งหมดจาก API
  const [availableMenus, setAvailableMenus] = useState<any[]>([]);
  const [loadingMenus, setLoadingMenus] = useState(false);
  // ✅ เก็บ selected menu IDs (OBJECT_ID)
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<number>>(
    new Set(),
  );

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Add Role Modal States
  const [addRoleName, setAddRoleName] = useState("");
  const [addRoleCode, setAddRoleCode] = useState("");
  const [addRoleDesc, setAddRoleDesc] = useState("");
  const [addRoleStatus, setAddRoleStatus] = useState("ACTIVE");
  const [addRoleErrors, setAddRoleErrors] = useState<{
    name?: string;
    code?: string;
    status?: string;
  }>({});

  const [allObjects, setAllObjects] = useState<ObjectApiRow[]>([]);
  const [objLoading, setObjLoading] = useState(false);
  const [objError, setObjError] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [modalSearch, setModalSearch] = useState("");

  /** ===== NEW: saving state ===== */
  const [savingPolicies, setSavingPolicies] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string>("");

  /** ===== DELETE ROLE_SYSTEM state ===== */
  const [deletingPolicyId, setDeletingPolicyId] = useState<string | null>(null);

  /** ===== PAGINATION state ===== */
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  /** ===== PROCESS OPTIONS state ===== */
  const [mainProcessOptions, setMainProcessOptions] = useState<OptionType[]>(
    [],
  );
  const [, setSubProcessOptionsAll] = useState<SubProcessWithParent[]>([]);
  // เก็บ sub process options แยกตาม mainProcessId
  const [subProcessOptionsMap, setSubProcessOptionsMap] = useState<
    Record<string, OptionType[]>
  >({});

  /** ===== PERMISSION TYPE OPTIONS state (from API) ===== */
  const [systemOptions, setSystemOptions] = useState<OptionType[]>([]);
  const [permissionOptionsMap, setPermissionOptionsMap] = useState<
    Record<string, OptionType[]>
  >({});

  /** ===== ACCESS TYPES state (for table 2) ===== */
  type AccessTypeData = {
    accessTypeId: number;
    permissionType: string;
    accessTypeName: string;
    description: string;
    status: string;
  };
  const [accessTypesData, setAccessTypesData] = useState<AccessTypeData[]>([]);

  // สถานะของแต่ละ access type (สำหรับ checkbox)
  const [accessTypeStatus, setAccessTypeStatus] = useState<
    Record<number, boolean>
  >({});

  // เก็บ access type IDs ที่บันทึกแล้ว (เพื่อซ่อนจากตาราง)
  const [savedAccessTypeIds, setSavedAccessTypeIds] = useState<Set<number>>(
    new Set(),
  );

  // กรองประเภทสิทธิ์
  const [selectedPermissionTypeFilter, setSelectedPermissionTypeFilter] =
    useState<string>("");

  /** ===== PERMISSION OBJECTS state (เมนูที่เกี่ยวข้องกับ permission ที่เลือก) ===== */
  const [selectedSystemPermissionId, setSelectedSystemPermissionId] = useState<
    string | null
  >(null);
  const [permissionObjects, setPermissionObjects] = useState<
    PermissionTreeNode[]
  >([]);
  // ✅ เพิ่ม state สำหรับ nested structure (แม่-ลูก)
  const [permissionObjectsGrouped, setPermissionObjectsGrouped] = useState<
    SystemPermissionWithObjects[]
  >([]);
  const [loadingPermissionObjects, setLoadingPermissionObjects] =
    useState(false);
  // ✅ เพิ่ม state สำหรับควบคุมการแสดง/ซ่อนส่วนเมนู
  const [showPermissionObjects, setShowPermissionObjects] = useState(false);
  // ✅ เก็บ object ที่ถูกเลือก (สำหรับแสดงประเภทสิทธิ์)
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(
    null,
  );
  const [selectedPermissionObjectId, setSelectedPermissionObjectId] =
    useState<string | null>(null);
  // ✅ เก็บข้อมูล access types ที่เลือก (สำหรับบันทึกเป็น batch)
  const [selectedAccessTypes, setSelectedAccessTypes] = useState<
    Array<{
      accessTypeId: number;
      status: boolean;
      condition: string;
    }>
  >([]);

  /** ===== โหลด process options จาก API ===== */
  const loadProcessOptions = async () => {
    try {
      // โหลด main process
      const mainRes = await fetch(`${API_BASE}/iamx/api/admin/options/main-processes`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (mainRes.ok) {
        const mainData: OptionType[] = await mainRes.json();
        setMainProcessOptions(mainData || []);
      }

      // โหลด sub process ทั้งหมด
      const subRes = await fetch(`${API_BASE}/iamx/api/admin/options/ref-subprocesses`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (subRes.ok) {
        const subData: SubProcessWithParent[] = await subRes.json();
        setSubProcessOptionsAll(subData || []);
      }
    } catch (e) {
      console.error("Failed to load process options:", e);
    }
  };

  /** ===== โหลด sub process options ตาม mainProcessId ===== */
  const loadSubProcessOptions = async (mainProcessId: string) => {
    if (!mainProcessId) return;

    // ถ้ามีข้อมูลแล้ว ไม่ต้องโหลดใหม่
    if (subProcessOptionsMap[mainProcessId]) return;

    try {
      const res = await fetch(
        `${API_BASE}/iamx/api/admin/options/ref-subprocesses?mainProcessId=${mainProcessId}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );
      if (res.ok) {
        const data: OptionType[] = await res.json();
        setSubProcessOptionsMap((prev) => ({
          ...prev,
          [mainProcessId]: data || [],
        }));
      }
    } catch (e) {
      console.error("Failed to load sub process options:", e);
    }
  };

  /** ===== โหลด system options จาก API ===== */
  const loadSystemOptions = async () => {
    try {
      const res = await fetch(`${API_BASE}/iamx/api/admin/options/systems`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const data: OptionType[] = await res.json();
        setSystemOptions(data || []);
      }
    } catch (e) {
      console.error("Failed to load system options:", e);
    }
  };

  /** ===== โหลด permission options จาก API (ตาม systemId) ===== */
  const loadPermissionOptions = async (systemId: string) => {
    if (!systemId) return;

    try {
      const res = await fetch(
        `${API_BASE}/iamx/api/admin/options/permissions?system=${systemId}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );
      if (res.ok) {
        const data: OptionType[] = await res.json();
        setPermissionOptionsMap((prev) => ({
          ...prev,
          [systemId]: data || [],
        }));
      }
    } catch (e) {
      console.error("Failed to load permission options:", e);
    }
  };

  /** ===== โหลด access types จาก API ===== */
  const loadAccessTypes = async () => {
    try {
      const res = await fetch(`${API_BASE}/iamx/api/role/access-types-list`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const data: AccessTypeData[] = await res.json();
        setAccessTypesData(data || []);

        // Init สถานะ checkbox เป็น false ทั้งหมด (ไม่ check ไว้ก่อน)
        const initialStatus: Record<number, boolean> = {};
        (data || []).forEach((item) => {
          initialStatus[item.accessTypeId] = false;
        });
        setAccessTypeStatus(initialStatus);
      }
    } catch (e) {
      console.error("Failed to load access types:", e);
    }
  };

  /** ===== โหลด permission objects (เมนู) ตาม roleSystemId ===== */
  const loadPermissionObjects = async (roleSystemId?: string) => {
    // Use selectedPolicyId if not provided
    const rsId = roleSystemId || selectedPolicyId;

    console.log("🔄 loadPermissionObjects called with:", {
      provided: roleSystemId,
      selectedPolicyId: selectedPolicyId,
      using: rsId,
    });

    if (!rsId) {
      console.log("⚠️ No roleSystemId provided");
      setPermissionObjects([]);
      setPermissionObjectsGrouped([]);
      return;
    }

    setLoadingPermissionObjects(true);
    try {
      const url = `${API_BASE}/iamx/api/role/permission-objects/${rsId}`;
      console.log("📡 Fetching permission objects from:", url);

      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      console.log("📡 Response status:", res.status, res.statusText);

      if (res.ok) {
        const rawData: SystemPermissionWithObjects[] = await res.json();
        console.log("✅ Permission objects raw data (nested):", rawData);

        // ✅ เก็บ nested structure ไว้ตรงๆ
        setPermissionObjectsGrouped(rawData || []);

        // ✅ สร้าง flat array สำหรับ backward compatibility (ถ้ามีโค้ดส่วนอื่นใช้)
        const flatData: PermissionTreeNode[] = [];
        (rawData || []).forEach((group) => {
          (group.objects || []).forEach((item) => {
            flatData.push({
              id: item.objectId || 0,
              name: item.objectName || `Object ${item.objectId || "?"}`,
              parentObjectId: item.parentObjectId || null,
              objectTypeName: item.objectTypeName || null,
              children: [],
              status: null,
              rolePolicyId: null,
            });
          });
        });

        console.log("✅ Permission objects flat:", flatData);
        setPermissionObjects(flatData);

        // ✅ แสดงส่วนเมนูเมื่อโหลดข้อมูลเสร็จ
        setShowPermissionObjects(true);
      } else {
        const errorText = await res.text();
        console.error(
          "❌ Failed to load permission objects:",
          res.status,
          errorText,
        );
        setPermissionObjects([]);
        setPermissionObjectsGrouped([]);
      }
    } catch (e) {
      console.error("💥 Exception loading permission objects:", e);
      setPermissionObjects([]);
      setPermissionObjectsGrouped([]);
    } finally {
      setLoadingPermissionObjects(false);
    }
  };

  /** ===== โหลดเมนูทั้งหมดจาก API สำหรับเลือกใน modal ===== */
  const loadAvailableMenus = async () => {
    setLoadingMenus(true);
    try {
      const url = `${API_BASE}/iamx/api/manage-menus`;
      console.log("📡 Fetching available menus from:", url);

      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        console.log("✅ Available menus loaded:", data);
        setAvailableMenus(data || []);
      } else {
        console.error("❌ Failed to load menus:", res.status);
        setAvailableMenus([]);
      }
    } catch (e) {
      console.error("💥 Exception loading menus:", e);
      setAvailableMenus([]);
    } finally {
      setLoadingMenus(false);
    }
  };

  /** ===== ดึงข้อมูล Object Access ที่เซฟไว้แล้ว ===== */
  const loadObjectAccess = async (permissionObjectId: string) => {
    try {
      const url = `${API_BASE}/iamx/api/object-access/${permissionObjectId}`;
      console.log("📡 Loading object access from:", url);

      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (res.ok) {
        const result = await res.json();
        console.log("✅ Object access loaded:", result);

        if (result.success && result.data) {
          // แปลงข้อมูลจาก API เป็น state
          const loadedAccessTypes = result.data.map((item: any) => ({
            accessTypeId: item.accessTypeId,
            status: item.useStatus === "1",
            condition: item.objectAccessCondition || "",
          }));

          setSelectedAccessTypes(loadedAccessTypes);

          // อัพเดท accessTypeStatus สำหรับการแสดง checkbox
          const statusMap: Record<number, boolean> = {};
          result.data.forEach((item: any) => {
            statusMap[item.accessTypeId] = item.useStatus === "1";
          });
          setAccessTypeStatus(statusMap);

          console.log("✅ Loaded access types:", loadedAccessTypes);
        }
      } else {
        console.error("❌ Failed to load object access:", res.status);
        // ถ้าไม่มีข้อมูล ให้ reset state
        setSelectedAccessTypes([]);
        setAccessTypeStatus({});
      }
    } catch (e) {
      console.error("💥 Exception loading object access:", e);
      // ถ้าเกิด error ให้ reset state
      setSelectedAccessTypes([]);
      setAccessTypeStatus({});
    }
  };

  /** ===== บันทึก Object Access (ประเภทสิทธิ์) ===== */
  const saveObjectAccess = async () => {
    if (!selectedPermissionObjectId) {
      showError("เกิดข้อผิดพลาด", "ไม่พบ Permission Object ID");
      return;
    }

    if (selectedAccessTypes.length === 0) {
      showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือกประเภทสิทธิ์อย่างน้อย 1 รายการ");
      return;
    }

    const confirmed = await showConfirm("ยืนยันการบันทึก", `ยืนยันการบันทึก ${selectedAccessTypes.length} รายการ?`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const url = `${API_BASE}/iamx/api/object-access/${selectedPermissionObjectId}`;
      console.log("💾 Saving object access:", {
        permissionObjectId: selectedPermissionObjectId,
        accessTypes: selectedAccessTypes,
      });

      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissionObjectId: selectedPermissionObjectId,
          accessTypes: selectedAccessTypes.map((item) => ({
            accessTypeId: item.accessTypeId,
            useStatus: item.status ? "1" : "0",
            objectAccessCondition: item.condition || null,
          })),
          createdBy: "SYSTEM", // TODO: ดึงจาก user session
        }),
      });

      if (res.ok) {
        console.log("✅ Object access saved");
        showSuccess("บันทึกสำเร็จ", "บันทึกข้อมูลเรียบร้อย");
        // Reset state
        setSelectedAccessTypes([]);
        setAccessTypeStatus({});
      } else {
        const errorText = await res.text();
        console.error("❌ Failed to save:", errorText);
        showError("เกิดข้อผิดพลาด", "บันทึกไม่สำเร็จ");
      }
    } catch (e) {
      console.error("💥 Exception saving:", e);
      showError("เกิดข้อผิดพลาด", String(e));
    } finally {
      setLoading(false);
    }
  };

  /** ===== บันทึก Permission Objects ===== */
  const savePermissionObjects = async () => {
    if (!selectedPermissionGroup?.systemPermissionId) {
      showError("เกิดข้อผิดพลาด", "ไม่พบ System Permission ID");
      return;
    }

    setLoading(true);
    try {
      // สร้าง array ของ object IDs ที่เลือก
      const objectIds = Array.from(selectedMenuIds);

      const url = `${API_BASE}/iamx/api/permission-objects/${selectedPermissionGroup.systemPermissionId}`;
      console.log("💾 Saving permission objects:", {
        systemPermissionId: selectedPermissionGroup.systemPermissionId,
        objectIds,
      });

      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectIds: objectIds,
          createdBy: "SYSTEM", // TODO: ดึงจาก user session
        }),
      });

      if (res.ok) {
        console.log("✅ Permission objects saved");
        showSuccess("บันทึกสำเร็จ", "บันทึกข้อมูลเรียบร้อย");
        setOpenPermissionObjectModal(false);
        // โหลด permission objects ใหม่เพื่อ refresh
        loadPermissionObjects();
      } else {
        const errorText = await res.text();
        console.error("❌ Failed to save:", errorText);
        showError("เกิดข้อผิดพลาด", "บันทึกไม่สำเร็จ");
      }
    } catch (e) {
      console.error("💥 Exception saving:", e);
      showError("เกิดข้อผิดพลาด", String(e));
    } finally {
      setLoading(false);
    }
  };

  /** ===== reload roles/policies ===== */
  const reloadRoles = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/iamx/api/role/`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Load roles failed: ${res.status} ${text}`);
      }
      const data: RoleWithPoliciesResponse[] = await res.json();
      setRolesData(data || []);

      const roleList = (data || []).map((r) => ({
        id: r.roleId,
        name: r.roleName ?? "",
        desc: r.roleDesc ?? "",
        systemId: r.systemId,
      }));

      roleList.sort((a, b) => {
        const an = norm(a.name);
        const bn = norm(b.name);
        if (an < bn) return -1;
        if (an > bn) return 1;
        return a.id.localeCompare(b.id);
      });

      setRoles(roleList);

      if (roleList.length > 0) {
        // ถ้ายังไม่เคยเลือก role ให้ default
        setSelectedRole((prev) => prev || roleList[0].id);

        // เปิด Role ที่มี policies อัตโนมัติ
        setExpandedRoles((prev) => {
          if (prev.size === 0) {
            // เปิด Role ที่มีข้อมูล (policies.length > 0)
            const rolesWithData = (data || [])
              .filter((r) => r.policies && r.policies.length > 0)
              .map((r) => r.roleId);
            return new Set(rolesWithData);
          }
          return prev;
        });
      } else {
        setSelectedRole("");
        setExpandedRoles(new Set());
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  /** ===== initial load ===== */
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([
        loadProcessOptions(),
        loadSystemOptions(),
        loadAccessTypes(),
        reloadRoles(),
      ]);
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRoles = useMemo(() => {
    const q = norm(roleSearch);
    if (!q) return roles;
    return roles.filter((r) =>
      norm(`${r.name} ${r.id} ${r.desc ?? ""}`).includes(q),
    );
  }, [roles, roleSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredRoles.length / itemsPerPage);

  const paginatedRoles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredRoles.slice(startIndex, endIndex);
  }, [filteredRoles, currentPage, itemsPerPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [roleSearch]);

  // Reset selectedPolicyId (roleSystemId) เมื่อเปลี่ยน role
  useEffect(() => {
    setSelectedPolicyId(null);
  }, [selectedRole]);

  // ฟังก์ชันโหลด Role Processes (เรียกได้จากหลายที่)
  const loadRoleProcesses = async (roleId: string) => {
    if (!roleId) {
      setPolicyRows([]);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/iamx/api/role/${roleId}/processes`);

      if (!res.ok) {
        throw new Error("Failed to fetch role processes");
      }

      const data = await res.json();

      // แปลงข้อมูลจาก API เป็น PolicyRow format
      const rows = data.map(
        (item: {
          roleProcessId?: string;
          roleSystemId?: string;
          processId?: string;
          subprocessId?: string;
          seq?: number;
        }) => ({
          id: crypto.randomUUID(),
          roleSystemId: item.roleSystemId || "",
          mainProcessId: item.processId || "",
          subProcessId: item.subprocessId || "",
          _status: "clean" as const,
        }),
      );

      setPolicyRows(rows);
    } catch (e) {
      console.error("Load role processes error:", e);
      setPolicyRows([]);
    } finally {
      setLoading(false);
    }
  };

  // โหลด Role Processes เมื่อเลือก role
  useEffect(() => {
    loadRoleProcesses(selectedRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole]);

  // เปลี่ยน tab เป็น "process" อัตโนมัติเมื่อเลือกตัวแม่ (role)
  useEffect(() => {
    // ถ้าไม่ได้เลือก system (เลือกแม่) และกำลังอยู่ที่ tab "permissionType" → เปลี่ยนเป็น "process"
    if (!selectedPolicyId && activePermTab === "permissionType") {
      setActivePermTab("process");
    }
  }, [selectedPolicyId, activePermTab]);

  const currentRole = useMemo(
    () => roles.find((r) => r.id === selectedRole) || null,
    [roles, selectedRole],
  );

  // หาข้อมูล ROLE_SYSTEM ที่เลือก
  const selectedPolicy = useMemo(() => {
    if (!selectedPolicyId || !selectedRole) return null;
    const role = rolesData.find((r) => r.roleId === selectedRole);
    if (!role) return null;
    return (
      role.policies.find((p) => p.rolePolicyId === selectedPolicyId) || null
    );
  }, [selectedPolicyId, selectedRole, rolesData]);

  // เช็คว่าควรแสดง tab "ประเภทสิทธิ์..." หรือไม่
  // แสดงเมื่อ: เลือก system (ตัวลูก) อยู่
  // const hasRolePolicies = useMemo(() => {
  //   // ถ้าเลือก system (ตัวลูก) → แสดง 2 tabs
  //   return selectedPolicyId !== null;
  // }, [selectedPolicyId]);

  // สร้าง tree สำหรับทุก role ที่เปิดอยู่
  const roleTreesMap = useMemo(() => {
    const map = new Map<string, PermissionTreeNode[]>();
    for (const roleId of expandedRoles) {
      if (roleId) {
        const tree = buildRoleObjectTree(rolesData, roleId);
        map.set(roleId, tree);
      }
    }
    return map;
  }, [rolesData, expandedRoles]);

  // กรอง tree ตาม permissionSearch
  const filteredRoleTreesMap = useMemo(() => {
    const q = norm(permissionSearch);
    const map = new Map<string, PermissionTreeNode[]>();

    for (const [roleId, trees] of roleTreesMap) {
      if (!q) {
        map.set(roleId, trees);
      } else {
        // Simple flat list filter - no tree logic needed
        const filtered = trees.filter((node) => {
          return (
            norm(node.name).includes(q) || norm(node.objectTypeName).includes(q)
          );
        });
        map.set(roleId, filtered);
      }
    }

    return map;
  }, [roleTreesMap, permissionSearch]);

  // No need to expand anything since we have a flat list

  // โหลด Permission Mapping เมื่อเลือก ROLE_SYSTEM
  useEffect(() => {
    if (!selectedPolicyId) {
      setPermissionTypeRows([]);
      setPermissionMappingSaved(false);
      return;
    }

    const loadPermissionMapping = async () => {
      try {
        setLoading(true);
        // API endpoint ยังใช้ /role-policy เพื่อความเข้ากันได้ แต่จริงๆ ดึงข้อมูล ROLE_SYSTEM
        // selectedPolicyId ตอนนี้คือ roleSystemId จริงๆ
        const res = await fetch(
          `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
        );

        if (!res.ok) {
          throw new Error("Failed to fetch permission mapping");
        }

        const data = await res.json();

        // แปลงข้อมูลจาก API เป็น PermissionTypeRow format
        if (data.rows && data.rows.length > 0) {
          console.log("🔍 Permission mapping data:", data);
          const rows = data.rows.map(
            (item: { systemPermissionId?: string; permissionId?: string }) => {
              console.log("🔍 Mapping item:", item);
              const row = {
                id: crypto.randomUUID(),
                systemPermissionId: item.systemPermissionId || "",
                permissionTypeId: currentRole?.systemId?.toString() || "",
                dataAccessId: item.permissionId || "",
                status: true,
                condition: "",
                _status: "clean" as const,
              };
              console.log("🔍 Created row:", row);
              return row;
            },
          );

          console.log("🔍 Final rows with systemPermissionId:", rows);
          // console.log(
          //   "🔍 Rows with systemPermissionId count:",
          //   rows.filter((r) => r.systemPermissionId).length,
          // );
          setPermissionTypeRows(rows);
          setPermissionMappingSaved(true);
        } else {
          setPermissionTypeRows([]);
          setPermissionMappingSaved(false);
        }
      } catch (e) {
        console.error("Load permission mapping error:", e);
        setPermissionTypeRows([]);
        setPermissionMappingSaved(false);
      } finally {
        setLoading(false);
      }
    };

    loadPermissionMapping();
  }, [selectedPolicyId, currentRole]);

  /** ===== โหลด permission options สำหรับ systemId จาก Role ===== */
  useEffect(() => {
    if (selectedPolicyId && currentRole?.systemId) {
      const systemId = String(currentRole.systemId);
      if (!permissionOptionsMap[systemId]) {
        loadPermissionOptions(systemId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPolicyId, currentRole]);

  /** ===== โหลด permission options สำหรับ permissionTypeRows ที่มีอยู่แล้ว ===== */
  useEffect(() => {
    if (activePermTab !== "permissionType") return;

    permissionTypeRows.forEach((row) => {
      if (row.permissionTypeId && !permissionOptionsMap[row.permissionTypeId]) {
        loadPermissionOptions(row.permissionTypeId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePermTab, permissionTypeRows]);

  /** ===== Reset selectedSystemPermissionId เมื่อเปลี่ยน tab หรือ policy ===== */
  useEffect(() => {
    setSelectedSystemPermissionId(null);
    setPermissionObjects([]);
    setPermissionObjectsGrouped([]);
    setShowPermissionObjects(false); // ✅ ซ่อนส่วนเมนูเมื่อเปลี่ยน tab/policy
    setSelectedObjectId(null); // ✅ ซ่อนส่วนประเภทสิทธิ์
  }, [activePermTab, selectedPolicyId]);

  /** ===== โหลด sub process options สำหรับ policyRows ที่มี mainProcessId อยู่แล้ว ===== */
  useEffect(() => {
    if (activePermTab !== "process") return;

    policyRows.forEach((row) => {
      if (row.mainProcessId && !subProcessOptionsMap[row.mainProcessId]) {
        loadSubProcessOptions(row.mainProcessId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePermTab, policyRows]);

  /** ===== Modal tree ===== */
  const modalRoots = useMemo(() => buildMainMenuTree(allObjects), [allObjects]);

  const filteredModalRoots = useMemo(() => {
    if (!modalSearch.trim()) return modalRoots;

    const q = modalSearch.toLowerCase().trim();
    return modalRoots.filter((node) => {
      const name = (node.name || "").toLowerCase();
      const type = (node.objectTypeName || "").toLowerCase();
      const systemId = String(node.id || ""); // node.id คือ systemId
      return (
        name.includes(q) ||
        type.includes(q) ||
        systemId.includes(modalSearch.trim())
      );
    });
  }, [modalRoots, modalSearch]);

  /** ✅ Simple toggle - ไม่มี parent-child logic */
  const setChecked = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const isChecked = (id: number) => selectedIds.has(id);

  /** ===== Render node as flat list item ===== */
  const ObjRow = ({
    node,
    showCheckbox = false,
  }: {
    node: PermissionTreeNode;
    showCheckbox?: boolean;
  }) => {
    const isDeleting = deletingPolicyId === node.rolePolicyId;

    return (
      <div
        className={`flex items-center gap-2 p-2 rounded-lg ${
          !showCheckbox && selectedPolicyId === node.rolePolicyId
            ? "bg-blue-50 border border-blue-200"
            : "hover:bg-gray-50"
        } ${!showCheckbox && node.rolePolicyId ? "cursor-pointer" : ""}`}
        onClick={() => {
          // ถ้าอยู่ใน modal (showCheckbox = true) → ไม่ทำอะไร
          if (showCheckbox) return;

          // ถ้าไม่ได้อยู่ใน modal และมี rolePolicyId → เลือก ROLE_SYSTEM นี้
          if (!showCheckbox && node.rolePolicyId) {
            setSelectedPolicyId(node.rolePolicyId);

            // หา role ที่ ROLE_SYSTEM นี้สังกัดอยู่
            const roleId = rolesData.find((r) =>
              r.policies.some((p) => p.rolePolicyId === node.rolePolicyId),
            )?.roleId;

            if (roleId) {
              const roleIdStr = roleId;
              // เซ็ต selectedRole
              setSelectedRole(roleIdStr);
              // โหลดข้อมูล policyRows (processes) จากตัวแม่ทันที (กรณีที่ role ไม่เปลี่ยน useEffect จะไม่ trigger)
              if (selectedRole === roleIdStr) {
                loadRoleProcesses(roleIdStr);
              }
            }
          }
        }}
      >
        {showCheckbox && (
          <Checkbox
            
            className="h-4 w-4"
            checked={isChecked(node.id)}
            onChange={(e) => setChecked(node.id, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div
              className={`font-medium text-sm ${
                !showCheckbox && node.rolePolicyId
                  ? `${
                      selectedPolicyId === node.rolePolicyId
                        ? "text-blue-600 font-bold"
                        : "text-gray-800"
                    }`
                  : "text-gray-800"
              }`}
            >
              {node.name}
            </div>

            {node.objectTypeName && (
              <span className="text-[10px] px-2 py-0.5 rounded border bg-white text-gray-700">
                {node.objectTypeName}
              </span>
            )}

            {node.status && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded ${
                  String(node.status).toUpperCase() === "ACTIVE"
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {node.status}
              </span>
            )}

            {!showCheckbox && node.rolePolicyId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePolicy(node, node.name);
                }}
                disabled={isDeleting}
                className="ml-2 w-6 h-6 inline-flex items-center justify-center rounded hover:bg-red-50 text-red-600 disabled:opacity-50"
                title="ลบสิทธิ"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="text-xs text-gray-500 mt-0.5">
            SystemID: {node.id}
          </div>
        </div>
      </div>
    );
  };

  /** ===== open permission modal ===== */
  const openPermissionModal = async (roleId: string) => {
    setSaveMsg("");
    setSelectedRole(roleId);
    setOpenPermModal(true);
    setObjError("");

    // init from existing ROLE_SYSTEM objectId (base set)
    const base = new Set<number>();
    const role = rolesData.find((r) => r.roleId === roleId);
    if (role) {
      for (const policy of role.policies) {
        if (policy.objectId) base.add(policy.objectId);
      }
    }

    // โหลด all objects ถ้ายังไม่มี
    if (allObjects.length === 0) {
      setObjLoading(true);
      try {
        const res = await fetch(`${API_BASE}/iamx/api/role/objects`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`Load objects failed: ${res.status} ${t}`);
        }
        const data: ObjectApiRow[] = await res.json();
        setAllObjects(data || []);
      } catch (err: any) {
        console.error(err);
        setAllObjects([]);
        setObjError(err?.message || "โหลดเมนูไม่สำเร็จ");
      } finally {
        setObjLoading(false);
      }
    }

    // set base first (เดี๋ยว normalize หลัง modalRoots ready)
    setSelectedIds(base);
  };

  /** ✅ ไม่ต้อง normalize ancestors เพราะไม่มี tree */

  /** ===== DELETE ROLE_SYSTEM (แบบ flat ไม่มี children) ===== */
  const deletePolicy = async (node: PermissionTreeNode, objectName: string) => {
    if (!currentRole?.id) return;

    if (!node.rolePolicyId) {
      showError("เกิดข้อผิดพลาด", "ไม่พบ ROLE_SYSTEM ID ที่จะลบ");
      return;
    }

    const policyIds = [node.rolePolicyId];
    const message = `ต้องการลบสิทธิ "${objectName}" ออกจาก Role "${currentRole.name}" ใช่หรือไม่?`;

    const confirmed = await showConfirm("ยืนยันการลบ", message);
    if (!confirmed) return;

    setDeletingPolicyId(policyIds[0]);
    try {
      // API endpoint ยังใช้ path /policies เพื่อความเข้ากันได้ แต่จริงๆ ลบ ROLE_SYSTEM
      // policyIds ตอนนี้คือ roleSystemIds จริงๆ
      const res = await fetch(
        `${API_BASE}/iamx/api/role/${currentRole.id}/policies/batch-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ policyIds }),
        },
      );

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Delete policies failed: ${res.status} ${t}`);
      }

      // Reload data
      await reloadRoles();
    } catch (e: any) {
      console.error(e);
      showError("เกิดข้อผิดพลาด", e?.message || "ลบไม่สำเร็จ");
    } finally {
      setDeletingPolicyId(null);
    }
  };

  /** ===== ADD ROLE HANDLERS ===== */
  const openAddRoleModal = () => {
    setAddRoleName("");
    setAddRoleCode("");
    setAddRoleDesc("");
    setAddRoleStatus("ACTIVE");
    setAddRoleErrors({});
    setOpenAddModal(true);
  };

  const closeAddRoleModal = () => {
    setOpenAddModal(false);
    setAddRoleName("");
    setAddRoleCode("");
    setAddRoleDesc("");
    setAddRoleStatus("ACTIVE");
    setAddRoleErrors({});
  };

  const validateAddRole = () => {
    const errors: { name?: string; code?: string; status?: string } = {};

    if (!addRoleName.trim()) {
      errors.name = "กรุณากรอกชื่อ Role";
    }
    if (!addRoleCode.trim()) {
      errors.code = "กรุณากรอกรหัส Role";
    }
    if (!addRoleStatus) {
      errors.status = "กรุณาเลือกสถานะ";
    }

    setAddRoleErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddRoleSubmit = async () => {
    if (!validateAddRole()) return;

    try {
      const payload = {
        roleName: addRoleName.trim(),
        roleCode: addRoleCode.trim(),
        roleDesc: addRoleDesc.trim(),
        status: addRoleStatus,
        systemId: 300, // TODO: ดึง systemId จาก context หรือ user session
        parentRoleId: null,
      };

      console.log("Add Role payload:", payload);

      const res = await fetch(`${API_BASE}/iamx/api/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "เพิ่ม Role ไม่สำเร็จ");
      }

      // ปิด modal
      closeAddRoleModal();

      // Reload roles
      await reloadRoles();

      showSuccess("เพิ่มสำเร็จ", "เพิ่ม Role สำเร็จ");
    } catch (e: any) {
      console.error(e);
      showError("เกิดข้อผิดพลาด", e?.message || "เพิ่ม Role ไม่สำเร็จ");
    }
  };

  /** ===== SAVE policies to API ===== */
  const savePolicies = async () => {
    if (!currentRole?.id) return;
    const roleId = String(currentRole.id);
    const systemId = currentRole.systemId ?? 0;

    if (!systemId) {
      setSaveMsg("ไม่พบ systemId ของ role นี้");
      return;
    }

    // ส่ง object ที่เลือก
    const objectIds = Array.from(selectedIds);

    setSavingPolicies(true);
    setSaveMsg("");
    try {
      // API endpoint ยังใช้ path /policies เพื่อความเข้ากันได้ แต่จริงๆ บันทึก ROLE_SYSTEM
      const res = await fetch(`${API_BASE}/iamx/api/role/${roleId}/policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          roleId,
          systemId,
          objectIds, // ส่ง systemIds ไปยัง backend (objectIds ตอนนี้คือ systemIds จริงๆ)
          createdBy: "SYSTEM",
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Save policies failed: ${res.status} ${t}`);
      }

      setSaveMsg("บันทึกสิทธิสำเร็จ");

      // ✅ รีโหลดจาก DB ให้ panel ซ้าย/ขวาตรงจริง
      await reloadRoles();
    } catch (e: any) {
      console.error(e);
      setSaveMsg(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSavingPolicies(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        <div className="flex-1 overflow-auto">
          {/* Header */}

          {/* Title */}
          <div className="bg-blue-600 text-white px-6 py-5">
            <h2 className="text-2xl font-bold">
              จัดการบทบาท (Role Management)
            </h2>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={openAddRoleModal}
              className="flex items-center gap-2 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus size={18} />
              เพิ่ม Role
            </button>
            <button className="flex items-center gap-2 px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
              <Download size={18} />
              ปุ่มพิมพ์
            </button>
            <button className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">
              <Download size={18} />
              ส่งออกข้อมูล
            </button>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-6">
              {/* LEFT */}
              <div className="w-1/2 bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      size={18}
                    />
                    <input
                      type="text"
                      placeholder="ค้นหา role"
                      value={roleSearch}
                      onChange={(e) => setRoleSearch(e.target.value)}
                      className="input-minimal w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div className="bg-blue-500 text-white px-4 py-3 flex items-center gap-2">
                  <User size={18} />
                  <span className="font-medium">จัดการ Role</span>
                  <span className="ml-2 px-2 py-0.5 bg-white text-blue-600 rounded text-xs font-bold">
                    {filteredRoles.length} roles
                  </span>
                </div>

                <div className="p-4">
                  {loading && (
                    <div className="text-center text-gray-500 py-10">
                      กำลังโหลดข้อมูล...
                    </div>
                  )}
                  {!loading && filteredRoles.length === 0 && (
                    <div className="text-center text-gray-500 py-10">
                      ไม่พบข้อมูล
                    </div>
                  )}

                  {!loading &&
                    paginatedRoles.map((r) => (
                      <div key={r.id} className="mb-3">
                        <div
                          onClick={() =>
                            setExpandedRoles((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id)) {
                                next.delete(r.id);
                              } else {
                                next.add(r.id);
                              }
                              return next;
                            })
                          }
                          className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition"
                        >
                          {expandedRoles.has(r.id) ? (
                            <ChevronDown size={18} className="text-blue-600" />
                          ) : (
                            <ChevronRight size={18} className="text-gray-600" />
                          )}

                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRole(r.id);
                              setSelectedPolicyId(null); // clear ROLE_SYSTEM selection เมื่อเลือกตัวแม่
                              setExpandedRoles((prev) => {
                                const next = new Set(prev);
                                next.add(r.id);
                                return next;
                              });
                              setPermissionSearch("");
                            }}
                            className={`flex-1 cursor-pointer ${selectedRole === r.id && !selectedPolicyId ? "font-bold text-blue-600" : "text-gray-700"}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-semibold">{r.name}</div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  title="จัดการเมนู/สิทธิ"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPermissionModal(r.id);
                                  }}
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
                                >
                                  <LayoutGrid size={14} />
                                </button>

                                <button
                                  type="button"
                                  title="แก้ไข Role"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRole(r.id);
                                    setEditName(r.name);
                                    setEditDesc(r.desc ?? "");
                                    setOpenEditModal(true);
                                  }}
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-blue-600"
                                >
                                  <Pencil size={14} />
                                </button>

                                <button
                                  type="button"
                                  title="ลบ Role"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRole(r.id);
                                    setOpenDeleteModal(true);
                                  }}
                                  className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-red-50 text-red-600"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              <div className="flex-1" />
                            </div>

                            <div className="text-xs text-gray-500 mt-0.5">
                              roleId: {r.id}
                              {r.systemId != null
                                ? ` • systemId: ${r.systemId}`
                                : ""}
                            </div>

                            {r.desc ? (
                              <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                {r.desc}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {expandedRoles.has(r.id) && (
                          <div className="ml-8 mt-2 rounded-lg border border-gray-200 bg-white p-2">
                            {(() => {
                              const treesForRole =
                                filteredRoleTreesMap.get(r.id) || [];
                              return treesForRole.length === 0 ? (
                                <div className="text-sm text-gray-500 py-3 px-2">
                                  ไม่มี SYSTEM ที่ผูกกับ Role นี้
                                </div>
                              ) : (
                                treesForRole.map((root) => (
                                  <ObjRow key={root.id} node={root} />
                                ))
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                </div>

                {/* Pagination */}
                {!loading && filteredRoles.length > 0 && (
                  <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      แสดง {(currentPage - 1) * itemsPerPage + 1} -{" "}
                      {Math.min(
                        currentPage * itemsPerPage,
                        filteredRoles.length,
                      )}{" "}
                      จาก {filteredRoles.length} รายการ
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        ก่อนหน้า
                      </button>

                      {(() => {
                        // แสดงหน้าแค่บางส่วนถ้ามีเยอะ
                        const maxVisible = 5;
                        const pages: (number | string)[] = [];

                        if (totalPages <= maxVisible + 2) {
                          // แสดงทั้งหมดถ้าน้อย
                          for (let i = 1; i <= totalPages; i++) {
                            pages.push(i);
                          }
                        } else {
                          // แสดงหน้าแรก
                          pages.push(1);

                          // คำนวณ range รอบ current page
                          let start = Math.max(2, currentPage - 1);
                          let end = Math.min(totalPages - 1, currentPage + 1);

                          if (currentPage <= 3) {
                            end = maxVisible - 1;
                          } else if (currentPage >= totalPages - 2) {
                            start = totalPages - (maxVisible - 2);
                          }

                          if (start > 2) pages.push("...");

                          for (let i = start; i <= end; i++) {
                            pages.push(i);
                          }

                          if (end < totalPages - 1) pages.push("...");

                          // แสดงหน้าสุดท้าย
                          pages.push(totalPages);
                        }

                        return pages.map((page, idx) =>
                          typeof page === "number" ? (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-1 rounded border text-sm ${
                                currentPage === page
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span
                              key={`ellipsis-${idx}`}
                              className="px-2 text-gray-500"
                            >
                              ...
                            </span>
                          ),
                        );
                      })()}

                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        ถัดไป
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT */}
              {/* <div className="w-1/2 bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      size={18}
                    />
                    <input
                      type="text"
                      placeholder="ค้นหาสิทธิ (objectName / type)"
                      value={permissionSearch}
                      onChange={(e) => setPermissionSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div className="bg-green-500 text-white px-4 py-3 flex items-center gap-2">
                  <Shield size={18} />
                  <span className="font-medium">สิทธิ (Permission)</span>

                  <span className="ml-2 px-2 py-0.5 bg-white text-green-600 rounded text-xs font-bold">
                    {filteredObjectRoots.length} systems
                  </span>
                </div>

                <div className="px-4 py-3 border-b text-xs text-gray-600">
                  <div>
                    Role:{" "}
                    <span className="font-semibold text-gray-800">
                      {currentRole?.name || "-"}
                    </span>{" "}
                    <span className="text-gray-500">
                      ({selectedRole || "-"})
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  {!selectedRole ? (
                    <div className="text-center text-gray-500 py-10">
                      กรุณาเลือก Role
                    </div>
                  ) : loading ? (
                    <div className="text-center text-gray-500 py-10">
                      กำลังโหลดข้อมูล...
                    </div>
                  ) : filteredObjectRoots.length === 0 ? (
                    <div className="text-center text-gray-500 py-10">
                      ไม่พบสิทธิ (ไม่มี SYSTEM ที่ผูกกับ Role นี้)
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredObjectRoots.map((root) => (
                        <ObjRow key={root.id} node={root}  />
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-4">
                    * ใช้ ROLE เป็นแม่ และแสดง SYSTEM ที่ผูกกับ Role
                    (เปิด/ปิดได้ทุกชั้น)
                  </div>
                </div>
              </div> */}
              <div className="w-1/2 bg-white rounded-lg shadow flex flex-col">
                {/* ===== Header Bar (ปรับให้เหมือนรูป 3: โทนฟ้า) ===== */}
                <div className="bg-blue-600 text-white px-4 py-3 flex items-center gap-2">
                  <Shield size={18} />
                  <span className="font-medium">กำหนดการทำงาน</span>

                  <span className="ml-2 px-2 py-0.5 bg-white text-blue-700 rounded text-xs font-bold">
                    {activePermTab === "process"
                      ? policyRows.filter(
                          (r) =>
                            r._status !== "deleted" &&
                            r.roleSystemId === selectedPolicyId,
                        ).length
                      : permissionTypeRows.filter(
                          (r) => r._status !== "deleted",
                        ).length}{" "}
                    รายการ
                  </span>
                </div>

                {/* ===== Role Info ===== */}
                <div className="px-4 py-3 border-b text-xs text-gray-600">
                  <div>
                    Role:{" "}
                    <span className="font-semibold text-gray-800">
                      {currentRole?.name || "-"}
                    </span>{" "}
                    <span className="text-gray-500">
                      ({selectedRole || "-"})
                    </span>
                  </div>
                  {selectedPolicy && (
                    <div className="mt-1">
                      System:{" "}
                      <span className="font-semibold text-blue-600">
                        {selectedPolicy.objectName || "-"}
                      </span>{" "}
                      <span className="text-gray-500">
                        (SYSTEM_ID: {selectedPolicy.objectId}, type:{" "}
                        {selectedPolicy.objectTypeName})
                      </span>
                    </div>
                  )}
                </div>

                {/* ===== Content ===== */}
                <div className="p-4 flex-1 overflow-auto">
                  {!selectedRole ? (
                    <div className="text-center text-gray-500 py-10">
                      กรุณาเลือก Role
                    </div>
                  ) : !selectedPolicyId ? (
                    <div className="text-center text-gray-500 py-10">
                      กรุณาเลือก SYSTEM
                    </div>
                  ) : loading ? (
                    <div className="text-center text-gray-500 py-10">
                      กำลังโหลดข้อมูล...
                    </div>
                  ) : activePermTab === "permissionType" ? (
                    <>
                      {/* ===== Action Buttons (เหนือตาราง) ===== */}
                      <div className="flex items-center justify-end gap-2 mb-3">
                        <button
                          type="button"
                          className="flex items-center gap-1 px-4 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition"
                          onClick={() => {
                            if (currentRole?.systemId) {
                              loadPermissionOptions(
                                String(currentRole.systemId),
                              );
                            }

                            setPermissionTypeRows((prev) => [
                              ...prev,
                              {
                                id: crypto.randomUUID(),
                                permissionTypeId: String(
                                  currentRole?.systemId || "",
                                ),
                                dataAccessId: "",
                                status: true, // เปิดใช้งานเป็นค่า default
                                condition: "",
                                _status: "new",
                              },
                            ]);
                          }}
                          disabled={!selectedPolicyId || loading}
                        >
                          <Plus size={16} />
                          เพิ่มแถว
                        </button>

                        <button
                          type="button"
                          className="flex items-center gap-1 px-4 py-2 text-sm rounded bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition"
                          disabled={!selectedPolicyId || loading}
                          onClick={async () => {
                            if (!selectedPolicyId) {
                              showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก Policy (ตัวลูก)");
                              return;
                            }

                            try {
                              setLoading(true);

                              // แปลง permissionTypeRows เป็น format ที่ API ต้องการ
                              const rows = permissionTypeRows
                                .filter((r) => r._status !== "deleted")
                                .map((r) => ({
                                  systemId: r.permissionTypeId,
                                  permissionId: r.dataAccessId,
                                }));

                              const payload = {
                                rolePolicyId: selectedPolicyId,
                                rows: rows,
                              };

                              console.log("SAVE permission mapping:", payload);

                              const res = await fetch(
                                `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                                {
                                  method: "PUT",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify(payload),
                                },
                              );

                              const data = await res.json();

                              if (!res.ok || !data.success) {
                                throw new Error(
                                  data.message || "บันทึกไม่สำเร็จ",
                                );
                              }

                              // Reload ข้อมูล
                              const reloadRes = await fetch(
                                `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                              );
                              const reloadData = await reloadRes.json();

                              if (
                                reloadData.rows &&
                                reloadData.rows.length > 0
                              ) {
                                const reloadedRows = reloadData.rows.map(
                                  (item: { permissionId?: string }) => ({
                                    id: crypto.randomUUID(),
                                    permissionTypeId:
                                      currentRole?.systemId?.toString() || "",
                                    dataAccessId: item.permissionId || "",
                                    status: true,
                                    condition: "",
                                    _status: "clean" as const,
                                  }),
                                );

                                setPermissionTypeRows(reloadedRows);
                                setPermissionMappingSaved(true);
                              }

                              showSuccess("บันทึกสำเร็จ", "บันทึกข้อมูลเรียบร้อย");
                            } catch (e: any) {
                              console.error("Save error:", e);
                              showError("เกิดข้อผิดพลาด", e?.message || "บันทึกไม่สำเร็จ");
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          บันทึก
                        </button>
                      </div>

                      {/* ===== Table ===== */}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="cds--data-table cds--data-table--sm w-full text-sm">
                          <thead className="bg-blue-100 text-gray-700">
                            <tr>
                              <th className="w-14 px-3 py-2 text-left border-r">
                                ลำดับ
                              </th>
                              <th className="px-3 py-2 text-left border-r">
                                System
                              </th>
                              <th className="px-3 py-2 text-left border-r">
                                Permission
                              </th>
                              <th className="w-16 px-3 py-2 text-center">ลบ</th>
                            </tr>
                          </thead>

                          <tbody>
                            {permissionTypeRows
                              .filter((r) => r._status !== "deleted")
                              .filter((r) => {
                                const q = permissionSearch.trim().toLowerCase();
                                if (!q) return true;

                                const systemLabel =
                                  systemOptions.find(
                                    (x) => x.value === r.permissionTypeId,
                                  )?.label || "";
                                const permissionLabel =
                                  (
                                    permissionOptionsMap[
                                      r.permissionTypeId || ""
                                    ] || []
                                  ).find((x) => x.value === r.dataAccessId)
                                    ?.label || "";

                                return (
                                  systemLabel.toLowerCase().includes(q) ||
                                  permissionLabel.toLowerCase().includes(q)
                                );
                              })
                              .map((row, idx) => {
                                // ดึง permission options ที่ตรงกับ system ที่เลือก
                                const allDataOptions =
                                  permissionOptionsMap[
                                    row.permissionTypeId || ""
                                  ] || [];

                                // หา permission ที่ถูกเลือกไปแล้วในแถวอื่น
                                const selectedPermissions = new Set(
                                  permissionTypeRows
                                    .filter((r) => r._status !== "deleted")
                                    .filter((r) => r.id !== row.id) // ยกเว้นแถวปัจจุบัน
                                    .filter(
                                      (r) =>
                                        r.permissionTypeId ===
                                        row.permissionTypeId,
                                    ) // เฉพาะ system เดียวกัน
                                    .map((r) => r.dataAccessId)
                                    .filter((id) => id !== ""),
                                );

                                // กรองตัวเลือกที่ยังไม่ถูกเลือก
                                const dataOptions = allDataOptions.filter(
                                  (opt) => !selectedPermissions.has(opt.value),
                                );

                                return (
                                  <tr
                                    key={row.id}
                                    className={`border-t transition-colors ${
                                      row._status === "new"
                                        ? "bg-yellow-50"
                                        : row._status === "clean"
                                          ? "bg-white"
                                          : "bg-gray-50"
                                    } ${
                                      row.systemPermissionId ===
                                      selectedSystemPermissionId
                                        ? "bg-blue-100 border-l-4 border-l-blue-500"
                                        : ""
                                    }`}
                                  >
                                    <td className="px-3 py-2 border-r text-gray-700">
                                      {idx + 1}
                                    </td>

                                    {/* PERMISSION TYPE select (System) */}
                                    <td className="px-3 py-2 border-r">
                                      {row._status === "clean" ? (
                                        <div className="h-10 flex items-center px-3 text-gray-700">
                                          {systemOptions.find(
                                            (x) =>
                                              x.value === row.permissionTypeId,
                                          )?.label || row.permissionTypeId}
                                        </div>
                                      ) : (
                                        <select
                                          className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                          value={row.permissionTypeId}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setPermissionTypeRows((prev) =>
                                              prev.map((p) => {
                                                if (p.id !== row.id) return p;
                                                return {
                                                  ...p,
                                                  permissionTypeId: v,
                                                  dataAccessId: "",
                                                  _status:
                                                    p._status === "new"
                                                      ? "new"
                                                      : "edited",
                                                };
                                              }),
                                            );
                                            // โหลด permission options เมื่อเลือก system
                                            if (v) {
                                              loadPermissionOptions(v);
                                            }
                                          }}
                                        >
                                          <option value="">
                                            -- เลือก System --
                                          </option>
                                          {systemOptions.map((o) => (
                                            <option
                                              key={o.value}
                                              value={o.value}
                                            >
                                              {o.label}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </td>

                                    {/* PERMISSION select (based on system) */}
                                    <td className="px-3 py-2 border-r">
                                      {row._status === "clean" ? (
                                        <div
                                          className={`h-10 flex items-center px-3 rounded transition-colors ${
                                            row.systemPermissionId
                                              ? "text-blue-700 font-medium cursor-pointer hover:bg-blue-50 hover:text-blue-900"
                                              : "text-gray-700"
                                          }`}
                                          title={
                                            row.systemPermissionId
                                              ? "🖱️ คลิกเพื่อดูเมนู"
                                              : ""
                                          }
                                          onClick={(e) => {
                                            if (row.systemPermissionId) {
                                              e.stopPropagation();
                                              console.log(
                                                "✅ Permission cell clicked:",
                                                row.systemPermissionId,
                                                "using roleSystemId:",
                                                selectedPolicyId,
                                              );
                                              setSelectedSystemPermissionId(
                                                row.systemPermissionId,
                                              );
                                              // Use selectedPolicyId (ROLE_SYSTEM_ID)
                                              loadPermissionObjects();
                                            }
                                          }}
                                        >
                                          <span className="flex-1">
                                            {(
                                              permissionOptionsMap[
                                                row.permissionTypeId || ""
                                              ] || []
                                            ).find(
                                              (x) =>
                                                x.value === row.dataAccessId,
                                            )?.label || row.dataAccessId}
                                          </span>
                                          {row.systemPermissionId && (
                                            <ChevronRight
                                              size={16}
                                              className="ml-2 text-blue-500"
                                            />
                                          )}
                                        </div>
                                      ) : (
                                        <select
                                          className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
                                          value={row.dataAccessId}
                                          disabled={!row.permissionTypeId}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setPermissionTypeRows((prev) =>
                                              prev.map((p) => {
                                                if (p.id !== row.id) return p;
                                                return {
                                                  ...p,
                                                  dataAccessId: v,
                                                  _status:
                                                    p._status === "new"
                                                      ? "new"
                                                      : "edited",
                                                };
                                              }),
                                            );
                                          }}
                                        >
                                          <option value="">
                                            {row.permissionTypeId
                                              ? "-- เลือก Permission --"
                                              : "-- กรุณาเลือก System ก่อน --"}
                                          </option>
                                          {dataOptions.map((o) => (
                                            <option
                                              key={o.value}
                                              value={o.value}
                                            >
                                              {o.label}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </td>

                                    {/* DELETE */}
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        type="button"
                                        className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-red-50 text-red-500"
                                        onClick={async (e) => {
                                          e.stopPropagation(); // ป้องกัน event bubbling ไปที่ row
                                          // ถ้า saved แล้ว → ต้องลบจริงใน database
                                          if (permissionMappingSaved) {
                                            const confirmed = await showConfirm("ยืนยันการลบ", "ต้องการลบแถวนี้หรือไม่? (จะลบออกจาก database)");
                                            if (!confirmed) {
                                              return;
                                            }

                                            try {
                                              setLoading(true);

                                              // ลบแถวนี้และบันทึกใหม่
                                              const remainingRows =
                                                permissionTypeRows.filter(
                                                  (p) => p.id !== row.id,
                                                );

                                              if (remainingRows.length === 0) {
                                                // ถ้าลบหมด → ลบ record ใน database
                                                // TODO: เรียก DELETE API
                                                setPermissionTypeRows([]);
                                                setPermissionMappingSaved(
                                                  false,
                                                );
                                                showSuccess("ลบสำเร็จ", "ลบข้อมูลเรียบร้อย");
                                                return;
                                              }

                                              const rows = remainingRows.map(
                                                (r) => ({
                                                  systemId: r.permissionTypeId,
                                                  permissionId: r.dataAccessId,
                                                }),
                                              );

                                              const payload = {
                                                rolePolicyId: selectedPolicyId,
                                                rows: rows,
                                              };

                                              const res = await fetch(
                                                `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                                                {
                                                  method: "PUT",
                                                  headers: {
                                                    "Content-Type":
                                                      "application/json",
                                                  },
                                                  body: JSON.stringify(payload),
                                                },
                                              );

                                              const data = await res.json();

                                              if (!res.ok || !data.success) {
                                                throw new Error(
                                                  data.message || "ลบไม่สำเร็จ",
                                                );
                                              }

                                              // Reload
                                              const reloadRes = await fetch(
                                                `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                                              );
                                              const reloadData =
                                                await reloadRes.json();

                                              if (
                                                reloadData.rows &&
                                                reloadData.rows.length > 0
                                              ) {
                                                const reloadedRows =
                                                  reloadData.rows.map(
                                                    (item: {
                                                      permissionId?: string;
                                                    }) => ({
                                                      id: crypto.randomUUID(),
                                                      permissionTypeId:
                                                        currentRole?.systemId?.toString() ||
                                                        "",
                                                      dataAccessId:
                                                        item.permissionId || "",
                                                      status: true,
                                                      condition: "",
                                                      _status: "clean" as const,
                                                    }),
                                                  );

                                                setPermissionTypeRows(
                                                  reloadedRows,
                                                );
                                              }

                                              showSuccess("ลบสำเร็จ", "ลบข้อมูลเรียบร้อย");
                                            } catch (e: any) {
                                              console.error("Delete error:", e);
                                              showError("เกิดข้อผิดพลาด", e?.message || "ลบไม่สำเร็จ",
                                              );
                                            } finally {
                                              setLoading(false);
                                            }

                                            return;
                                          }

                                          // ถ้ายังไม่ saved → แค่ mark deleted
                                          setPermissionTypeRows((prev) =>
                                            prev.map((p) => {
                                              if (p.id !== row.id) return p;
                                              if (p._status === "new") {
                                                return {
                                                  ...p,
                                                  _status: "deleted",
                                                };
                                              }
                                              return {
                                                ...p,
                                                _status: "deleted",
                                              };
                                            }),
                                          );
                                        }}
                                        title="ลบ"
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}

                            {permissionTypeRows.filter(
                              (r) => r._status !== "deleted",
                            ).length === 0 && (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="text-center text-gray-500 py-10"
                                >
                                  ไม่มีรายการ (กด "+ เพิ่มแถว" เพื่อเพิ่ม)
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* คำอธิบายการใช้งาน */}
                      <div className="mt-2 text-xs text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-white border rounded"></div>
                          <span>= ข้อมูลที่บันทึกแล้ว (คลิกเพื่อดูเมนู)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-yellow-50 border rounded"></div>
                          <span>
                            = ข้อมูลใหม่ (กรุณาบันทึกก่อนจึงจะคลิกดูเมนูได้)
                          </span>
                        </div>
                      </div>

                      {/* Debug Info */}
                      {process.env.NODE_ENV === "development" && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                          <div className="font-semibold mb-1">
                            🐛 Debug Info:
                          </div>
                          <div>
                            Total Rows:{" "}
                            {
                              permissionTypeRows.filter(
                                (r) => r._status !== "deleted",
                              ).length
                            }
                          </div>
                          <div>
                            Rows with systemPermissionId:{" "}
                            {
                              permissionTypeRows.filter(
                                (r) =>
                                  r._status !== "deleted" &&
                                  r.systemPermissionId,
                              ).length
                            }
                          </div>
                          <div>
                            Selected systemPermissionId:{" "}
                            {selectedSystemPermissionId || "None"}
                          </div>
                          <div>
                            Permission Objects Loaded:{" "}
                            {permissionObjects.length}
                          </div>
                        </div>
                      )}

                      {/* ===== Divider / เส้นแบ่ง ===== */}
                      {/* แสดงส่วนล่างเฉพาะเมื่อมี mapping ที่ saved แล้ว */}
                      {false && permissionMappingSaved && (
                        <>
                          <div className="my-6 border-t-2 border-gray-300"></div>

                          {/* ===== ตารางที่ 2: ประเภทสิทธิ์และเงื่อนไข (ย้ายไปอยู่ใต้เมนูแล้ว) ===== */}
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700">
                              กำหนดประเภทสิทธิ์และเงื่อนไข
                            </h3>

                            {/* กรองประเภทสิทธิ์ */}
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-600 font-medium">
                                กรองตามประเภทสิทธิ์:
                              </label>
                              <select
                                className="h-9 rounded-md border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                value={selectedPermissionTypeFilter}
                                onChange={(e) =>
                                  setSelectedPermissionTypeFilter(
                                    e.target.value,
                                  )
                                }
                              >
                                <option value="">ทั้งหมด</option>
                                {(() => {
                                  // ดึงประเภทสิทธิ์ที่ไม่ซ้ำกัน
                                  const uniqueTypes = Array.from(
                                    new Set(
                                      accessTypesData
                                        .map((item) => item.permissionType)
                                        .filter((type) => type),
                                    ),
                                  ).sort();
                                  return uniqueTypes.map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ));
                                })()}
                              </select>
                            </div>
                          </div>

                          <div className="border rounded-lg overflow-hidden">
                            <table className="cds--data-table cds--data-table--sm w-full text-sm">
                              <thead className="bg-blue-100 text-gray-700">
                                <tr>
                                  <th className="w-14 px-3 py-2 text-left border-r">
                                    ลำดับ
                                  </th>
                                  <th className="px-3 py-2 text-left border-r">
                                    ประเภทสิทธิ์
                                  </th>
                                  <th className="px-3 py-2 text-left border-r">
                                    ชื่อสิทธิในการเข้าถึง
                                  </th>
                                  <th className="w-32 px-3 py-2 text-center border-r">
                                    สถานะ
                                  </th>
                                  <th className="px-3 py-2 text-left border-r">
                                    เงื่อนไข
                                  </th>
                                  <th className="w-24 px-3 py-2 text-center">
                                    การจัดการ
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {accessTypesData
                                  .filter((item) => {
                                    // ✅ ซ่อนแถวที่บันทึกแล้ว
                                    if (
                                      savedAccessTypeIds.has(item.accessTypeId)
                                    )
                                      return false;

                                    // กรองตามประเภทสิทธิ์
                                    if (selectedPermissionTypeFilter === "")
                                      return true;
                                    return (
                                      item.permissionType ===
                                      selectedPermissionTypeFilter
                                    );
                                  })
                                  .map((item, idx) => {
                                    return (
                                      <tr
                                        key={item.accessTypeId}
                                        className="border-t"
                                      >
                                        <td className="px-3 py-2 border-r text-gray-700">
                                          {idx + 1}
                                        </td>

                                        {/* ประเภทสิทธิ์ (read-only) */}
                                        <td className="px-3 py-2 border-r text-gray-700">
                                          {item.permissionType || "-"}
                                        </td>

                                        {/* ชื่อสิทธิในการเข้าถึง (read-only) + Description */}
                                        <td className="px-3 py-2 border-r">
                                          <div>
                                            <div className="text-gray-800 font-medium">
                                              {item.accessTypeName || "-"}
                                            </div>
                                            {item.description && (
                                              <div className="text-xs text-gray-500 mt-0.5">
                                                {item.description}
                                              </div>
                                            )}
                                          </div>
                                        </td>

                                        {/* สถานะ (checkbox) */}
                                        <td className="px-3 py-2 border-r text-center">
                                          <label
                                            className={`inline-flex items-center cursor-pointer px-3 py-2 rounded-lg transition-colors ${
                                              accessTypeStatus[
                                                item.accessTypeId
                                              ]
                                                ? "bg-green-100 hover:bg-green-200"
                                                : "bg-gray-100 hover:bg-gray-200"
                                            }`}
                                          >
                                            <Checkbox
                                              
                                              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500"
                                              checked={
                                                accessTypeStatus[
                                                  item.accessTypeId
                                                ] ?? false
                                              }
                                              onChange={(e) => {
                                                const checked =
                                                  e.target.checked;
                                                setAccessTypeStatus((prev) => ({
                                                  ...prev,
                                                  [item.accessTypeId]: checked,
                                                }));
                                              }}
                                            />
                                            <span
                                              className={`ml-2 text-xs font-semibold ${
                                                accessTypeStatus[
                                                  item.accessTypeId
                                                ]
                                                  ? "text-green-700"
                                                  : "text-gray-600"
                                              }`}
                                            >
                                              {accessTypeStatus[
                                                item.accessTypeId
                                              ]
                                                ? "เปิดใช้งาน"
                                                : "ปิดการใช้งาน"}
                                            </span>
                                          </label>
                                        </td>

                                        {/* เงื่อนไข (editable) */}
                                        <td className="px-3 py-2 border-r">
                                          <input
                                            type="text"
                                            className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                                            placeholder="ระบุเงื่อนไข (ถ้ามี)"
                                            defaultValue=""
                                          />
                                        </td>

                                        {/* ปุ่ม Save */}
                                        <td className="px-3 py-2 text-center">
                                          <button
                                            onClick={async () => {
                                              if (!selectedPolicyId) return;

                                              const isChecked =
                                                accessTypeStatus[
                                                  item.accessTypeId
                                                ] ?? false;

                                              if (!isChecked) {
                                                showError("ข้อมูลไม่ครบถ้วน", "กรุณาเปิดใช้งานสถานะก่อนบันทึก");
                                                return;
                                              }

                                              // TODO: เรียก API บันทึก permission
                                              // POST /iamx/api/role-policy/{policyId}/permissions
                                              // body: { rows: [{ permissionId: item.accessTypeId }] }

                                              const confirmed = await showConfirm(
                                                "ยืนยันการบันทึก",
                                                `ยืนยันการบันทึก "${item.accessTypeName}"?`,
                                              );
                                              if (!confirmed) return;

                                              try {
                                                const res = await fetch(
                                                  `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                                                  {
                                                    method: "PUT",
                                                    headers: {
                                                      "Content-Type":
                                                        "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                      rolePolicyId:
                                                        selectedPolicyId,
                                                      rows: [
                                                        {
                                                          permissionId: String(
                                                            item.accessTypeId,
                                                          ),
                                                        },
                                                      ],
                                                    }),
                                                  },
                                                );

                                                if (!res.ok) {
                                                  const errData =
                                                    await res.json();
                                                  throw new Error(
                                                    errData.message ||
                                                      "บันทึกล้มเหลว",
                                                  );
                                                }

                                                showSuccess("บันทึกสำเร็จ", "บันทึกข้อมูลเรียบร้อย");

                                                // ✅ เพิ่ม ID เข้า savedAccessTypeIds เพื่อซ่อนแถว
                                                setSavedAccessTypeIds(
                                                  (prev) => {
                                                    const newSet = new Set(
                                                      prev,
                                                    );
                                                    newSet.add(
                                                      item.accessTypeId,
                                                    );
                                                    return newSet;
                                                  },
                                                );
                                              } catch (err: any) {
                                                showError("เกิดข้อผิดพลาด", err.message);
                                              }
                                            }}
                                            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                                          >
                                            บันทึก
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}

                                {(() => {
                                  const filteredData = accessTypesData.filter(
                                    (item) => {
                                      // ✅ ซ่อนแถวที่บันทึกแล้ว
                                      if (
                                        savedAccessTypeIds.has(
                                          item.accessTypeId,
                                        )
                                      )
                                        return false;

                                      if (selectedPermissionTypeFilter === "")
                                        return true;
                                      return (
                                        item.permissionType ===
                                        selectedPermissionTypeFilter
                                      );
                                    },
                                  );

                                  if (filteredData.length === 0) {
                                    return (
                                      <tr>
                                        <td
                                          colSpan={6}
                                          className="text-center text-gray-500 py-10"
                                        >
                                          {accessTypesData.length === 0
                                            ? "ไม่พบข้อมูลประเภทสิทธิ์"
                                            : accessTypesData.every((item) =>
                                                  savedAccessTypeIds.has(
                                                    item.accessTypeId,
                                                  ),
                                                )
                                              ? "บันทึกครบทุกรายการแล้ว"
                                              : "ไม่พบข้อมูลที่ตรงกับการกรอง"}
                                        </td>
                                      </tr>
                                    );
                                  }
                                  return null;
                                })()}
                              </tbody>
                            </table>
                          </div>

                          {/* ===== Footer Hint ===== */}
                          <div className="text-xs text-gray-400 mt-4">
                            * ใช้ ROLE เป็นแม่ และ ROLE_SYSTEM เป็นลูก โดย
                            "ประเภทสิทธิ์/การเข้าถึงข้อมูล" เป็น select
                            และบันทึกแยกจากกระบวนการทำงาน
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {/* ===== Action Buttons (เหนือตาราง) ===== */}
                      <div className="bg-sky-600 text-white px-4 py-3 flex items-center gap-2">
                        <span className="font-medium">กำหนดการทำงาน</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 mb-4 rounded-xl border bg-white px-4 py-3 shadow-sm">
                        {/* 🔍 Search */}

                        <div className="relative w-full max-w-md">
                          <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={18}
                          />
                          <input
                            type="text"
                            placeholder="ค้นหา (กระบวนการหลัก / รอง)"
                            value={permissionSearch}
                            onChange={(e) =>
                              setPermissionSearch(e.target.value)
                            }
                            className="
        w-full pl-10 pr-4 py-2
        border border-gray-300 rounded-lg
        text-sm
        focus:outline-none focus:ring-2 focus:ring-blue-500
      "
                          />
                        </div>

                        {/* 👉 Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={!selectedPolicyId}
                            onClick={() => {
                              if (!selectedPolicyId) return;
                              setPolicyRows((prev) => [
                                ...prev,
                                {
                                  id: crypto.randomUUID(),
                                  roleSystemId: selectedPolicyId,
                                  mainProcessId: "",
                                  subProcessId: "",
                                  _status: "new",
                                },
                              ]);
                            }}
                            className="
        flex items-center gap-1
        px-4 py-2 text-sm font-medium
        rounded-lg
        bg-blue-500 text-white
        hover:bg-blue-600
        disabled:opacity-40 disabled:cursor-not-allowed
        transition
      "
                          >
                            <Plus size={16} />
                            เพิ่มแถว
                          </button>

                          <button
                            type="button"
                            disabled={!selectedPolicyId || loading}
                            onClick={async () => {
                              if (!selectedPolicyId) {
                                showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก System");
                                return;
                              }

                              try {
                                setLoading(true);

                                const rows = policyRows
                                  .filter((r) => r._status !== "deleted")
                                  .filter(
                                    (r) => r.roleSystemId === selectedPolicyId,
                                  )
                                  .map((r) => ({
                                    processId: r.mainProcessId,
                                    subprocessId: r.subProcessId,
                                  }));

                                const payload = {
                                  roleSystemId: selectedPolicyId,
                                  rows,
                                };

                                console.log("SAVE role processes:", payload);

                                const res = await fetch(
                                  `${API_BASE}/iamx/api/role/${selectedRole}/processes`,
                                  {
                                    method: "PUT",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify(payload),
                                  },
                                );

                                const data = await res.json();
                                if (!res.ok || !data.success) {
                                  throw new Error(
                                    data.message || "บันทึกไม่สำเร็จ",
                                  );
                                }

                                setPolicyRows((prev) =>
                                  prev
                                    .filter((r) => r._status !== "deleted")
                                    .map((r) =>
                                      r.roleSystemId === selectedPolicyId
                                        ? { ...r, _status: "clean" as const }
                                        : r,
                                    ),
                                );

                                showSuccess("บันทึกสำเร็จ", "บันทึกข้อมูลเรียบร้อย");
                              } catch (e: any) {
                                showError("เกิดข้อผิดพลาด", e?.message || "บันทึกไม่สำเร็จ");
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="
        flex items-center gap-1
        px-4 py-2 text-sm font-medium
        rounded-lg
        bg-green-500 text-white
        hover:bg-green-600
        disabled:opacity-40 disabled:cursor-not-allowed
        transition
      "
                          >
                            {loading ? "กำลังบันทึก..." : "บันทึก"}
                          </button>
                        </div>
                      </div>

                      {/* ===== Table ===== */}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="cds--data-table cds--data-table--sm w-full text-sm">
                          <thead className="bg-blue-100 text-gray-700">
                            <tr>
                              <th className="w-14 px-3 py-2 text-left border-r">
                                ลำดับ
                              </th>
                              <th className="px-3 py-2 text-left border-r">
                                การทำงานหลัก
                              </th>
                              <th className="px-3 py-2 text-left border-r">
                                การทำงานรอง
                              </th>
                              <th className="w-16 px-3 py-2 text-center">ลบ</th>
                            </tr>
                          </thead>

                          <tbody>
                            {policyRows
                              .filter((r) => r._status !== "deleted")
                              .filter(
                                (r) => r.roleSystemId === selectedPolicyId,
                              )
                              .filter((r) => {
                                const q = permissionSearch.trim().toLowerCase();
                                if (!q) return true;

                                const mainLabel =
                                  mainProcessOptions.find(
                                    (x) => x.value === r.mainProcessId,
                                  )?.label || "";
                                const subLabel =
                                  (
                                    subProcessOptionsMap[r.mainProcessId] || []
                                  ).find((x) => x.value === r.subProcessId)
                                    ?.label || "";

                                return (
                                  mainLabel.toLowerCase().includes(q) ||
                                  subLabel.toLowerCase().includes(q)
                                );
                              })
                              .map((row, idx) => {
                                // ดึง sub process options จาก map
                                const subOptions =
                                  subProcessOptionsMap[row.mainProcessId] || [];

                                return (
                                  <tr key={row.id} className="border-t">
                                    <td className="px-3 py-2 border-r text-gray-700">
                                      {idx + 1}
                                    </td>

                                    {/* MAIN select */}
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                        value={row.mainProcessId}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setPolicyRows((prev) =>
                                            prev.map((p) => {
                                              if (p.id !== row.id) return p;
                                              return {
                                                ...p,
                                                mainProcessId: v,
                                                subProcessId: "", // reset ลูก
                                                _status:
                                                  p._status === "new"
                                                    ? "new"
                                                    : "edited",
                                              };
                                            }),
                                          );
                                          // โหลด sub process options สำหรับ main process ที่เลือก
                                          if (v) {
                                            loadSubProcessOptions(v);
                                          }
                                        }}
                                      >
                                        <option value="">
                                          -- เลือกการทำงานหลัก --
                                        </option>
                                        {mainProcessOptions.map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                    </td>

                                    {/* SUB select */}
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
                                        value={row.subProcessId}
                                        disabled={!row.mainProcessId}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setPolicyRows((prev) =>
                                            prev.map((p) => {
                                              if (p.id !== row.id) return p;
                                              return {
                                                ...p,
                                                subProcessId: v,
                                                _status:
                                                  p._status === "new"
                                                    ? "new"
                                                    : "edited",
                                              };
                                            }),
                                          );
                                        }}
                                      >
                                        <option value="">
                                          {row.mainProcessId
                                            ? "-- เลือกการทำงานรอง --"
                                            : "-- กรุณาเลือกการทำงานหลักก่อน --"}
                                        </option>
                                        {subOptions.map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                    </td>

                                    {/* DELETE */}
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        type="button"
                                        className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-red-50 text-red-500"
                                        onClick={() => {
                                          setPolicyRows((prev) =>
                                            prev.map((p) => {
                                              if (p.id !== row.id) return p;
                                              // ถ้าเป็น new แล้วลบทิ้งเลยก็ได้
                                              if (p._status === "new") {
                                                return {
                                                  ...p,
                                                  _status: "deleted",
                                                };
                                              }
                                              return {
                                                ...p,
                                                _status: "deleted",
                                              };
                                            }),
                                          );
                                        }}
                                        title="ลบ"
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}

                            {policyRows.filter(
                              (r) =>
                                r._status !== "deleted" &&
                                r.roleSystemId === selectedPolicyId,
                            ).length === 0 && (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="text-center text-gray-500 py-10"
                                >
                                  ไม่มีรายการ (กด "+ เพิ่มแถว" เพื่อเพิ่ม)
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* ===== Footer Hint ===== */}
                      <div className="text-xs text-gray-400 mt-4">
                        * ใช้ ROLE เป็นแม่ และ ROLE_SYSTEM เป็นลูก โดย
                        "กระบวนการทำงานหลัก/รอง" เป็น select และบันทึกแบบ
                        create/update/delete
                      </div>

                      {/* ===== Divider / เส้นแบ่ง ===== */}
                      {/* แสดงส่วนล่างเมื่อเลือก system แล้ว */}
                      {selectedPolicyId && (
                        <>
                          <div className="my-6 border-t-2 border-gray-300"></div>

                          {/* ===== ตารางจับคู่ System กับ Permission ===== */}

                          {/* Search Input */}
                          <div className="relative mb-3"></div>
                          <div className="bg-sky-600 text-white px-4 py-3 flex items-center gap-2">
                            <span className="font-medium">ประเภทสิทธิ</span>
                          </div>

                          {/* Action Buttons */}
                          <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                            {/* 🔍 Search */}
                            <div className="relative w-full sm:max-w-md">
                              <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                size={18}
                              />
                              <input
                                type="text"
                                placeholder="ค้นหา Permission"
                                value={permissionSearch}
                                onChange={(e) =>
                                  setPermissionSearch(e.target.value)
                                }
                                className="
        w-full
        rounded-lg border border-gray-300
        py-2 pl-10 pr-4 text-sm
        focus:outline-none focus:ring-2 focus:ring-blue-500
      "
                              />
                            </div>

                            {/* 👉 Actions */}
                            <div className="flex items-center justify-end gap-2 sm:justify-start">
                              <button
                                type="button"
                                disabled={!selectedPolicyId || loading}
                                onClick={() => {
                                  if (currentRole?.systemId) {
                                    loadPermissionOptions(
                                      String(currentRole.systemId),
                                    );
                                  }

                                  setPermissionTypeRows((prev) => [
                                    ...prev,
                                    {
                                      id: crypto.randomUUID(),
                                      permissionTypeId: String(
                                        currentRole?.systemId || "",
                                      ),
                                      dataAccessId: "",
                                      status: true,
                                      condition: "",
                                      _status: "new",
                                    },
                                  ]);
                                }}
                                className="
        inline-flex items-center gap-1
        rounded-lg bg-blue-500 px-4 py-2
        text-sm font-medium text-white
        hover:bg-blue-600
        disabled:cursor-not-allowed disabled:opacity-40
        transition
      "
                              >
                                <Plus size={16} />
                                เพิ่มแถว
                              </button>

                              <button
                                type="button"
                                disabled={!selectedPolicyId || loading}
                                onClick={async () => {
                                  if (!selectedPolicyId) {
                                    showError("ข้อมูลไม่ครบถ้วน", "กรุณาเลือก Policy (ตัวลูก)");
                                    return;
                                  }
                                  if (!currentRole?.systemId) {
                                    showError("เกิดข้อผิดพลาด", "ไม่พบ systemId ของ Role");
                                    return;
                                  }

                                  try {
                                    setLoading(true);

                                    const rows = permissionTypeRows
                                      .filter((r) => r._status !== "deleted")
                                      .map((r) => ({
                                        permissionId: r.dataAccessId,
                                      }));

                                    const payload = {
                                      rolePolicyId: selectedPolicyId,
                                      rows,
                                    };

                                    const res = await fetch(
                                      `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                                      {
                                        method: "PUT",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify(payload),
                                      },
                                    );

                                    const data = await res.json();
                                    if (!res.ok || !data.success)
                                      throw new Error(
                                        data.message || "บันทึกไม่สำเร็จ",
                                      );

                                    const reloadRes = await fetch(
                                      `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                                    );
                                    const reloadData = await reloadRes.json();

                                    if (
                                      reloadData.rows &&
                                      reloadData.rows.length > 0
                                    ) {
                                      setPermissionTypeRows(
                                        reloadData.rows.map(
                                          (item: {
                                            permissionId?: string;
                                          }) => ({
                                            id: crypto.randomUUID(),
                                            permissionTypeId:
                                              currentRole?.systemId?.toString() ||
                                              "",
                                            dataAccessId:
                                              item.permissionId || "",
                                            status: true,
                                            condition: "",
                                            _status: "clean" as const,
                                          }),
                                        ),
                                      );
                                      setPermissionMappingSaved(true);
                                    }

                                    showSuccess("บันทึกสำเร็จ", "บันทึกข้อมูลเรียบร้อย");
                                  } catch (e: any) {
                                    console.error("Save error:", e);
                                    showError("เกิดข้อผิดพลาด", e?.message || "บันทึกไม่สำเร็จ");
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                className="
        inline-flex items-center gap-2
        rounded-lg bg-green-500 px-4 py-2
        text-sm font-medium text-white
        hover:bg-green-600
        disabled:cursor-not-allowed disabled:opacity-40
        transition
      "
                              >
                                {loading && (
                                  <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
                                )}
                                {loading ? "กำลังบันทึก..." : "บันทึก"}
                              </button>

                              {/* {permissionMappingSaved && (
                                <span className="ml-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                  บันทึกแล้ว
                                </span>
                              )} */}
                            </div>
                          </div>

                          {/* Table */}
                          <div className="border rounded-lg overflow-hidden">
                            <table className="cds--data-table cds--data-table--sm w-full text-sm">
                              <thead className="bg-blue-100 text-gray-700">
                                <tr>
                                  <th className="w-14 px-3 py-2 text-left border-r">
                                    ลำดับ
                                  </th>
                                  <th className="px-3 py-2 text-left border-r">
                                    Permission
                                  </th>
                                  <th className="w-16 px-3 py-2 text-center">
                                    ลบ
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {permissionTypeRows
                                  .filter((r) => r._status !== "deleted")
                                  .filter((r) => {
                                    const q = permissionSearch
                                      .trim()
                                      .toLowerCase();
                                    if (!q) return true;

                                    const permissionLabel =
                                      (
                                        permissionOptionsMap[
                                          String(currentRole?.systemId || "")
                                        ] || []
                                      ).find((x) => x.value === r.dataAccessId)
                                        ?.label || "";

                                    return permissionLabel
                                      .toLowerCase()
                                      .includes(q);
                                  })
                                  .map((row, idx) => {
                                    const systemId = String(
                                      currentRole?.systemId || "",
                                    );
                                    const allDataOptions =
                                      permissionOptionsMap[systemId] || [];

                                    const selectedPermissions = new Set(
                                      permissionTypeRows
                                        .filter((r) => r._status !== "deleted")
                                        .filter((r) => r.id !== row.id)
                                        .map((r) => r.dataAccessId)
                                        .filter((id) => id !== ""),
                                    );

                                    const dataOptions = allDataOptions.filter(
                                      (opt) =>
                                        !selectedPermissions.has(opt.value),
                                    );

                                    return (
                                      <tr
                                        key={row.id}
                                        className={`border-t transition-colors ${
                                          row._status === "clean" &&
                                          row.systemPermissionId
                                            ? "cursor-pointer hover:bg-blue-50 hover:shadow-sm bg-white"
                                            : row._status === "new"
                                              ? "bg-yellow-50"
                                              : "bg-gray-50"
                                        } ${
                                          row.systemPermissionId ===
                                          selectedSystemPermissionId
                                            ? "bg-blue-100 border-l-4 border-l-blue-500"
                                            : ""
                                        }`}
                                        title={
                                          row._status === "clean" &&
                                          row.systemPermissionId
                                            ? "🖱️ คลิกเพื่อดูเมนู (Menu Hierarchy)"
                                            : row._status === "new"
                                              ? "บันทึกก่อนเพื่อดูเมนู"
                                              : ""
                                        }
                                        onClick={() => {
                                          if (
                                            row._status === "clean" &&
                                            row.systemPermissionId
                                          ) {
                                            console.log(
                                              "✅ Loading permission objects for systemPermissionId:",
                                              row.systemPermissionId,
                                              "using roleSystemId:",
                                              selectedPolicyId,
                                            );
                                            setSelectedSystemPermissionId(
                                              row.systemPermissionId,
                                            );
                                            // Use selectedPolicyId (ROLE_SYSTEM_ID)
                                            loadPermissionObjects();
                                          }
                                        }}
                                      >
                                        <td className="px-3 py-2 border-r text-gray-700">
                                          {idx + 1}
                                        </td>

                                        <td className="px-3 py-2 border-r">
                                          {row._status === "clean" ? (
                                            <div
                                              className={`h-10 flex items-center px-3 rounded transition-colors ${
                                                row.systemPermissionId
                                                  ? "text-blue-700 font-medium cursor-pointer hover:bg-blue-50 hover:text-blue-900 border-l-2 border-l-blue-400"
                                                  : "text-gray-700"
                                              }`}
                                              title={
                                                row.systemPermissionId
                                                  ? `🖱️ คลิกเพื่อดูเมนู (ID: ${row.systemPermissionId})`
                                                  : "⚠️ ไม่มี systemPermissionId - บันทึกข้อมูลก่อน"
                                              }
                                              onClick={(e) => {
                                                console.log(
                                                  "🖱️ Modal Permission Cell clicked:",
                                                  {
                                                    hasId:
                                                      !!row.systemPermissionId,
                                                    id: row.systemPermissionId,
                                                    status: row._status,
                                                    permissionTypeId:
                                                      row.permissionTypeId,
                                                    dataAccessId:
                                                      row.dataAccessId,
                                                    roleSystemId:
                                                      selectedPolicyId,
                                                  },
                                                );
                                                if (row.systemPermissionId) {
                                                  e.stopPropagation();
                                                  console.log(
                                                    "✅ Permission cell clicked - Loading objects using roleSystemId:",
                                                    selectedPolicyId,
                                                  );
                                                  setSelectedSystemPermissionId(
                                                    row.systemPermissionId,
                                                  );
                                                  // Use selectedPolicyId (ROLE_SYSTEM_ID)
                                                  loadPermissionObjects();
                                                } else {
                                                  console.warn(
                                                    "❌ No systemPermissionId in row:",
                                                    row,
                                                  );
                                                }
                                              }}
                                            >
                                              <span className="flex-1">
                                                {(
                                                  permissionOptionsMap[
                                                    systemId
                                                  ] || []
                                                ).find(
                                                  (x) =>
                                                    x.value ===
                                                    row.dataAccessId,
                                                )?.label || row.dataAccessId}
                                              </span>
                                              {row.systemPermissionId && (
                                                <ChevronRight
                                                  size={16}
                                                  className="ml-2 text-blue-500"
                                                />
                                              )}
                                            </div>
                                          ) : (
                                            <select
                                              className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                              value={row.dataAccessId}
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                              onChange={(e) => {
                                                const v = e.target.value;
                                                setPermissionTypeRows((prev) =>
                                                  prev.map((p) => {
                                                    if (p.id !== row.id)
                                                      return p;
                                                    return {
                                                      ...p,
                                                      dataAccessId: v,
                                                      _status:
                                                        p._status === "new"
                                                          ? "new"
                                                          : "edited",
                                                    };
                                                  }),
                                                );
                                              }}
                                            >
                                              <option value="">
                                                -- เลือก Permission --
                                              </option>
                                              {dataOptions.map((o) => (
                                                <option
                                                  key={o.value}
                                                  value={o.value}
                                                >
                                                  {o.label}
                                                </option>
                                              ))}
                                            </select>
                                          )}
                                        </td>

                                        <td className="px-3 py-2 text-center">
                                          <button
                                            type="button"
                                            className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-red-50 text-red-500"
                                            onClick={async () => {
                                              if (permissionMappingSaved) {
                                                const confirmed = await showConfirm("ยืนยันการลบ", "ต้องการลบแถวนี้หรือไม่? (จะลบออกจาก database)");
                                                if (!confirmed) {
                                                  return;
                                                }

                                                try {
                                                  setLoading(true);

                                                  const remainingRows =
                                                    permissionTypeRows.filter(
                                                      (p) => p.id !== row.id,
                                                    );

                                                  if (
                                                    remainingRows.length === 0
                                                  ) {
                                                    setPermissionTypeRows([]);
                                                    setPermissionMappingSaved(
                                                      false,
                                                    );
                                                    showSuccess("ลบสำเร็จ", "ลบข้อมูลเรียบร้อย");
                                                    return;
                                                  }

                                                  const rows =
                                                    remainingRows.map((r) => ({
                                                      permissionId:
                                                        r.dataAccessId,
                                                    }));

                                                  const payload = {
                                                    rolePolicyId:
                                                      selectedPolicyId,
                                                    rows: rows,
                                                  };

                                                  const res = await fetch(
                                                    `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                                                    {
                                                      method: "PUT",
                                                      headers: {
                                                        "Content-Type":
                                                          "application/json",
                                                      },
                                                      body: JSON.stringify(
                                                        payload,
                                                      ),
                                                    },
                                                  );

                                                  const data = await res.json();

                                                  if (
                                                    !res.ok ||
                                                    !data.success
                                                  ) {
                                                    throw new Error(
                                                      data.message ||
                                                        "ลบไม่สำเร็จ",
                                                    );
                                                  }

                                                  const reloadRes = await fetch(
                                                    `${API_BASE}/iamx/api/role-policy/${selectedPolicyId}/permissions`,
                                                  );
                                                  const reloadData =
                                                    await reloadRes.json();

                                                  if (
                                                    reloadData.rows &&
                                                    reloadData.rows.length > 0
                                                  ) {
                                                    const reloadedRows =
                                                      reloadData.rows.map(
                                                        (item: {
                                                          permissionId?: string;
                                                        }) => ({
                                                          id: crypto.randomUUID(),
                                                          permissionTypeId:
                                                            currentRole?.systemId?.toString() ||
                                                            "",
                                                          dataAccessId:
                                                            item.permissionId ||
                                                            "",
                                                          status: true,
                                                          condition: "",
                                                          _status:
                                                            "clean" as const,
                                                        }),
                                                      );

                                                    setPermissionTypeRows(
                                                      reloadedRows,
                                                    );
                                                  }

                                                  showSuccess("ลบสำเร็จ", "ลบข้อมูลเรียบร้อย");
                                                } catch (e: any) {
                                                  console.error(
                                                    "Delete error:",
                                                    e,
                                                  );
                                                  showError("เกิดข้อผิดพลาด", e?.message || "ลบไม่สำเร็จ");
                                                } finally {
                                                  setLoading(false);
                                                }

                                                return;
                                              }

                                              setPermissionTypeRows((prev) =>
                                                prev.map((p) => {
                                                  if (p.id !== row.id) return p;
                                                  if (p._status === "new") {
                                                    return {
                                                      ...p,
                                                      _status: "deleted",
                                                    };
                                                  }
                                                  return {
                                                    ...p,
                                                    _status: "deleted",
                                                  };
                                                }),
                                              );
                                            }}
                                            title="ลบ"
                                          >
                                            <Trash2 size={18} />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}

                                {permissionTypeRows.filter(
                                  (r) => r._status !== "deleted",
                                ).length === 0 && (
                                  <tr>
                                    <td
                                      colSpan={3}
                                      className="text-center text-gray-500 py-10"
                                    >
                                      ไม่มีรายการ (กด "+ เพิ่มแถว" เพื่อเพิ่ม)
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* ===== แสดงเมนูเป็น Nested Structure (แม่-ลูก) ===== */}
                  {showPermissionObjects && selectedSystemPermissionId ? (
                    <>
                      <div className="my-6 border-t-2 border-gray-300"></div>
                      <div className="relative mb-3"></div>
                      <div className="border rounded-lg overflow-hidden bg-white shadow">
                        {/* Header */}
                        <div className="bg-sky-600 text-white px-4 py-3 flex items-center gap-2">
                          <span className="font-medium">เมนู</span>
                          <button
                            type="button"
                            onClick={() => setShowPermissionObjects(false)}
                            className="ml-auto text-white hover:bg-white/20 rounded p-1"
                            title="ปิด"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 bg-gray-50">
                          {loadingPermissionObjects ? (
                            <div className="text-center text-gray-500 py-8">
                              <div className="animate-pulse">
                                กำลังโหลดข้อมูล...
                              </div>
                              <div className="text-xs mt-2">
                                Loading from:
                                /iamx/api/role/permission-objects/
                                {selectedPolicyId}
                              </div>
                            </div>
                          ) : permissionObjectsGrouped.length === 0 ? (
                            <div className="text-center text-gray-500 py-8">
                              <div>ไม่มีข้อมูลเมนู</div>
                              <div className="text-xs mt-2 text-red-500">
                                ✓ API called successfully but returned 0
                                permissions
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {permissionObjectsGrouped.map(
                                (permGroup, idx) => (
                                  <div
                                    key={permGroup.systemPermissionId || idx}
                                    className="border rounded-lg overflow-hidden bg-white"
                                  >
                                    {/* Permission Header (แม่) */}
                                    <div className="bg-blue-50 px-4 py-2 border-b">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <div className="font-semibold text-sm text-blue-900">
                                              {permGroup.permissionName ||
                                                "Unknown Permission"}
                                            </div>
                                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                              {permGroup.objects?.length || 0}{" "}
                                              เมนู
                                            </span>
                                          </div>
                                          {permGroup.systemPermissionId && (
                                            <div className="text-xs text-gray-500 mt-1">
                                              ID: {permGroup.systemPermissionId}
                                            </div>
                                          )}
                                        </div>
                                        {/* ไอคอนจัดการเมนู */}
                                        <button
                                          type="button"
                                          title="จัดการเมนูของ Permission นี้"
                                          onClick={async () => {
                                            setSelectedPermissionGroup(
                                              permGroup,
                                            );
                                            // ✅ Set selected menu IDs จากข้อมูลปัจจุบัน
                                            const currentIds = new Set<number>();
                                            (permGroup.objects || []).forEach(
                                              (obj) => {
                                                if (obj.objectId) {
                                                  currentIds.add(obj.objectId);
                                                }
                                              },
                                            );
                                            setSelectedMenuIds(currentIds);
                                            // ✅ โหลดเมนูทั้งหมดจาก API
                                            setOpenPermissionObjectModal(true);
                                            await loadAvailableMenus();
                                          }}
                                          className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-blue-200 bg-white hover:bg-blue-50 text-blue-600"
                                        >
                                          <LayoutGrid size={14} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Objects List (ลูก) */}
                                    <div className="divide-y">
                                      {permGroup.objects &&
                                      permGroup.objects.length > 0 ? (
                                        permGroup.objects.map((obj, objIdx) => {
                                          const isSelected =
                                            selectedObjectId === obj.objectId;
                                          return (
                                            <div
                                              key={
                                                obj.permissionObjectId ||
                                                `${idx}-${objIdx}`
                                              }
                                              className={`px-4 py-2 hover:bg-blue-50 cursor-pointer transition-colors ${
                                                isSelected
                                                  ? "bg-blue-100 border-l-4 border-l-blue-500"
                                                  : ""
                                              }`}
                                              onClick={async () => {
                                                console.log(
                                                  "🖱️ Object clicked:",
                                                  obj.objectId,
                                                  obj.permissionObjectId,
                                                );
                                                setSelectedObjectId(
                                                  obj.objectId || null,
                                                );
                                                setSelectedPermissionObjectId(
                                                  obj.permissionObjectId || null,
                                                );
                                                // โหลดข้อมูล Object Access ที่เซฟไว้แล้ว
                                                if (obj.permissionObjectId) {
                                                  await loadObjectAccess(
                                                    obj.permissionObjectId,
                                                  );
                                                } else {
                                                  // ถ้าไม่มี permissionObjectId ให้ reset
                                                  setSelectedAccessTypes([]);
                                                  setAccessTypeStatus({});
                                                }
                                              }}
                                              title="คลิกเพื่อจัดการประเภทสิทธิ์"
                                            >
                                              <div className="flex items-center gap-2">
                                                <div className="flex-1">
                                                  <div className="flex items-center gap-2">
                                                    <div className="font-medium text-sm text-gray-800">
                                                      {obj.objectName ||
                                                        `Object ${obj.objectId || "?"}`}
                                                    </div>
                                                    {obj.objectTypeName && (
                                                      <span className="text-[10px] px-2 py-0.5 rounded border bg-gray-50 text-gray-600">
                                                        {obj.objectTypeName}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-xs text-gray-500 mt-0.5">
                                                    Object ID: {obj.objectId}
                                                    {obj.parentObjectId &&
                                                      ` | Parent ID: ${obj.parentObjectId}`}
                                                  </div>
                                                </div>
                                                {isSelected && (
                                                  <ChevronRight
                                                    size={16}
                                                    className="text-blue-500"
                                                  />
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                          ไม่มีเมนู
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ===== ประเภทสิทธิ์และเงื่อนไข (แสดงเมื่อเลือก Object) ===== */}
                      {selectedObjectId && permissionMappingSaved && (
                        <div className="mt-6 border rounded-lg overflow-hidden bg-white shadow">
                          {/* Header */}
                          <div className="bg-green-600 text-white px-4 py-3 flex items-center gap-2">
                            <span className="font-medium">
                              ประเภทสิทธิ์และเงื่อนไข
                            </span>
                            <span className="text-xs bg-white/20 px-2 py-1 rounded">
                              Object ID: {selectedObjectId}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedObjectId(null)}
                              className="ml-auto text-white hover:bg-white/20 rounded p-1"
                              title="ปิด"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          {/* Content */}
                          <div className="p-4 bg-gray-50">
                            {/* กรองประเภทสิทธิ์ และปุ่มบันทึก */}
                            <div className="mb-3 flex items-center justify-between">
                              <h3 className="text-sm font-semibold text-gray-700">
                                กำหนดประเภทสิทธิ์และเงื่อนไข
                              </h3>

                              <div className="flex items-center gap-3">
                                <label className="text-xs text-gray-600 font-medium">
                                  กรองตามประเภทสิทธิ์:
                                </label>
                                <select
                                  className="h-9 rounded-md border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                  value={selectedPermissionTypeFilter}
                                  onChange={(e) =>
                                    setSelectedPermissionTypeFilter(
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="">ทั้งหมด</option>
                                  {(() => {
                                    const uniqueTypes = Array.from(
                                      new Set(
                                        accessTypesData
                                          .map((item) => item.permissionType)
                                          .filter((type) => type),
                                      ),
                                    ).sort();
                                    return uniqueTypes.map((type) => (
                                      <option key={type} value={type}>
                                        {type}
                                      </option>
                                    ));
                                  })()}
                                </select>

                                {/* ปุ่มบันทึก */}
                                <button
                                  type="button"
                                  onClick={saveObjectAccess}
                                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                  disabled={loading || selectedAccessTypes.length === 0}
                                >
                                  {loading && (
                                    <span className="text-[12px] text-[var(--iamx-fg-muted)]">กำลังโหลด…</span>
                                  )}
                                  บันทึกทั้งหมด ({selectedAccessTypes.length})
                                </button>
                              </div>
                            </div>

                            <div className="border rounded-lg overflow-hidden bg-white">
                              <table className="cds--data-table cds--data-table--sm w-full text-sm">
                                <thead className="bg-blue-100 text-gray-700">
                                  <tr>
                                    <th className="w-14 px-3 py-2 text-left border-r">
                                      ลำดับ
                                    </th>
                                    <th className="px-3 py-2 text-left border-r">
                                      ประเภทสิทธิ์
                                    </th>
                                    <th className="px-3 py-2 text-left border-r">
                                      ชื่อสิทธิในการเข้าถึง
                                    </th>
                                    <th className="w-32 px-3 py-2 text-center border-r">
                                      สถานะ
                                    </th>
                                    <th className="px-3 py-2 text-left">
                                      เงื่อนไข
                                    </th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {accessTypesData
                                    .filter((item) => {
                                      if (
                                        savedAccessTypeIds.has(item.accessTypeId)
                                      )
                                        return false;

                                      if (selectedPermissionTypeFilter === "")
                                        return true;
                                      return (
                                        item.permissionType ===
                                        selectedPermissionTypeFilter
                                      );
                                    })
                                    .map((item, idx) => {
                                      const currentItem = selectedAccessTypes.find(
                                        (x) => x.accessTypeId === item.accessTypeId,
                                      );
                                      const isChecked = currentItem?.status ?? false;
                                      const condition = currentItem?.condition ?? "";

                                      return (
                                        <tr
                                          key={item.accessTypeId}
                                          className="border-t"
                                        >
                                          <td className="px-3 py-2 border-r text-gray-700">
                                            {idx + 1}
                                          </td>

                                          <td className="px-3 py-2 border-r text-gray-700">
                                            {item.permissionType || "-"}
                                          </td>

                                          <td className="px-3 py-2 border-r">
                                            <div>
                                              <div className="text-gray-800 font-medium">
                                                {item.accessTypeName || "-"}
                                              </div>
                                              {item.description && (
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                  {item.description}
                                                </div>
                                              )}
                                            </div>
                                          </td>

                                          <td className="px-3 py-2 border-r text-center">
                                            <label
                                              className={`inline-flex items-center cursor-pointer px-3 py-2 rounded-lg transition-colors ${
                                                isChecked
                                                  ? "bg-green-100 hover:bg-green-200"
                                                  : "bg-gray-100 hover:bg-gray-200"
                                              }`}
                                            >
                                              <Checkbox
                                                
                                                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500"
                                                checked={isChecked}
                                                onChange={(e) => {
                                                  const checked = e.target.checked;
                                                  setSelectedAccessTypes((prev) => {
                                                    const filtered = prev.filter(
                                                      (x) => x.accessTypeId !== item.accessTypeId,
                                                    );
                                                    if (checked) {
                                                      return [
                                                        ...filtered,
                                                        {
                                                          accessTypeId: item.accessTypeId,
                                                          status: true,
                                                          condition: condition,
                                                        },
                                                      ];
                                                    }
                                                    return filtered;
                                                  });
                                                }}
                                              />
                                              <span
                                                className={`ml-2 text-xs font-semibold ${
                                                  isChecked
                                                    ? "text-green-700"
                                                    : "text-gray-600"
                                                }`}
                                              >
                                                {isChecked
                                                  ? "เปิดใช้งาน"
                                                  : "ปิดการใช้งาน"}
                                              </span>
                                            </label>
                                          </td>

                                          <td className="px-3 py-2">
                                            <input
                                              type="text"
                                              className="h-10 w-full rounded-md border px-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                                              placeholder="ระบุเงื่อนไข (ถ้ามี)"
                                              value={condition}
                                              onChange={(e) => {
                                                const value = e.target.value;
                                                setSelectedAccessTypes((prev) => {
                                                  const existing = prev.find(
                                                    (x) => x.accessTypeId === item.accessTypeId,
                                                  );
                                                  if (existing) {
                                                    return prev.map((x) =>
                                                      x.accessTypeId === item.accessTypeId
                                                        ? { ...x, condition: value }
                                                        : x,
                                                    );
                                                  }
                                                  // ถ้ายังไม่มี ให้เพิ่มเข้าไปด้วย status = false
                                                  return [
                                                    ...prev,
                                                    {
                                                      accessTypeId: item.accessTypeId,
                                                      status: false,
                                                      condition: value,
                                                    },
                                                  ];
                                                });
                                              }}
                                            />
                                          </td>
                                        </tr>
                                      );
                                    })}

                                  {(() => {
                                    const filteredData =
                                      accessTypesData.filter((item) => {
                                        if (
                                          savedAccessTypeIds.has(
                                            item.accessTypeId,
                                          )
                                        )
                                          return false;

                                        if (
                                          selectedPermissionTypeFilter === ""
                                        )
                                          return true;
                                        return (
                                          item.permissionType ===
                                          selectedPermissionTypeFilter
                                        );
                                      });

                                    if (filteredData.length === 0) {
                                      return (
                                        <tr>
                                          <td
                                            colSpan={5}
                                            className="text-center text-gray-500 py-10"
                                          >
                                            {accessTypesData.length === 0
                                              ? "ไม่พบข้อมูลประเภทสิทธิ์"
                                              : accessTypesData.every((item) =>
                                                    savedAccessTypeIds.has(
                                                      item.accessTypeId,
                                                    ),
                                                  )
                                                ? "บันทึกครบทุกรายการแล้ว"
                                                : "ไม่พบข้อมูลที่ตรงกับการกรอง"}
                                          </td>
                                        </tr>
                                      );
                                    }
                                    return null;
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
          </div>
        </div>
      </div>

      {/* ===== Permission Modal ===== */}
      <Modal
        open={openPermModal}
        title="จัดการเมนู/สิทธิของ Role"
        onClose={() => {
          setOpenPermModal(false);
          setModalSearch("");
        }}
      >
        <div className="text-sm text-gray-700">
          Role:{" "}
          <span className="font-semibold">{currentRole?.name ?? "-"}</span>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          * เลือก SYSTEM ที่ต้องการให้สิทธิ์แก่ Role นี้
        </div>

        {/* Search box */}
        <div className="mt-3">
          <input
            type="text"
            placeholder="🔍 ค้นหาระบบ..."
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={modalSearch}
            onChange={(e) => setModalSearch(e.target.value)}
          />
        </div>

        {saveMsg && (
          <div
            className={`mt-3 text-sm ${saveMsg.includes("สำเร็จ") ? "text-green-700" : "text-red-700"}`}
          >
            {saveMsg}
          </div>
        )}

        <div className="mt-4 border rounded-lg p-2 max-h-[55vh] overflow-auto">
          {objLoading ? (
            <div className="text-sm text-gray-500 p-2">กำลังโหลดเมนู...</div>
          ) : objError ? (
            <div className="text-sm text-red-600 p-2">{objError}</div>
          ) : filteredModalRoots.length === 0 ? (
            <div className="text-sm text-gray-500 p-2">
              {modalSearch ? "ไม่พบ SYSTEM ที่ค้นหา" : "ไม่พบ SYSTEM"}
            </div>
          ) : (
            filteredModalRoots.map((root) => (
              <ObjRow key={root.id} node={root} showCheckbox />
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setOpenPermModal(false);
              setModalSearch("");
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
            disabled={savingPolicies}
          >
            ปิด
          </button>

          <button
            type="button"
            onClick={savePolicies}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-60"
            disabled={savingPolicies || objLoading || !!objError}
          >
            {savingPolicies ? "กำลังบันทึก..." : "บันทึกสิทธิ"}
          </button>
        </div>
      </Modal>

      {/* ===== Permission Object Modal (จัดการเมนูของแต่ละ Permission) ===== */}
      <Modal
        open={openPermissionObjectModal}
        title={`จัดการเมนู - ${selectedPermissionGroup?.permissionName || "Permission"}`}
        onClose={() => {
          setOpenPermissionObjectModal(false);
          setSelectedPermissionGroup(null);
        }}
      >
        <div className="text-sm text-gray-700 mb-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {selectedPermissionGroup?.permissionName || "N/A"}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
              {selectedPermissionGroup?.objects?.length || 0} เมนู
            </span>
          </div>
          {selectedPermissionGroup?.systemPermissionId && (
            <div className="text-xs text-gray-500 mt-1">
              System Permission ID: {selectedPermissionGroup.systemPermissionId}
            </div>
          )}
        </div>

        {/* แสดงรายการเมนูทั้งหมด (สำหรับเลือก) */}
        <div className="text-xs text-gray-600 mb-2">
          เลือกเมนูที่ต้องการให้ Permission นี้เข้าถึง:
        </div>
        <div className="border rounded-lg max-h-[50vh] overflow-auto">
          {loadingMenus ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <div className="animate-pulse">กำลังโหลดเมนู...</div>
            </div>
          ) : availableMenus.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              ไม่พบข้อมูลเมนู
            </div>
          ) : (
            <div className="divide-y">
              {availableMenus.map((menu) => {
                const isSelected = selectedMenuIds.has(menu.objectId);
                return (
                  <div
                    key={menu.objectId}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-50" : ""
                    }`}
                    onClick={() => {
                      setSelectedMenuIds((prev) => {
                        const newSet = new Set(prev);
                        if (newSet.has(menu.objectId)) {
                          newSet.delete(menu.objectId);
                        } else {
                          newSet.add(menu.objectId);
                        }
                        return newSet;
                      });
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <Checkbox
                        
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm text-gray-800">
                            {menu.objectName || `Object ${menu.objectId}`}
                          </div>
                          {menu.objectTypeName && (
                            <span className="text-[10px] px-2 py-0.5 rounded border bg-gray-100 text-gray-600">
                              {menu.objectTypeName}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Object ID: {menu.objectId}
                          {menu.parentObjectId &&
                            ` | Parent ID: ${menu.parentObjectId}`}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* สรุปที่เลือก */}
        <div className="mt-3 text-xs text-gray-600">
          เลือกแล้ว: {selectedMenuIds.size} เมนู
        </div>

        {/* ปุ่มบันทึก/ปิด */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setOpenPermissionObjectModal(false);
              setSelectedPermissionGroup(null);
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
            disabled={loading}
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={savePermissionObjects}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
            disabled={loading || loadingMenus}
          >
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </Modal>

      {/* ===== Edit Modal (ยังเป็น UI-only ตามเดิม) ===== */}
      <Modal
        open={openEditModal}
        title="แก้ไข Role"
        onClose={() => setOpenEditModal(false)}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600">ชื่อ Role</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="roleName"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">คำอธิบาย</label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="roleDesc"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenEditModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                console.log("save edit", {
                  roleId: selectedRole,
                  editName,
                  editDesc,
                });
                setRoles((prev) =>
                  prev.map((x) =>
                    x.id === selectedRole
                      ? { ...x, name: editName, desc: editDesc }
                      : x,
                  ),
                );
                setOpenEditModal(false);
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              บันทึก
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== Delete Modal (ยังเป็น UI-only ตามเดิม) ===== */}
      <Modal
        open={openDeleteModal}
        title="ยืนยันการลบ Role"
        onClose={() => setOpenDeleteModal(false)}
      >
        <div className="text-sm text-gray-700">
          ต้องการลบ Role:{" "}
          <span className="font-semibold">{currentRole?.name ?? "-"}</span>{" "}
          ใช่หรือไม่?
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpenDeleteModal(false)}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => {
              console.log("delete role", selectedRole);
              setRoles((prev) => prev.filter((x) => x.id !== selectedRole));
              setExpandedRoles((prev) => {
                const next = new Set(prev);
                next.delete(selectedRole);
                return next;
              });
              setSelectedRole("");
              setOpenDeleteModal(false);
            }}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
          >
            ลบ
          </button>
        </div>
      </Modal>

      {/* ===== Add Role Modal ===== */}
      <Modal
        open={openAddModal}
        title="เพิ่ม Role ใหม่"
        onClose={closeAddRoleModal}
      >
        <div className="space-y-4">
          {/* ชื่อ Role */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              ชื่อ Role <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={addRoleName}
              onChange={(e) => setAddRoleName(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                addRoleErrors.name
                  ? "border-red-300 focus:ring-red-500"
                  : "border-gray-300 focus:ring-blue-500"
              }`}
              placeholder="เช่น Accountant, Manager"
            />
            {addRoleErrors.name && (
              <p className="mt-1 text-xs text-red-600">{addRoleErrors.name}</p>
            )}
          </div>

          {/* รหัส Role */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              รหัส Role <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={addRoleCode}
              onChange={(e) => setAddRoleCode(e.target.value)}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                addRoleErrors.code
                  ? "border-red-300 focus:ring-red-500"
                  : "border-gray-300 focus:ring-blue-500"
              }`}
              placeholder="เช่น ACC, HR_MGR, ADMIN"
            />
            {addRoleErrors.code && (
              <p className="mt-1 text-xs text-red-600">{addRoleErrors.code}</p>
            )}
          </div>

          {/* คำอธิบาย */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              คำอธิบาย
            </label>
            <textarea
              value={addRoleDesc}
              onChange={(e) => {
                const val = e.target.value;
                if (val.length <= 500) {
                  setAddRoleDesc(val);
                }
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              maxLength={500}
              placeholder="คำอธิบายเกี่ยวกับ Role นี้ และหน้าที่ความรับผิดชอบ"
            />
            <div className="mt-1 text-xs text-gray-500 text-right">
              {addRoleDesc.length} / 500
            </div>
          </div>

          {/* สถานะ */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              สถานะ <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-block w-3 h-3 rounded-full ${
                  addRoleStatus === "ACTIVE" ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <select
                value={addRoleStatus}
                onChange={(e) => setAddRoleStatus(e.target.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                  addRoleErrors.status
                    ? "border-red-300 focus:ring-red-500"
                    : "border-gray-300 focus:ring-blue-500"
                }`}
              >
                <option value="ACTIVE">ใช้งาน</option>
                <option value="INACTIVE">ไม่ใช้งาน</option>
              </select>
            </div>
            {addRoleErrors.status && (
              <p className="mt-1 text-xs text-red-600">
                {addRoleErrors.status}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeAddRoleModal}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleAddRoleSubmit}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              บันทึก
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
