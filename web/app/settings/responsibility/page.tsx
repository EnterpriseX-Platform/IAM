"use client";

import { tx } from "@/lib/i18n";
// - บทบาทในชุด: ผูก/ถอด role → ทุกคนในชุดได้/เสีย role นั้น (USER_ROLE_MAPPING เดิม)
// - เมนู: แก้สิทธิ์ที่บทบาทโดยตรง (ROLE_OBJECT_PERMISSION เดิม) — มีผลกับทุกคนที่มีบทบาทนั้น
//   แสดงแค่ "ใช้งาน" (VIEW) + "แก้ไขได้" (CREATE+EDIT) เฉพาะเมนูที่ระบบตรวจจริง
// - ผู้ใช้: ใส่/เอาออก (ถอดเฉพาะ role ที่ชุดให้ ไม่แตะ role ที่ให้เองแยก)

import { groupRoles, groupResponsibilities, useItemGroups } from "../../components/iamx/roleGroups";
import Select2 from "@/app/components/Select2";
import { MenuPicker } from "../../components/iamx/MenuPicker";
import {
  Button,
  Drawer,
  DrawerSection,
  EmptyState,
  FilterChip,
  FormField,
  Input,
  PageHeader,
  Tabs,
} from "@/app/components/iamx";
import { showConfirm, showError, showSuccess } from "@/lib/swal";
import { Check, ChevronDown, ChevronRight, X } from "@/app/components/iamx/carbonLucide";
import { useEffect, useMemo, useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

// เมนูที่ระบบตรวจสิทธิ์ CREATE/EDIT จริง (นอกนั้นใช้แค่ VIEW) — เพิ่มรหัสเมนูที่นี่เมื่อมีระบบเริ่มตรวจ
const EDITABLE_MENUS = new Set<string>([]);

interface Resp { id: number; code: string; name: string; description?: string; is_active: number; user_count: number; role_count: number; applicant_type?: string; agency_level?: string; parent_id?: number; agency_count?: number; group_code?: string }
interface RespRole { id: string; code: string; name: string; user_count: number }
interface RespUser { user_id: string; name: string; email: string; custom_count: number }
interface Role { id: string; code: string; name: string }
interface ObjectNode {
  id: number; label: string; code: string; path: string; level: number; sort_order: number;
  children: ObjectNode[]; domain_name?: string; application_name?: string; module_name?: string;
}
interface HistoryRow { kind: "role" | "user"; action: string; by: string; at: string; role_name: string; role_code: string; user_name: string }

const j = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(d.message || d.error || tx("ทำรายการไม่สำเร็จ"));
  return d;
};
const post = (url: string, body: unknown) =>
  j(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const sortObjects = (nodes: ObjectNode[]): ObjectNode[] =>
  [...nodes].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((n) => ({ ...n, children: sortObjects(n.children || []) }));

function Pills({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={"h-8 px-3 rounded-md text-[12.5px] border transition-colors " + (value === o.value
            ? "bg-[var(--iamx-accent)] border-[var(--iamx-accent)] text-white"
            : "bg-layer border-[var(--iamx-border)] text-[var(--iamx-fg)] hover:border-[var(--iamx-border-strong)]")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ResponsibilityPage() {
  // 15/11/69: กลุ่มมาจาก System settings › Groups
  useItemGroups("ROLE");
  const respGroupsList = useItemGroups("RESP");
  const [list, setList] = useState<Resp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [respFilter, setRespFilter] = useState<"all" | "in" | "ex" | "norole" | "nouser">("all");
  // 13/11/69: ลิงก์จากหน้าแรก ?filter=norole
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("filter") === "norole") setRespFilter("norole"); } catch {}
  }, []);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    try { setOpenIds(new Set(JSON.parse(localStorage.getItem("iamx.resp.open") || "[]"))); } catch { /* ไม่มีที่เก็บ */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("iamx.resp.open", JSON.stringify([...openIds])); } catch { /* ไม่มีที่เก็บ */ }
  }, [openIds]);
  const [selected, setSelected] = useState<Resp | null>(null);
  const [tab, setTab] = useState("menu");

  const [roles, setRoles] = useState<RespRole[]>([]);
  const [users, setUsers] = useState<RespUser[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [tree, setTree] = useState<ObjectNode[]>([]);
  // object_id → { role_id → permissions[] } ของบทบาทในชุด
  const [perms, setPerms] = useState<Record<number, Record<string, string[]>>>({});
  const [mappingIds, setMappingIds] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());

  const [menuSearch] = useState("");
  const [onlyGranted, setOnlyGranted] = useState(true);
  const [rowRole, setRowRole] = useState<Record<number, string>>({});

  const [drawer, setDrawer] = useState<null | "new" | "edit">(null);
  const [form, setForm] = useState({ code: "", name: "", description: "", applicant_type: "", agency_level: "", parent_id: "", group_code: "" });
  // ใช้กับหน่วยงาน (ว่าง = ทุกหน่วยงาน) — ORG_DEPT = สำนัก/กองภายในองค์กร · AGC = กระทรวง/กรม
  const [agencies, setAgencies] = useState<Array<{ type: string; id: string; name: string }>>([]);
  const [agencyOpts, setAgencyOpts] = useState<Record<string, Array<{ id: string; name: string; level: string }>>>({});
  const [agencySearch, setAgencySearch] = useState("");
  const [rolePickOpen, setRolePickOpen] = useState(false);
  const [parentPickOpen, setParentPickOpen] = useState(false);
  const [parentQ, setParentQ] = useState("");
  const [rolePickQ, setRolePickQ] = useState("");
  const [userPicker, setUserPicker] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ user_id: string; name: string; email: string }>>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userListSearch, setUserListSearch] = useState("");

  const loadList = async (keepId?: number) => {
    try {
      const d = await j(`${API_BASE}/admin/resp-ux`);
      const rows: Resp[] = d.data || [];
      setList(rows);
      if (keepId) setSelected(rows.find((r) => r.id === keepId) || null);
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    fetch(`${API_BASE}/admin/roles`).then((r) => r.json()).then((d) => setAllRoles(d.data || d || [])).catch(() => {});
    fetch(`${API_BASE}/admin/options/object-hierarchy`).then((r) => r.json()).then((d) => setTree(sortObjects(d.data || d || []))).catch(() => {});
  }, []);

  const loadPerms = async (rs: RespRole[]) => {
    const next: Record<number, Record<string, string[]>> = {};
    const ids: Record<string, number> = {};
    await Promise.all(
      rs.map(async (r) => {
        const d = await fetch(`${API_BASE}/admin/roles/${r.id}/permissions`).then((x) => x.json()).catch(() => ({}));
        (d.data || []).forEach((p: any) => {
          next[p.object_id] = next[p.object_id] || {};
          next[p.object_id][r.id] = p.permissions || [];
          ids[`${r.id}:${p.object_id}`] = p.role_object_mapping_id;
        });
      })
    );
    setPerms(next);
    setMappingIds(ids);
  };

  const loadDetail = async (id: number) => {
    try {
      const d = await j(`${API_BASE}/admin/resp-ux/${id}`);
      const rs: RespRole[] = d.data?.roles || [];
      setRoles(rs);
      setUsers(d.data?.users || []);
      await loadPerms(rs);
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    }
  };
  const loadHistory = async (id: number) => {
    const d = await fetch(`${API_BASE}/admin/resp-ux/${id}/history`).then((x) => x.json()).catch(() => ({}));
    setHistory(d.data || []);
  };

  useEffect(() => {
    setRoles([]); setUsers([]); setPerms({}); setHistory([]); setRowRole({});
    if (!selected) return;
    loadDetail(selected.id);
    loadHistory(selected.id);
  }, [selected?.id]);

  // ---------- บทบาทในชุด ----------
  const addRole = async (roleId: string) => {
    if (!selected || !roleId) return;
    const role = allRoles.find((r) => r.id === roleId);
    if (users.length && !(await showConfirm(tx("เพิ่มบทบาท"), tx("{0} จะถูกให้กับผู้ใช้ในชุดนี้ {1} คน", role?.name || "", users.length), tx("เพิ่ม")))) return;
    try {
      await post(`${API_BASE}/admin/resp-ux/${selected.id}/roles`, { role_id: roleId });
      await Promise.all([loadDetail(selected.id), loadHistory(selected.id), loadList(selected.id)]);
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    }
  };
  const removeRole = async (r: RespRole) => {
    if (!selected) return;
    if (!(await showConfirm(tx("เอาบทบาทออก"), tx("{0} จะถูกถอดจากผู้ใช้ที่ได้รับจากชุดนี้", r.name), tx("เอาออก")))) return;
    try {
      await j(`${API_BASE}/admin/resp-ux/${selected.id}/roles/${r.id}`, { method: "DELETE" });
      await Promise.all([loadDetail(selected.id), loadHistory(selected.id), loadList(selected.id)]);
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    }
  };

  // ---------- เมนู ----------
  const grantingRoles = (objectId: number, perm: string) =>
    Object.entries(perms[objectId] || {}).filter(([, p]) => p.includes(perm)).map(([rid]) => rid);

  const setRolePerms = async (roleId: string, objectId: number, permissions: string[]) => {
    const mid = mappingIds[`${roleId}:${objectId}`];
    if (mid || permissions.length === 0) {
      await post(`${API_BASE}/admin/roles/${roleId}/objects/${objectId}/set-permissions`, { permissions });
      return;
    }
    const created = await post(`${API_BASE}/admin/role-object-mappings`, {
      role_id: roleId, object_id: objectId, effective_date: new Date().toISOString().split("T")[0], is_active: 1,
    });
    const newId = created.data?.id || created.id;
    await post(`${API_BASE}/admin/role-object-permissions`, { role_object_mapping_id: newId, permissions });
  };

  const toggleMenu = async (obj: ObjectNode, perm: "VIEW" | "EDIT") => {
    const key = `${obj.id}-${perm}`;
    if (pending.has(key) || !roles.length) return;
    const holders = grantingRoles(obj.id, perm);
    const turnOn = holders.length === 0;
    const target = turnOn ? [rowRole[obj.id] || grantingRoles(obj.id, "VIEW")[0] || roles[0].id] : holders;
    const names = target.map((rid) => roles.find((r) => r.id === rid)).filter(Boolean) as RespRole[];
    const affected = names.reduce((s, r) => s + (r.user_count || 0), 0);
    if (affected > users.length &&
      !(await showConfirm(tx("แก้สิทธิ์บทบาท"), tx("{0} ใช้กับผู้ใช้ทั้งหมด {1} คน การเปลี่ยนนี้มีผลกับทุกคน", names.map((r) => r.name).join(", "), affected), tx("ยืนยัน")))) return;
    setPending((p) => new Set(p).add(key));
    try {
      for (const rid of target) {
        const cur = perms[obj.id]?.[rid] || [];
        let next: string[];
        if (perm === "VIEW") next = turnOn ? Array.from(new Set([...cur, "VIEW"])) : [];
        else next = turnOn ? Array.from(new Set([...cur, "VIEW", "CREATE", "EDIT"])) : cur.filter((p) => p !== "CREATE" && p !== "EDIT");
        await setRolePerms(rid, obj.id, next);
      }
      await loadPerms(roles);
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n; });
    }
  };

  const grouped = useMemo(() => {
    const granted = (o: ObjectNode): boolean => !!grantingRoles(o.id, "VIEW").length || (o.children || []).some(granted);
    const prune = (objs: ObjectNode[]): ObjectNode[] =>
      objs.flatMap((o) => {
        const kids = prune(o.children || []);
        return (!onlyGranted || grantingRoles(o.id, "VIEW").length || kids.length) ? [{ ...o, children: kids }] : [];
      });
    const q = menuSearch.trim().toLowerCase();
    const match = (o: ObjectNode): boolean => !q || o.label.toLowerCase().includes(q) || o.code.toLowerCase().includes(q) || (o.children || []).some(match);
    const g: Record<string, Record<string, Record<string, ObjectNode[]>>> = {};
    tree.forEach((n) => {
      if (onlyGranted && !granted(n)) return;
      if (!match(n)) return;
      const objs = prune([n]);
      if (!objs.length) return;
      const d = n.domain_name || tx("ไม่ระบุโดเมน"), a = n.application_name || tx("ไม่ระบุระบบงาน"), m = n.module_name || tx("ไม่ระบุโมดูล");
      ((g[d] ||= {})[a] ||= {})[m] = [...(g[d][a][m] || []), ...objs];
    });
    return g;
  }, [tree, perms, onlyGranted, menuSearch]);


  const Check2 = ({ on, busy, onClick, disabled }: { on: boolean; busy?: boolean; onClick: () => void; disabled?: boolean }) => (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className={
        "inline-flex h-5 w-5 items-center justify-center rounded transition-colors disabled:opacity-50 " +
        (on ? "bg-[var(--iamx-accent)] text-white" : "bg-layer border border-[var(--iamx-border-strong)] hover:border-[var(--iamx-accent)]")
      }
    >
      {on && <Check className="w-3 h-3" strokeWidth={3} />}
    </button>
  );


  // ---------- ผู้ใช้ ----------
  const openUserPicker = async () => {
    setUserPicker(true);
    setUserSearch("");
    if (allUsers.length) return;
    const d = await fetch(`${API_BASE}/users`).then((x) => x.json()).catch(() => ({}));
    const rows = (d.data || d || []) as any[];
    setAllUsers(rows.map((u) => ({
      user_id: String(u.user_id),
      name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.user_name || "",
      email: u.email || u.user_name || "",
    })));
  };
  const addUser = async (uid: string) => {
    if (!selected) return;
    try {
      await post(`${API_BASE}/admin/resp-ux/${selected.id}/users`, { user_id: uid });
      await Promise.all([loadDetail(selected.id), loadHistory(selected.id), loadList(selected.id)]);
      showSuccess(tx("เพิ่มแล้ว"), "");
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    }
  };
  const removeUser = async (u: RespUser) => {
    if (!selected) return;
    if (!(await showConfirm(tx("เอาออกจากชุด"), tx("{0} จะถูกถอดบทบาทที่ได้รับจากชุดนี้", u.name), tx("เอาออก")))) return;
    try {
      await j(`${API_BASE}/admin/resp-ux/${selected.id}/users/${u.user_id}`, { method: "DELETE" });
      await Promise.all([loadDetail(selected.id), loadHistory(selected.id), loadList(selected.id)]);
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    }
  };

  // ---------- ชุด ----------
  const putRegister = (id: number) =>
    j(`${API_BASE}/admin/resp-ux/${id}/register`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicant_type: form.applicant_type, agency_level: form.applicant_type === "EXTERNAL" || form.applicant_type === "BOTH" ? form.agency_level : "", parent_id: Number(form.parent_id) || 0 }),
    }).then(() => j(`${API_BASE}/admin/resp-ux/${id}/agencies`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: agencies }),
    })).then(() => j(`${API_BASE}/admin/resp-ux/${id}/group`, {
      // 15/11/69: กลุ่มจาก System settings › Groups
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_code: form.group_code }),
    }));
  const loadAgencies = async (id: number) => {
    setAgencies([]);
    const d = await fetch(`${API_BASE}/admin/resp-ux/${id}/agencies`).then((r) => r.json()).catch(() => ({}));
    setAgencies(d.data || []);
  };
  const agencyType = form.applicant_type === "INTERNAL" ? "ORG_DEPT" : "AGC";
  useEffect(() => {
    if (!drawer || agencyOpts[agencyType]) return;
    fetch(`${API_BASE}/admin/resp-ux/agency-options?type=${agencyType}`).then((r) => r.json())
      .then((d) => setAgencyOpts((o) => ({ ...o, [agencyType]: d.data || [] }))).catch(() => {});
  }, [drawer, agencyType]);
  const saveResp = async () => {
    try {
      const body = { code: form.code.trim(), name: form.name.trim(), description: form.description.trim(), is_active: 1, permissions: [] };
      if (drawer === "edit" && selected) {
        await j(`${API_BASE}/admin/responsibilities/${selected.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        await putRegister(selected.id);
        await loadList(selected.id);
      } else {
        const d = await j(`${API_BASE}/admin/responsibilities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (d.data?.id) await putRegister(d.data.id);
        await loadList(d.data?.id);
      }
      setDrawer(null);
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    }
  };
  const deleteResp = async () => {
    if (!selected) return;
    if (!(await showConfirm(tx("ลบความรับผิดชอบ"), tx("{0} — ผู้ใช้ในชุดจะถูกถอดบทบาทที่ได้รับจากชุดนี้", selected.name), tx("ลบ")))) return;
    try {
      await j(`${API_BASE}/admin/resp-ux/${selected.id}`, { method: "DELETE" });
      setDrawer(null);
      setSelected(null);
      await loadList();
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    }
  };

  const childrenOf = useMemo(() => {
    const m = new Map<number, Resp[]>();
    const ids = new Set(list.map((r) => r.id));
    list.forEach((r) => {
      const p = r.parent_id && ids.has(r.parent_id) && r.parent_id !== r.id ? r.parent_id : 0;
      m.set(p, [...(m.get(p) || []), r]);
    });
    return m;
  }, [list]);
  const depthOf = (r: Resp, seen = new Set<number>()): number => {
    const p = list.find((x) => x.id === r.parent_id);
    if (!p || seen.has(p.id)) return 0;
    seen.add(p.id);
    return 1 + depthOf(p, seen);
  };
  const pathOf = (r: Resp): Resp[] => {
    const out: Resp[] = [r];
    let cur = r;
    while (cur.parent_id) {
      const p = list.find((x) => x.id === cur.parent_id);
      if (!p || out.includes(p)) break;
      out.unshift(p);
      cur = p;
    }
    return out;
  };
  const q = search.trim().toLowerCase();
  const passFilter = (r: Resp) =>
    respFilter === "all" ||
    (respFilter === "in" && (r.applicant_type === "INTERNAL" || r.applicant_type === "BOTH")) ||
    (respFilter === "ex" && (r.applicant_type === "EXTERNAL" || r.applicant_type === "BOTH")) ||
    (respFilter === "norole" && !r.role_count) ||
    (respFilter === "nouser" && !r.user_count);
  const matches = (r: Resp) => passFilter(r) && (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  const narrowing = !!q || respFilter !== "all";
  const visMemo = new Map<number, boolean>();
  const isVisible = (r: Resp): boolean => {
    if (visMemo.has(r.id)) return visMemo.get(r.id)!;
    visMemo.set(r.id, false);
    const v = matches(r) || (childrenOf.get(r.id) || []).some(isVisible);
    visMemo.set(r.id, v);
    return v;
  };
  const ordered: Resp[] = [];
  const walkAll = (pid: number) => (childrenOf.get(pid) || []).forEach((r) => { ordered.push(r); walkAll(r.id); });
  walkAll(0);
  const rowsShown: Array<{ r: Resp; depth: number; kids: number; open: boolean }> = [];
  const walk = (pid: number, depth: number) => (childrenOf.get(pid) || []).forEach((r) => {
    if (!isVisible(r)) return;
    const kids = (childrenOf.get(r.id) || []).filter(isVisible).length;
    const open = kids > 0 && (narrowing || openIds.has(r.id));
    rowsShown.push({ r, depth, kids, open });
    if (open) walk(r.id, depth + 1);
  });
  walk(0, 0);
  const matchCount = list.filter(matches).length;
  const chipCounts = {
    all: list.length,
    in: list.filter((r) => r.applicant_type === "INTERNAL" || r.applicant_type === "BOTH").length,
    ex: list.filter((r) => r.applicant_type === "EXTERNAL" || r.applicant_type === "BOTH").length,
    norole: list.filter((r) => !r.role_count).length,
    nouser: list.filter((r) => !r.user_count).length,
  };
  const toggleOpen = (id: number) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hl = (text: string) => {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark className="bg-amber-100 text-inherit rounded-sm">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
  };
  const roleOptions = allRoles.filter((r) => !roles.some((x) => x.id === r.id));
  const pickable = allUsers.filter((u) => !users.some((x) => x.user_id === u.user_id))
    .filter((u) => !userSearch.trim() || `${u.name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())).slice(0, 50);
  const shownUsers = users.filter((u) => !userListSearch.trim() || `${u.name} ${u.email}`.toLowerCase().includes(userListSearch.toLowerCase()));
  const fmt = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={tx("ความรับผิดชอบ")}
        description={loading ? "" : tx("{0} ชุด · ยังไม่มีบทบาท {1} ชุด", list.length, chipCounts.norole)}
        actions={<Button variant="primary" icon="plus" onClick={() => { setForm({ code: "", name: "", description: "", applicant_type: "", agency_level: "", parent_id: "", group_code: "" }); setAgencies([]); setDrawer("new"); }}>{tx("เพิ่มความรับผิดชอบ")}</Button>}
      />

      {/* 13/11/69: จัดแบบเดียวกับหน้าบทบาท — รายการแคบซ้าย 340px แถวเดียว ไม่มีเส้นคั่น · ชุดย่อยยุบไว้ · รายละเอียดขวา */}
      <div className="flex flex-col min-[900px]:flex-row flex-1 min-h-0 overflow-y-auto min-[900px]:overflow-visible">
        <div className="w-full min-[900px]:w-[340px] shrink-0 max-h-[50vh] min-[900px]:max-h-none border-b min-[900px]:border-b-0 min-[900px]:border-r border-[var(--iamx-border)] flex flex-col bg-[var(--iamx-bg)]">
          <div className="p-3 border-b border-[var(--iamx-border)]">
            <Input value={search} onChange={setSearch} placeholder={tx("ค้นหาชื่อหรือรหัส")} icon="search" />
            {respFilter !== "all" && (
              <div className="mt-2">
                <FilterChip label={tx("ต้องจัดการ")} value={respFilter === "norole" ? tx("ยังไม่มีบทบาท") : respFilter === "nouser" ? tx("ยังไม่มีผู้ใช้") : respFilter === "in" ? tx("ภายใน") : tx("ภายนอก")} onClick={() => {}} onClear={() => { setRespFilter("all"); try { window.history.replaceState(null, "", window.location.pathname); } catch {} }} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 px-4 h-8 items-center border-b border-[var(--iamx-border)] text-[11.5px] font-medium text-[var(--iamx-fg-muted)]">
            <span>{tx("ความรับผิดชอบ")}</span><span className="text-right">{tx("ผู้ใช้")}</span>
          </div>
          {loading ? (
            <div className="py-8 text-center text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</div>
          ) : rowsShown.length === 0 ? (
            <div className="py-8 text-center text-[12.5px] text-[var(--iamx-fg-muted)]">{narrowing ? tx("ไม่พบความรับผิดชอบที่ตรงเงื่อนไข") : tx("ยังไม่มีความรับผิดชอบ")}</div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {/* 13/11/69: จัดกลุ่มตามผู้สมัคร (ภายใน/ภายนอก) แบบหน้าบทบาท · กลุ่มยุบไว้ ค้นหาแล้วกางเอง · ชุดย่อยตามกลุ่มของชุดบนสุด */}
              {(() => {
                // 15/11/69: กลุ่มตาม System settings › Groups (ชุดย่อยอยู่กลุ่มเดียวกับชุดบนสุด) · เดิม hardcode ภายใน/ภายนอก
                const chunks: (typeof rowsShown)[] = [];
                for (const x of rowsShown) {
                  if (x.depth === 0 || !chunks.length) chunks.push([]);
                  chunks[chunks.length - 1].push(x);
                }
                const by: Record<string, typeof rowsShown> = {};
                const GROUPS = groupResponsibilities(chunks, (ch) => ch[0]?.r.group_code).map((g) => {
                  by[g.key] = g.items.flat();
                  return [g.key, g.label] as const;
                });
                return GROUPS.filter(([k]) => by[k]?.length).map(([k, label]) => {
                  const gOpen = narrowing || openGroups.has(k) || (!!selected && by[k].some((x) => x.r.id === selected.id));
                  return (
                    <div key={k || "none"}>
                      <button type="button"
                        onClick={() => setOpenGroups((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                        className="sticky top-0 z-[1] w-full flex items-center gap-2 px-4 h-9 text-[12.5px] font-medium text-[var(--iamx-fg)] bg-[var(--iamx-surface)] border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]">
                        {gOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <span className="flex-1 text-left">{label}</span>
                        <span className="tabular-nums font-normal text-[12px] text-[var(--iamx-fg-muted)]">{by[k].filter((x) => x.depth === 0).length} sets</span>
                      </button>
                      {gOpen && by[k].map(({ r, depth, kids, open }) => {
                const active = selected?.id === r.id;
                const dim = narrowing && !matches(r);
                return (
                  <div key={r.id} role="button" tabIndex={0}
                    onClick={() => { setSelected(r); setTab("menu"); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { setSelected(r); setTab("menu"); }
                      if (e.key === "ArrowRight" && kids && !open) toggleOpen(r.id);
                      if (e.key === "ArrowLeft" && open) toggleOpen(r.id);
                      if (e.key === "ArrowDown") (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
                      if (e.key === "ArrowUp") (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
                    }}
                    className={"grid grid-cols-[minmax(0,1fr)_36px] items-baseline gap-2 pr-4 py-1.5 cursor-pointer text-[13px] outline-none focus-visible:bg-[var(--iamx-bg-hover)] " + (active ? "bg-[var(--iamx-bg-active)] shadow-[inset_3px_0_0_#0f62fe] font-medium" : "hover:bg-[var(--iamx-bg-hover)]")}
                    style={{ paddingLeft: 24 + depth * 20 }}>
                    <div className="flex items-baseline min-w-0">
                      <span onClick={(e) => { if (kids) { e.stopPropagation(); toggleOpen(r.id); } }}
                        className={"h-5 w-6 inline-flex items-center justify-center shrink-0 self-center " + (kids ? "text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)]" : "")}>
                        {kids ? (open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : null}
                      </span>
                      <span className={"min-w-0 break-words " + (dim ? "text-[var(--iamx-fg-muted)]" : "text-[var(--iamx-fg)]")}>
                        {hl(r.name)}
                        {kids > 0 && !open && <span className="ml-1.5 text-[11.5px] font-normal text-[var(--iamx-fg-muted)] tabular-nums">{kids}</span>}
                        {!r.role_count && <span className="ml-1.5 text-[11px] font-normal text-amber-700 whitespace-nowrap">{tx("ไม่มีบทบาท")}</span>}
                      </span>
                    </div>
                    <span className="text-right tabular-nums text-[12px] text-[var(--iamx-fg-muted)]">{r.user_count || 0}</span>
                  </div>
                );
              })}
                    </div>
                  );
                });
              })()}
            </div>
          )}
          <div className="px-4 py-2 border-t border-[var(--iamx-border)] text-[11.5px] text-[var(--iamx-fg-muted)] tabular-nums">{narrowing ? tx("ตรงเงื่อนไข {0} จาก {1}", matchCount, list.length) : tx("{0} ความรับผิดชอบ", list.length)}</div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-[70vh] min-[900px]:min-h-0">
          {!selected ? (
            <div className="flex items-center justify-center h-full"><EmptyState icon="briefcase" title={tx("เลือกความรับผิดชอบ")} /></div>
          ) : (
            <>
              <div className="px-6 pt-4 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)]">
                {pathOf(selected).length > 1 && (
                  <div className="flex items-center gap-1 flex-wrap text-[12px] text-[var(--iamx-fg-muted)] mb-1.5">
                    {pathOf(selected).slice(0, -1).map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1">
                        <button type="button" className="hover:text-[var(--iamx-accent)] hover:underline" onClick={() => { setSelected(p); setOpenIds((s) => new Set([...s, ...pathOf(p).map((x) => x.id)])); }}>{p.name}</button>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[16px] font-semibold">{selected.name}</h2>
                      <span className="font-mono text-[11.5px] text-[var(--iamx-fg-muted)]">{selected.code}</span>
                    </div>
                    {selected.description && <p className="text-[12.5px] text-[var(--iamx-fg-muted)] mt-1">{selected.description}</p>}
                  </div>
                  <Button variant="secondary" size="sm" icon="edit" onClick={() => { setForm({ code: selected.code, name: selected.name, description: selected.description || "", applicant_type: selected.applicant_type || "", agency_level: selected.agency_level || "", parent_id: selected.parent_id ? String(selected.parent_id) : "", group_code: selected.group_code || "" }); loadAgencies(selected.id); setDrawer("edit"); }}>{tx("แก้ไข")}</Button>
                </div>
                <Tabs
                  className="mt-3 !mx-0 !px-0 border-b-0"
                  value={tab}
                  onChange={setTab}
                  tabs={[{ value: "menu", label: tx("เมนู") }, { value: "users", label: tx("ผู้ใช้"), count: users.length }, { value: "history", label: tx("ประวัติ") }]}
                />
              </div>

              <div className="flex-1 overflow-auto">
                {tab === "menu" && (
                  <>
                    <div className="px-6 py-3 flex items-center gap-2 flex-wrap border-b border-[var(--iamx-border)]">
                      <span className="text-[12.5px] text-[var(--iamx-fg-muted)] mr-1">{tx("บทบาทในชุด")}</span>
                      {roles.map((r) => (
                        <span key={r.id} className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-md border border-[var(--iamx-border-strong)] bg-layer text-[12.5px]">
                          {r.name}
                          <span className="font-mono text-[11px] text-[var(--iamx-fg-muted)]">{r.code}</span>
                          <button type="button" onClick={() => removeRole(r)} className="h-5 w-5 inline-flex items-center justify-center rounded text-[var(--iamx-fg-muted)] hover:text-red-600 hover:bg-red-50" title={tx("เอาออก")}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <div className="relative">
                        <button type="button" onClick={() => { setRolePickOpen((v) => !v); setRolePickQ(""); }}
                          className="h-7 px-2.5 text-[12.5px] text-[var(--iamx-accent)] bg-layer border border-dashed border-[var(--iamx-border-strong)] rounded-md hover:border-[var(--iamx-accent)]">
                          
                          {tx("+ เพิ่มบทบาท")}
                        </button>
                        {rolePickOpen && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setRolePickOpen(false)} />
                            <div className="absolute z-40 mt-1 left-0 w-[360px] max-w-[calc(100vw-32px)] rounded-lg border border-[var(--iamx-border)] bg-layer shadow-lg">
                              <div className="p-2 border-b border-[var(--iamx-border)]">
                                <Input value={rolePickQ} onChange={setRolePickQ} placeholder={tx("ค้นหาชื่อหรือรหัสบทบาท")} icon="search" autoFocus />
                              </div>
                              <div className="max-h-[320px] overflow-y-auto py-1">
                                {(() => {
                                  const q = rolePickQ.trim().toLowerCase();
                                  const list = roleOptions.filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
                                  if (!list.length) return <div className="px-3 py-4 text-center text-[12.5px] text-[var(--iamx-fg-muted)]">{tx("ไม่พบบทบาท")}</div>;
                                  return groupRoles(list).map((g) => (
                                    <div key={g.key}>
                                      <div className="px-3 pt-2 pb-1 text-[11.5px] font-medium text-[var(--iamx-fg-muted)]">{g.label}</div>
                                      {g.items.map((r) => (
                                        <button key={r.id} type="button" onClick={() => { setRolePickOpen(false); addRole(r.id); }}
                                          className="w-full text-left px-3 py-1.5 hover:bg-[var(--iamx-bg-hover)] flex items-center gap-2">
                                          <span className="flex-1 min-w-0 text-[13px] truncate">{r.name}</span>
                                          <span className="font-mono text-[11px] text-[var(--iamx-fg-muted)] shrink-0">{r.code}</span>
                                        </button>
                                      ))}
                                    </div>
                                  ));
                                })()}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {roles.length === 0 ? (
                      <EmptyState icon="shield" title={tx("ยังไม่มีบทบาทในชุด")} />
                    ) : (
                      <>
                        {/* 13/11/69: ซ้ายระบบงาน · ขวาเมนูแบน (แทนต้นไม้ซ้อน) */}
                        <div className="px-6 py-3 h-[620px]">
                          <MenuPicker
                            groups={grouped}
                            isOn={(n) => grantingRoles(n.id, "VIEW").length > 0}
                            toolbar={<FilterChip label={tx("เฉพาะที่เลือก")} active={onlyGranted} onClick={() => setOnlyGranted((v) => !v)} />}
                            header={<>
                              <span className="w-[150px]">{tx("บทบาท")}</span>
                              <span className="w-14 text-center">{tx("ใช้งาน")}</span>
                              <span className="w-14 text-center">{tx("แก้ไขได้")}</span>
                            </>}
                            renderCells={(n) => {
                              const viewBy = grantingRoles(n.id, "VIEW");
                              const editBy = grantingRoles(n.id, "EDIT");
                              const o = n as ObjectNode;
                              const editable = EDITABLE_MENUS.has(o.code);
                              return (
                                <>
                                  <span className="w-[150px] shrink-0 text-[12px] text-[var(--iamx-fg-muted)]">
                                    {viewBy.length ? (
                                      viewBy.map((rid) => roles.find((r) => r.id === rid)?.code).join(", ")
                                    ) : roles.length > 1 ? (
                                      <Select2
                                        value={String(rowRole[o.id] || roles[0].id)}
                                        onChange={(v) => setRowRole((p) => ({ ...p, [o.id]: v }))}
                                        className="w-[146px]"
                                        clearable={false}
                                        options={roles.map((r) => ({ value: String(r.id), label: r.code }))}
                                      />
                                    ) : null}
                                  </span>
                                  <span className="w-14 flex justify-center shrink-0"><Check2 on={viewBy.length > 0} busy={pending.has(`${o.id}-VIEW`)} onClick={() => toggleMenu(o, "VIEW")} /></span>
                                  <span className="w-14 flex justify-center shrink-0">
                                    {editable && <Check2 on={editBy.length > 0} busy={pending.has(`${o.id}-EDIT`)} disabled={!viewBy.length} onClick={() => toggleMenu(o, "EDIT")} />}
                                  </span>
                                </>
                              );
                            }}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                {tab === "users" && (
                  <>
                    <div className="px-6 py-3 flex items-center gap-2 flex-wrap border-b border-[var(--iamx-border)]">
                      <div className="w-[240px]"><Input value={userListSearch} onChange={setUserListSearch} placeholder={tx("ค้นหาผู้ใช้")} icon="search" /></div>
                      <div className="ml-auto"><Button variant="secondary" size="sm" icon="plus" onClick={openUserPicker}>{tx("เพิ่มผู้ใช้")}</Button></div>
                    </div>
                    {shownUsers.length === 0 ? (
                      <EmptyState icon="users" title={tx("ยังไม่มีผู้ใช้ในชุด")} />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="cds--data-table cds--data-table--sm w-full min-w-[560px] text-[13px] border-collapse">
                          <thead>
                            <tr className="border-b border-[var(--iamx-border)] text-[11.5px] text-[var(--iamx-fg-muted)]">
                              <th className="text-left h-9 pl-6 pr-3 font-medium">{tx("ผู้ใช้")}</th>
                              <th className="text-left h-9 px-3 font-medium w-40">{tx("สิทธิ์เพิ่มเติม")}</th>
                              <th className="w-24" />
                            </tr>
                          </thead>
                          <tbody>
                            {shownUsers.map((u) => (
                              <tr key={u.user_id} className="border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]" style={{ height: 52 }}>
                                <td className="pl-6 pr-3">
                                  <div className="font-medium">{u.name}</div>
                                  <div className="text-[11.5px] text-[var(--iamx-fg-muted)]">{u.email}</div>
                                </td>
                                <td className="px-3 text-[12.5px] text-[var(--iamx-fg-muted)]">{u.custom_count ? tx("{0} เมนู", u.custom_count) : "—"}</td>
                                <td className="pr-6 text-right"><Button variant="ghost" size="sm" onClick={() => removeUser(u)}>{tx("เอาออก")}</Button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {tab === "history" && (
                  history.length === 0 ? (
                    <EmptyState icon="calendar" title={tx("ยังไม่มีประวัติ")} />
                  ) : (
                    <div className="px-6 py-2">
                      {history.map((h, i) => (
                        <div key={i} className="flex items-start justify-between gap-4 py-2.5 border-b border-[var(--iamx-border)] text-[13px]">
                          <div>
                            {h.action === "INSERT" ? tx("เพิ่ม") : tx("เอาออก")}{h.kind === "role" ? tx("บทบาท") : tx("ผู้ใช้")}
                            <span className="font-medium">{h.kind === "role" ? h.role_name : h.user_name}</span>
                            {h.kind === "role" && <span className="font-mono text-[11.5px] text-[var(--iamx-fg-muted)] ml-1.5">{h.role_code}</span>}
                          </div>
                          <div className="text-[11.5px] text-[var(--iamx-fg-muted)] whitespace-nowrap">{fmt(h.at)} · {h.by}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer === "edit" ? tx("แก้ไขความรับผิดชอบ") : tx("เพิ่มความรับผิดชอบ")}
        width={480}
        persistKey="iamx-resp-drawer"
        footer={
          <div className="flex items-center gap-2 w-full">
            {drawer === "edit" && <Button variant="danger" size="sm" onClick={deleteResp}>{tx("ลบ")}</Button>}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDrawer(null)}>{tx("ยกเลิก")}</Button>
              <Button variant="primary" size="sm" disabled={!form.code.trim() || !form.name.trim() || ((form.applicant_type === "EXTERNAL" || form.applicant_type === "BOTH") && !form.agency_level)} onClick={saveResp}>{tx("บันทึก")}</Button>
            </div>
          </div>
        }
      >
        <DrawerSection title={tx("ข้อมูลทั่วไป")}>
          <div className="space-y-4">
          <FormField label={tx("รหัส")} required><Input value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))} placeholder="AGENCY_DEPT" /></FormField>
          <FormField label={tx("ชื่อ")} required><Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} /></FormField>
          <FormField label={tx("คำอธิบาย")}><Input value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} /></FormField>
          </div>
        </DrawerSection>
        <DrawerSection title="Group">
          <Select2 value={form.group_code} onChange={(v) => setForm((f) => ({ ...f, group_code: v || "" }))} clearable={false}
            options={[{ value: "", label: "Ungrouped" }, ...respGroupsList.filter((g) => g.is_active === 1).map((g) => ({ value: g.code, label: g.name }))]} />
        </DrawerSection>
        <DrawerSection title={tx("การสมัครใช้งาน")}>
          <div className="space-y-4">
          <FormField label={tx("ให้เลือกตอนสมัครใช้งาน")}>
            <Pills value={form.applicant_type} onChange={(v) => setForm((f) => ({ ...f, applicant_type: v }))}
              options={[{ value: "", label: tx("ไม่ให้เลือก") }, { value: "EXTERNAL", label: tx("ภายนอก") }, { value: "INTERNAL", label: tx("ภายใน (ภายใน)") }, { value: "BOTH", label: tx("ทั้งสอง") }]} />
          </FormField>
          {(form.applicant_type === "EXTERNAL" || form.applicant_type === "BOTH") && (
            <FormField label={tx("หน่วยงานที่ผู้สมัครเลือก")} required>
              <Pills value={form.agency_level} onChange={(v) => setForm((f) => ({ ...f, agency_level: v }))}
                options={[{ value: "MIN", label: tx("กระทรวง") }, { value: "AGC", label: tx("กระทรวง › กรม") }, { value: "SUB_AGC", label: tx("กระทรวง › กรม › หน่วยปฏิบัติ") }]} />
            </FormField>
          )}
          <FormField label={tx("อยู่ภายใต้")}>
            <div className="relative">
              <button type="button" onClick={() => { setParentPickOpen((v) => !v); setParentQ(""); }}
                className="w-full h-8 px-2.5 text-left text-[13px] bg-layer border border-[var(--iamx-border)] rounded-md flex items-center justify-between gap-2 hover:border-[var(--iamx-border-strong)]">
                <span className={form.parent_id ? "" : "text-[var(--iamx-fg-muted)]"}>{list.find((r) => String(r.id) === form.parent_id)?.name || tx("ไม่มี (ชุดบนสุด)")}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--iamx-fg-muted)]" />
              </button>
              {parentPickOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setParentPickOpen(false)} />
                  <div className="absolute z-40 mt-1 left-0 right-0 rounded-lg border border-[var(--iamx-border)] bg-layer shadow-lg">
                    <div className="p-2 border-b border-[var(--iamx-border)]"><Input value={parentQ} onChange={setParentQ} placeholder={tx("ค้นหาความรับผิดชอบ")} icon="search" autoFocus /></div>
                    <div className="max-h-[280px] overflow-y-auto py-1">
                      <button type="button" onClick={() => { setForm((f) => ({ ...f, parent_id: "", group_code: "" })); setParentPickOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-[13px] text-[var(--iamx-fg-muted)] hover:bg-[var(--iamx-bg-hover)]">{tx("ไม่มี (ชุดบนสุด)")}</button>
                      {ordered.filter((r) => (drawer !== "edit" || r.id !== selected?.id) && (!parentQ.trim() || r.name.toLowerCase().includes(parentQ.toLowerCase())))
                        .slice(0, 200).map((r) => (
                          <button key={r.id} type="button" onClick={() => { setForm((f) => ({ ...f, parent_id: String(r.id) })); setParentPickOpen(false); }}
                            className={"w-full text-left py-1.5 pr-3 text-[13px] hover:bg-[var(--iamx-bg-hover)] " + (String(r.id) === form.parent_id ? "bg-[var(--iamx-bg-active)] font-medium" : "")}
                            style={{ paddingLeft: 12 + (parentQ.trim() ? 0 : depthOf(r) * 16) }}>
                            {r.name}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </FormField>
          {form.applicant_type && (
            <FormField label={agencyType === "ORG_DEPT" ? tx("ใช้กับสำนัก/กอง (ภายใน)") : tx("ใช้กับกระทรวง/กรม")}>
              <div className="text-[12px] text-[var(--iamx-fg-muted)] mb-1.5">{tx("ไม่เลือก = ทุกหน่วยงาน")}{agencyType === "AGC" ? tx("· เลือกกระทรวง = ทุกกรมในกระทรวง") : ""}</div>
              {agencies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {agencies.map((a) => (
                    <span key={a.type + a.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md border border-[var(--iamx-border-strong)] text-[12.5px] bg-layer">
                      {a.name}
                      <button type="button" className="h-5 w-5 inline-flex items-center justify-center rounded text-[var(--iamx-fg-muted)] hover:text-red-600" onClick={() => setAgencies((x) => x.filter((y) => !(y.type === a.type && y.id === a.id)))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <Input value={agencySearch} onChange={setAgencySearch} placeholder={tx("ค้นหาหน่วยงานเพื่อเพิ่ม")} icon="search" />
              {agencySearch.trim().length >= 2 && (
                <div className="mt-1 max-h-48 overflow-y-auto border border-[var(--iamx-border)] rounded-md">
                  {(agencyOpts[agencyType] || [])
                    .filter((o) => o.name.toLowerCase().includes(agencySearch.toLowerCase()) && !agencies.some((a) => a.type === agencyType && a.id === o.id))
                    .slice(0, 30)
                    .map((o) => (
                      <button key={o.id} type="button" className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[var(--iamx-bg-hover)] flex justify-between gap-2"
                        onClick={() => { setAgencies((x) => [...x, { type: agencyType, id: o.id, name: o.name }]); setAgencySearch(""); }}>
                        <span>{o.name}</span>
                        <span className="text-[11px] text-[var(--iamx-fg-muted)]">{o.level === "MIN" ? tx("กระทรวง") : o.level === "AGC" ? tx("กรม") : ""}</span>
                      </button>
                    ))}
                </div>
              )}
            </FormField>
          )}
                  </div>
        </DrawerSection>
      </Drawer>

      <Drawer open={userPicker} onClose={() => setUserPicker(false)} title={tx("เพิ่มผู้ใช้")} width={520} persistKey="iamx-resp-users">
        <DrawerSection>
        <Input value={userSearch} onChange={setUserSearch} placeholder={tx("ค้นหาชื่อ หรืออีเมล")} icon="search" />
        <div className="mt-3 border border-[var(--iamx-border)] rounded-md">
          {allUsers.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</div>
          ) : pickable.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[var(--iamx-fg-muted)]">{tx("ไม่พบผู้ใช้")}</div>
          ) : (
            pickable.map((u) => (
              <div key={u.user_id} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 border-[var(--iamx-border)] text-[13px]">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{u.name || u.email}</div>
                  <div className="text-[11.5px] text-[var(--iamx-fg-muted)] truncate">{u.email}</div>
                </div>
                <Button variant="secondary" size="xs" onClick={() => addUser(u.user_id)}>{tx("เพิ่ม")}</Button>
              </div>
            ))
          )}
        </div>
        </DrawerSection>
      </Drawer>
    </div>
  );
}
