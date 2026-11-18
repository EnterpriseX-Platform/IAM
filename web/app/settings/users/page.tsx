"use client";
import { Checkbox, Radio } from "@/app/components/iamx/Check";
import { tx } from "@/lib/i18n";

import { groupRoles, useItemGroups } from "../../components/iamx/roleGroups";
import { permLabel, sortPerms } from "../../components/iamx/perms";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  DrawerSection,
  EmptyState,
  FilterChip,
  FormField,
  IconButton,
  Input,
  PageHeader,
  Select,
  Tabs,
  Toolbar,
} from "@/app/components/iamx";
import { showConfirm, showError, showSuccess } from "@/lib/swal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { activeUserTypes, domainAllowsType, isStaffType, normalizeUserType, staffCode, userTypeName, useUserTypes } from "@/lib/menuType";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Shield,
  Trash2,
  X,
} from "@/app/components/iamx/carbonLucide";
import MultiSelect from "@/app/components/MultiSelect";
import Select2 from "@/app/components/Select2";
import { MenuPicker, type PickerGroups } from "../../components/iamx/MenuPicker";
import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

async function invalidateUserMenuCache(refUserId: string) {
  const response = await fetch(`${API_BASE}/cache/invalidate/menu/${refUserId}`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to invalidate cache");
  return response.json();
}

interface UserInfo {
  user_id: number;
  first_name?: string;
  last_name?: string;
  first_name_eng?: string;
  last_name_eng?: string;
  email?: string;
  user_name?: string;
  status?: string;
  personal_card_id?: string;
  user_type?: string | null;
  user_ministry_id?: string | null;
  user_agency_id?: string | null;
  user_department_id?: string | null;
  user_operation_id?: string | null;
  user_ministry_name?: string | null;
  user_agency_name?: string | null;
  user_department_name?: string | null;
  user_operation_name?: string | null;
  send_flag?: string | null;
}

interface Role {
  id: string;
  code: string;
  name: string;
  role_type?: string;
}

interface ObjectNode {
  id: number;
  label: string;
  name: string;
  code: string;
  path: string;
  level: number;
  domain_name?: string;
  domain_menu_type?: string;
  application_name?: string;
  module_name?: string;
  children: ObjectNode[];
}

interface Ministry {
  agcId: string;
  agcName: string;
  agcType: string;
  agcCode?: string;
  parentId?: string;
}

interface Department {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  agencyId: string;
  ministryId: string;
}

interface GeoRef {
  id: string;
  name: string;
}

// 13/11/69: แท็บ "สิทธิ์" รวมความรับผิดชอบ + บทบาท + ขั้นสูง (ข้อยกเว้นรายคน · ข้อมูลที่เห็น)
type DrawerTab = "info" | "access" | "objects" | "data";


export default function UsersPage() {
  useUserTypes();
  // 15/11/69: กลุ่มมาจาก System settings › Groups
  useItemGroups("ROLE");
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [objectTree, setObjectTree] = useState<ObjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // 14/11/69 PDPA: รายการได้เลขบัตรแบบปิด (4 ตัวท้าย) → ค้นด้วยเลขบัตรให้ server หาคนที่ตรง
  const [cardMatchIds, setCardMatchIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [userTypeFilter, setUserTypeFilter] = useState<string>("");
  // 18/10/69: ตารางเดิมไม่มี role ต้องเปิดทีละคน → คอลัมน์ + ตัวกรอง role (endpoint ใหม่ /user-role-summary)
  const [roleSummary, setRoleSummary] = useState<Record<string, { code: string; name: string }[]>>({});
  const [roleFilter, setRoleFilter] = useState("");
  // แท็บออบเจ็กต์: ค่าเริ่มต้นแสดง "สิทธิ์ที่มีผลจริง" (เดิมแสดงต้นไม้ 675 เมนูว่าง ๆ ของสิทธิ์เฉพาะคน)
  const [objView, setObjView] = useState<"effective" | "custom">("effective");
  const [effective, setEffective] = useState<any[] | null>(null);
  const [effSearch, setEffSearch] = useState("");
  const [twoFA, setTwoFA] = useState<{ enabled: boolean; configured: boolean; pending: boolean } | null>(null);
  const [twoFAMsg, setTwoFAMsg] = useState("");
  const [twoFABusy, setTwoFABusy] = useState(false);
  const twoFAQuery = (u: { user_name?: string; email?: string }) =>
    `username=${encodeURIComponent(u.user_name || "")}&email=${encodeURIComponent(u.email || "")}`;
  const loadTwoFA = async (u: UserInfo) => {
    setTwoFA(null); setTwoFAMsg("");
    try {
      const r = await fetch(`${API_BASE}/admin/two-factor?${twoFAQuery(u)}`).then((x) => x.json());
      if (r.success) setTwoFA(r.data); else setTwoFAMsg(r.message || tx("อ่านสถานะไม่สำเร็จ"));
    } catch { setTwoFAMsg(tx("อ่านสถานะไม่สำเร็จ")); }
  };
  const toggleTwoFA = async (u: UserInfo, enabled: boolean) => {
    setTwoFABusy(true); setTwoFAMsg("");
    try {
      const r = await fetch(`${API_BASE}/admin/two-factor`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u.user_name || "", email: u.email || "", enabled }),
      }).then((x) => x.json());
      if (r.success) setTwoFA(r.data); else setTwoFAMsg(r.message || tx("ตั้งค่าไม่สำเร็จ"));
    } catch { setTwoFAMsg(tx("ตั้งค่าไม่สำเร็จ")); }
    setTwoFABusy(false);
  };
  // PROD มีผู้ใช้ ~16,000 คน — วาดทั้งหมดทีเดียวทำให้หน้าค้าง จึงแสดงทีละหน้า
  // (ค้นหา/กรองยังทำกับรายชื่อทั้งหมดเหมือนเดิม)
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("info");
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    first_name_eng: "",
    last_name_eng: "",
    email: "",
    user_name: "",
    status: "active",
    password: "",
    personal_card_id: "",
    user_type: staffCode(),
    user_ministry_id: "",
    user_agency_id: "",
    user_department_id: "",
    user_operation_id: "",
    send_flag: "",
  });
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);

  // Cascading lookups for drawer form สังกัด
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [formAgencies, setFormAgencies] = useState<Ministry[]>([]);
  const [formDepartments, setFormDepartments] = useState<Ministry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Assignment state (for selected user in drawer)
  const [userRoles, setUserRoles] = useState<string[]>([]);
  // 21/10/69 รูปโปรไฟล์: user_id → เวลาที่แก้ล่าสุด (โหลดรูปเฉพาะคนที่มี)
  const [avatarIds, setAvatarIds] = useState<Record<string, string>>({});
  const loadAvatarIds = async () => { try { const d = await (await fetch(`${API_BASE}/users/avatar-ids`)).json(); setAvatarIds(d.data || {}); } catch {} };
  useEffect(() => { loadAvatarIds(); }, []);
  useEffect(() => {
    const digits = search.replace(/\D/g, "");
    if (digits.length < 4 || digits.length !== search.replace(/[\s-]/g, "").length) { setCardMatchIds(new Set()); return; }
    const t = setTimeout(() => {
      fetch(`${API_BASE}/directory/users?include_inactive=1&card=${digits}`)
        .then((r) => r.json())
        .then((j) => setCardMatchIds(new Set(((j.data || []) as { user_id: string }[]).map((u) => String(u.user_id)))))
        .catch(() => setCardMatchIds(new Set()));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const uploadAvatar = async (file: File) => {
    if (!editingUser) return;
    if (file.size > 2 * 1024 * 1024) { showError(tx("รูปใหญ่เกินไป"), tx("ขนาดไม่เกิน 2 MB")); return; }
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`${API_BASE}/users/${editingUser.user_id}/avatar`, { method: "PUT", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { showError(tx("อัปโหลดไม่สำเร็จ"), d.error || ""); return; }
    loadAvatarIds();
  };
  const removeAvatar = async () => {
    if (!editingUser) return;
    if (!(await showConfirm(tx("ลบรูปโปรไฟล์"), tx("ใช้อักษรย่อแทน"), tx("ลบรูป")))) return;
    await fetch(`${API_BASE}/users/${editingUser.user_id}/avatar`, { method: "DELETE" });
    loadAvatarIds();
  };
  // 20/10/69 แยกแท็บความรับผิดชอบ · บทบาทที่ได้จากชุด (role_id → ชื่อชุด) ถอดที่แท็บบทบาทไม่ได้
  const [userResps, setUserResps] = useState<Array<{ id: number; code: string; name: string; role_count: number }>>([]);
  const [roleFromResp, setRoleFromResp] = useState<Record<string, string[]>>({});
  const [allResps, setAllResps] = useState<Array<{ id: number; code: string; name: string; parent_id?: number; role_count: number; is_active: number }>>([]);
  const [respPickQ, setRespPickQ] = useState("");
  const [userObjects, setUserObjects] = useState<Map<number, string[]>>(new Map());
  const [userDataAccess, setUserDataAccess] = useState<any[]>([]);
  const [roleSearch, setRoleSearch] = useState("");

  const [objectPermTypes, setObjectPermTypes] = useState<string[]>(["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"]);
  const [dataAccessPermTypes, setDataAccessPermTypes] = useState<string[]>(["ALL", "MINISTRY", "DEPARTMENT", "OPER"]);

  // Data access form (redesigned)
  const [daMinistryIds, setDaMinistryIds] = useState<string[]>([]);
  const [daAgencyIds, setDaAgencyIds] = useState<string[]>([]);
  const [daUnitIds, setDaUnitIds] = useState<string[]>([]);
  const [daRoleId, setDaRoleId] = useState("");
  const [daPermission, setDaPermission] = useState<string>("ALL");
  const [daStagedEntries, setDaStagedEntries] = useState<Array<{ agency_path: string; permissions: string[]; label: string }>>([]);
  const [daFilteredMinistries, setDaFilteredMinistries] = useState<Ministry[]>([]);
  const [daFilteredAgencies, setDaFilteredAgencies] = useState<Ministry[]>([]);
  const [daFilteredUnits, setDaFilteredUnits] = useState<Ministry[]>([]);
  // Geo filters
  const [geoRegion, setGeoRegion] = useState("");
  const [geoProvinceDistrict, setGeoProvinceDistrict] = useState("");
  const [geoProvince, setGeoProvince] = useState("");
  const [geoDistrict, setGeoDistrict] = useState("");
  const [geoSubdistrict, setGeoSubdistrict] = useState("");
  const [geoRegions, setGeoRegions] = useState<GeoRef[]>([]);
  const [geoProvinceDistricts, setGeoProvinceDistricts] = useState<GeoRef[]>([]);
  const [geoProvinces, setGeoProvinces] = useState<GeoRef[]>([]);
  const [geoDistricts, setGeoDistricts] = useState<GeoRef[]>([]);
  const [geoSubdistricts, setGeoSubdistricts] = useState<GeoRef[]>([]);
  const [geoFilterOpen, setGeoFilterOpen] = useState(false);

  // Cache state
  const [expandedAgencies, setExpandedAgencies] = useState<Set<string>>(new Set());

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<string>(() => staffCode());
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number; imported: number; skipped: number; failed: number;
    errors: { row: number; name?: string; reason: string }[];
    warnings: { row: number; name?: string; reason: string }[];
  } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEscapeKey(drawerOpen, () => setDrawerOpen(false));

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchObjectTree();
    fetchMinistries();
    fetchDepartments();
    fetch(`${API_BASE}/admin/permission-types?group=OBJECT`)
      .then((r) => r.json())
      .then((d) => { if ((d.data || []).length > 0) setObjectPermTypes(d.data.map((p: any) => p.permission_type)); })
      .catch(() => {});
    fetch(`${API_BASE}/admin/permission-types?group=DATA_ACCESS`)
      .then((r) => r.json())
      .then((d) => {
        if ((d.data || []).length > 0) {
          const order = ["ALL", "MINISTRY", "DEPARTMENT", "OPER"];
          const types: string[] = d.data.map((p: any) => p.permission_type);
          types.sort((a, b) => {
            const ai = order.indexOf(a);
            const bi = order.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          });
          setDataAccessPermTypes(types);
        }
      })
      .catch(() => {});
  }, []);

  // Geo reference data loading
  useEffect(() => {
    fetch(`${API_BASE}/admin/ref/regions`).then(r => r.json()).then(d => setGeoRegions(d.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!geoRegion) { setGeoProvinceDistricts([]); setGeoProvinceDistrict(""); return; }
    fetch(`${API_BASE}/admin/ref/province-districts?region_id=${geoRegion}`).then(r => r.json()).then(d => setGeoProvinceDistricts(d.data || [])).catch(() => {});
  }, [geoRegion]);
  useEffect(() => {
    if (!geoRegion && !geoProvinceDistrict) { setGeoProvinces([]); setGeoProvince(""); return; }
    const qs = [`region_id=${geoRegion}`, geoProvinceDistrict ? `province_district_id=${geoProvinceDistrict}` : ""].filter(Boolean).join("&");
    fetch(`${API_BASE}/admin/ref/provinces?${qs}`).then(r => r.json()).then(d => setGeoProvinces(d.data || [])).catch(() => {});
  }, [geoRegion, geoProvinceDistrict]);
  useEffect(() => {
    if (!geoProvince) { setGeoDistricts([]); setGeoDistrict(""); return; }
    fetch(`${API_BASE}/admin/ref/districts?province_id=${geoProvince}`).then(r => r.json()).then(d => setGeoDistricts(d.data || [])).catch(() => {});
  }, [geoProvince]);
  useEffect(() => {
    if (!geoDistrict) { setGeoSubdistricts([]); setGeoSubdistrict(""); return; }
    fetch(`${API_BASE}/admin/ref/subdistricts?district_id=${geoDistrict}`).then(r => r.json()).then(d => setGeoSubdistricts(d.data || [])).catch(() => {});
  }, [geoDistrict]);

  // Data access agency filtering with geo
  const buildFilteredQuery = (levelType: string, parentIds: string[]) => {
    const params = new URLSearchParams();
    params.set("level_type", levelType);
    if (parentIds.length) params.set("parent_ids", parentIds.join(","));
    if (geoRegion) params.set("region_id", geoRegion);
    if (geoProvince) params.set("province_id", geoProvince);
    if (geoDistrict) params.set("district_id", geoDistrict);
    if (geoSubdistrict) params.set("subdistrict_id", geoSubdistrict);
    return `${API_BASE}/admin/agencies/filtered?${params.toString()}`;
  };
  useEffect(() => {
    fetch(buildFilteredQuery("MIN", []))
      .then(r => r.json())
      .then(d => setDaFilteredMinistries(d.data || []))
      .catch(() => setDaFilteredMinistries([]));
  }, [geoRegion, geoProvince, geoDistrict, geoSubdistrict]);
  useEffect(() => {
    if (daMinistryIds.length === 0) {
      setDaFilteredAgencies([]); setDaAgencyIds([]); return;
    }
    fetch(buildFilteredQuery("DEPT", daMinistryIds))
      .then(r => r.json())
      .then(d => setDaFilteredAgencies(d.data || []))
      .catch(() => setDaFilteredAgencies([]));
  }, [daMinistryIds, geoRegion, geoProvince, geoDistrict, geoSubdistrict]);
  useEffect(() => {
    if (daAgencyIds.length === 0) {
      setDaFilteredUnits([]); setDaUnitIds([]); return;
    }
    fetch(buildFilteredQuery("UNIT", daAgencyIds))
      .then(r => r.json())
      .then(d => setDaFilteredUnits(d.data || []))
      .catch(() => setDaFilteredUnits([]));
  }, [daAgencyIds, geoRegion, geoProvince, geoDistrict, geoSubdistrict]);

  // Cascade: ministry → agencies (กรม)
  useEffect(() => {
    if (formData.user_ministry_id) {
      fetch(`${API_BASE}/admin/agencies/children?parent_id=${formData.user_ministry_id}`)
        .then((r) => r.json())
        .then((d) => setFormAgencies(d.data || []))
        .catch(() => setFormAgencies([]));
    } else {
      setFormAgencies([]);
    }
  }, [formData.user_ministry_id]);

  // Cascade: agency → หน่วยปฏิบัติ
  useEffect(() => {
    if (formData.user_agency_id) {
      fetch(`${API_BASE}/admin/agencies/children?parent_id=${formData.user_agency_id}`)
        .then((r) => r.json())
        .then((d) => setFormDepartments(d.data || []))
        .catch(() => setFormDepartments([]));
    } else {
      setFormDepartments([]);
    }
  }, [formData.user_agency_id]);

  const fetchMinistries = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/agencies/ministries`);
      const data = await res.json();
      setMinistries(data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/agencies/departments`);
      const data = await res.json();
      setDepartments(data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRoleSummary = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/user-role-summary`);
      const data = await res.json();
      setRoleSummary(data.data || {});
    } catch (e) {
      console.error("Failed to fetch role summary:", e);
    }
  };

  const fetchUsers = async () => {
    fetchRoleSummary();
    try {
      const res = await fetch(`${API_BASE}/users?include_inactive=1`);
      const data = await res.json();
      setUsers(data.data || []);
    } catch (e) {
      console.error("Failed to fetch users:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/roles`);
      const data = await res.json();
      setRoles(data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchObjectTree = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/options/object-hierarchy`);
      const data = await res.json();
      setObjectTree(data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEffective = async (userId: number | string) => {
    setEffective(null);
    try {
      const res = await fetch(`${API_BASE}/admin/effective-permissions?user_id=${encodeURIComponent(String(userId))}`);
      const data = await res.json();
      setEffective(data.data || []);
    } catch (e) {
      setEffective([]);
    }
  };

  const fetchUserResps = async (userId: string) => {
    try {
      const d = await (await fetch(`${API_BASE}/admin/resp-ux/by-user/${userId}`)).json();
      setUserResps(d.data?.responsibilities || []);
      const m: Record<string, string[]> = {};
      (d.data?.grants || []).forEach((g: { role_id: string; resp_name: string }) => { m[g.role_id] = [...(m[g.role_id] || []), g.resp_name]; });
      setRoleFromResp(m);
      if (!allResps.length) {
        const all = await (await fetch(`${API_BASE}/admin/resp-ux`)).json();
        setAllResps(all.data || []);
      }
    } catch { setUserResps([]); setRoleFromResp({}); }
  };
  const addUserResp = async (respId: number) => {
    if (!editingUser) return;
    const r = await fetch(`${API_BASE}/admin/resp-ux/${respId}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: editingUser.user_id }) });
    if (!r.ok) { showError(tx("ผิดพลาด"), tx("ใส่ความรับผิดชอบไม่สำเร็จ")); return; }
    setRespPickQ("");
    fetchUserAssignments(editingUser.user_id);
    if (editingUser.user_name) { try { await invalidateUserMenuCache(editingUser.user_name); } catch {} }
  };
  const removeUserResp = async (resp: { id: number; name: string }) => {
    if (!editingUser) return;
    if (!(await showConfirm(tx("ถอดความรับผิดชอบ"), tx("{0} — บทบาทที่ได้จากชุดนี้จะถูกถอดด้วย (บทบาทที่กำหนดเพิ่มรายคนไม่ถูกแตะ)", resp.name), tx("ถอด")))) return;
    const r = await fetch(`${API_BASE}/admin/resp-ux/${resp.id}/users/${editingUser.user_id}`, { method: "DELETE" });
    if (!r.ok) { showError(tx("ผิดพลาด"), tx("ถอดไม่สำเร็จ")); return; }
    fetchUserAssignments(editingUser.user_id);
    if (editingUser.user_name) { try { await invalidateUserMenuCache(editingUser.user_name); } catch {} }
  };

  // 13/11/69: ไม่รีเซ็ตมุมมองที่นี่ (เดิมติ๊กข้อยกเว้นแล้วเด้งกลับ "ที่เห็นจริง") — รีเซ็ตตอนเปิดผู้ใช้แทน
  const fetchUserAssignments = async (userId: number) => {
    fetchEffective(userId);
    try {
      const rolesRes = await fetch(`${API_BASE}/admin/user-role-mappings?user_id=${userId}`);
      const rolesData = await rolesRes.json();
      setUserRoles((rolesData.data || []).map((r: any) => r.role_id));
      fetchUserResps(String(userId));

      const objRes = await fetch(`${API_BASE}/admin/user-custom-object-mappings?user_id=${userId}`);
      const objData = await objRes.json();
      const objMap = new Map<number, string[]>();
      (objData.data || []).forEach((m: any) => objMap.set(m.object_id, m.permissions || []));
      setUserObjects(objMap);

      const dataRes = await fetch(`${API_BASE}/admin/user-custom-data-accesses?user_id=${userId}`);
      const dataData = await dataRes.json();
      setUserDataAccess(dataData.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const openAddDrawer = () => {
    setEditingUser(null);
    setFormData({
      first_name: "",
      last_name: "",
      first_name_eng: "",
      last_name_eng: "",
      email: "",
      user_name: "",
      status: "active",
      password: "",
      personal_card_id: "",
      user_type: staffCode(),
      user_ministry_id: "",
      user_agency_id: "",
      user_department_id: "",
      user_operation_id: "",
      send_flag: "",
    });
    setCreatedTempPassword(null);
    setDrawerTab("info");
    setDrawerOpen(true);
  };

  const openEditDrawer = (user: UserInfo, tab: DrawerTab = "info") => {
    setEditingUser(user);
    // 14/11/69 PDPA: รายการมีเลขบัตรแบบปิด → ดึงเลขเต็มจากรายการเดียวมาแสดงในฟอร์ม
    fetch(`${API_BASE}/directory/users/${user.user_id}`)
      .then((r) => r.json())
      .then((j) => { const pid = (j.data || j)?.personal_card_id; if (pid) setFormData((f) => ({ ...f, personal_card_id: pid })); })
      .catch(() => {});
    loadTwoFA(user);
    setFormData({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      first_name_eng: user.first_name_eng || "",
      last_name_eng: user.last_name_eng || "",
      email: user.email || "",
      user_name: user.user_name || "",
      status: user.status || "active",
      password: "",
      personal_card_id: user.personal_card_id || "",
      user_type: normalizeUserType(user.user_type),
      user_ministry_id: user.user_ministry_id || "",
      user_agency_id: user.user_agency_id || "",
      user_department_id: user.user_department_id || "",
      user_operation_id: user.user_operation_id || "",
      send_flag: user.send_flag || "",
    });
    setCreatedTempPassword(null);
    setDrawerTab(tab);
    setDrawerOpen(true);
    setDaStagedEntries([]);
    setDaMinistryIds([]);
    setDaAgencyIds([]);
    /* setDaUnitIds([]); */
    setDaRoleId("");
    setDaPermission("ALL");
    setObjView("effective");
    fetchUserAssignments(user.user_id);
  };

  const handleSave = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      return showError(tx("กรุณากรอก"), tx("ชื่อ และนามสกุล จำเป็น"));
    }
    if (!activeUserTypes().some((t) => t.code === formData.user_type)) {
      return showError(tx("กรุณาเลือก"), tx("ประเภทผู้ใช้งาน"));
    }

    if (!editingUser && formData.password) {
      const pw = formData.password;
      const local = (formData.email || "").split("@")[0].toLowerCase();
      if (pw.length < 10) return showError(tx("รหัสผ่านไม่ผ่านกติกา"), tx("รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร"));
      if (!/^[\x21-\x7E]+$/.test(pw)) return showError(tx("รหัสผ่านไม่ผ่านกติกา"), tx("รหัสผ่านใช้ได้เฉพาะภาษาอังกฤษ ตัวเลข และอักขระพิเศษ"));
      if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw))
        return showError(tx("รหัสผ่านไม่ผ่านกติกา"), tx("รหัสผ่านต้องมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ"));
      if (local && pw.toLowerCase().includes(local)) return showError(tx("รหัสผ่านไม่ผ่านกติกา"), tx("รหัสผ่านห้ามมีชื่อผู้ใช้หรืออีเมล"));
    }

    try {
      const url = editingUser ? `${API_BASE}/users/${editingUser.user_id}` : `${API_BASE}/users`;
      const method = editingUser ? "PUT" : "POST";
      const body: any = { ...formData };
      // For update, send ministry/agency/department even if empty (so we can clear)
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        if (!editingUser && data.temp_password) setCreatedTempPassword(data.temp_password);
        // แก้ไขแล้ว: ให้แท็บบทบาท/ออบเจ็กต์กรองตามประเภทที่เพิ่งบันทึก ไม่ต้องปิดเปิด drawer ใหม่
        if (editingUser) setEditingUser({ ...editingUser, ...formData });
        if (!editingUser && data.data?.user_id) {
          const newUser: UserInfo = {
            user_id: data.data.user_id,
            ...formData,
          };
          for (const rid of newResps) {
            try { await fetch(`${API_BASE}/admin/resp-ux/${rid}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: newUser.user_id }) }); } catch {}
          }
          for (const roleId of newRoles) {
            try { await fetch(`${API_BASE}/admin/user-role-mappings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: newUser.user_id, role_id: roleId, effective_date: new Date().toISOString().split("T")[0], is_active: 1 }) }); } catch {}
          }
          setNewResps([]);
          setNewRoles([]);
          setEditingUser(newUser);
          setDrawerTab("access");
          fetchUserAssignments(newUser.user_id);
          fetchUserResps(String(newUser.user_id));
        }
        fetchUsers();
        if (!editingUser && data.password_mode === "link") {
          if (data.password_link_sent) showSuccess(tx("บันทึกสำเร็จ"), tx("ส่งลิงก์ตั้งรหัสผ่านไปที่ {0} แล้ว", formData.email));
          else showError(tx("บันทึกผู้ใช้แล้ว แต่ส่งลิงก์ตั้งรหัสผ่านไม่สำเร็จ"), data.password_link_error || tx("กรุณาตรวจสอบอีเมลของผู้ใช้"));
        } else if (!editingUser && data.password_mode === "admin") {
          showSuccess(tx("บันทึกสำเร็จ"), tx("ตั้งรหัสผ่านตามที่กรอกแล้ว"));
        } else {
          showSuccess(tx("บันทึกสำเร็จ"));
        }
        if (!editingUser) setFormData((p) => ({ ...p, password: "" }));
      } else {
        showError(tx("บันทึกไม่สำเร็จ"), data.error || data.message || tx("เกิดข้อผิดพลาด"));
      }
    } catch (e) {
      console.error(e);
      showError(tx("บันทึกไม่สำเร็จ"));
    }
  };

  const handleDelete = async (user: UserInfo) => {
    const confirmed = await showConfirm(tx("ลบผู้ใช้"), tx("{0} {1} — ลบบัญชี บทบาท ความรับผิดชอบ สิทธิ์รายคน และคำร้องทั้งหมด (รวมที่ยังไม่อนุมัติ) ออกถาวร · ทะเบียนบุคลากรไม่ถูกลบ · ถ้าแค่ไม่ให้เข้าระบบ ใช้ปิดใช้งานแทน", user.first_name || "", user.last_name || ""), tx("ลบถาวร"));
    if (!confirmed) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.user_id}`, { method: "DELETE" });
      if (res.ok) {
        showSuccess(tx("ลบสำเร็จ"));
        setDrawerOpen(false);
        fetchUsers();
      } else {
        const data = await res.json();
        showError(tx("ผิดพลาด"), data.error || tx("ลบไม่สำเร็จ"));
      }
    } catch {
      showError(tx("ผิดพลาด"));
    }
  };

  const handleToggleStatus = async (user: UserInfo) => {
    const newStatus = user.status === "active" ? "inactive" : "active";
    try {
      const res = await fetch(`${API_BASE}/users/${user.user_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.user_id === user.user_id ? { ...u, status: newStatus } : u)));
        if (editingUser?.user_id === user.user_id) {
          setEditingUser({ ...editingUser, status: newStatus });
        }
      } else {
        const data = await res.json();
        showError(tx("ผิดพลาด"), data.error || tx("อัปเดตสถานะไม่สำเร็จ"));
      }
    } catch {
      showError(tx("ผิดพลาด"));
    }
  };

  const handleImportSubmit = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(importFile);
      });
      const res = await fetch(`${API_BASE}/users/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, fileName: importFile.name, empType: importType, userCreate: "admin" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Import failed");
      const data = json.data;
      fetchUsers();
      const allSuccess = data.imported === data.total && data.total > 0;
      if (allSuccess) {
        showSuccess(tx("นำเข้าสำเร็จ {0}/{1} รายการ", data.imported, data.total));
        setImportOpen(false);
        setImportResult(null);
        setImportFile(null);
        if (importFileRef.current) importFileRef.current.value = "";
      } else {
        setImportResult(data);
      }
    } catch (err: unknown) {
      showError(tx("นำเข้าข้อมูลไม่สำเร็จ"), (err as Error).message);
    } finally {
      setImportLoading(false);
    }
  };

  const toggleRole = async (roleId: string) => {
    if (!editingUser) return;
    const hasRole = userRoles.includes(roleId);
    setUserRoles((prev) => (hasRole ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
    try {
      if (hasRole) {
        const res = await fetch(`${API_BASE}/admin/user-role-mappings?user_id=${editingUser.user_id}`);
        const data = await res.json();
        const mapping = (data.data || []).find((m: any) => m.role_id === roleId);
        if (mapping) await fetch(`${API_BASE}/admin/user-role-mappings/${mapping.id}`, { method: "DELETE" });
      } else {
        await fetch(`${API_BASE}/admin/user-role-mappings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: editingUser.user_id,
            role_id: roleId,
            effective_date: new Date().toISOString().split("T")[0],
            is_active: 1,
          }),
        });
      }
      fetchUserAssignments(editingUser.user_id);
      if (editingUser.user_name) {
        try { await invalidateUserMenuCache(editingUser.user_name); } catch {}
      }
    } catch (e) {
      setUserRoles((prev) => (hasRole ? [...prev, roleId] : prev.filter((id) => id !== roleId)));
      console.error(e);
    }
  };

  const toggleObjectPermission = async (objectId: number, permission: string) => {
    if (!editingUser) return;
    const currentPerms = userObjects.get(objectId) || [];
    const hasPerm = currentPerms.includes(permission);
    try {
      await fetch(`${API_BASE}/admin/user-custom-object-mappings/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: editingUser.user_id,
          object_id: objectId,
          permission,
          enabled: !hasPerm,
        }),
      });
      fetchUserAssignments(editingUser.user_id);
      if (editingUser.user_name) {
        try { await invalidateUserMenuCache(editingUser.user_name); } catch {}
      }
    } catch (e) {
      console.error(e);
    }
  };


  // Stage entries locally — no API call yet
  const handleStageEntry = () => {
    if (!daPermission) return;

    const newEntries: Array<{ agency_path: string; permissions: string[]; label: string }> = [];

    if (daPermission === "ALL") {
      newEntries.push({ agency_path: "", permissions: ["ALL"], label: tx("ALL (ทุกหน่วยงาน)") });
    } else if (daPermission === "MINISTRY") {
      // MINISTRY scope = กระทรวง
      for (const minId of daMinistryIds) {
        const ministry = daFilteredMinistries.find((m) => m.agcId === minId);
        if (!ministry) continue;
        newEntries.push({ agency_path: ministry.agcCode || ministry.agcId, permissions: [daPermission], label: `MINISTRY · ${ministry.agcName}` });
      }
    } else if (daPermission === "DEPARTMENT") {
      // DEPARTMENT scope = กรม (agency_path = ministry.agency)
      for (const agencyId of daAgencyIds) {
        const agency = daFilteredAgencies.find((a) => a.agcId === agencyId);
        if (!agency) continue;
        const ministry = daFilteredMinistries.find((m) => m.agcId === agency.parentId);
        const parts = [ministry, agency].filter(Boolean).map((x) => x!.agcCode || x!.agcId);
        const labelParts = [ministry, agency].filter(Boolean).map((x) => x!.agcName);
        newEntries.push({ agency_path: parts.join("."), permissions: [daPermission], label: `DEPARTMENT · ${labelParts.join(" › ")}` });
      }
      if (newEntries.length === 0) {
        for (const minId of daMinistryIds) {
          const ministry = daFilteredMinistries.find((m) => m.agcId === minId);
          if (!ministry) continue;
          newEntries.push({ agency_path: ministry.agcCode || ministry.agcId, permissions: [daPermission], label: `DEPARTMENT · ${ministry.agcName}` });
        }
      }
    } else if (daPermission === "OPER") {
      // OPER scope = หน่วยปฏิบัติ (agency_path = ministry.agency.unit)
      for (const unitId of daUnitIds) {
        const unit = daFilteredUnits.find((u) => u.agcId === unitId);
        if (!unit) continue;
        const agency = daFilteredAgencies.find((a) => a.agcId === unit.parentId);
        const ministry = agency ? daFilteredMinistries.find((m) => m.agcId === agency.parentId) : undefined;
        const parts = [ministry, agency, unit].filter(Boolean).map((x) => x!.agcCode || x!.agcId);
        const labelParts = [ministry, agency, unit].filter(Boolean).map((x) => x!.agcName);
        newEntries.push({ agency_path: parts.join("."), permissions: [daPermission], label: `OPER · ${labelParts.join(" › ")}` });
      }
      // fallback: if no units selected, use agency
      if (newEntries.length === 0) {
        for (const agencyId of daAgencyIds) {
          const agency = daFilteredAgencies.find((a) => a.agcId === agencyId);
          if (!agency) continue;
          const ministry = daFilteredMinistries.find((m) => m.agcId === agency.parentId);
          const parts = [ministry, agency].filter(Boolean).map((x) => x!.agcCode || x!.agcId);
          const labelParts = [ministry, agency].filter(Boolean).map((x) => x!.agcName);
          newEntries.push({ agency_path: parts.join("."), permissions: [daPermission], label: `OPER · ${labelParts.join(" › ")}` });
        }
      }
      // fallback: if no agencies selected, use ministry
      if (newEntries.length === 0) {
        for (const minId of daMinistryIds) {
          const ministry = daFilteredMinistries.find((m) => m.agcId === minId);
          if (!ministry) continue;
          newEntries.push({ agency_path: ministry.agcCode || ministry.agcId, permissions: [daPermission], label: `OPER · ${ministry.agcName}` });
        }
      }
    }

    if (newEntries.length === 0) return;

    // Merge: deduplicate by agency_path
    setDaStagedEntries((prev) => {
      const merged = [...prev];
      for (const e of newEntries) {
        const idx = merged.findIndex((x) => x.agency_path === e.agency_path);
        if (idx >= 0) merged[idx] = e; // overwrite same path
        else merged.push(e);
      }
      return merged;
    });

    // Reset form fields
    setDaMinistryIds([]);
    setDaAgencyIds([]);
    setDaUnitIds([]);
    setDaPermission("ALL");
  };

  // Commit all staged entries to DB via batch replace
  const handleCommitDataAccess = async () => {
    if (!editingUser || daStagedEntries.length === 0) return;
    try {
      await fetch(`${API_BASE}/admin/user-custom-data-accesses/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: editingUser.user_id,
          role_id: daRoleId || null,
          entries: daStagedEntries.map(({ agency_path, permissions }) => ({ agency_path, permissions })),
        }),
      });
      setDaStagedEntries([]);
      setDaRoleId("");
      fetchUserAssignments(editingUser.user_id);
      showSuccess(tx("บันทึกสำเร็จ"));
    } catch (e) {
      console.error(e);
      showError(tx("บันทึกไม่สำเร็จ"));
    }
  };

  const handleDeleteDataAccess = async (id: string) => {
    const ok = await showConfirm(tx("ยืนยันการลบ"), tx("ลบสิทธิ์การเข้าถึงนี้?"));
    if (!ok) return;
    try {
      await fetch(`${API_BASE}/admin/user-custom-data-accesses/${id}`, { method: "DELETE" });
      showSuccess(tx("ลบสำเร็จ"));
      if (editingUser) fetchUserAssignments(editingUser.user_id);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleDataAccessPerm = async (id: string, permission: string, enabled: boolean) => {
    try {
      await fetch(`${API_BASE}/admin/user-custom-data-accesses/${id}/toggle-permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission, enabled }),
      });
      if (editingUser) fetchUserAssignments(editingUser.user_id);
    } catch (e) {
      console.error(e);
    }
  };

  // Filter users
  // 13/11/69: ตัวกรองจากหน้าแรก (?filter=norole|mismatch|noorg)
  const [attn, setAttn] = useState<"" | "norole" | "mismatch" | "noorg">("");
  useEffect(() => {
    try {
      const f = new URLSearchParams(window.location.search).get("filter");
      if (f === "norole" || f === "mismatch" || f === "noorg") setAttn(f);
    } catch {}
  }, []);
  const ATTN_LABEL = { norole: tx("ยังไม่มีบทบาท"), mismatch: tx("บทบาทไม่ตรงประเภท"), noorg: tx("ภายในที่ยังไม่มีสังกัด") } as const;
  const roleTypeByCode = useMemo(() => new Map(roles.map((r: any) => [r.code, r.role_type])), [roles]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (attn) {
        const held = roleSummary[String(u.user_id)] || [];
        if (u.status !== "active") return false;
        if (attn === "norole" && held.length) return false;
        if (attn === "mismatch" && !held.some((r) => normalizeUserType(roleTypeByCode.get(r.code) as string) !== normalizeUserType(u.user_type))) return false;
        if (attn === "noorg" && !(isStaffType(u.user_type) && !(u as any).user_ministry_id && !(u as any).user_department_id)) return false;
      }
      if (statusFilter && u.status !== statusFilter) return false;
      if (userTypeFilter && normalizeUserType(u.user_type) !== userTypeFilter) return false;
      if (roleFilter && !(roleSummary[String(u.user_id)] || []).some((r) => r.code === roleFilter)) return false;
      if (search) {
        const hay = `${u.first_name || ""} ${u.last_name || ""} ${u.user_name || ""} ${u.email || ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase()) && !cardMatchIds.has(String(u.user_id))) return false;
      }
      return true;
    });
  }, [users, search, statusFilter, userTypeFilter, roleFilter, roleSummary, attn, roleTypeByCode, cardMatchIds]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );
  // เปลี่ยนคำค้น/ตัวกรอง → กลับไปหน้าแรก
  useEffect(() => setPage(1), [search, statusFilter, userTypeFilter, roleFilter, attn]);
  const roleOptions = useMemo(() => {
    const m = new Map<string, string>();
    Object.values(roleSummary).forEach((rs) => rs.forEach((r) => m.set(r.code, r.name)));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [roleSummary]);

  const permissionTypes = sortPerms(objectPermTypes);
  // 13/11/69 (เคาะ 2ก): ข้อยกเว้นรายคนแสดงแค่ "ดู" · สิทธิ์ย่อยอยู่หลังปุ่ม
  const [showSubPerms, setShowSubPerms] = useState(false);
  const matrixPerms = showSubPerms ? permissionTypes : permissionTypes.filter((p) => p === "VIEW");
  // สิทธิ์ที่ได้จากบทบาทของผู้ใช้ (จาก effective-permissions) — objectId → perm → [role codes]
  const rolePermsByObj = useMemo(() => {
    const m = new Map<number, Map<string, string[]>>();
    (effective || []).forEach((r: any) => {
      if (r.source === "CUSTOM" || !r.object_id) return;
      let a: string[] = [];
      try { a = JSON.parse(r.permission || "[]"); } catch {}
      const om = m.get(Number(r.object_id)) || new Map<string, string[]>();
      a.forEach((p) => om.set(p, [...(om.get(p) || []), r.role_code || ""]));
      m.set(Number(r.object_id), om);
    });
    return m;
  }, [effective]);

  // Group objects by Domain > App > Module
  const groupedObjects = useMemo(() => {
    const groups: { [d: string]: { [a: string]: { [m: string]: ObjectNode[] } } } = {};
    const expectedMenuType = normalizeUserType(editingUser?.user_type);
    const processNode = (node: ObjectNode) => {
      if (!domainAllowsType(node.domain_menu_type, expectedMenuType)) return;
      const d = node.domain_name || tx("ไม่ระบุโดเมน");
      const a = node.application_name || tx("ไม่ระบุแอป");
      const m = node.module_name || tx("ไม่ระบุโมดูล");
      if (!groups[d]) groups[d] = {};
      if (!groups[d][a]) groups[d][a] = {};
      if (!groups[d][a][m]) groups[d][a][m] = [];
      groups[d][a][m].push(node);
      node.children.forEach(processNode);
    };
    objectTree.forEach(processNode);
    return groups;
  }, [objectTree, editingUser?.user_type]);


  const pickerGroups = useMemo(() => {
    const out: PickerGroups = {};
    Object.entries(groupedObjects).forEach(([d, apps]) => {
      out[d] = {};
      Object.entries(apps).forEach(([a, mods]) => {
        out[d][a] = {};
        Object.entries(mods).forEach(([m, objs]) => {
          out[d][a][m] = objs.map((o) => ({ id: o.id, label: (o as any).label || o.name, code: o.code, children: [] }));
        });
      });
    });
    return out;
  }, [groupedObjects]);

  const groupedDataAccess = useMemo(() => {
    const groups = new Map<string, { roleCode: string; roleName: string; items: any[] }>();
    userDataAccess.forEach((a: any) => {
      const key = a.role_code || "global";
      const name = a.role_name || "Global";
      if (!groups.has(key)) groups.set(key, { roleCode: key, roleName: name, items: [] });
      groups.get(key)!.items.push(a);
    });
    return Array.from(groups.values());
  }, [userDataAccess]);

  const [newResps, setNewResps] = useState<string[]>([]);
  const [newRoles, setNewRoles] = useState<string[]>([]);
  // 13/11/69: ทำกับผู้ใช้ที่ติ๊กเลือกหลายคนพร้อมกัน (เดิมติ๊กได้แต่ไม่มีปุ่ม)
  const [bulkRole, setBulkRole] = useState("");
  const [bulkResp, setBulkResp] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectedUsers = users.filter((u) => selected.includes(u.user_id));
  const runBulk = async (label: string, fn: (u: UserInfo) => Promise<Response | void>) => {
    if (!selectedUsers.length) return;
    // บอกชื่อคนที่จะโดน (ไม่เกิน 5 คน) ไม่ใช่แค่จำนวน
    const names = selectedUsers.slice(0, 5).map((u: any) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.user_name).join(", ");
    const more = selectedUsers.length > 5 ? tx("และอีก {0} คน", selectedUsers.length - 5) : "";
    if (!(await showConfirm(label, `${names}${more}`, tx("ยืนยัน")))) return;
    setBulkBusy(true);
    let fail = 0;
    for (const u of selectedUsers) {
      try { const r = await fn(u); if (r && !r.ok) fail++; } catch { fail++; }
    }
    setBulkBusy(false);
    await Promise.all([fetchUsers(), fetchRoleSummary()]);
    if (fail) showError(tx("{0} ไม่สำเร็จ {1} คน", label, fail), "");
    else showSuccess(tx("{0} แล้ว {1} คน", label, selectedUsers.length));
  };
  const bulkAssignRole = () => {
    const role = roles.find((r) => String(r.id) === bulkRole);
    if (!role) return;
    return runBulk(tx("ผูกบทบาท {0}", role.code), async (u) => {
      if ((roleSummary[u.user_id] || []).some((r: any) => r.code === role.code)) return;
      return fetch(`${API_BASE}/admin/user-role-mappings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: u.user_id, role_id: role.id, effective_date: new Date().toISOString().split("T")[0], is_active: 1 }),
      });
    });
  };
  const bulkAssignResp = () => {
    const resp = allResps.find((r) => String(r.id) === bulkResp);
    if (!resp) return;
    return runBulk(tx("ผูกความรับผิดชอบ {0}", resp.name), (u) =>
      fetch(`${API_BASE}/admin/resp-ux/${resp.id}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: u.user_id }) }));
  };
  const bulkStatus = (status: "active" | "inactive") =>
    runBulk(status === "active" ? "Activate" : "Deactivate", (u) =>
      u.status === status ? Promise.resolve() : fetch(`${API_BASE}/users/${u.user_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }));
  const bulkExport = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = [tx("ชื่อผู้ใช้"), tx("ชื่อ"), tx("นามสกุล"), tx("อีเมล"), tx("สถานะ"), tx("บทบาท")];
    const lines = selectedUsers.map((u: any) => [u.user_name, u.first_name, u.last_name, u.email, u.status === "active" ? tx("ใช้งาน") : tx("ปิดใช้งาน"), (roleSummary[u.user_id] || []).map((r: any) => r.code).join(" ")].map(esc).join(","));
    const blob = new Blob(["\ufeff" + [head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `iamx-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  useEffect(() => {
    if ((selected.length || (drawerOpen && !editingUser)) && !allResps.length) {
      fetch(`${API_BASE}/admin/resp-ux`).then((r) => r.json()).then((d) => setAllResps(d.data || [])).catch(() => {});
    }
  }, [selected.length, allResps.length, drawerOpen, editingUser]);

  // Table selection
  const allChecked = filtered.length > 0 && filtered.every((u) => selected.includes(u.user_id));
  const someChecked = !allChecked && filtered.some((u) => selected.includes(u.user_id));
  const toggleAll = () => {
    if (allChecked) setSelected((prev) => prev.filter((id) => !filtered.find((u) => u.user_id === id)));
    else setSelected((prev) => Array.from(new Set([...prev, ...filtered.map((u) => u.user_id)])));
  };
  const toggleOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHeader
        title={<span className="block whitespace-nowrap overflow-hidden text-ellipsis">{tx("ผู้ใช้งาน")}</span>}
        actions={
          <>
            <Button variant="secondary" icon="upload" onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}>
              
              {tx("นำเข้าข้อมูล")}
            </Button>
            <Button variant="primary" icon="plus" onClick={openAddDrawer}>
              
              {tx("เพิ่มผู้ใช้")}
            </Button>
          </>
        }
      />

      <div className="max-md:[&>*]:flex-wrap max-md:[&>*]:h-auto max-md:[&>*]:gap-y-2 max-md:[&>*]:py-2">
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, username or email"
        filters={
          <>
            {attn && (
              <FilterChip
                label={tx("ต้องจัดการ")}
                value={ATTN_LABEL[attn]}
                onClick={() => {}}
                onClear={() => { setAttn(""); try { window.history.replaceState(null, "", window.location.pathname); } catch {} }}
              />
            )}
            {/* 14/11/69: เดิมเป็นปุ่มกดวนค่า (ไม่รู้ว่ากดแล้วจะได้อะไร) → dropdown แบบเดียวกับบทบาท */}
            <Select2
              value={statusFilter}
              onChange={(v) => setStatusFilter((v || "") as typeof statusFilter)}
              placeholder="All statuses"
              className="w-[150px]"
              options={[{ value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
            />
            <Select2
              value={userTypeFilter}
              onChange={(v) => setUserTypeFilter((v || "") as typeof userTypeFilter)}
              placeholder="All types"
              className="w-[140px]"
              options={[{ value: "", label: "All types" }, ...activeUserTypes().map((t) => ({ value: t.code, label: t.name }))]}
            />
            <Select2
              value={roleFilter}
              onChange={(v) => setRoleFilter(v)}
              placeholder={tx("ทุกบทบาท")}
              className="w-[240px]"
              options={[{ value: "", label: tx("ทุกบทบาท") }, ...roleOptions.map(([code, name]) => ({ value: code, label: `${code}${name && name !== code ? ` · ${name}` : ""}` }))]}
            />
          </>
        }
        right={
          <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
            {filtered.length} {" "}{tx("ผู้ใช้")}
          </span>
        }
        selectedCount={selected.length}
        onClearSelection={() => setSelected([])}
        // เดิมมีปุ่ม "ลบ" แบบเลือกหลายคนที่ไม่มีการทำงาน (กดแล้วไม่มีอะไร) — ซ่อนไว้จนกว่าจะทำจริง
        bulkActions={
          <>
            <Select2 value={bulkRole} onChange={setBulkRole} placeholder={tx("เลือกบทบาท")} className="w-[200px]"
              options={roles.map((r: any) => ({ value: String(r.id), label: `${r.code} · ${r.name}` }))} />
            <Button size="sm" variant="secondary" disabled={!bulkRole || bulkBusy} onClick={bulkAssignRole}>Assign role</Button>
            <Select2 value={bulkResp} onChange={setBulkResp} placeholder={tx("เลือกความรับผิดชอบ")} className="w-[220px]"
              options={allResps.filter((r) => r.is_active !== 0).map((r) => ({ value: String(r.id), label: r.name }))} />
            <Button size="sm" variant="secondary" disabled={!bulkResp || bulkBusy} onClick={bulkAssignResp}>Assign responsibility</Button>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => bulkStatus("active")}>Activate</Button>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => bulkStatus("inactive")}>Deactivate</Button>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={bulkExport}>{tx("ส่งออก CSV")}</Button>
          </>
        }
      />
      </div>

      <div className="flex-1 overflow-auto min-h-0 max-w-full">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={search ? "search" : "users"}
            title={search ? tx("ไม่พบ \"{0}\"", search) : tx("ยังไม่มีผู้ใช้")}
            hint={search ? tx("ลองคำอื่น หรือเปลี่ยน filter") : tx("เพิ่มผู้ใช้เพื่อเริ่มต้น")}
          />
        ) : (
          <table className="cds--data-table cds--data-table--sm w-full min-w-[860px] table-fixed text-[13px] border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--iamx-bg)]">
              <tr className="border-b border-[var(--iamx-border)]">
                <th className="w-10 h-9 px-3">
                  <Checkbox
                    
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-[var(--iamx-border-strong)]"
                    style={{ accentColor: "var(--iamx-accent)" }}
                  />
                </th>
                <th className="text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("ผู้ใช้")}
                </th>
                <th className="w-60 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("หน่วยงาน")}
                </th>
                <th className="w-36 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("บทบาท")}
                </th>
                <th className="w-24 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("ประเภท")}
                </th>
                <th className="w-24 text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("สถานะ")}
                </th>
                <th className="w-32 h-9 px-3" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((u) => {
                const checked = selected.includes(u.user_id);
                const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
                const isActive = u.status === "active";
                return (
                  <tr
                    key={u.user_id}
                    onClick={() => openEditDrawer(u)}
                    className="group/row border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)] cursor-pointer"
                    style={{ height: "var(--iamx-row-h)" }}
                  >
                    <td className="px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        
                        checked={checked}
                        onChange={() => toggleOne(u.user_id)}
                        className="w-4 h-4 rounded border-[var(--iamx-border-strong)]"
                        style={{ accentColor: "var(--iamx-accent)" }}
                      />
                    </td>
                    <td className="px-3 align-middle">
                      <div className="flex items-center gap-3 min-w-0 max-w-[380px]">
                        <Avatar name={name} size={28} src={avatarIds[String(u.user_id)] ? `${API_BASE}/users/${u.user_id}/avatar?v=${avatarIds[String(u.user_id)]}` : undefined} />
                        <div className="min-w-0 w-full" title={name}>
                          <div className="font-medium text-[var(--iamx-fg)] truncate whitespace-nowrap">{name}</div>
                          {u.email && (
                            <div className="text-[12px] text-[var(--iamx-fg-muted)] truncate">{u.email}</div>
                          )}
                          {u.user_name && u.user_name !== (u.email || "").split("@")[0] && (
                            <div className="font-mono text-[11px] text-[var(--iamx-fg-muted)] truncate" title={u.user_name}>{u.user_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 align-middle">
                      <div className="min-w-0">
                        <div className="text-[12.5px] text-[var(--iamx-fg)] truncate">
                          {u.user_ministry_name || "—"}
                        </div>
                        {(u.user_agency_name || u.user_operation_name) && (
                          <div className="text-[11.5px] text-[var(--iamx-fg-muted)] truncate">
                            {[u.user_agency_name, u.user_operation_name]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 align-middle">
                      {(() => {
                        const rs = roleSummary[String(u.user_id)] || [];
                        if (!rs.length) return <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("ไม่มีบทบาท")}</span>;
                        return (
                          <div className="flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden" title={rs.map((r) => `${r.code} · ${r.name}`).join("\n")}>
                            <span className="font-mono text-[11px] px-1.5 rounded border border-[var(--iamx-border)] bg-[var(--iamx-surface)] truncate whitespace-nowrap">{rs[0].code}</span>
                            {rs.length > 1 && <span className="shrink-0 text-[11px] px-1.5 rounded border border-[var(--iamx-border)] text-[var(--iamx-fg-muted)] whitespace-nowrap">+{rs.length - 1}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 align-middle">
                      <span className="text-[12.5px] text-[var(--iamx-fg-muted)]">{userTypeName(u.user_type)}</span>
                    </td>
                    <td className="px-3 align-middle">
                      {/* 14/11/69: ป้ายเฉพาะที่ปิด แบบจออื่น · ใช้งานอยู่เป็นตัวหนังสือธรรมดา */}
                      {isActive ? <span className="text-[12.5px] text-[var(--iamx-fg-muted)]">{tx("ใช้งาน")}</span> : <span className="text-[11px] px-2 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">{tx("ปิดใช้งาน")}</span>}
                    </td>
                    <td
                      className="px-3 align-middle text-right opacity-0 group-hover/row:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-0.5">
                        <IconButton icon="edit" label={tx("แก้ไข")} onClick={() => openEditDrawer(u)} />
                        <IconButton
                          icon={isActive ? "eyeOff" : "eye"}
                          label={isActive ? "Deactivate" : "Activate"}
                          onClick={() => handleToggleStatus(u)}
                        />
                        <IconButton
                          icon="trash"
                          label={tx("ลบ")}
                          variant="danger"
                          onClick={() => handleDelete(u)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filtered.length > 0 && (
          <div className="px-6 py-3 flex items-center justify-between gap-3 text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
            <span>
              
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length.toLocaleString()}
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" icon="chevronLeft"
                        disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  
                  {tx("ก่อนหน้า")}
                </Button>
                <span>
                  
                  {tx("หน้า")}{" "}{currentPage.toLocaleString()} / {pageCount.toLocaleString()}
                </span>
                <Button variant="secondary" size="sm" icon="chevronRight"
                        disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                  
                  {tx("ถัดไป")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Temp password toast */}
      {createdTempPassword && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-layer border border-[var(--iamx-accent)] rounded-md shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-[var(--iamx-accent-soft)] flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-[var(--iamx-accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-[var(--iamx-fg)] text-sm">{tx("สร้างผู้ใช้สำเร็จ")}</h4>
              <p className="text-xs text-[var(--iamx-fg-muted)] mt-0.5">{tx("รหัสผ่านชั่วคราว")}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="bg-[var(--iamx-bg-hover)] px-2 py-1 rounded text-sm font-mono text-[var(--iamx-accent)]">
                  {createdTempPassword}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(createdTempPassword)}
                  className="text-xs text-[var(--iamx-accent)] hover:underline"
                >
                  
                  {tx("คัดลอก")}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCreatedTempPassword(null)}
              className="text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)]"
            >
              âœ•
            </button>
          </div>
        </div>
      )}

      {/* User Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          editingUser
            ? `${formData.first_name} ${formData.last_name}`.trim() || tx("แก้ไขผู้ใช้")
            : tx("เพิ่มผู้ใช้ใหม่")
        }
        subtitle={
          editingUser
            ? `@${formData.user_name || editingUser.user_name || ""} · ${formData.email || editingUser.email || ""}`
            : undefined
        }
        width={720}
        persistKey="iamx-drawer-user"
        headerExtra={
          editingUser && (
            <Badge tone={editingUser.status === "active" ? "success" : "neutral"} size="sm" dot>
              {editingUser.status === "active" ? tx("ใช้งาน") : tx("ปิดใช้งาน")}
            </Badge>
          )
        }
        footer={
          drawerTab === "info" ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(false)}>
                
                {tx("ยกเลิก")}
              </Button>
              <Button variant="primary" size="sm" icon="check" onClick={handleSave}>
                {editingUser ? tx("บันทึก") : tx("สร้างผู้ใช้")}
              </Button>
            </>
          ) : null
        }
      >
        {editingUser && <div className="sticky top-0 z-10 bg-[var(--iamx-bg)] px-5 pt-1">
          <Tabs
            value={drawerTab === "data" ? "access" : drawerTab}
            onChange={(v) => { setDrawerTab(v as DrawerTab); if (v === "objects") setObjView("effective"); }}
            tabs={
              editingUser
                ? [
                    { value: "info", label: tx("ข้อมูล") },
                    { value: "access", label: tx("สิทธิ์"), count: userRoles.length },
                    { value: "objects", label: tx("เมนูที่เห็น") },
                  ]
                : [{ value: "info", label: tx("ข้อมูล") }]
            }
          />
        </div>}

        {drawerTab === "info" && (
          <>
            <DrawerSection title={tx("ข้อมูลส่วนตัว")}>
              {editingUser && (
                <div className="flex items-center gap-4 mb-4">
                  <Avatar
                    name={`${editingUser.first_name || ""} ${editingUser.last_name || ""}`}
                    size={64}
                    src={avatarIds[String(editingUser.user_id)] ? `${API_BASE}/users/${editingUser.user_id}/avatar?v=${avatarIds[String(editingUser.user_id)]}` : undefined}
                  />
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <label className="h-8 px-3 inline-flex items-center rounded-md border border-[var(--iamx-border-strong)] bg-layer text-[12.5px] cursor-pointer hover:bg-[var(--iamx-bg-hover)]">
                        {avatarIds[String(editingUser.user_id)] ? tx("เปลี่ยนรูป") : tx("อัปโหลดรูป")}
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }} />
                      </label>
                      {avatarIds[String(editingUser.user_id)] && (
                        <button type="button" onClick={removeAvatar} className="h-8 px-3 text-[12.5px] rounded-md text-[var(--iamx-fg-muted)] hover:text-red-600 hover:bg-red-50">{tx("ลบรูป")}</button>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[var(--iamx-fg-muted)]">{tx("PNG / JPG / WEBP ไม่เกิน 2 MB")}</div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
                <FormField label={tx("ชื่อ")} required>
                  <Input
                    value={formData.first_name}
                    onChange={(v) => setFormData((p) => ({ ...p, first_name: v }))}
                    maxLength={100}
                    autoFocus
                  />
                </FormField>
                <FormField label={tx("นามสกุล")} required>
                  <Input
                    value={formData.last_name}
                    onChange={(v) => setFormData((p) => ({ ...p, last_name: v }))}
                    maxLength={100}
                  />
                </FormField>
                <FormField label={tx("ชื่อ (อังกฤษ)")}>
                  <Input
                    value={formData.first_name_eng}
                    onChange={(v) => setFormData((p) => ({ ...p, first_name_eng: v }))}
                    maxLength={100}
                  />
                </FormField>
                <FormField label={tx("นามสกุล (อังกฤษ)")}>
                  <Input
                    value={formData.last_name_eng}
                    onChange={(v) => setFormData((p) => ({ ...p, last_name_eng: v }))}
                    maxLength={100}
                  />
                </FormField>
              </div>
              <FormField
                label={tx("เลขบัตรประชาชน")}
                className="mt-3"
              >
                <Input
                  value={formData.personal_card_id}
                  onChange={(v) => setFormData((p) => ({ ...p, personal_card_id: v }))}
                  placeholder="1-2345-67890-12-4"
                  maxLength={20}
                  disabled={!!editingUser}
                />
              </FormField>
            </DrawerSection>

            <DrawerSection
              title={tx("บัญชีและการเข้าใช้")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
                <FormField label={tx("ชื่อผู้ใช้")}>
                  <Input
                    value={formData.user_name}
                    onChange={(v) => setFormData((p) => ({ ...p, user_name: v }))}
                    placeholder={tx("ชื่อ.นามสกุลย่อ")}
                    icon="user"
                  />
                </FormField>
                <FormField label={tx("อีเมล")}>
                  <Input
                    value={formData.email}
                    onChange={(v) => setFormData((p) => ({ ...p, email: v }))}
                    placeholder="name@example.com"
                    icon="mail"
                    type="email"
                    maxLength={100}
                  />
                </FormField>
                <FormField label={tx("สถานะ")}>
                  <Select
                    value={formData.status}
                    onChange={(v) => setFormData((p) => ({ ...p, status: v }))}
                    options={[
                      { value: "active", label: tx("ใช้งาน") },
                      { value: "inactive", label: tx("ปิดใช้งาน") },
                    ]}
                  />
                </FormField>
                {!editingUser && (
                  <FormField label={tx("รหัสผ่าน")} hint={tx("อย่างน้อย 10 ตัว · พิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข อักขระพิเศษ")}>
                    <Input
                      value={formData.password}
                      onChange={(v) => setFormData((p) => ({ ...p, password: v }))}
                      placeholder={tx("เว้นว่าง = ส่งลิงก์ตั้งรหัสทางอีเมล")}
                      icon="key"
                      type="password"
                      autoComplete="new-password"
                      maxLength={64}
                    />
                  </FormField>
                )}
              </div>
              {editingUser && (
                <FormField label={tx("ยืนยันตัวตน 2 ขั้นตอน (OTP)")} className="mt-3"
                  hint={twoFA?.pending ? tx("รอผู้ใช้ตั้งแอป OTP") : twoFA?.configured ? tx("ตั้งแอป OTP แล้ว") : undefined}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!twoFA?.enabled}
                      disabled={!twoFA || twoFABusy}
                      onClick={() => editingUser && twoFA && toggleTwoFA(editingUser, !twoFA.enabled)}
                      className={"relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 " + (twoFA?.enabled ? "bg-[var(--iamx-accent)]" : "bg-[var(--iamx-border-strong)]")}
                    >
                      <span className={"inline-block h-4 w-4 rounded-full bg-layer transition-transform " + (twoFA?.enabled ? "translate-x-[18px]" : "translate-x-0.5")} />
                    </button>
                    <span className="text-[13px] text-[var(--iamx-fg)]">
                      {!twoFA ? (twoFAMsg || tx("กำลังอ่านสถานะ…")) : twoFA.configured ? tx("เปิดใช้งาน") : twoFA.pending ? tx("เปิดแล้ว · รอตั้งแอป") : tx("ปิด")}
                    </span>
                    {twoFA && twoFAMsg && <span className="text-[12px] text-red-600">{twoFAMsg}</span>}
                  </div>
                </FormField>
              )}
              <FormField label={tx("ประเภทผู้ใช้งาน")} required className="mt-3">
                <div role="radiogroup" aria-label={tx("ประเภทผู้ใช้งาน")} className="flex flex-wrap items-center gap-x-6 gap-y-2" style={{ fontSize: 13 }}>
                  {activeUserTypes().map((t) => ({ value: t.code, label: t.name })).map((opt) => (
                    <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <Radio
                        
                        name="user_type"
                        value={opt.value}
                        checked={normalizeUserType(formData.user_type) === opt.value}
                        onChange={() =>
                          setFormData((p) => ({
                            ...p,
                            user_type: opt.value,
                            // กอง มีเฉพาะผู้ใช้ภายใน — เปลี่ยนเป็นภายนอกแล้วล้างทิ้ง ไม่ให้ค่าเก่าค้างไปบันทึก
                            user_department_id: isStaffType(opt.value) ? p.user_department_id : "",
                          }))
                        }
                        className="w-4 h-4"
                        style={{ accentColor: "var(--iamx-accent)" }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </FormField>
              <label
                className="inline-flex items-center gap-2 cursor-pointer select-none"
                style={{ fontSize: 13 }}
              >
                <Checkbox
                  
                  checked={formData.send_flag === "Y"}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, send_flag: e.target.checked ? "Y" : "" }))
                  }
                  className="w-4 h-4 rounded"
                  style={{ accentColor: "var(--iamx-accent)" }}
                />
                
                {tx("มีสิทธินำส่ง")}
              </label>
            </DrawerSection>

            <DrawerSection title={tx("สังกัด")}>
              <div className="grid grid-cols-3 gap-x-3 gap-y-3">
                {isStaffType(formData.user_type) && (
                  <FormField label={tx("กอง")} className="col-span-3">
                    <Select2
                      value={formData.user_department_id}
                      onChange={(v) => {
                        const dept = departments.find((d) => d.departmentId === v);
                        if (dept) {
                          setFormData((p) => ({
                            ...p,
                            user_department_id: v,
                            user_ministry_id: dept.ministryId || "",
                            user_agency_id: dept.agencyId || "",
                          }));
                        } else {
                          setFormData((p) => ({
                            ...p,
                            user_department_id: "",
                            user_ministry_id: "",
                            user_agency_id: "",
                          }));
                        }
                      }}
                      options={departments.map((d) => ({
                        value: d.departmentId,
                        label: `${d.departmentCode || ""} : ${d.departmentName}`,
                      }))}
                      placeholder={tx("เลือกกอง...")}
                    />
                  </FormField>
                )}
                <FormField label={tx("กระทรวง")}>
                  <Select2
                    value={formData.user_ministry_id}
                    onChange={(v) =>
                      setFormData((p) => ({
                        ...p,
                        user_ministry_id: v,
                        user_agency_id: "",
                        user_operation_id: "",
                      }))
                    }
                    options={ministries.map((m) => ({ value: m.agcId, label: `${m.agcCode || ""} : ${m.agcName}` }))}
                    placeholder={tx("เลือกกระทรวง...")}
                  />
                </FormField>
                <FormField label={tx("กรม")}>
                  <Select2
                    value={formData.user_agency_id}
                    onChange={(v) =>
                      setFormData((p) => ({ ...p, user_agency_id: v, user_operation_id: "" }))
                    }
                    options={formAgencies.map((a) => ({ value: a.agcId, label: `${a.agcCode || ""} : ${a.agcName}` }))}
                    placeholder={tx("เลือกกรม...")}
                    disabled={!formData.user_ministry_id}
                  />
                </FormField>
                <FormField label={tx("หน่วยปฏิบัติ")}>
                  <Select2
                    value={formData.user_operation_id}
                    onChange={(v) => setFormData((p) => ({ ...p, user_operation_id: v }))}
                    options={formDepartments.map((d) => ({ value: d.agcId, label: `${d.agcCode || ""} : ${d.agcName}` }))}
                    placeholder={tx("เลือกหน่วย...")}
                    disabled={!formData.user_agency_id}
                  />
                </FormField>
              </div>
            </DrawerSection>
            {!editingUser && (
              // 13/11/69: เลือกความรับผิดชอบตั้งแต่ตอนสร้าง — ได้บทบาทในชุดทันทีหลังบันทึก ไม่ต้องเปิดผู้ใช้ซ้ำ
              <DrawerSection title={tx("สิทธิ์")}>
                <div className="grid gap-3">
                  <FormField label={tx("ความรับผิดชอบ")}>
                    <MultiSelect
                      value={newResps}
                      onChange={setNewResps}
                      placeholder={tx("เลือกความรับผิดชอบ")}
                      options={allResps.filter((r) => r.is_active !== 0).map((r) => ({ value: String(r.id), label: r.name }))}
                    />
                  </FormField>
                  <FormField label={tx("บทบาท")}>
                    <MultiSelect
                      value={newRoles}
                      onChange={setNewRoles}
                      placeholder={tx("เลือกบทบาท")}
                      options={roles.filter((r: any) => r.is_active !== 0 && (!r.role_type || r.role_type === normalizeUserType(formData.user_type))).map((r: any) => ({ value: String(r.id), label: `${r.code} · ${r.name}` }))}
                    />
                  </FormField>
                </div>
              </DrawerSection>
            )}

          </>
        )}

        {drawerTab === "access" && editingUser && (() => {
          const q = respPickQ.trim().toLowerCase();
          const mine = new Set(userResps.map((r) => r.id));
          const options = q ? allResps.filter((r) => r.is_active && !mine.has(r.id) && (r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))).slice(0, 30) : [];
          return (
            <DrawerSection title={tx("ความรับผิดชอบ")}>
              {userResps.length === 0 ? (
                <div className="py-3 text-[12.5px] text-[var(--iamx-fg-muted)]">{tx("ยังไม่อยู่ในความรับผิดชอบใด")}</div>
              ) : (
                <div className="divide-y divide-[var(--iamx-border)] border border-[var(--iamx-border)] rounded-md mb-3">
                  {userResps.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-3 h-11">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] truncate">{r.name}</div>
                        <div className="text-[11.5px] text-[var(--iamx-fg-muted)]">{r.role_count ? tx("{0} บทบาท", r.role_count) : tx("ยังไม่มีบทบาท")}</div>
                      </div>
                      <button type="button" onClick={() => removeUserResp(r)} className="h-7 px-2.5 text-[12px] rounded-md text-[var(--iamx-fg-muted)] hover:text-red-600 hover:bg-red-50">{tx("ถอด")}</button>
                    </div>
                  ))}
                </div>
              )}
              <Input value={respPickQ} onChange={setRespPickQ} placeholder={tx("พิมพ์ชื่อความรับผิดชอบเพื่อเพิ่ม")} icon="search" />
              {options.length > 0 && (
                <div className="mt-1 border border-[var(--iamx-border)] rounded-md max-h-[280px] overflow-y-auto">
                  {options.map((r) => (
                    <button key={r.id} type="button" onClick={() => addUserResp(r.id)} className="w-full text-left px-3 py-2 hover:bg-[var(--iamx-bg-hover)] flex items-center gap-2">
                      <span className="flex-1 text-[13px] truncate">{r.name}</span>
                      <span className="text-[11.5px] text-[var(--iamx-fg-muted)] shrink-0">{r.role_count ? tx("{0} บทบาท", r.role_count) : tx("ไม่มีบทบาท")}</span>
                    </button>
                  ))}
                </div>
              )}
              {q && options.length === 0 && <div className="mt-2 text-[12px] text-[var(--iamx-fg-muted)]">{tx("ไม่พบความรับผิดชอบที่ตรงคำค้น")}</div>}
            </DrawerSection>
          );
        })()}

        {drawerTab === "access" && editingUser && (() => {
          const visibleRoles = roles.filter((r) => (!r.role_type || r.role_type === normalizeUserType(editingUser.user_type)) && (!roleSearch || r.name.toLowerCase().includes(roleSearch.toLowerCase()) || r.code.toLowerCase().includes(roleSearch.toLowerCase())));
          // 13/11/69: บทบาทที่ถืออยู่แสดงเสมอ แม้ประเภทไม่ตรงผู้ใช้ (เดิมถูกกรองหายทั้งที่มีผลจริง)
          const uType = normalizeUserType(editingUser.user_type);
          const checkedRoles = roles.filter((r) => userRoles.includes(r.id) && (!roleSearch || r.name.toLowerCase().includes(roleSearch.toLowerCase()) || r.code.toLowerCase().includes(roleSearch.toLowerCase())));
          const uncheckedRoles = visibleRoles.filter((r) => !userRoles.includes(r.id));

          const renderRole = (r: Role) => {
            const has = userRoles.includes(r.id);
            const from = roleFromResp[r.id];
            const locked = has && !!from?.length;
            return (
              <button
                key={r.id}
                type="button"
                disabled={locked}
                title={locked ? tx("ได้จากความรับผิดชอบ — ถอดที่แท็บความรับผิดชอบ") : undefined}
                onClick={() => toggleRole(r.id)}
                className={
                  "w-full flex items-center gap-3 px-3 py-2 border-b border-[var(--iamx-border)] text-left transition-colors " +
                  (has ? "bg-[var(--iamx-surface)]" : "hover:bg-[var(--iamx-bg-hover)]") +
                  (locked ? " cursor-default" : "")
                }
              >
                <Checkbox
                  
                  checked={has}
                  readOnly
                  className="w-4 h-4 rounded border-[var(--iamx-border-strong)]"
                  style={{ accentColor: "var(--iamx-accent)" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] text-[var(--iamx-fg)] truncate">{r.name}</div>
                  <div className="text-[11.5px] text-[var(--iamx-fg-muted)]"><span className="font-mono">{r.code}</span>{locked && <span> {" "}{tx("· จากความรับผิดชอบ:")}{" "}{from.join(", ")}</span>}</div>
                  {has && r.role_type && r.role_type !== uType && (
                    <span className="inline-block mt-1 px-2 rounded-full text-[11px] bg-amber-100 text-amber-700">{tx("ไม่ตรงประเภทผู้ใช้ (")}{userTypeName(r.role_type)})</span>
                  )}
                </div>
              </button>
            );
          };

          return (
            <DrawerSection title={tx("บทบาท · {0}", userRoles.length)}>
              <div className="mb-3">
                <Input
                  value={roleSearch}
                  onChange={setRoleSearch}
                  placeholder={tx("ค้นหาจากชื่อหรือรหัสบทบาท...")}
                  icon="search"
                />
              </div>
              <div>
                {checkedRoles.length > 0 && (
                  <>
                    {checkedRoles.some((r) => roleFromResp[r.id]?.length) && (
                      <>
                        <div className="text-[11.5px] font-medium text-[var(--iamx-fg-muted)] pb-1">{tx("ได้จากความรับผิดชอบ")}</div>
                        {checkedRoles.filter((r) => roleFromResp[r.id]?.length).map(renderRole)}
                      </>
                    )}
                    {checkedRoles.some((r) => !roleFromResp[r.id]?.length) && (
                      <div className="text-[11.5px] font-medium text-[var(--iamx-fg-muted)] pb-1 pt-2">{tx("ผูกตรง")}</div>
                    )}
                    {checkedRoles.filter((r) => !roleFromResp[r.id]?.length).map(renderRole)}
                    {uncheckedRoles.length > 0 && (
                      <div className="pt-2 pb-1 border-t border-[var(--iamx-border)]">
                        <div className="text-[11.5px] font-medium text-[var(--iamx-fg-muted)]">
                          
                          {tx("บทบาทอื่น")}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {/* 18/10/69: บทบาทที่ยังไม่เลือก 80 ตัวเดิมกองเป็นรายการเดียว → จัดกลุ่ม พับได้ */}
                {groupRoles(uncheckedRoles).map((g) => (
                  <details key={g.key} open={!!roleSearch.trim()} className="group/rg">
                    <summary className="cursor-pointer list-none flex items-center gap-2 py-1.5 text-[12px] font-medium text-[var(--iamx-fg-muted)]">
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-open/rg:rotate-90" />
                      <span className="flex-1">{g.label}</span>
                      <span className="tabular-nums">{g.items.length}</span>
                    </summary>
                    <div className="pb-2 border-t border-[var(--iamx-border)]">{g.items.map(renderRole)}</div>
                  </details>
                ))}
              </div>
            </DrawerSection>
          );
        })()}

        {drawerTab === "access" && editingUser && (() => {
          const custom = [...userObjects.values()].filter((p) => p.length).length;
          const isAgency = !isStaffType(editingUser.user_type);
          return (
            <DrawerSection title={tx("ขั้นสูง")}>
              <div className="divide-y divide-[var(--iamx-border)] border border-[var(--iamx-border)]">
                <button type="button" onClick={() => { setObjView("custom"); setDrawerTab("objects"); }} className="w-full flex items-center gap-3 px-3 h-11 text-left hover:bg-[var(--iamx-bg-hover)]">
                  <span className="flex-1 text-[13px]">{tx("ข้อยกเว้นรายคน")}</span>
                  <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">{custom ? tx("{0} เมนู", custom) : tx("ไม่มี")}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)]" />
                </button>
                {!isAgency && (
                  <button type="button" onClick={() => setDrawerTab("data")} className="w-full flex items-center gap-3 px-3 h-11 text-left hover:bg-[var(--iamx-bg-hover)]">
                    <span className="flex-1 text-[13px]">{tx("ข้อมูลที่เห็น")}</span>
                    <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">{userDataAccess.length ? tx("{0} รายการ", userDataAccess.length) : tx("ไม่มี")}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)]" />
                  </button>
                )}
              </div>
            </DrawerSection>
          );
        })()}

        {drawerTab === "objects" && editingUser && (
          <div className="h-full flex flex-col">
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-[var(--iamx-border)]">
              <div className="inline-flex rounded-md border border-[var(--iamx-border-strong)] overflow-hidden text-[12.5px]">
                {([["effective", tx("ที่เห็นจริง")], ["custom", tx("ข้อยกเว้นรายคน")]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setObjView(k)}
                    className={"h-8 px-3 " + (objView === k ? "bg-[var(--iamx-accent)] text-white" : "bg-layer text-[var(--iamx-fg)] hover:bg-[var(--iamx-bg-hover)]")}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                {objView === "effective" ? (
                  <Input value={effSearch} onChange={setEffSearch} placeholder={tx("ค้นหาเมนู / รหัส / บทบาท...")} icon="search" className="max-w-xs" />
                ) : null}
              </div>
            </div>
            {objView === "effective" && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                {effective === null ? (
                  <div className="px-5 py-6 text-[12.5px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</div>
                ) : (() => {
                  const q = effSearch.trim().toLowerCase();
                  const rows = effective.filter((r) => !q || `${r.object_name} ${r.object_code} ${r.role_code}`.toLowerCase().includes(q));
                  // 20/10/69 ถอดเมนูรายคน: สิทธิ์เฉพาะคน ["DENY"] ตัดเมนูที่ได้จากบทบาท (view V_USER_EFFECTIVE_PERMISSION)
                  const objInfo = new Map<number, { name: string; code: string }>();
                  const walkObj = (ns: ObjectNode[]) => ns.forEach((n) => { objInfo.set(n.id, { name: n.name || n.label, code: n.code }); walkObj((n as any).children || []); });
                  walkObj(objectTree);
                  const denied = [...userObjects.entries()].filter(([, p]) => p.includes("DENY")).map(([id]) => ({ id, ...(objInfo.get(id) || { name: String(id), code: "" }) }));
                  const deniedBox = denied.length > 0 && (
                    <div className="border-b border-[var(--iamx-border)]">
                      <div className="px-5 py-1.5 text-[12px] font-medium bg-red-50 text-red-700 border-b border-[var(--iamx-border)]">{tx("ข้อยกเว้นรายคน · ถอดเมนู (")}{denied.length})</div>
                      {denied.map((d) => (
                        <div key={d.id} className="px-5 py-2 border-b last:border-b-0 border-[var(--iamx-border)] flex items-center gap-3">
                          <div className="flex-1 min-w-0"><div className="text-[13px] line-through text-[var(--iamx-fg-muted)] truncate">{d.name}</div><div className="font-mono text-[11px] text-[var(--iamx-fg-muted)]">{d.code}</div></div>
                          <button type="button" onClick={() => toggleObjectPermission(d.id, "DENY")} className="h-7 px-2.5 text-[12px] rounded-md border border-[var(--iamx-border-strong)] bg-layer hover:bg-[var(--iamx-bg-hover)]">{tx("คืนเมนู")}</button>
                        </div>
                      ))}
                    </div>
                  );
                  if (!rows.length) return <div>{deniedBox}<div className="px-5 py-6 text-[12.5px] text-[var(--iamx-fg-muted)]">{q ? tx("ไม่พบเมนูที่ค้นหา") : tx("ผู้ใช้นี้ยังไม่เห็นเมนูใด")}</div></div>;
                  // 13/11/69: เมนูเดียวกันจากหลายบทบาท รวมเป็นแถวเดียว — สิทธิ์ = รวมทุกที่มา · ที่มาแสดงเป็นป้ายหลายอัน
                  const parse = (x: any) => { try { return JSON.parse(x || "[]") as string[]; } catch { return [] as string[]; } };
                  const merged = new Map<string, any>();
                  rows.forEach((r) => {
                    const k = String(r.object_id || r.object_code);
                    const m = merged.get(k);
                    if (!m) merged.set(k, { ...r, perms: parse(r.permission), sources: [r.source === "CUSTOM" ? tx("ข้อยกเว้นรายคน") : tx("บทบาท {0}", r.role_code || "")], fromRole: r.source !== "CUSTOM" });
                    else {
                      m.perms = Array.from(new Set([...m.perms, ...parse(r.permission)]));
                      const src = r.source === "CUSTOM" ? tx("ข้อยกเว้นรายคน") : tx("บทบาท {0}", r.role_code || "");
                      if (!m.sources.includes(src)) m.sources.push(src);
                      m.fromRole = m.fromRole || r.source !== "CUSTOM";
                    }
                  });
                  const byApp: Record<string, any[]> = {};
                  [...merged.values()].forEach((r) => { (byApp[r.application_code || "-"] ||= []).push(r); });
                  return (
                    <div>
                      {deniedBox}
                      <div className="px-5 py-2 text-[12px] text-[var(--iamx-fg-muted)] border-b border-[var(--iamx-border)]">{merged.size} {" "}{tx("เมนู")}</div>
                      {Object.entries(byApp).map(([app, list]) => (
                        <div key={app}>
                          <div className="px-5 py-1.5 text-[12px] font-medium bg-[var(--iamx-surface)] border-b border-[var(--iamx-border)]">{app} <span className="text-[var(--iamx-fg-muted)]">({list.length})</span></div>
                          {list.map((r, i) => (
                            <div key={app + i} className="px-5 py-2 border-b border-[var(--iamx-border)] flex flex-wrap items-center gap-x-3 gap-y-1">
                              <div className="flex-1 min-w-[180px]">
                                <div className="text-[13px] text-[var(--iamx-fg)] break-words">{r.object_name || r.object_code}</div>
                                <div className="font-mono text-[11px] text-[var(--iamx-fg-muted)]">{r.object_code}</div>
                              </div>
                              <span className="flex flex-wrap gap-1">
                                {r.sources.map((src: string) => (
                                  <span key={src} className={"text-[11px] px-1.5 border " + (src === tx("ข้อยกเว้นรายคน") ? "border-amber-100 bg-amber-100 text-amber-700" : "border-[var(--iamx-border)] bg-[var(--iamx-surface)] text-[var(--iamx-fg-muted)]")}>{src}</span>
                                ))}
                              </span>
                              <span className="w-[260px] text-[11.5px] text-[var(--iamx-fg)]">
                                {r.perms.length ? sortPerms(r.perms as string[]).map((x: string) => permLabel(x)).join(" · ") : tx("ไม่ระบุ")}
                              </span>
                              {r.fromRole && r.object_id && (
                                <button type="button" title={tx("ไม่ให้คนนี้เห็นเมนูนี้ แม้บทบาทจะให้")}
                                  onClick={async () => { if (await showConfirm(tx("ข้อยกเว้นรายคน · ถอดเมนู"), tx("{0} — บทบาทของคนอื่นไม่ถูกแตะ คืนได้ภายหลัง", r.object_name || r.object_code), tx("ถอด"))) toggleObjectPermission(Number(r.object_id), "DENY"); }}
                                  className="h-7 px-2 text-[12px] rounded-md text-[var(--iamx-fg-muted)] hover:text-red-600 hover:bg-red-50">{tx("ถอด")}</button>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
            {objView === "custom" && (
              // 13/11/69: ซ้ายระบบงาน · ขวาเมนูแบน (แทนต้นไม้ซ้อน) · ช่องเทา = บทบาทให้อยู่แล้ว
              <div className="flex-1 min-h-0 flex flex-col px-5 pt-3 pb-4">
                <MenuPicker
                  groups={pickerGroups}
                  isOn={(n) => (userObjects.get(n.id) || []).includes("VIEW")}
                  toolbar={<FilterChip label={tx("สิทธิ์ย่อย")} active={showSubPerms} onClick={() => setShowSubPerms((v) => !v)} />}
                  header={matrixPerms.map((p) => (
                    <span key={p} className="text-center whitespace-nowrap" style={{ width: 52 }}>{permLabel(p)}</span>
                  ))}
                  renderCells={(n) => (
                    <>
                      {matrixPerms.map((p) => {
                        const on = (userObjects.get(n.id) || []).includes(p);
                        const fromRoles = rolePermsByObj.get(n.id)?.get(p);
                        return (
                          <span key={p} className="flex justify-center shrink-0" style={{ width: 52 }}>
                            <button
                              type="button"
                              onClick={() => toggleObjectPermission(n.id, p)}
                              title={on ? tx("ข้อยกเว้นรายคน") : fromRoles ? tx("ได้จากบทบาท {0}", fromRoles.join(", ")) : undefined}
                              aria-label={`${permLabel(p)} ${n.label}`}
                              className={
                                "inline-flex h-4 w-4 items-center justify-center " +
                                (on ? "bg-[#0f62fe] text-white" : fromRoles ? "bg-[var(--iamx-bg-active)] text-[var(--iamx-fg-muted)]" : "bg-layer border border-[var(--iamx-border-strong)] hover:border-[#0f62fe]")
                              }
                            >
                              {(on || fromRoles) && (
                                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3 3 7-7" /></svg>
                              )}
                            </button>
                          </span>
                        );
                      })}
                    </>
                  )}
                />
              </div>
            )}
          </div>
        )}

        {drawerTab === "data" && editingUser && (
          <>
            <button type="button" onClick={() => setDrawerTab("access")} className="mx-5 mt-3 inline-flex items-center gap-1 text-[12.5px] text-[var(--iamx-accent)] hover:underline">
              <ChevronLeft className="w-3.5 h-3.5" /> {" "}{tx("สิทธิ์ · ข้อมูลที่เห็น")}
            </button>
            <div className="mx-5 mt-4 mb-1 rounded-md border border-[var(--iamx-border)] overflow-hidden">
              <button
                type="button"
                onClick={() => setGeoFilterOpen((p) => !p)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--iamx-bg-hover)] hover:bg-[var(--iamx-surface)] transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {geoFilterOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)]" />
                  )}
                  <span className="text-[13px] font-medium text-[var(--iamx-fg)]">{tx("กรองตามภูมิศาสตร์")}</span>
                  {[geoRegion, geoProvinceDistrict, geoProvince, geoDistrict, geoSubdistrict].filter(Boolean).length > 0 && (
                    <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-medium bg-[var(--iamx-accent)] text-white">
                      {[geoRegion, geoProvinceDistrict, geoProvince, geoDistrict, geoSubdistrict].filter(Boolean).length}
                    </span>
                  )}
                </div>
                <span className="text-[11.5px] text-[var(--iamx-fg-muted)]">{tx("จำกัดหน่วยงานตามเขตภูมิศาสตร์")}</span>
              </button>
              {geoFilterOpen && (
                <div className="px-4 py-3 border-t border-[var(--iamx-border)]">
                  <div className="grid grid-cols-3 gap-x-3 gap-y-3">
                    <FormField label={tx("ภูมิภาค")}>
                      <Select2
                        value={geoRegion}
                        onChange={(v) => setGeoRegion(v)}
                        options={geoRegions.map((r) => ({ value: r.id, label: r.name }))}
                        placeholder={tx("ทุกภูมิภาค")}
                      />
                    </FormField>
                    <FormField label={tx("เขตจังหวัด")}>
                      <Select2
                        value={geoProvinceDistrict}
                        onChange={(v) => setGeoProvinceDistrict(v)}
                        options={geoProvinceDistricts.map((r) => ({ value: r.id, label: r.name }))}
                        placeholder={tx("ทุกเขต")}
                        disabled={!geoRegion}
                      />
                    </FormField>
                    <FormField label={tx("จังหวัด")}>
                      <Select2
                        value={geoProvince}
                        onChange={(v) => setGeoProvince(v)}
                        options={geoProvinces.map((r) => ({ value: r.id, label: r.name }))}
                        placeholder={tx("ทุกจังหวัด")}
                        disabled={!geoRegion && !geoProvinceDistrict}
                      />
                    </FormField>
                    <FormField label={tx("อำเภอ")}>
                      <Select2
                        value={geoDistrict}
                        onChange={(v) => setGeoDistrict(v)}
                        options={geoDistricts.map((r) => ({ value: r.id, label: r.name }))}
                        placeholder={tx("ทุกอำเภอ")}
                        disabled={!geoProvince}
                      />
                    </FormField>
                    <FormField label={tx("ตำบล")}>
                      <Select2
                        value={geoSubdistrict}
                        onChange={(v) => setGeoSubdistrict(v)}
                        options={geoSubdistricts.map((r) => ({ value: r.id, label: r.name }))}
                        placeholder={tx("ทุกตำบล")}
                        disabled={!geoDistrict}
                      />
                    </FormField>
                  </div>
                </div>
              )}
            </div>

            <DrawerSection title={tx("เพิ่มสิทธิ์เข้าถึงข้อมูล")}>
              {/* Permission type — radio, top */}
              <div className="mb-3">
                <div className="text-[12px] font-medium text-[var(--iamx-fg-muted)] mb-1.5">{tx("สิทธิ์การเข้าถึงข้อมูล")}</div>
                <div className="flex flex-wrap gap-2">
                  {dataAccessPermTypes.map((permType) => {
                    const isSelected = daPermission === permType;
                    return (
                      <label
                        key={permType}
                        className={
                          "inline-flex items-center gap-2 px-3 h-8 rounded-md border text-[12.5px] cursor-pointer transition-colors " +
                          (isSelected
                            ? "bg-[var(--iamx-accent-soft)] border-[var(--iamx-accent)] text-[var(--iamx-accent)]"
                            : "bg-layer border-[var(--iamx-border)] hover:border-[var(--iamx-border-strong)] text-[var(--iamx-fg)]")
                        }
                      >
                        <Radio
                          
                          name="daPermissionType"
                          checked={isSelected}
                          onChange={() => {
                            setDaPermission(permType);
                            if (permType === "ALL") { setDaMinistryIds([]); setDaAgencyIds([]); setDaUnitIds([]); }
                            else if (permType === "MINISTRY") { setDaAgencyIds([]); setDaUnitIds([]); }
                            else if (permType === "DEPARTMENT") { setDaUnitIds([]); }
                          }}
                          className="w-3.5 h-3.5"
                          style={{ accentColor: "var(--iamx-accent)" }}
                        />
                        {{ ALL: tx("ทั้งหมด"), MINISTRY: tx("กระทรวง"), DEPARTMENT: tx("กรม"), OPER: tx("หน่วยปฏิบัติ") }[permType] ?? permType}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Agency pickers — cascading per permission level */}
              {daPermission !== "ALL" && (
                <div className="space-y-3">
                  <MultiSelect
                    label={tx("กระทรวง")}
                    options={daFilteredMinistries.map((m) => ({ value: m.agcId, label: `${m.agcCode || ""} : ${m.agcName}` }))}
                    value={daMinistryIds}
                    onChange={(vals) => { setDaMinistryIds(vals); setDaAgencyIds([]); setDaUnitIds([]); }}
                    placeholder={tx("เลือกกระทรวง...")}
                  />
                  {(daPermission === "DEPARTMENT" || daPermission === "OPER") && (
                    <MultiSelect
                      label={tx("กรม")}
                      options={daFilteredAgencies.map((a) => ({ value: a.agcId, label: `${a.agcCode || ""} : ${a.agcName}` }))}
                      value={daAgencyIds}
                      onChange={(vals) => { setDaAgencyIds(vals); setDaUnitIds([]); }}
                      placeholder={daMinistryIds.length ? tx("เลือกกรม...") : tx("เลือกกระทรวงก่อน")}
                      disabled={daMinistryIds.length === 0}
                    />
                  )}
                  {daPermission === "OPER" && (
                    <MultiSelect
                      label={tx("หน่วยปฏิบัติ")}
                      options={daFilteredUnits.map((u) => ({ value: u.agcId, label: `${u.agcCode || ""} : ${u.agcName}` }))}
                      value={daUnitIds}
                      onChange={setDaUnitIds}
                      placeholder={daAgencyIds.length ? tx("เลือกหน่วยปฏิบัติ...") : tx("เลือกกรมก่อน")}
                      disabled={daAgencyIds.length === 0}
                    />
                  )}
                </div>
              )}

              <FormField label={tx("บทบาท (ไม่บังคับ)")} className="mt-3">
                <Select
                  value={daRoleId}
                  onChange={setDaRoleId}
                  options={[
                    { value: "", label: tx("ไม่ระบุ (Global)") },
                    ...roles
                      .filter((r) => userRoles.includes(r.id))
                      .map((r) => ({ value: String(r.id), label: `${r.name} (${r.code})` })),
                  ]}
                />
              </FormField>

              {/* Add to staging list */}
              <div className="mt-3 flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="plus"
                  onClick={handleStageEntry}
                  disabled={daPermission !== "ALL" && daMinistryIds.length === 0}
                >
                  
                  {tx("เพิ่มในรายการ")}
                </Button>
              </div>

              {/* Staged entries */}
              {daStagedEntries.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[11.5px] font-medium text-[var(--iamx-fg-muted)] mb-1">{tx("รายการที่จะบันทึก")}</div>
                  {daStagedEntries.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 rounded-md bg-[var(--iamx-surface)] border border-[var(--iamx-border)] text-[12.5px]"
                    >
                      <span className="text-[var(--iamx-fg)] truncate">{e.label}</span>
                      <button
                        type="button"
                        onClick={() => setDaStagedEntries((prev) => prev.filter((_, j) => j !== i))}
                        className="ml-2 p-0.5 text-[var(--iamx-fg-muted)] hover:text-red-500 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="pt-1 flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleCommitDataAccess}
                    >
                      
                      {tx("บันทึกทั้งหมด (")}{daStagedEntries.length})
                    </Button>
                  </div>
                </div>
              )}
            </DrawerSection>

            <DrawerSection title={tx("รายการสิทธิ์ที่มี · {0}", userDataAccess.length)}>
              {userDataAccess.length === 0 ? (
                <div className="py-6 text-center text-[12.5px] text-[var(--iamx-fg-muted)]">
                  
                  {tx("ยังไม่มีสิทธิ์การเข้าถึงข้อมูล")}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {groupedDataAccess.map((group) => {
                    const expanded = expandedAgencies.has(group.roleCode);
                    return (
                      <div
                        key={group.roleCode}
                        className="rounded-md border border-[var(--iamx-border)] overflow-hidden bg-layer"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedAgencies((p) => {
                              const n = new Set(p);
                              if (n.has(group.roleCode)) n.delete(group.roleCode);
                              else n.add(group.roleCode);
                              return n;
                            })
                          }
                          className="w-full flex items-center gap-2 p-3 text-left hover:bg-[var(--iamx-bg-hover)]"
                        >
                          {expanded ? (
                            <ChevronDown className="w-4 h-4 text-[var(--iamx-fg-muted)]" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[var(--iamx-fg-muted)]" />
                          )}
                          <div className="flex-1">
                            <div className="text-[13px] font-medium text-[var(--iamx-fg)]">
                              {group.roleName}
                            </div>
                            <div className="text-[11.5px] text-[var(--iamx-fg-muted)]">
                              {group.roleCode} · {group.items.length} {" "}{tx("รายการ")}
                            </div>
                          </div>
                        </button>
                        {expanded && (
                          <div className="border-t border-[var(--iamx-border)] bg-[var(--iamx-surface)]">
                            {group.items.map((access: any) => (
                              <div
                                key={access.id}
                                className="px-3 py-2 border-b border-[var(--iamx-border)] last:border-b-0"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-[11.5px] text-[var(--iamx-fg-muted)] flex flex-col">
                                    <span className="font-mono">{access.agency_path}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDataAccess(access.id)}
                                    className="p-1 text-[var(--iamx-fg-muted)] hover:text-red-600 rounded"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {dataAccessPermTypes.map((permType) => {
                                    const isSelected = access.permissions?.includes(permType);
                                    return (
                                      <label
                                        key={permType}
                                        className={
                                          "inline-flex items-center gap-1 px-2 h-6 rounded text-[11px] border cursor-pointer " +
                                          (isSelected
                                            ? "bg-[var(--iamx-accent-soft)] border-[var(--iamx-accent)] text-[var(--iamx-accent)]"
                                            : "bg-layer border-[var(--iamx-border)] text-[var(--iamx-fg-muted)]")
                                        }
                                      >
                                        <Checkbox
                                          
                                          checked={isSelected ?? false}
                                          onChange={() =>
                                            toggleDataAccessPerm(access.id, permType, !isSelected)
                                          }
                                          className="w-3 h-3 rounded"
                                          style={{ accentColor: "var(--iamx-accent)" }}
                                        />
                                        {permType}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </DrawerSection>
          </>
        )}
      </Drawer>

      {/* Import modal */}
      {importOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
          onClick={(e) => { if (e.target === e.currentTarget) setImportOpen(false); }}
        >
          <div style={{ background: "var(--iamx-bg)", borderRadius: 0, width: "100%", maxWidth: 520, boxShadow: "none", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--iamx-border)" }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{tx("นำเข้าข้อมูลผู้ใช้")}</span>
              <button onClick={() => setImportOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--iamx-fg-muted)", borderRadius: 0 }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px" }}>
              {/* User type selector */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--iamx-fg-muted)", marginBottom: 8 }}>{tx("ประเภทผู้ใช้")}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {activeUserTypes().map((x) => x.code).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setImportType(t); setImportFile(null); setImportResult(null); }}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 0, border: "1.5px solid",
                        borderColor: importType === t ? "var(--iamx-accent)" : "var(--iamx-border)",
                        background: importType === t ? "var(--iamx-accent-soft)" : "transparent",
                        color: importType === t ? "var(--iamx-accent)" : "var(--iamx-fg-muted)",
                        fontWeight: importType === t ? 600 : 400, fontSize: 13, cursor: "pointer",
                      }}
                    >
                      {userTypeName(t)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Download template */}
              <div style={{ marginBottom: 16 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="download"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = `${process.env.NEXT_PUBLIC_BASE_PATH || "/iamx"}/template/import_${isStaffType(importType) ? "internal" : "agency"}.xlsx`;
                    a.download = `${userTypeName(importType)}.xlsx`;
                    a.click();
                  }}
                >
                  
                  {tx("ดาวน์โหลด template")}{" "}{userTypeName(importType)}
                </Button>
              </div>

              {/* File drop zone */}
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!f.name.toLowerCase().endsWith(".xlsx")) {
                    showError(tx("ไฟล์ไม่ถูกต้อง"), tx("รองรับเฉพาะไฟล์ .xlsx เท่านั้น"));
                    e.target.value = "";
                    return;
                  }
                  setImportFile(f);
                  setImportResult(null);
                }}
              />
              {!importFile ? (
                <div
                  onClick={() => !importLoading && importFileRef.current?.click()}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    height: 72, border: "1px dashed #8d8d8d", borderRadius: 0,
                    color: "rgba(146,146,146,1)", cursor: "pointer", fontSize: 13,
                  }}
                >
                  <FileSpreadsheet size={20} />
                  
                  {tx("อัปโหลดไฟล์ .xlsx")}
                </div>
              ) : (
                <div style={{
                  display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12,
                  padding: 15, border: "1px solid rgba(220,220,220,1)", borderRadius: 0,
                }}>
                  {/* icon */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gridRow: "1 / 3", color: "#0f62fe" }}>
                    <FileSpreadsheet size={32} />
                  </div>
                  {/* filename + size */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{importFile.name}</span>
                    <span style={{ fontSize: 12, color: "rgba(146,146,146,1)" }}>
                      {(importFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  {/* actions / state */}
                  {importLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ height: 9, width: "100%", border: "1px solid #666", borderRadius: 0, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", background: "#0f62fe", borderRadius: 0,
                          animation: "importBarFill 1.5s ease-in-out infinite alternate",
                          width: "60%",
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: "rgba(146,146,146,1)" }}>{tx("กำลังนำเข้าข้อมูล...")}</span>
                    </div>
                  ) : importResult ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <svg width="18" height="18" viewBox="0 0 54 54" fill="none">
                        <path d="M23.5 31.843L17.585 25.928C16.025 24.368 13.491 24.367 11.929 25.929C10.37 27.488 10.367 30.023 11.928 31.585L20.415 40.072C21.977 41.633 24.488 41.623 26.04 40.071L43.311 23.346C44.877 21.78 44.876 19.248 43.314 17.686C41.755 16.127 39.218 16.126 37.654 17.689L23.5 31.843Z" fill="#24a148"/>
                        <circle cx="27" cy="27" r="26" stroke="#24a148" strokeWidth="2"/>
                      </svg>
                      <span style={{ fontSize: 13, color: "rgba(91,151,93,1)", fontWeight: 500 }}>
                        
                        {tx("นำเข้าสำเร็จ")}{" "}{importResult.imported}/{importResult.total}
                      </span>
                      <span
                        onClick={() => { setImportFile(null); setImportResult(null); if (importFileRef.current) importFileRef.current.value = ""; }}
                        style={{ fontSize: 12, color: "rgba(205,63,63,1)", textDecorationLine: "underline", cursor: "pointer", marginLeft: 8 }}
                      >
                        
                        {tx("ล้าง")}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 24 }}>
                      <span
                        onClick={() => importFileRef.current?.click()}
                        style={{ fontSize: 13, color: "#0f62fe", textDecorationLine: "underline", cursor: "pointer" }}
                      >
                        
                        {tx("เปลี่ยนไฟล์")}
                      </span>
                      <span
                        onClick={() => { setImportFile(null); setImportResult(null); if (importFileRef.current) importFileRef.current.value = ""; }}
                        style={{ fontSize: 13, color: "rgba(205,63,63,1)", textDecorationLine: "underline", cursor: "pointer" }}
                      >
                        
                        {tx("ลบ")}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Result summary */}
              {importResult && (
                <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 0, background: "var(--iamx-bg-subtle, #f4f4f4)", border: "1px solid var(--iamx-border)", fontSize: 12 }}>
                  <div style={{ display: "flex", gap: 16, marginBottom: (importResult.errors.length > 0 || importResult.warnings?.length > 0) ? 10 : 0 }}>
                    <span>{tx("ทั้งหมด")}{" "}<strong>{importResult.total}</strong></span>
                    <span style={{ color: "rgb(var(--c-green-600))" }}>{tx("นำเข้าสำเร็จ")}{" "}<strong>{importResult.imported}</strong></span>
                    <span style={{ color: "rgb(var(--c-amber-700))" }}>{tx("ข้าม")}{" "}<strong>{importResult.skipped}</strong></span>
                    <span style={{ color: "rgb(var(--c-red-600))" }}>{tx("ล้มเหลว")}{" "}<strong>{importResult.failed}</strong></span>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div style={{ maxHeight: 120, overflowY: "auto", borderTop: "1px solid var(--iamx-border)", paddingTop: 8 }}>
                      {importResult.errors.map((e, i) => (
                        <div key={i} style={{ color: "rgb(var(--c-red-600))", padding: "1px 0" }}>
                          
                          {tx("แถว")}{" "}{e.row}{e.name ? ` (${e.name})` : ""}: {e.reason}
                        </div>
                      ))}
                    </div>
                  )}
                  {importResult.warnings?.length > 0 && (
                    <div style={{ maxHeight: 80, overflowY: "auto", borderTop: "1px solid var(--iamx-border)", paddingTop: 8, marginTop: importResult.errors.length > 0 ? 8 : 0 }}>
                      {importResult.warnings.map((w, i) => (
                        <div key={i} style={{ color: "rgb(var(--c-amber-700))", padding: "1px 0" }}>
                          
                          {tx("âš แถว")}{" "}{w.row}{w.name ? ` (${w.name})` : ""}: {w.reason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--iamx-border)" }}>
              <Button variant="secondary" onClick={() => setImportOpen(false)}>{tx("ยกเลิก")}</Button>
              <Button variant="primary" onClick={handleImportSubmit} disabled={!importFile || importLoading}>
                {importLoading ? tx("กำลังนำเข้า...") : tx("นำเข้าข้อมูล")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
