"use client";

// รหัสเปลี่ยนไม่ได้ เพราะเก็บใน token และระบบอื่นอ่านค่านี้
import { Button, Input, Toggle } from "@/app/components/iamx";
import { loadUserTypes, type UserType } from "@/lib/menuType";
import { showConfirm, showError } from "@/lib/swal";
import { useEffect, useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(`${API_BASE}/admin/user-types${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) throw new Error(d.message || "Couldn't save");
  return d;
}

export default function UserTypesSettings() {
  const [types, setTypes] = useState<UserType[]>([]);
  const [edit, setEdit] = useState<Record<string, { name?: string; aliases?: string }>>({});
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [staff, setStaff] = useState(false);
  const reload = async () => { const d = await call("GET", ""); setTypes(d.data); loadUserTypes(true); };
  useEffect(() => { reload().catch(() => {}); }, []);
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { showError("Error", (e as Error).message); } };

  const save = (t: UserType, patch: Partial<{ name: string; is_staff: boolean; aliases: string; is_active: boolean }>) =>
    run(() => call("POST", `/${t.code}`, { name: t.name, is_staff: t.is_staff, aliases: (t.aliases || []).join(","), is_active: t.is_active, ...patch }));
  const commit = (t: UserType, field: "name" | "aliases") => {
    const v = edit[t.code]?.[field];
    setEdit((e) => { const n = { ...e }; delete n[t.code]; return n; });
    const cur = field === "name" ? t.name : (t.aliases || []).join(",");
    if (v === undefined || v.trim() === cur || (field === "name" && !v.trim())) return;
    save(t, { [field]: v.trim() });
  };
  const move = (i: number, d: number) => run(async () => {
    const codes = types.map((t) => t.code);
    const j = i + d;
    if (j < 0 || j >= codes.length) return;
    [codes[i], codes[j]] = [codes[j], codes[i]];
    await call("POST", "/reorder", { codes });
  });
  const remove = async (t: UserType) => {
    if (!(await showConfirm("Delete user type", `Delete "${t.name}"?`, "Delete"))) return;
    run(() => call("DELETE", `/${t.code}`));
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); };

  return (
    <section className="bg-layer mb-6">
      <div className="px-6 pt-4 pb-2 flex items-baseline gap-3">
        <h3 className="text-[15px] font-semibold text-[var(--iamx-fg)]">User types</h3>
        <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">{types.length} types</span>
      </div>
      <table className="cds--data-table cds--data-table--sm w-full text-[13px] border-collapse">
        <thead>
          <tr className="border-y border-[var(--iamx-border)] text-[11.5px] text-[var(--iamx-fg-muted)]">
            <th className="text-left h-9 pl-6 pr-3 font-medium w-[70px]">Order</th>
            <th className="text-left h-9 px-3 font-medium">Name</th>
            <th className="text-left h-9 px-3 font-medium w-[120px]">Code</th>
            <th className="text-left h-9 px-3 font-medium w-[180px]">Also matches</th>
            <th className="text-left h-9 px-3 font-medium w-[90px]">Staff</th>
            <th className="text-right h-9 px-3 font-medium w-[80px]">In use</th>
            <th className="text-left h-9 px-3 font-medium w-[80px]">Active</th>
            <th className="w-[90px]" />
          </tr>
        </thead>
        <tbody>
          {types.map((t, i) => (
            <tr key={t.code} className="border-b border-[var(--iamx-border)]">
              <td className="pl-6 pr-3">
                <span className="inline-flex gap-1">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="h-7 w-7 hover:bg-[var(--iamx-bg-hover)] disabled:opacity-30">↑</button>
                  <button type="button" aria-label="Move down" disabled={i === types.length - 1} onClick={() => move(i, 1)} className="h-7 w-7 hover:bg-[var(--iamx-bg-hover)] disabled:opacity-30">↓</button>
                </span>
              </td>
              <td className="px-3 py-1.5"><Input value={edit[t.code]?.name ?? t.name} onChange={(v) => setEdit((e) => ({ ...e, [t.code]: { ...e[t.code], name: v } }))} onBlur={() => commit(t, "name")} onKeyDown={enter} /></td>
              <td className="px-3 font-mono text-[12px] text-[var(--iamx-fg-muted)]">{t.code}</td>
              <td className="px-3 py-1.5"><Input value={edit[t.code]?.aliases ?? (t.aliases || []).join(",")} onChange={(v) => setEdit((e) => ({ ...e, [t.code]: { ...e[t.code], aliases: v.toLowerCase() } }))} onBlur={() => commit(t, "aliases")} onKeyDown={enter} placeholder="—" /></td>
              <td className="px-3"><Toggle size="sm" checked={t.is_staff} onChange={() => save(t, { is_staff: !t.is_staff })} /></td>
              <td className="px-3 text-right tabular-nums text-[var(--iamx-fg-muted)]">{t.used}</td>
              <td className="px-3"><Toggle size="sm" checked={t.is_active} onChange={() => save(t, { is_active: !t.is_active })} /></td>
              <td className="px-3 text-right">{t.used === 0 && <Button variant="ghost" size="sm" onClick={() => remove(t)}>Delete</Button>}</td>
            </tr>
          ))}
          <tr>
            <td className="pl-6 pr-3 py-2 text-[12px] text-[var(--iamx-fg-muted)]">New</td>
            <td className="px-3 py-2"><Input value={name} onChange={setName} placeholder="Type name" /></td>
            <td className="px-3 py-2"><Input value={code} onChange={(v) => setCode(v.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} placeholder="code" /></td>
            <td />
            <td className="px-3"><Toggle size="sm" checked={staff} onChange={() => setStaff(!staff)} /></td>
            <td />
            <td />
            <td className="px-3 py-2 text-right">
              <Button variant="primary" size="sm" icon="plus" disabled={!code || !name.trim()} onClick={() => run(async () => { await call("POST", "", { code, name, is_staff: staff }); setCode(""); setName(""); setStaff(false); })}>Add</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
