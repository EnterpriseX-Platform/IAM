"use client";

import { tx } from "@/lib/i18n";
// 20/10/69 ผู้ดูแล IAM-X Console (ตาราง IAMX.ADMIN) — เพิ่ม · ปิด/เปิดใช้งาน · รีเซ็ตรหัสผ่าน (แสดงรหัสชั่วคราวครั้งเดียว)
import { Button, Drawer, DrawerSection, FormField, Input, PageHeader } from "@/app/components/iamx";
import { showConfirm, showError } from "@/lib/swal";
import Swal from "sweetalert2";
import { useEffect, useState } from "react";
import Select2 from "@/app/components/Select2";

// 14/11/69: ระดับผู้ดูแล IAMX (API บังคับที่ด่านกลาง)
const LEVELS = [
  { value: "admin", label: "System admin" },
  { value: "access_manager", label: "Access manager" },
  { value: "auditor", label: "Auditor (read-only)" },
];
const levelLabel = (r: string) => LEVELS.find((l) => l.value === r)?.label || r || "—";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;
interface Admin { id: string; username: string; first_name: string; last_name: string; active: boolean; role: string; updated_at: string; hashed: boolean }

const showTemp = (title: string, pw: string) =>
  Swal.fire({ title, html: tx("รหัสผ่านชั่วคราว (แสดงครั้งเดียว กรุณาจดและแจ้งผู้ใช้)<br><code style=\"font-size:18px;user-select:all\">{0}</code>", pw), confirmButtonText: tx("จดแล้ว") });

export default function ConsoleAdminsPage() {
  const [rows, setRows] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [f, setF] = useState({ username: "", first_name: "", last_name: "", role: "admin" });

  const load = async () => {
    try {
      const r = await fetch(`${API_BASE}/console-admins`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.message || tx("โหลดไม่สำเร็จ"));
      setRows(d.data || []);
    } catch (e) {
      showError(tx("ผิดพลาด"), (e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const post = async (url: string, body?: unknown) => {
    const r = await fetch(`${API_BASE}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.message || tx("ทำรายการไม่สำเร็จ"));
    return d;
  };
  const add = async () => {
    try {
      const d = await post("/console-admins", f);
      setAdding(false);
      setF({ username: "", first_name: "", last_name: "", role: "admin" });
      await load();
      showTemp(tx("เพิ่ม {0} แล้ว", f.username), d.data.temp_password);
    } catch (e) { showError(tx("ผิดพลาด"), (e as Error).message); }
  };
  const reset = async (a: Admin) => {
    if (!(await showConfirm(tx("รีเซ็ตรหัสผ่าน"), tx("ตั้งรหัสผ่านชั่วคราวใหม่ให้ {0}", a.username), tx("รีเซ็ต")))) return;
    try { const d = await post(`/console-admins/${a.id}/reset-password`); await load(); showTemp(tx("รีเซ็ตรหัสผ่าน {0}", a.username), d.data.temp_password); }
    catch (e) { showError(tx("ผิดพลาด"), (e as Error).message); }
  };
  const setLevel = async (a: Admin, role: string) => {
    if (!role || role === a.role) return;
    try { await post(`/console-admins/${a.id}/role`, { role }); await load(); }
    catch (e) { showError(tx("ผิดพลาด"), (e as Error).message); }
  };
  const toggle = async (a: Admin) => {
    if (a.active && !(await showConfirm(tx("ปิดใช้งาน"), tx("{0} จะเข้า IAMX ไม่ได้", a.username), tx("ปิดใช้งาน")))) return;
    try { await post(`/console-admins/${a.id}/status`, { active: !a.active }); await load(); }
    catch (e) { showError(tx("ผิดพลาด"), (e as Error).message); }
  };

  const sel = rows.find((r) => r.id === selId) || rows[0] || null;
  return (
    <div className="h-full flex flex-col">
      <PageHeader title={tx("ผู้ดูแล IAMX")}
        actions={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>{tx("เพิ่มผู้ดูแล")}</Button>} />
      <div className="flex flex-col min-[900px]:flex-row flex-1 min-h-0">
        <div className="w-full min-[900px]:w-[340px] shrink-0 border-b min-[900px]:border-b-0 min-[900px]:border-r border-[var(--iamx-border)] flex flex-col bg-[var(--iamx-bg)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 h-8 items-center border-b border-[var(--iamx-border)] text-[11.5px] font-medium text-[var(--iamx-fg-muted)]">
            <span>{tx("ผู้ดูแล IAMX")}</span><span>Level</span>
          </div>
          {loading ? <div className="py-8 text-center text-[12px] text-[var(--iamx-fg-muted)]">{tx("กำลังโหลด…")}</div> : (
            <div className="overflow-y-auto flex-1">
              {rows.map((a) => {
                const active = sel?.id === a.id;
                return (
                  <button key={a.id} type="button" onClick={() => setSelId(a.id)}
                    className={"w-full text-left grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 px-4 py-2 text-[13px] " + (active ? "bg-[var(--iamx-bg-active)] shadow-[inset_3px_0_0_#0f62fe] font-medium" : "hover:bg-[var(--iamx-bg-hover)]")}>
                    <span className="min-w-0">
                      <span className={"block truncate " + (a.active ? "text-[var(--iamx-fg)]" : "text-[var(--iamx-fg-muted)]")}>{[a.first_name, a.last_name].filter(Boolean).join(" ") || a.username}</span>
                      <span className="block font-mono text-[11.5px] font-normal text-[var(--iamx-fg-muted)] truncate">{a.username}</span>
                    </span>
                    <span className="text-right text-[12px] font-normal text-[var(--iamx-fg-muted)] whitespace-nowrap">
                      {!a.active ? <span className="text-[11px] px-2 rounded-full bg-amber-100 text-amber-700">{tx("ปิดใช้งาน")}</span> : levelLabel(a.role).replace(" (read-only)", "")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="px-4 py-2 border-t border-[var(--iamx-border)] text-[11.5px] text-[var(--iamx-fg-muted)] tabular-nums">{rows.length} admins</div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-[50vh] min-[900px]:min-h-0">
          {!sel ? null : (
            <>
              <div className="px-6 py-4 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)]">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[18px] font-semibold text-[var(--iamx-fg)]">{[sel.first_name, sel.last_name].filter(Boolean).join(" ") || sel.username}</h2>
                      <span className="font-mono text-[11.5px] px-1.5 bg-[var(--iamx-surface)] text-[var(--iamx-fg-muted)]">{sel.username}</span>
                      {!sel.active && <span className="text-[11px] px-2 rounded-full bg-amber-100 text-amber-700">{tx("ปิดใช้งาน")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => reset(sel)}>{tx("รีเซ็ตรหัสผ่าน")}</Button>
                    <Button variant="secondary" size="sm" onClick={() => toggle(sel)}>{sel.active ? "Deactivate" : "Activate"}</Button>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto bg-layer">
                <div className="grid grid-cols-[160px_minmax(0,1fr)] text-[13px] max-w-[640px]">
                  <div className="px-6 py-3 border-b border-[var(--iamx-border)] text-[var(--iamx-fg-muted)]">Level</div>
                  <div className="px-3 py-2 border-b border-[var(--iamx-border)]"><div className="w-[220px]"><Select2 value={sel.role} onChange={(v) => setLevel(sel, v)} options={LEVELS} clearable={false} placeholder={levelLabel(sel.role)} /></div></div>
                  <div className="px-6 py-3 border-b border-[var(--iamx-border)] text-[var(--iamx-fg-muted)]">Can do</div>
                  <div className="px-3 py-3 border-b border-[var(--iamx-border)] text-[var(--iamx-fg)]">
                    {sel.role === "auditor" ? "View everything, change nothing" : sel.role === "access_manager" ? "Manage users, roles, responsibilities and permissions · menu structure and IAMX admins view-only" : "Everything, including menu structure and IAMX admins"}
                  </div>
                  <div className="px-6 py-3 border-b border-[var(--iamx-border)] text-[var(--iamx-fg-muted)]">{tx("สถานะ")}</div>
                  <div className="px-3 py-3 border-b border-[var(--iamx-border)]">{sel.active ? tx("ใช้งาน") : tx("ปิดใช้งาน")}</div>
                  <div className="px-6 py-3 border-b border-[var(--iamx-border)] text-[var(--iamx-fg-muted)]">{tx("รหัสผ่าน")}</div>
                  <div className="px-3 py-3 border-b border-[var(--iamx-border)]">{sel.hashed ? tx("เข้ารหัสแล้ว") : <span className="text-[11px] px-2 rounded-full bg-amber-100 text-amber-700">{tx("ยังเป็นรหัสเดิม")}</span>}</div>
                  <div className="px-6 py-3 border-b border-[var(--iamx-border)] text-[var(--iamx-fg-muted)]">Last updated</div>
                  <div className="px-3 py-3 border-b border-[var(--iamx-border)] tabular-nums text-[var(--iamx-fg-muted)]">{sel.updated_at ? sel.updated_at.replace("T", " ").slice(0, 16) : "—"}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <Drawer open={adding} onClose={() => setAdding(false)} title={tx("เพิ่มผู้ดูแล IAMX")} width={440} persistKey="iamx-console-admin"
        footer={<div className="flex gap-2 ml-auto"><Button variant="secondary" size="sm" onClick={() => setAdding(false)}>{tx("ยกเลิก")}</Button><Button variant="primary" size="sm" disabled={f.username.trim().length < 3} onClick={add}>{tx("บันทึก")}</Button></div>}>
        <DrawerSection>
          <div className="space-y-4">
            <FormField label={tx("ชื่อผู้ใช้")} required><Input value={f.username} onChange={(v) => setF((x) => ({ ...x, username: v.trim() }))} placeholder={tx("เช่น somchai.k")} /></FormField>
            <FormField label="Level" required><Select2 value={f.role} onChange={(v) => setF((x) => ({ ...x, role: v || "admin" }))} options={LEVELS} clearable={false} /></FormField>
            <FormField label={tx("ชื่อ")}><Input value={f.first_name} onChange={(v) => setF((x) => ({ ...x, first_name: v }))} /></FormField>
            <FormField label={tx("นามสกุล")}><Input value={f.last_name} onChange={(v) => setF((x) => ({ ...x, last_name: v }))} /></FormField>
          </div>
        </DrawerSection>
      </Drawer>
    </div>
  );
}
