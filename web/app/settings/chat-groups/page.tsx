"use client";

import { tx } from "@/lib/i18n";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  DrawerSection,
  EmptyState,
  FormField,
  Icon,
  IconButton,
  Input,
  PageHeader,
  StatusPill,
  Textarea,
  Toggle,
} from "@/app/components/iamx";
import Select2 from "@/app/components/Select2";
import { showConfirm, showError, showSuccess } from "@/lib/swal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

const CHAT_API =
  process.env.NEXT_PUBLIC_CHAT_API_BASE ||
  "/chat-service/chat/group/api";
const IAMX_API = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

interface ChatGroup {
  id: number;
  code: string;
  name: string;
  description: string;
  avatar_url: string;
  is_active: number;
  agent_count: number;
  member_count: number;
  created_at: string;
  updated_at: string;
}

interface Agent {
  id: number;
  group_id: number;
  user_id: number;
  user_name: string;
  is_primary: number;
}

interface Member {
  id: number;
  group_id: number;
  user_id: number;
  user_name: string;
}

interface UserResult {
  id: number;
  name: string;
  firstName?: string;
  lastName?: string;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  is_active: number;
  avatar_url: string;
}

const emptyForm: FormState = { code: "", name: "", description: "", is_active: 1, avatar_url: "" };

export default function ChatGroupsPage() {
  const { token } = useAuth();
  const authHeaders = () => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token ?? ""}`,
  });
  // ขอบนอก (WAF) ปล่อยแค่ GET/POST — PUT/DELETE ส่งเป็น POST + X-HTTP-Method-Override (chat-service แปลงกลับเอง)
  const overrideInit = (method: "PUT" | "DELETE") => ({
    method: "POST",
    headers: { ...authHeaders(), "X-HTTP-Method-Override": method },
  });

  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [selected, setSelected] = useState<ChatGroup | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [searchGroup, setSearchGroup] = useState("");
  const [chatAgentRoleId, setChatAgentRoleId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserResult[]>([]);

  // Drawer
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<ChatGroup | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Detail tab
  const [detailTab, setDetailTab] = useState<"agents" | "members">("agents");

  // Agent search / add mode
  const [agentSearch, setAgentSearch] = useState("");
  const [addMode, setAddMode] = useState<"search" | "role">("search");
  const [roles, setRoles] = useState<{ id: string; code: string; name: string }[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [roleUsers, setRoleUsers] = useState<UserResult[]>([]);
  const [loadingRoleUsers, setLoadingRoleUsers] = useState(false);

  useEscapeKey(showDrawer, () => setShowDrawer(false));

  // ── CHAT_AGENT role helpers ───────────────────────────────────────

  useEffect(() => {
    fetch(`${IAMX_API}/directory/roles`)
      .then(r => r.json())
      .then(data => {
        const list: { id: string; code: string; name: string }[] = data.data ?? data ?? [];
        setRoles(list);
        const chatAgent = list.find(r => r.code === "CHAT_AGENT");
        if (chatAgent) setChatAgentRoleId(chatAgent.id);
      })
      .catch(() => {});
  }, []);

  const assignChatAgentRole = async (userId: number) => {
    if (!chatAgentRoleId) return;
    try {
      const res = await fetch(`${IAMX_API}/directory/user-role-mappings?user_id=${userId}`);
      const data = await res.json();
      const mappings: { role_id: string }[] = data.data ?? data ?? [];
      if (mappings.some(m => m.role_id === chatAgentRoleId)) return;
      await fetch(`${IAMX_API}/directory/user-role-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          role_id: chatAgentRoleId,
          effective_date: new Date().toISOString().split("T")[0],
          is_active: 1,
        }),
      });
    } catch {
      console.warn("Could not assign CHAT_AGENT role for user", userId);
    }
  };

  const revokeChatAgentRole = async (userId: number) => {
    if (!chatAgentRoleId) return;
    try {
      const res = await fetch(`${IAMX_API}/directory/user-role-mappings?user_id=${userId}`);
      const data = await res.json();
      const mappings: { id: number; role_id: string }[] = data.data ?? data ?? [];
      const mapping = mappings.find(m => m.role_id === chatAgentRoleId);
      if (!mapping) return;
      await fetch(`${IAMX_API}/directory/user-role-mappings/${mapping.id}`, { method: "DELETE" });
    } catch {
      console.warn("Could not revoke CHAT_AGENT role for user", userId);
    }
  };

  // ── Fetch ────────────────────────────────────────────────────────

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${CHAT_API}/groups`, { headers: authHeaders() });
      if (!res.ok) {
        setGroups([]);
        if (res.status === 401) showError(tx("เซสชันหมดอายุ"), tx("กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่"));
        else if (res.status === 403) showError(tx("ไม่มีสิทธิ์จัดการกลุ่มแชท"), tx("เฉพาะผู้ดูแลระบบเท่านั้น"));
        else if (res.status === 404) showError(tx("ไม่พบบริการกลุ่มแชท"), tx("กรุณาแจ้งผู้ดูแลระบบ"));
        else showError(tx("โหลดข้อมูลกลุ่มไม่สำเร็จ"));
        return;
      }
      const data = await res.json();
      setGroups(data.data ?? data ?? []);
    } catch {
      showError(tx("โหลดข้อมูลกลุ่มไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async (groupId: number) => {
    setLoadingAgents(true);
    try {
      const res = await fetch(`${CHAT_API}/groups/${groupId}/agents`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAgents(data.data ?? data ?? []);
    } catch {
      setAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  };

  const fetchMembers = async (groupId: number) => {
    try {
      const res = await fetch(`${CHAT_API}/groups/${groupId}/members`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data.data ?? data ?? []);
    } catch {
      setMembers([]);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  useEffect(() => {
    if (!selected) { setAgents([]); setMembers([]); return; }
    setDetailTab("agents");
    setAgentSearch("");
    setMemberSearch("");
    setAddMode("search");
    setSelectedRoleId("");
    setRoleUsers([]);
    fetchAgents(selected.id);
    fetchMembers(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    if (!selectedRoleId) { setRoleUsers([]); return; }
    setLoadingRoleUsers(true);
    fetch(`${IAMX_API}/directory/roles/${selectedRoleId}/users`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: { user_id: number; first_name?: string; last_name?: string }[] = data.data ?? data ?? [];
        setRoleUsers(list.map(u => ({
          id: u.user_id,
          name: [u.first_name, u.last_name].filter(Boolean).join(" ") || `User ${u.user_id}`,
          firstName: u.first_name ?? "",
          lastName: u.last_name ?? "",
        })));
      })
      .catch(() => setRoleUsers([]))
      .finally(() => setLoadingRoleUsers(false));
  }, [selectedRoleId]);

  useEffect(() => {
    fetch(`${IAMX_API}/users`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list: { user_id: number; first_name?: string; last_name?: string; user_name?: string }[] = data.data ?? data ?? [];
        setAllUsers(list.map(u => ({
          id: u.user_id,
          name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.user_name || `User ${u.user_id}`,
          firstName: u.first_name ?? "",
          lastName: u.last_name ?? "",
        })));
      })
      .catch(() => setAllUsers([]));
  }, []);

  // ── Drawer ───────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowDrawer(true);
  };

  const openEdit = (g: ChatGroup) => {
    setEditing(g);
    setForm({
      code: g.code,
      name: g.name,
      description: g.description || "",
      is_active: g.is_active,
      avatar_url: g.avatar_url || "",
    });
    setShowDrawer(true);
  };

  const handleAvatarUpload = (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      showError(tx("รองรับเฉพาะ JPG / PNG / GIF / WEBP"));
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      showError(tx("ไฟล์ต้องไม่เกิน 1 MB"));
      return;
    }
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = e => {
      setForm(p => ({ ...p, avatar_url: e.target?.result as string }));
      setUploadingAvatar(false);
    };
    reader.onerror = () => {
      showError(tx("อ่านไฟล์ไม่สำเร็จ"));
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
  };

  const formValid =
    form.code.trim().length > 0 &&
    form.name.trim().length > 0 &&
    /^[A-Z0-9_]+$/.test(form.code);

  const handleSave = async () => {
    if (!formValid) {
      showError(tx("กรอกข้อมูลไม่ครบ"), tx("ตรวจสอบรหัสกลุ่ม (A-Z, 0-9, _) และชื่อกลุ่ม"));
      return;
    }
    setSaving(true);
    try {
      const url = editing
        ? `${CHAT_API}/groups/${editing.id}`
        : `${CHAT_API}/groups`;
      const res = await fetch(url, {
        ...(editing ? overrideInit("PUT") : { method: "POST", headers: authHeaders() }),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      showSuccess(editing ? tx("บันทึกสำเร็จ") : tx("สร้างกลุ่มสำเร็จ"));
      setShowDrawer(false);
      await fetchGroups();
      if (editing) {
        setSelected(prev => prev ? { ...prev, ...form } as ChatGroup : null);
      }
    } catch {
      showError(editing ? tx("บันทึกไม่สำเร็จ") : tx("สร้างกลุ่มไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────

  const handleDelete = async (g: ChatGroup) => {
    const ok = await showConfirm(tx("ลบกลุ่ม \"{0}\" ?", g.name), tx("ข้อมูลจะถูกลบถาวร"));
    if (!ok) return;
    try {
      const res = await fetch(`${CHAT_API}/groups/${g.id}`, overrideInit("DELETE"));
      if (!res.ok) throw new Error();
      showSuccess(tx("ลบกลุ่มสำเร็จ"));
      if (selected?.id === g.id) setSelected(null);
      await fetchGroups();
    } catch {
      showError(tx("ลบกลุ่มไม่สำเร็จ"));
    }
  };

  // ── Agent search (computed from iamx allUsers) ───────────────────

  const agentResults = allUsers.filter(u => {
    if (!agentSearch.trim()) return true;
    return u.name.toLowerCase().includes(agentSearch.toLowerCase());
  });

  const handleAddAgent = async (user: UserResult) => {
    if (!selected) return;
    try {
      const res = await fetch(`${CHAT_API}/groups/${selected.id}/agents`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ user_id: user.id, first_name: user.firstName ?? "", last_name: user.lastName ?? "" }),
      });
      if (!res.ok) throw new Error();
      setAgentSearch("");
      await fetchAgents(selected.id);
      setGroups(prev => prev.map(g => g.id === selected.id ? { ...g, agent_count: (g.agent_count ?? 0) + 1 } : g));
      await assignChatAgentRole(user.id);
    } catch {
      showError(tx("เพิ่มเจ้าหน้าที่ไม่สำเร็จ"));
    }
  };

  const handleRemoveAgent = async (agent: Agent) => {
    if (!selected) return;
    const ok = await showConfirm(tx("ลบ \"{0}\" ออกจากกลุ่ม?", agent.user_name), tx("เจ้าหน้าที่จะถูกนำออกจากกลุ่ม"));
    if (!ok) return;
    try {
      const res = await fetch(
        `${CHAT_API}/groups/${selected.id}/agents/${agent.id}`,
        overrideInit("DELETE")
      );
      if (!res.ok) throw new Error();
      await fetchAgents(selected.id);
      setGroups(prev => prev.map(g => g.id === selected.id ? { ...g, agent_count: Math.max(0, (g.agent_count ?? 0) - 1) } : g));
      const countRes = await fetch(
        `${CHAT_API}/users/${agent.user_id}/agent-group-count`,
        { headers: authHeaders() }
      );
      if (countRes.ok) {
        const countData = await countRes.json();
        const remaining = countData?.data?.count ?? countData?.count ?? 1;
        if (remaining === 0) await revokeChatAgentRole(agent.user_id);
      }
    } catch {
      showError(tx("ลบเจ้าหน้าที่ไม่สำเร็จ"));
    }
  };

  const handleTogglePrimary = async (agent: Agent) => {
    if (!selected) return;
    const next = agent.is_primary ? 0 : 1;
    const before = agents;
    setAgents(prev => prev.map(a => ({
      ...a,
      is_primary: a.id === agent.id ? next : (next === 1 ? 0 : a.is_primary),
    })));
    try {
      const res = await fetch(
        `${CHAT_API}/groups/${selected.id}/agents/${agent.id}`,
        { ...overrideInit("PUT"), body: JSON.stringify({ is_primary: next }) }
      );
      if (!res.ok) throw new Error();
    } catch {
      setAgents(before);
      showError(tx("เปลี่ยนสถานะเจ้าหน้าที่หลักไม่สำเร็จ"));
    }
  };

  // ── Filter ────────────────────────────────────────────────────────

  const filteredGroups = groups.filter(g => {
    if (!searchGroup.trim()) return true;
    const q = searchGroup.toLowerCase();
    return [g.code, g.name, g.description].some(v => (v || "").toLowerCase().includes(q));
  });

  const primaryCount = agents.filter(a => a.is_primary === 1).length;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={tx("กลุ่มแชท")}
        actions={
          <Button variant="primary" icon="plus" onClick={openCreate}>
            
            {tx("เพิ่มกลุ่ม")}
          </Button>
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* Groups list */}
        {/* 19/10/69: จอแคบ (<1024px) แสดงทีละฝั่ง — เดิมรายการกลุ่ม 320px บีบฝั่งสมาชิก */}
        <div className={"w-full lg:w-[320px] shrink-0 lg:border-r border-[var(--iamx-border)] flex-col bg-[var(--iamx-bg)] " + (selected ? "hidden lg:flex" : "flex")}>
          <div className="p-3 border-b border-[var(--iamx-border)]">
            <Input
              value={searchGroup}
              onChange={setSearchGroup}
              placeholder={tx("ค้นหากลุ่ม...")}
              icon="search"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="search"
                title={searchGroup ? tx("ไม่พบ \"{0}\"", searchGroup) : tx("ไม่มีกลุ่ม")}
              />
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {filteredGroups.map(g => {
                const active = selected?.id === g.id;
                const count = g.agent_count ?? 0;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelected(g)}
                    className={
                      "group/grp w-full text-left flex items-start gap-3 px-4 py-3 border-b border-[var(--iamx-border)] transition-colors relative " +
                      (active
                        ? "bg-[var(--iamx-bg-active)]"
                        : "hover:bg-[var(--iamx-bg-hover)]")
                    }
                  >
                    {active && (
                      <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--iamx-accent)]" />
                    )}
                    <Avatar name={g.name} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[13px] text-[var(--iamx-fg)] break-words">
                          {g.name}
                        </span>
                      </div>
                      {g.description && (
                        <div className="text-[12px] text-[var(--iamx-fg-muted)] truncate mt-0.5">
                          {g.description}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-[var(--iamx-fg-muted)] mt-1">
                        <span className="font-mono">{g.code}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1" title={tx("เจ้าหน้าที่")}>
                          <Icon name="users" size={10} />
                          {count}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1" title={tx("สมาชิก")}>
                          <Icon name="user" size={10} />
                          {g.member_count}
                        </span>
                        {!g.is_active && (
                          <>
                            <span>·</span>
                            <span className="text-red-600">{tx("ปิดใช้")}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-4 py-2 border-t border-[var(--iamx-border)] text-[11.5px] text-[var(--iamx-fg-muted)] tabular-nums">
            {filteredGroups.length} {" "}{tx("กลุ่ม")}
          </div>
        </div>

        {/* Detail */}
        <div className={"flex-1 overflow-y-auto min-w-0 " + (selected ? "block" : "hidden lg:block")}>
          {!selected ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon="chat"
                title={tx("เลือกกลุ่มแชท")}
              />
            </div>
          ) : (
            <div className="min-h-full flex flex-col">
              <div className="px-6 py-5 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)] shrink-0">
                <button type="button" onClick={() => setSelected(null)} className="lg:hidden mb-3 text-[12.5px] text-[var(--iamx-accent)]">{tx("‹ กลับไปรายการกลุ่ม")}</button>
                <div className="flex items-start gap-4">
                  {selected.avatar_url ? (
                    <img src={selected.avatar_url} alt={selected.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                  ) : (
                    <Avatar name={selected.name} size={48} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[18px] font-semibold text-[var(--iamx-fg)]">
                        {selected.name}
                      </h2>
                      <Badge tone="neutral" size="sm">
                        <span className="font-mono">{selected.code}</span>
                      </Badge>
                      <StatusPill active={!!selected.is_active} />
                    </div>
                    {selected.description && (
                      <p className="text-[13px] text-[var(--iamx-fg-muted)] mt-1">
                        {selected.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="edit"
                      onClick={() => openEdit(selected)}
                    >
                      
                      {tx("แก้ไข")}
                    </Button>
                    <IconButton
                      icon="trash"
                      label={tx("ลบกลุ่ม")}
                      variant="danger"
                      onClick={() => handleDelete(selected)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_360px] gap-0 flex-1 min-h-0">
                {/* Tabbed: Agents / Members */}
                <section className="flex flex-col border-r border-[var(--iamx-border)] min-h-0">
                  {/* Tab bar */}
                  <div className="flex border-b border-[var(--iamx-border)] shrink-0 bg-[var(--iamx-bg)]">
                    <button
                      type="button"
                      onClick={() => setDetailTab("agents")}
                      className={
                        "px-5 py-3 text-[13px] font-medium border-b-2 transition-colors " +
                        (detailTab === "agents"
                          ? "border-[var(--iamx-accent)] text-[var(--iamx-accent)]"
                          : "border-transparent text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)]")
                      }
                    >
                      
                      {tx("เจ้าหน้าที่ในกลุ่ม")}
                      <span className="ml-1.5 text-[11px] tabular-nums opacity-70">({agents.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab("members")}
                      className={
                        "px-5 py-3 text-[13px] font-medium border-b-2 transition-colors " +
                        (detailTab === "members"
                          ? "border-[var(--iamx-accent)] text-[var(--iamx-accent)]"
                          : "border-transparent text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)]")
                      }
                    >
                      
                      {tx("สมาชิกในกลุ่ม")}
                      <span className="ml-1.5 text-[11px] tabular-nums opacity-70">({members.length})</span>
                    </button>
                  </div>

                  {/* Tab content */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {detailTab === "agents" ? (
                      <>
                        <p className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums mb-4">
                          {agents.length} {" "}{tx("คน · เจ้าหน้าที่หลัก")}{" "}{primaryCount} {" "}{tx("คน")}
                        </p>
                        {loadingAgents ? (
                          <div className="flex items-center justify-center py-10">
                            <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
                          </div>
                        ) : agents.length === 0 ? (
                          <div className="border border-[var(--iamx-border)] rounded-md p-6 text-center text-[12.5px] text-[var(--iamx-fg-muted)] bg-[var(--iamx-bg)]">
                            
                            {tx("ยังไม่มีเจ้าหน้าที่ในกลุ่ม — เพิ่มจากแผงด้านขวา")}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {agents.filter(a => a.is_primary === 1).length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold text-[var(--iamx-fg-muted)] uppercase tracking-wide mb-1.5">
                                  
                                  {tx("เจ้าหน้าที่หลัก (")}{agents.filter(a => a.is_primary === 1).length})
                                </div>
                                <div className="border border-[var(--iamx-border)] rounded-md overflow-hidden bg-[var(--iamx-bg)]">
                                  {agents.filter(a => a.is_primary === 1).map(a => (
                                    <AgentRow key={a.id} agent={a} onTogglePrimary={handleTogglePrimary} onRemove={handleRemoveAgent} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {agents.filter(a => a.is_primary !== 1).length > 0 && (
                              <div>
                                <div className="text-[11px] font-semibold text-[var(--iamx-fg-muted)] uppercase tracking-wide mb-1.5">
                                  
                                  {tx("เจ้าหน้าที่ทั่วไป (")}{agents.filter(a => a.is_primary !== 1).length})
                                </div>
                                <div className="border border-[var(--iamx-border)] rounded-md overflow-hidden bg-[var(--iamx-bg)]">
                                  {agents.filter(a => a.is_primary !== 1).map(a => (
                                    <AgentRow key={a.id} agent={a} onTogglePrimary={handleTogglePrimary} onRemove={handleRemoveAgent} />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-3">
                          <p className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums shrink-0">{members.length} {" "}{tx("คน")}</p>
                          <div className="w-48 shrink-0 ml-auto">
                            <Input value={memberSearch} onChange={setMemberSearch} placeholder={tx("ค้นหา...")} icon="search" />
                          </div>
                        </div>
                        {members.length === 0 ? (
                          <div className="border border-[var(--iamx-border)] rounded-md p-4 text-center text-[12.5px] text-[var(--iamx-fg-muted)] bg-[var(--iamx-bg)]">
                            
                            {tx("ยังไม่มีสมาชิกในกลุ่ม")}
                          </div>
                        ) : (
                          <div className="border border-[var(--iamx-border)] rounded-md overflow-hidden bg-[var(--iamx-bg)]">
                            <table className="cds--data-table cds--data-table--sm w-full text-[12.5px] border-collapse">
                              <thead>
                                <tr className="bg-[var(--iamx-surface)]">
                                  <th className="h-8 px-3 text-left font-medium text-[var(--iamx-fg-muted)]">{tx("ชื่อ")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {members
                                  .filter(m => !memberSearch.trim() || m.user_name.toLowerCase().includes(memberSearch.toLowerCase()))
                                  .map(m => (
                                    <tr key={m.id} className="border-t border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]">
                                      <td className="px-3 py-2">
                                        <div className="font-medium text-[var(--iamx-fg)] truncate">{m.user_name || `#${m.user_id}`}</div>
                                        <div className="text-[11.5px] text-[var(--iamx-fg-muted)] font-mono">ID: {m.user_id}</div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>

                {/* Add agents */}
                <aside className="bg-[var(--iamx-surface)] overflow-y-auto">
                  <div className="p-6">
                    <h3 className="text-[14px] font-semibold mb-3">{tx("เพิ่มเจ้าหน้าที่")}</h3>

                    {/* Mode tabs */}
                    <div className="flex gap-1 mb-3 p-0.5 bg-[var(--iamx-bg)] rounded-md border border-[var(--iamx-border)]">
                      {(["search", "role"] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setAddMode(m)}
                          className={
                            "flex-1 text-[12px] py-1 rounded transition-colors " +
                            (addMode === m
                              ? "bg-[var(--iamx-accent)] text-white font-medium"
                              : "text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)]")
                          }
                        >
                          {m === "search" ? tx("ค้นหาชื่อ") : tx("ตามบทบาท")}
                        </button>
                      ))}
                    </div>

                    {addMode === "search" ? (
                      <>
                        <Input
                          value={agentSearch}
                          onChange={setAgentSearch}
                          placeholder={tx("ค้นหาชื่อเพื่อเพิ่ม...")}
                          icon="search"
                        />
                        <div className="mt-3 space-y-1 max-h-[60vh] overflow-y-auto -mx-2 px-2">
                          {agentResults.filter(u => !agents.some(a => a.user_id === u.id)).length === 0 && agentResults.length > 0 && (
                            <div className="text-center py-8 text-[12.5px] text-[var(--iamx-fg-muted)]">
                              
                              {tx("ผู้ใช้ทั้งหมดอยู่ในกลุ่มแล้ว")}
                            </div>
                          )}
                          {agentResults.length === 0 && (
                            <div className="text-center py-8 text-[12.5px] text-[var(--iamx-fg-muted)]">
                              {agentSearch ? tx("ไม่พบผู้ใช้ที่ตรงกับการค้นหา") : tx("ไม่พบผู้ใช้ในระบบ")}
                            </div>
                          )}
                          {agentResults
                            .filter(u => !agents.some(a => a.user_id === u.id))
                            .map(u => (
                              <UserAddRow key={u.id} user={u} onAdd={handleAddAgent} />
                            ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <Select2
                          value={selectedRoleId}
                          onChange={setSelectedRoleId}
                          placeholder={tx("เลือกบทบาท...")}
                          options={roles.map(r => ({ value: String(r.id), label: r.name || r.code }))}
                        />
                        <div className="mt-3 space-y-1 max-h-[60vh] overflow-y-auto -mx-2 px-2">
                          {loadingRoleUsers && (
                            <div className="flex justify-center py-6">
                              <span className="text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</span>
                            </div>
                          )}
                          {!loadingRoleUsers && !selectedRoleId && (
                            <div className="text-center py-8 text-[12.5px] text-[var(--iamx-fg-muted)]">
                              
                              {tx("เลือก Role เพื่อดูรายชื่อ")}
                            </div>
                          )}
                          {!loadingRoleUsers && selectedRoleId && roleUsers.filter(u => !agents.some(a => a.user_id === u.id)).length === 0 && (
                            <div className="text-center py-8 text-[12.5px] text-[var(--iamx-fg-muted)]">
                              {roleUsers.length === 0 ? tx("ไม่มีผู้ใช้ในบทบาทนี้") : tx("ผู้ใช้ทั้งหมดอยู่ในกลุ่มแล้ว")}
                            </div>
                          )}
                          {!loadingRoleUsers && roleUsers
                            .filter(u => !agents.some(a => a.user_id === u.id))
                            .map(u => (
                              <UserAddRow key={u.id} user={u} onAdd={handleAddAgent} />
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / edit drawer */}
      <Drawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        title={editing ? tx("แก้ไข: {0}", form.name || editing.name) : tx("เพิ่มกลุ่มแชท")}
        subtitle={editing ? tx("รหัส {0}", editing.code) : ""}
        width={560}
        persistKey="iamx-drawer-chatgroup"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowDrawer(false)}>
              
              {tx("ยกเลิก")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="check"
              disabled={!formValid || saving}
              onClick={handleSave}
            >
              {saving ? tx("กำลังบันทึก...") : editing ? tx("บันทึก") : tx("สร้างกลุ่ม")}
            </Button>
          </>
        }
      >
        <DrawerSection title={tx("ข้อมูลกลุ่ม")}>
          <div className="flex items-center gap-4 mb-4">
            {form.avatar_url ? (
              <img
                src={form.avatar_url}
                alt="avatar"
                className="w-14 h-14 rounded-full object-cover shrink-0"
              />
            ) : (
              <Avatar name={form.name || "?"} size={56} />
            )}
            <div className="flex-1">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleAvatarUpload(f);
                  e.target.value = "";
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="upload"
                  disabled={uploadingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {uploadingAvatar ? tx("กำลังอัปโหลด...") : tx("อัปโหลดรูป")}
                </Button>
                {form.avatar_url && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="x"
                    onClick={() => setForm(p => ({ ...p, avatar_url: "" }))}
                  >
                    
                    {tx("ลบรูป")}
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-[var(--iamx-fg-muted)] mt-1">
                
                {tx("PNG / JPG ขนาดไม่เกิน 1 MB")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
            <FormField label={tx("รหัสกลุ่ม")} required>
              <Input
                value={form.code}
                onChange={v => setForm(p => ({ ...p, code: v.toUpperCase() }))}
                placeholder={tx("เช่น BUD")}
                autoFocus
                maxLength={50}
              />
            </FormField>
            <FormField label={tx("ชื่อกลุ่ม")} required>
              <Input
                value={form.name}
                onChange={v => setForm(p => ({ ...p, name: v }))}
                placeholder={tx("เช่น ฝ่ายบัญชี")}
                maxLength={200}
              />
            </FormField>
          </div>
          <FormField label={tx("คำอธิบาย")} className="mt-3">
            <Textarea
              value={form.description}
              onChange={v => setForm(p => ({ ...p, description: v }))}
              rows={3}
              maxLength={500}
              placeholder={tx("คำอธิบาย (ไม่บังคับ)")}
            />
          </FormField>
        </DrawerSection>

        <DrawerSection title={tx("สถานะ")}>
          <Toggle
            checked={form.is_active === 1}
            onChange={v => setForm(p => ({ ...p, is_active: v ? 1 : 0 }))}
            label={tx("เปิดใช้งาน")}
            sublabel={tx("ปิดเพื่อซ่อนกลุ่มจากการส่งข้อความ")}
          />
        </DrawerSection>
      </Drawer>
    </div>
  );
}

function AgentRow({ agent, onTogglePrimary, onRemove }: {
  agent: Agent;
  onTogglePrimary: (a: Agent) => void;
  onRemove: (a: Agent) => void;
}) {
  return (
    <div className="group/agent grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 h-12 border-b border-[var(--iamx-border)] last:border-b-0 hover:bg-[var(--iamx-bg-hover)]">
      <Avatar name={agent.user_name} size={28} />
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate text-[var(--iamx-fg)]">{agent.user_name}</div>
      </div>
      <label className="inline-flex items-center gap-1.5 cursor-pointer">
        <Toggle checked={agent.is_primary === 1} onChange={() => onTogglePrimary(agent)} size="sm" />
        <span className="text-[11.5px] text-[var(--iamx-fg-muted)]">{tx("หลัก")}</span>
      </label>
      <IconButton icon="x" label={tx("นำออก")} variant="danger" onClick={() => onRemove(agent)} />
    </div>
  );
}

function UserAddRow({ user, onAdd }: { user: UserResult; onAdd: (u: UserResult) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(user)}
      className="w-full text-left flex items-center gap-2.5 p-2 rounded-md hover:bg-[var(--iamx-bg-hover)] group/cand"
    >
      <Avatar name={user.name} size={26} />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium truncate text-[var(--iamx-fg)]">{user.name}</div>
      </div>
      <span className="text-[11.5px] text-[var(--iamx-accent)] opacity-0 group-hover/cand:opacity-100 transition-opacity inline-flex items-center gap-0.5">
        <Icon name="plus" size={12} />
        
        {tx("เพิ่ม")}
      </span>
    </button>
  );
}
