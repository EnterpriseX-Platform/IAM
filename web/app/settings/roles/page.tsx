"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import { tx } from "@/lib/i18n";
import { groupRoles, useItemGroups } from "../../components/iamx/roleGroups";
import { permLabel, sortPerms } from "../../components/iamx/perms";
import ThaiDatePicker from "@/app/components/ThaiDatePicker";
import {
  Badge,
  Button,
  Drawer,
  DrawerSection,
  EmptyState,
  FilterChip,
  FormField,
  Icon,
  IconButton,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  Toggle,
} from "@/app/components/iamx";
import ReportByRole from "../report-mapping/ByRole";
import { MenuPicker } from "../../components/iamx/MenuPicker";
import { showConfirm, showError, showSuccess } from "@/lib/swal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { activeUserTypes, domainAllowsType, isStaffType, normalizeUserType, staffCode, userTypeName, useUserTypes } from "@/lib/menuType";
import {
  ChevronDown,
  ChevronRight,
  Shield,
} from "@/app/components/iamx/carbonLucide";
import { useEffect, useMemo, useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  role_type: string;
  effective_date?: string;
  expire_date?: string;
  is_active: number;
  default_role: number;
  all_data_access: number;
  user_count?: number;
  menu_count?: number;
}

interface ObjectNode {
  id: number;
  label: string;
  code: string;
  path: string;
  level: number;
  sort_order: number;
  children: ObjectNode[];
  domain_name?: string;
  domain_menu_type?: string;
  application_name?: string;
  module_name?: string;
}

interface RoleObjectMapping {
  id: number;
  object_id: number;
  permissions: string[];
}

export default function RolesV2Page() {
  useUserTypes();
  // 15/11/69: กลุ่มมาจาก System settings › Groups
  const roleGroupsList = useItemGroups("ROLE");
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [objectTree, setObjectTree] = useState<ObjectNode[]>([]);
  const [mappings, setMappings] = useState<RoleObjectMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchRole, setSearchRole] = useState("");
  const [searchObject] = useState("");
  // 13/11/69: เข้ามาเห็นเมนูทั้งหมด (เดิมเปิดตัวกรอง "เฉพาะที่ให้สิทธิ์แล้ว" ไว้ ทำให้บทบาทใหม่เห็นจอว่าง)
  const [onlyGranted, setOnlyGranted] = useState(false);
  const [roleTab, setRoleTab] = useState<"menu" | "report" | "users">("menu");
  // 13/11/69: กลุ่มบทบาทยุบไว้ทั้งหมด เปิดเฉพาะกลุ่มที่มีบทบาทที่เลือกอยู่ (+กลุ่มที่ผู้ใช้กดเปิด)
  const [openRoleGroups, setOpenRoleGroups] = useState<Set<string>>(new Set());
  const [domainFilter] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [permissionTypeDefs, setPermissionTypeDefs] = useState<Array<{ code: string }>>([
    { code: "VIEW" },
    { code: "CREATE" },
    { code: "EDIT" },
    { code: "DELETE" },
    { code: "APPROVE" },
    { code: "EXPORT" },
  ]);


  // Drawer state (was modal)
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // Users-of-role drawer
  interface RoleUser {
    user_id: number;
    user_name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    status?: string;
    employee_id?: string;
    is_active: number;
    effective_date?: string;
    expire_date?: string;
  }
  const [roleUsers, setRoleUsers] = useState<RoleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    role_type: staffCode(),
    effective_date: "",
    expire_date: "",
    no_expire: false,
    group_code: "",
    is_active: 1,
    default_role: 0,
    all_data_access: 0,
  });

  useEscapeKey(showDrawer, () => setShowDrawer(false));

  const openUsersDrawer = async (role: Role) => {
    setRoleUsers([]);
    setSearchUser("");
    setLoadingUsers(true);
    try {
      const res = await fetch(`${API_BASE}/admin/roles/${role.id}/users`);
      const data = await res.json();
      setRoleUsers(data.data || []);
    } catch (err) {
      console.error("Failed to fetch role users:", err);
      showError(tx("โหลดผู้ใช้ไม่สำเร็จ"));
    } finally {
      setLoadingUsers(false);
    }
  };

  // 13/11/69: แท็บ "ผู้ใช้" ในหน้าบทบาท (แทนลิ้นชักดูผู้ใช้)
  useEffect(() => {
    if (roleTab === "users" && selectedRole) openUsersDrawer(selectedRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleTab, selectedRole?.id]);

  useEffect(() => {
    fetchRoles();
    fetchObjectTree();
    fetchPermissionTypes();
  }, []);

  const fetchPermissionTypes = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/permission-types?group=OBJECT`);
      const json = await res.json();
      const list: Array<{ permission_type: string }> = json.data || [];
      if (list.length === 0) return;
      setPermissionTypeDefs(list.map((p) => ({ code: p.permission_type })));
    } catch (err) {
      console.error("Failed to fetch permission types:", err);
    }
  };

  useEffect(() => {
    setMappings([]);
    if (!selectedRole) return;

    let cancelled = false;
    fetch(`${API_BASE}/admin/roles/${selectedRole.id}/permissions`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setMappings(
            (data.data || []).map((p: any) => ({
              id: p.role_object_mapping_id,
              object_id: p.object_id,
              permissions: p.permissions || [],
            }))
          );
        }
      })
      .catch((err) => console.error("Failed to fetch mappings:", err));

    return () => {
      cancelled = true;
    };
  }, [selectedRole]);

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/roles`);
      const data = await res.json();
      setRoles(data.data || []);
      // 22/10/69 เปิดจอแล้วเลือกบทบาทแรกให้เลย (เดิมว่าง "เลือกบทบาท")
      setSelectedRole((cur) => cur ?? (data.data || [])[0] ?? null);
    } catch (error) {
      console.error("Failed to fetch roles:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchObjectTree = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/options/object-hierarchy`);
      const data = await res.json();
      setObjectTree(data.data || []);
    } catch (error) {
      console.error("Failed to fetch objects:", error);
    }
  };

  const fetchMappings = async (roleId: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/roles/${roleId}/permissions`);
      const data = await res.json();
      setMappings(
        (data.data || []).map((p: any) => ({
          id: p.role_object_mapping_id,
          object_id: p.object_id,
          permissions: p.permissions || [],
        }))
      );
    } catch (error) {
      console.error("Failed to fetch mappings:", error);
    }
  };

  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) return;

    try {
      const url = editingRole
        ? `${API_BASE}/admin/roles/${editingRole.id}`
        : `${API_BASE}/admin/roles`;
      const method = editingRole ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          effective_date: formData.effective_date || null,
          expire_date: formData.no_expire ? null : (formData.expire_date || null),
        }),
      });

      if (res.ok) {
        const responseData = await res.json();
        setShowDrawer(false);

        if (!editingRole && responseData.id) {
          const newRole: Role = {
            id: responseData.id,
            code: formData.code,
            name: formData.name,
            description: formData.description,
            role_type: formData.role_type,
            effective_date: formData.effective_date || undefined,
            expire_date: formData.expire_date || undefined,
            is_active: formData.is_active,
            default_role: formData.default_role,
            all_data_access: formData.all_data_access,
          };
          setSelectedRole(newRole);
        }

        const savedId = editingRole?.id || responseData.id;
        if (savedId) {
          await fetch(`${API_BASE}/admin/roles/${savedId}/group`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_code: formData.group_code }) });
        }
        fetchRoles();
        showSuccess(tx("บันทึกสำเร็จ"));
      } else {
        const errorData = await res.json().catch(() => null);
        showError(tx("บันทึกไม่สำเร็จ"), errorData?.error || tx("เกิดข้อผิดพลาด"));
      }
    } catch (error) {
      console.error("Failed to save role:", error);
      showError(tx("บันทึกไม่สำเร็จ"), tx("เกิดข้อผิดพลาดในการเชื่อมต่อ"));
    }
  };

  const handleDelete = async (role: Role) => {
    const userCount = role.user_count ?? 0;
    const text = userCount > 0
      ? tx("ลบ Role \"{0}\"? บทบาทนี้มีผู้ใช้ {1} คน การลบจะยกเลิกการผูกผู้ใช้และสิทธิ์ทั้งหมด", role.name, userCount)
      : tx("ลบ Role \"{0}\"?", role.name);
    const confirmed = await showConfirm(tx("ยืนยันการลบ"), text);
    if (!confirmed) return;
    try {
      await fetch(`${API_BASE}/admin/roles/${role.id}`, { method: "DELETE" });
      if (selectedRole?.id === role.id) setSelectedRole(null);
      fetchRoles();
      showSuccess(tx("ลบสำเร็จ"));
    } catch (error) {
      console.error("Failed to delete role:", error);
      showError(tx("ลบไม่สำเร็จ"));
    }
  };

  // 22/10/69 บันทึกทันทีทีละช่อง → แจ้ง "บันทึกแล้ว"/"บันทึกไม่สำเร็จ" ข้างแถว ~2 วินาที
  const [saveFlash, setSaveFlash] = useState<{ objectId: number; ok: boolean; t: number } | null>(null);
  const flashSave = (objectId: number, ok: boolean) => {
    const t = Date.now();
    setSaveFlash({ objectId, ok, t });
    setTimeout(() => setSaveFlash((cur) => (cur && cur.t === t ? null : cur)), ok ? 2000 : 4000);
  };

  const togglePermission = async (objectId: number, permission: string) => {
    if (!selectedRole) return;

    const pendingKey = `${objectId}-${permission}`;
    if (pending.has(pendingKey)) return;

    const existing = mappings.find((m) => m.object_id === objectId);
    const hasPerm = existing?.permissions.includes(permission);

    setPending((prev) => {
      const next = new Set(prev);
      next.add(pendingKey);
      return next;
    });

    try {
      if (!existing) {
        const createRes = await fetch(`${API_BASE}/admin/role-object-mappings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_id: selectedRole.id,
            object_id: objectId,
            effective_date: new Date().toISOString().split("T")[0],
            is_active: 1,
          }),
        });

        if (!createRes.ok) {
          const errorData = await createRes.json().catch(() => null);
          throw new Error(errorData?.message || "Failed to create mapping");
        }

        const newMapping = await createRes.json();
        const mappingId = newMapping.data?.id || newMapping.id;
        if (!mappingId) throw new Error("No mapping ID returned");

        const permRes = await fetch(`${API_BASE}/admin/role-object-permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_object_mapping_id: mappingId,
            permissions: [permission],
          }),
        });

        if (!permRes.ok) {
          const errorData = await permRes.json().catch(() => null);
          throw new Error(errorData?.message || "Failed to add permission");
        }
      } else {
        const toggleRes = await fetch(
          `${API_BASE}/admin/role-object-mappings/${existing.id}/toggle-permission`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ permission, enabled: !hasPerm }),
          }
        );

        if (!toggleRes.ok) throw new Error("Failed to toggle permission");
      }

      await fetchMappings(selectedRole.id);
      flashSave(objectId, true);
    } catch (error) {
      console.error("Failed to toggle permission:", error);
      flashSave(objectId, false);
      showError(tx("ผิดพลาด"), (error as Error).message);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });
    }
  };

  // 13/11/69: ลิงก์จากหน้าแรก ?filter=nomenu = บทบาทที่ใช้งานอยู่แต่ยังไม่มีเมนู
  // 14/11/69: เพิ่ม ?filter=expiring = บทบาทที่หมดอายุแล้วหรือจะหมดใน 30 วัน
  const [attnFilter, setAttnFilter] = useState<"" | "nomenu" | "expiring">("");
  const noMenuOnly = attnFilter !== "";
  const setNoMenuOnly = (v: boolean) => { if (!v) setAttnFilter(""); };
  useEffect(() => {
    try {
      const f = new URLSearchParams(window.location.search).get("filter");
      if (f === "nomenu" || f === "expiring") setAttnFilter(f);
    } catch {}
  }, []);
  const soon = Date.now() + 30 * 86400000;
  const filteredRoles = roles.filter(
    (r) =>
      (attnFilter !== "nomenu" || (r.is_active !== 0 && !r.menu_count)) &&
      (attnFilter !== "expiring" || (r.is_active !== 0 && !!r.expire_date && new Date(r.expire_date).getTime() < soon)) &&
      (r.name.toLowerCase().includes(searchRole.toLowerCase()) ||
      r.code.toLowerCase().includes(searchRole.toLowerCase()))
  );
  useEffect(() => {
    if (!selectedRole) return;
    const g = groupRoles(roles).find((x) => x.items.some((r) => r.id === selectedRole.id));
    if (g) setOpenRoleGroups((prev) => (prev.has(g.key) ? prev : new Set(prev).add(g.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole?.id, roles]);

  // เปิดจากหน้าแรก (?filter=nomenu) → เลือกบทบาทแรกในรายการที่กรองแล้ว
  useEffect(() => {
    if (noMenuOnly && filteredRoles.length && !filteredRoles.some((r) => r.id === selectedRole?.id)) setSelectedRole(filteredRoles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noMenuOnly, roles]);

  // 18/10/69: มีผลจริงแค่ "ดู" (ระบบอื่นยังตัดสินจากชื่อ role) → ค่าเริ่มต้นแสดงคอลัมน์ ดู · ช่องอื่นอยู่หลังปุ่ม (ไม่ลบข้อมูล)
  // 13/11/69 (เคาะ 2ก): สิทธิ์ย่อยยังไม่มีผลกับระบบงาน → ซ่อนไว้หลังปุ่ม ข้อมูลเดิมไม่หาย
  const [showAllPerms, setShowAllPerms] = useState(false);
  const allPermissionTypes = sortPerms(permissionTypeDefs.map((p) => p.code));
  const permissionTypes = showAllPerms ? allPermissionTypes : allPermissionTypes.filter((p) => p === "VIEW");



  // 13/11/69: ติ๊ก "ดู" ทั้งโดเมน/ระบบงาน/โมดูลในครั้งเดียว · เอาออก = ถอนทุกสิทธิ์ของเมนูนั้น
  const [groupBusy, setGroupBusy] = useState(false);
  const setGroupView = async (label: string, objs: ObjectNode[], on: boolean) => {
    if (!selectedRole) return;
    const targets = objs.filter((o) => {
      const has = mappings.find((m) => m.object_id === o.id)?.permissions?.includes("VIEW");
      return on ? !has : !!mappings.find((m) => m.object_id === o.id)?.permissions?.length;
    });
    if (!targets.length) return;
    const ok = await showConfirm(
      on ? tx("ให้สิทธิ์ดูทั้งกลุ่ม") : tx("ถอนสิทธิ์ทั้งกลุ่ม"),
      tx("{0} · {1} เมนู · บทบาท {2}", label, targets.length, selectedRole.code),
      on ? tx("ให้สิทธิ์") : tx("ถอนสิทธิ์")
    );
    if (!ok) return;
    setGroupBusy(true);
    let fail = 0;
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        const o = queue.shift()!;
        const cur = mappings.find((m) => m.object_id === o.id)?.permissions || [];
        const next = on ? Array.from(new Set([...cur, "VIEW"])) : [];
        try {
          const res = await fetch(`${API_BASE}/admin/roles/${selectedRole.id}/objects/${o.id}/set-permissions`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: next }),
          });
          if (!res.ok) fail++;
        } catch { fail++; }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    await fetchMappings(selectedRole.id);
    setGroupBusy(false);
    if (fail) showError(tx("บันทึกไม่สำเร็จ {0} เมนู", fail), "");
    else showSuccess(on ? tx("ให้สิทธิ์ดูแล้ว {0} เมนู", targets.length) : tx("ถอนสิทธิ์แล้ว {0} เมนู", targets.length));
  };



  const sortObjects = (nodes: ObjectNode[]): ObjectNode[] => {
    return [...nodes]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((node) => ({ ...node, children: sortObjects(node.children) }));
  };

  const groupedObjects = useMemo(() => {
    const groups: {
      [domainName: string]: {
        [appName: string]: { [moduleName: string]: ObjectNode[] };
      };
    } = {};

    const sortedTree = sortObjects(objectTree);
    const roleType = selectedRole?.role_type;

    sortedTree.forEach((node) => {
      if (roleType && !domainAllowsType(node.domain_menu_type, roleType)) return;
      const domainName = node.domain_name || tx("ไม่ระบุโดเมน");
      const appName = node.application_name || tx("ไม่ระบุแอปพลิเคชัน");
      const modName = node.module_name || tx("ไม่ระบุโมดูล");

      if (!groups[domainName]) groups[domainName] = {};
      if (!groups[domainName][appName]) groups[domainName][appName] = {};
      if (!groups[domainName][appName][modName]) groups[domainName][appName][modName] = [];
      groups[domainName][appName][modName].push(node);
    });

    return groups;
  }, [objectTree, selectedRole?.role_type]);

  const filteredGroups = useMemo(() => {
    // เมนูที่มีสิทธิ์ (ตัวเองหรือลูกหลาน) — ใช้กับสวิตช์ "เฉพาะที่ให้สิทธิ์แล้ว"
    const grantedIds = new Set(mappings.filter((m) => m.permissions?.length).map((m) => m.object_id));
    const pruneGranted = (objs: ObjectNode[]): ObjectNode[] =>
      objs.flatMap((o) => {
        const kids = pruneGranted(o.children || []);
        return grantedIds.has(o.id) || kids.length ? [{ ...o, children: kids }] : [];
      });
    const base: typeof groupedObjects = {};
    Object.entries(groupedObjects).forEach(([domainName, apps]) => {
      if (domainFilter && domainName !== domainFilter) return;
      Object.entries(apps).forEach(([appName, modules]) => {
        Object.entries(modules).forEach(([modName, objects]) => {
          const objs = onlyGranted ? pruneGranted(objects) : objects;
          if (!objs.length) return;
          if (!base[domainName]) base[domainName] = {};
          if (!base[domainName][appName]) base[domainName][appName] = {};
          base[domainName][appName][modName] = objs;
        });
      });
    });
    if (!searchObject.trim()) return base;
    const query = searchObject.toLowerCase();
    const filtered: typeof groupedObjects = {};

    Object.entries(base).forEach(([domainName, apps]) => {
      Object.entries(apps).forEach(([appName, modules]) => {
        Object.entries(modules).forEach(([modName, objects]) => {
          const matchingObjects = objects.filter(
            (obj) =>
              obj.label.toLowerCase().includes(query) ||
              obj.code.toLowerCase().includes(query) ||
              obj.path?.toLowerCase().includes(query) ||
              domainName.toLowerCase().includes(query) ||
              appName.toLowerCase().includes(query) ||
              modName.toLowerCase().includes(query)
          );

          if (matchingObjects.length > 0) {
            if (!filtered[domainName]) filtered[domainName] = {};
            if (!filtered[domainName][appName]) filtered[domainName][appName] = {};
            filtered[domainName][appName][modName] = matchingObjects;
          }
        });
      });
    });

    return filtered;
  }, [groupedObjects, searchObject, onlyGranted, domainFilter, mappings]);

  const PERM_COL_WIDTH = 56;


  // 13/11/69: รายชื่อผู้ใช้ของบทบาท แสดงในแท็บ "ผู้ใช้" (เดิมอยู่ในลิ้นชัก "ดูผู้ใช้")
  const renderRoleUsers = () => (
    <>
        <div className="px-1">
          <Input
            value={searchUser}
            onChange={setSearchUser}
            placeholder={tx("ค้นหา ชื่อ / username / email...")}
            icon="search"
          />
        </div>
        <div className="mt-3">
          {loadingUsers ? (
            <div className="flex items-center justify-center py-10">
              <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
            </div>
          ) : roleUsers.length === 0 ? (
            <EmptyState
              icon="users"
              title={tx("ยังไม่มีผู้ใช้")}
            />
          ) : (
            (() => {
              const q = searchUser.trim().toLowerCase();
              const filtered = q
                ? roleUsers.filter((u) =>
                    [u.user_name, u.first_name, u.last_name, u.email, u.employee_id]
                      .filter(Boolean)
                      .some((v) => (v as string).toLowerCase().includes(q))
                  )
                : roleUsers;
              if (filtered.length === 0) {
                return (
                  <EmptyState icon="search" title={tx("ไม่พบ \"{0}\"", searchUser)} />
                );
              }
              return (
                <div className="border border-[var(--iamx-border)] overflow-hidden bg-layer">
                  {/* 13/11/69: table-fixed ให้ truncate ทำงาน — เดิมรหัสยาวดันคอลัมน์สถานะล้นจอ */}
                  <table className="cds--data-table cds--data-table--sm w-full text-[13px] table-fixed">
                    <thead className="bg-[var(--iamx-bg-hover)]">
                      <tr className="text-left text-[11.5px] text-[var(--iamx-fg-muted)]">
                        <th className="h-8 px-3 font-medium">{tx("ผู้ใช้")}</th>
                        <th className="h-8 px-3 font-medium">{tx("อีเมล")}</th>
                        <th className="h-8 px-3 font-medium text-center w-24">{tx("สถานะ")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u) => {
                        const fullName =
                          `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
                          u.user_name ||
                          `#${u.user_id}`;
                        return (
                          <tr
                            key={u.user_id}
                            className="border-t border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]"
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium text-[var(--iamx-fg)] truncate">
                                {fullName}
                              </div>
                              <div className="text-[11.5px] text-[var(--iamx-fg-muted)] truncate font-mono">
                                {u.user_name || "—"}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-[12.5px] text-[var(--iamx-fg-muted)] truncate">
                              {u.email || "—"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge
                                tone={u.is_active ? "success" : "neutral"}
                                size="xs"
                                dot
                              >
                                {u.is_active ? tx("ใช้งาน") : tx("ปิดใช้งาน")}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </div>
    </>
  );



  const openAddDrawer = () => {
    setEditingRole(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      role_type: staffCode(),
      effective_date: "",
      expire_date: "",
      no_expire: false,
      group_code: "",
      is_active: 1,
      default_role: 0,
      all_data_access: 0,
    });
    setShowDrawer(true);
  };

  const openEditDrawer = (role: Role) => {
    setEditingRole(role);
    setFormData({
      code: role.code,
      name: role.name,
      description: role.description || "",
      role_type: normalizeUserType(role.role_type),
      effective_date: role.effective_date?.substring(0, 10) || "",
      expire_date: role.expire_date?.substring(0, 10) || "",
      no_expire: !role.expire_date,
      group_code: (role as { group_code?: string }).group_code || "",
      is_active: role.is_active,
      default_role: role.default_role,
      all_data_access: role.all_data_access,
    });
    setShowDrawer(true);
  };

  const formValid = formData.code.trim() && formData.name.trim();

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={tx("บทบาทและสิทธิ์")}
        actions={
          <Button variant="primary" icon="plus" onClick={openAddDrawer}>
            
            {tx("เพิ่มบทบาท")}
          </Button>
        }
      />

      <div className="flex flex-col min-[900px]:flex-row flex-1 min-h-0 overflow-y-auto min-[900px]:overflow-visible">
        {/* Roles list (left) */}
        {/* 18/10/69: จอแคบ (<1024px) แสดงทีละฝั่ง — เดิมบีบฝั่งรายละเอียดจนคำอธิบายเรียงลงทีละคำและปุ่มทับหัวเรื่อง */}
        <div className={"w-full min-[900px]:w-[340px] shrink-0 max-h-[50vh] min-[900px]:max-h-none border-b min-[900px]:border-b-0 min-[900px]:border-r border-[var(--iamx-border)] flex flex-col bg-[var(--iamx-bg)]"}>
          <div className="p-3 border-b border-[var(--iamx-border)]">
            <Input
              value={searchRole}
              onChange={setSearchRole}
              placeholder={tx("ค้นหาชื่อหรือรหัสบทบาท")}
              icon="search"
            />
            {noMenuOnly && (
              <div className="mt-2">
                <FilterChip label={tx("ต้องจัดการ")} value={attnFilter === "expiring" ? "Expired or expiring" : tx("ยังไม่มีเมนู")} onClick={() => {}} onClear={() => { setNoMenuOnly(false); try { window.history.replaceState(null, "", window.location.pathname); } catch {} }} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 px-4 h-8 items-center border-b border-[var(--iamx-border)] text-[11.5px] font-medium text-[var(--iamx-fg-muted)]">
            <span>{tx("บทบาท")}</span><span className="text-right">{tx("ผู้ใช้")}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
            </div>
          ) : filteredRoles.length === 0 ? (
            <EmptyState
              icon="search"
              title={searchRole ? tx("ไม่พบ \"{0}\"", searchRole) : tx("ไม่มีบทบาท")}
              hint={searchRole ? tx("ลองคำอื่น") : tx("เพิ่มบทบาทใหม่เพื่อเริ่มต้น")}
            />
          ) : (
            <div className="overflow-y-auto flex-1">
              {groupRoles(filteredRoles).map((g) => {
                // ค้นหาอยู่ = กางทุกกลุ่ม
                const open = !!searchRole.trim() || noMenuOnly || openRoleGroups.has(g.key);
                return (
                  <div key={g.key}>
                    <button
                      type="button"
                      onClick={() => setOpenRoleGroups((prev) => { const n = new Set(prev); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}
                      className="sticky top-0 z-[1] w-full flex items-center gap-2 px-4 h-9 text-[12.5px] font-medium text-[var(--iamx-fg)] bg-[var(--iamx-surface)] border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]"
                    >
                      {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span className="flex-1 text-left">{g.label}</span>
                      <span className="tabular-nums">{g.items.length}</span>
                    </button>
                    {open && g.items.map((r) => {
                const active = selectedRole?.id === r.id;
                // 21/10/69 แถวเดียวแบบตาราง (เหมือนหน้าความรับผิดชอบ) — เลิกไอคอนซ้ำทุกแถว/ข้อมูลอัดใต้ชื่อ
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRole(r)}
                    className={"w-full text-left grid grid-cols-[minmax(0,1fr)_36px] items-baseline gap-2 pl-8 pr-4 py-1.5 text-[13px] relative " + (active ? "bg-[var(--iamx-bg-active)] shadow-[inset_3px_0_0_#0f62fe] font-medium" : "hover:bg-[var(--iamx-bg-hover)]")}
                  >
                    {/* 13/11/69: แถวเดียว ไม่มีเส้นคั่น · รหัสต่อท้ายชื่อสีจาง (ชื่อซ้ำกับรหัสไม่แสดงซ้ำ) */}
                    <span className={"min-w-0 break-words " + (r.is_active ? "text-[var(--iamx-fg)]" : "text-[var(--iamx-fg-muted)] line-through")}>
                      {r.name}
                      {r.code.toLowerCase() !== r.name.toLowerCase() && (
                        <span className="ml-1.5 font-mono text-[11px] font-normal text-[var(--iamx-fg-muted)] whitespace-nowrap">{r.code}</span>
                      )}
                    </span>
                    <span className="text-right tabular-nums text-[12px] text-[var(--iamx-fg-muted)]">{r.user_count || 0}</span>
                  </button>
                );
              })}
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-4 py-2 border-t border-[var(--iamx-border)] text-[11.5px] text-[var(--iamx-fg-muted)] tabular-nums">
            {filteredRoles.length} {" "}{tx("บทบาท")}
          </div>
        </div>

        {/* Detail (right) */}
        <div className={"flex-1 flex flex-col min-w-0 min-h-[70vh] min-[900px]:min-h-0"}>
          {!selectedRole ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon="shield"
                title={tx("เลือกบทบาท")}
                
              />
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)]">
                <button type="button" onClick={() => setSelectedRole(null)} className="hidden mb-3 inline-flex items-center gap-1 text-[12.5px] text-[var(--iamx-accent)]">
                  <ChevronRight className="w-3.5 h-3.5 rotate-180" /> {" "}{tx("กลับไปรายการบทบาท")}
                </button>
                <div className="flex items-start gap-4 flex-wrap">
                  <span className="h-10 w-10 rounded-md bg-[var(--iamx-bg-hover)] text-[var(--iamx-fg-muted)] flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[16px] font-semibold text-[var(--iamx-fg)]">
                        {selectedRole.name}
                      </h2>
                      <Badge tone="neutral" size="sm">
                        <span className="font-mono">{selectedRole.code}</span>
                      </Badge>
                      <Badge tone={isStaffType(selectedRole.role_type) ? "neutral" : "accent"} size="sm">
                        {userTypeName(selectedRole.role_type)}
                      </Badge>
                      {selectedRole.all_data_access ? (
                        <Badge tone="warning" size="sm" dot>
                          
                          {tx("เข้าถึงข้อมูลทั้งหมด")}
                        </Badge>
                      ) : null}
                      {!selectedRole.is_active && <span className="text-[11px] px-2 rounded-full bg-amber-100 text-amber-700">{tx("ปิดใช้งาน")}</span>}
                    </div>
                    {selectedRole.description && (
                      <p className="text-[12.5px] text-[var(--iamx-fg-muted)] mt-1">
                        {selectedRole.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-[11.5px] text-[var(--iamx-fg-muted)] mt-2">
                      {selectedRole.effective_date && (
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="calendar" size={12} />
                          
                          {tx("มีผล")}{" "}{new Date(selectedRole.effective_date).toLocaleDateString("th-TH")}
                        </span>
                      )}
                      {selectedRole.expire_date && (
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="calendar" size={12} />
                          
                          {tx("หมดอายุ")}{" "}{new Date(selectedRole.expire_date).toLocaleDateString("th-TH")}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name="users" size={12} />
                        {selectedRole.user_count ?? 0} {" "}{tx("ผู้ใช้")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="edit"
                      onClick={() => openEditDrawer(selectedRole)}
                    >
                      
                      {tx("แก้ไข")}
                    </Button>
                    <IconButton
                      icon="trash"
                      label={tx("ลบบทบาท")}
                      variant="danger"
                      onClick={() => handleDelete(selectedRole)}
                    />
                  </div>
                </div>

              </div>

              <div className="px-6 bg-[var(--iamx-bg)]">
                <Tabs className="!mx-0 !px-0" value={roleTab} onChange={(v) => setRoleTab(v as typeof roleTab)} tabs={[
                  { value: "menu", label: tx("เมนู"), count: mappings.filter((m) => m.permissions?.length).length },
                  { value: "report", label: tx("รายงาน") },
                  { value: "users", label: tx("ผู้ใช้"), count: selectedRole.user_count ?? 0 },
                ]} />
              </div>
              {roleTab === "report" && (
                <div className="flex-1 min-h-0"><ReportByRole roleId={String(selectedRole.id)} /></div>
              )}
              {roleTab === "users" && (
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{renderRoleUsers()}</div>
              )}
              {roleTab === "menu" && (
              <div className="flex-1 min-h-0 flex flex-col px-6 pt-4 pb-6">
                {/* 13/11/69: ซ้ายระบบงาน · ขวาเมนูแบน (แทนต้นไม้ซ้อน 4–5 ชั้น) */}
                <MenuPicker
                  groups={filteredGroups}
                  busy={groupBusy}
                  isOn={(n) => !!mappings.find((m) => m.object_id === n.id)?.permissions?.includes("VIEW")}
                  onGroup={(label, nodes, on) => setGroupView(label, nodes as ObjectNode[], on)}
                  toolbar={
                    <>
                      <FilterChip
                        label={tx("เฉพาะที่ให้สิทธิ์แล้ว ({0})", mappings.filter((m) => m.permissions?.length).length)}
                        active={onlyGranted}
                        onClick={() => setOnlyGranted((v) => !v)}
                      />
                      <FilterChip label={tx("สิทธิ์ย่อย")} active={showAllPerms} onClick={() => setShowAllPerms((v) => !v)} />
                    </>
                  }
                  header={permissionTypes.map((p) => (
                    <span key={p} className="text-center whitespace-nowrap" style={{ width: PERM_COL_WIDTH }}>{permLabel(p)}</span>
                  ))}
                  renderCells={(n) => {
                    const perms = mappings.find((m) => m.object_id === n.id)?.permissions || [];
                    return (
                      <>
                        {saveFlash?.objectId === n.id && (
                          <span className={"text-[11px] shrink-0 " + (saveFlash.ok ? "text-green-600" : "text-red-600")}>{saveFlash.ok ? tx("บันทึกแล้ว") : tx("ไม่สำเร็จ")}</span>
                        )}
                        {permissionTypes.map((p) => (
                          <span key={p} className="flex justify-center shrink-0" style={{ width: PERM_COL_WIDTH }}>
                            <Checkbox
                              
                              className="h-4 w-4 accent-[#0f62fe] cursor-pointer"
                              checked={perms.includes(p)}
                              disabled={pending.has(`${n.id}-${p}`)}
                              onChange={() => togglePermission(n.id, p)}
                              aria-label={`${permLabel(p)} ${n.label}`}
                            />
                          </span>
                        ))}
                      </>
                    );
                  }}
                />
              </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit drawer */}
      <Drawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        title={editingRole ? tx("แก้ไข: {0}", formData.name || editingRole.name) : tx("เพิ่มบทบาทใหม่")}
        subtitle={editingRole ? tx("รหัส {0}", editingRole.code) : ""}
        width={640}
        persistKey="iamx-drawer-role"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowDrawer(false)}>
              
              {tx("ยกเลิก")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="check"
              disabled={!formValid}
              onClick={handleSave}
            >
              {editingRole ? tx("บันทึก") : tx("สร้างบทบาท")}
            </Button>
          </>
        }
      >
        <DrawerSection title={tx("ข้อมูลพื้นฐาน")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
            <FormField label={tx("รหัส")} required>
              <Input
                value={formData.code}
                onChange={(v) => setFormData((p) => ({ ...p, code: v.replace(/[^A-Z_-]/g, "") }))}
                placeholder={tx("เช่น ROLE001")}
                autoFocus
                maxLength={50}
              />
            </FormField>
            <FormField label={tx("ชื่อ")} required>
              <Input
                value={formData.name}
                onChange={(v) => setFormData((p) => ({ ...p, name: v }))}
                placeholder={tx("เช่น Administrator")}
                maxLength={200}
              />
            </FormField>
          </div>
          <FormField label="Group" className="mt-3">
            {/* 15/11/69: กลุ่มจาก System settings › Groups (เลิก hardcode) */}
            <Select
              value={formData.group_code}
              onChange={(v) => setFormData((p) => ({ ...p, group_code: v || "" }))}
              options={[{ value: "", label: "Ungrouped" }, ...roleGroupsList.filter((g) => g.is_active === 1).map((g) => ({ value: g.code, label: g.name }))]}
            />
          </FormField>
          <FormField label={tx("ประเภทบทบาท")} className="mt-3">
            <Select
              value={formData.role_type}
              onChange={(v) => setFormData((p) => ({ ...p, role_type: v }))}
              options={[
                ...activeUserTypes().map((t) => ({ value: t.code, label: t.name })),
              ]}
            />
          </FormField>
          <FormField label={tx("คำอธิบาย")} className="mt-3">
            <Textarea
              value={formData.description}
              onChange={(v) => setFormData((p) => ({ ...p, description: v }))}
              rows={2}
              maxLength={500}
              placeholder={tx("คำอธิบาย (ไม่บังคับ)")}
            />
          </FormField>
        </DrawerSection>

        <DrawerSection title={tx("ช่วงเวลามีผล")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3 items-start">
            <FormField label={tx("วันที่มีผล")}>
              <ThaiDatePicker
                value={formData.effective_date}
                onChange={(iso) => setFormData((p) => ({ ...p, effective_date: iso }))}
                className="w-full h-8 px-2.5 py-1 border border-[var(--iamx-border)] rounded-md outline-none text-[13px] focus:border-[var(--iamx-accent)] focus:ring-2 focus:ring-[var(--iamx-accent-soft)]"
              />
            </FormField>
            <FormField label={tx("วันที่หมดอายุ")}>
              <ThaiDatePicker
                value={formData.no_expire ? "" : formData.expire_date}
                onChange={(iso) =>
                  setFormData((p) => ({
                    ...p,
                    expire_date: iso,
                    no_expire: iso ? false : p.no_expire,
                  }))
                }
                className={
                  "w-full h-8 px-2.5 py-1 border border-[var(--iamx-border)] rounded-md outline-none text-[13px] focus:border-[var(--iamx-accent)] focus:ring-2 focus:ring-[var(--iamx-accent-soft)] " +
                  (formData.no_expire ? "opacity-50 pointer-events-none" : "")
                }
              />
              <label className="flex items-center gap-2 mt-2 text-[12px] text-[var(--iamx-fg)] cursor-pointer">
                <Checkbox
                  
                  checked={formData.no_expire}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      no_expire: e.target.checked,
                      expire_date: e.target.checked ? "" : p.expire_date,
                    }))
                  }
                  className="w-4 h-4 rounded border-[var(--iamx-border-strong)] focus:ring-0 focus:ring-offset-0"
                  style={{
                    accentColor: "var(--iamx-accent)",
                    backgroundColor: formData.no_expire ? "var(--iamx-accent)" : undefined,
                  }}
                />
                <span>{tx("ไม่มีสิ้นสุด")}</span>
              </label>
            </FormField>
          </div>
        </DrawerSection>

        <DrawerSection title={tx("การตั้งค่า")}>
          <div className="space-y-2">
            <SettingToggle
              title={tx("เปิดใช้งาน")}
              checked={!!formData.is_active}
              onChange={(v) => setFormData((p) => ({ ...p, is_active: v ? 1 : 0 }))}
            />
            <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-amber-200 bg-amber-50/50">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium flex items-center gap-1.5">
                  <Icon name="alert" size={13} className="text-amber-600" />
                  
                  {tx("สิทธิ์เข้าถึงข้อมูลทั้งหมด")}
                </div>
                <div className="text-[11.5px] text-amber-700">
                  
                  {tx("ข้ามการกรองข้อมูลตามสังกัด")}
                </div>
              </div>
              <Toggle
                checked={!!formData.all_data_access}
                onChange={(v) => setFormData((p) => ({ ...p, all_data_access: v ? 1 : 0 }))}
              />
            </div>
            {/* 13/11/69: เอาช่อง "สถานะ (เลือกจาก dropdown)" ออก — ผูก is_active ตัวเดียวกับสวิตช์ "เปิดใช้งาน" ด้านบน */}
          </div>
        </DrawerSection>
      </Drawer>

    </div>
  );
}

function SettingToggle({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-[var(--iamx-border)] bg-[var(--iamx-bg)]">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--iamx-fg)]">{title}</div>
        {subtitle && (
          <div className="text-[11.5px] text-[var(--iamx-fg-muted)]">{subtitle}</div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
