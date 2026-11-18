"use client";

// กลุ่มของบทบาท / ความรับผิดชอบ — เพิ่ม · เปลี่ยนชื่อ · เรียงลำดับ · ปิด · ลบ (เมื่อไม่มีรายการใช้)
import { Button, Input, Toggle } from "@/app/components/iamx";
import { loadItemGroups, useItemGroups, type ItemGroup } from "@/app/components/iamx/roleGroups";
import { showConfirm, showError } from "@/lib/swal";
import { useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(`${API_BASE}/admin/item-groups${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) throw new Error(d.message || "Couldn't save");
}

function GroupList({ kind, title }: { kind: "ROLE" | "RESP"; title: string }) {
  const groups = useItemGroups(kind);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<Record<number, string>>({});
  const reload = () => loadItemGroups(kind, true);
  const run = async (fn: () => Promise<void>) => { try { await fn(); await reload(); } catch (e) { showError("Error", (e as Error).message); } };

  const move = (i: number, d: number) => run(async () => {
    const ids = groups.map((g) => g.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await call("POST", "/reorder", { ids });
  });
  const saveName = (g: ItemGroup) => {
    const v = (edit[g.id] ?? g.name).trim();
    setEdit((e) => { const n = { ...e }; delete n[g.id]; return n; });
    if (!v || v === g.name) return;
    run(() => call("POST", `/${g.id}`, { name: v, is_active: g.is_active }));
  };
  const remove = async (g: ItemGroup) => {
    if (!(await showConfirm("Delete group", `Delete "${g.name}"?`, "Delete"))) return;
    run(() => call("DELETE", `/${g.id}`));
  };
  const add = () => run(async () => {
    await call("POST", "", { kind, code, name });
    setCode("");
    setName("");
  });

  return (
    <section className="bg-layer">
      <div className="px-6 pt-4 pb-2 flex items-baseline gap-3">
        <h3 className="text-[15px] font-semibold text-[var(--iamx-fg)]">{title}</h3>
        <span className="text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">{groups.length} groups</span>
      </div>
      <table className="cds--data-table cds--data-table--sm w-full text-[13px] border-collapse">
        <thead>
          <tr className="border-y border-[var(--iamx-border)] text-[11.5px] text-[var(--iamx-fg-muted)]">
            <th className="text-left h-9 pl-6 pr-3 font-medium w-[70px]">Order</th>
            <th className="text-left h-9 px-3 font-medium">Name</th>
            <th className="text-left h-9 px-3 font-medium w-[140px]">Code</th>
            <th className="text-right h-9 px-3 font-medium w-[80px]">Items</th>
            <th className="text-left h-9 px-3 font-medium w-[90px]">Active</th>
            <th className="w-[90px]" />
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.id} className="border-b border-[var(--iamx-border)]">
              <td className="pl-6 pr-3">
                <span className="inline-flex gap-1">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="h-7 w-7 hover:bg-[var(--iamx-bg-hover)] disabled:opacity-30">↑</button>
                  <button type="button" aria-label="Move down" disabled={i === groups.length - 1} onClick={() => move(i, 1)} className="h-7 w-7 hover:bg-[var(--iamx-bg-hover)] disabled:opacity-30">↓</button>
                </span>
              </td>
              <td className="px-3 py-1.5">
                <Input value={edit[g.id] ?? g.name} onChange={(v) => setEdit((e) => ({ ...e, [g.id]: v }))} onBlur={() => saveName(g)} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              </td>
              <td className="px-3 font-mono text-[12px] text-[var(--iamx-fg-muted)]">{g.code}</td>
              <td className="px-3 text-right tabular-nums text-[var(--iamx-fg-muted)]">{g.used}</td>
              <td className="px-3"><Toggle size="sm" checked={g.is_active === 1} onChange={() => run(() => call("POST", `/${g.id}`, { name: g.name, is_active: g.is_active === 1 ? 0 : 1 }))} /></td>
              <td className="px-3 text-right">
                {g.used === 0 && <Button variant="ghost" size="sm" onClick={() => remove(g)}>Delete</Button>}
              </td>
            </tr>
          ))}
          <tr>
            <td className="pl-6 pr-3 py-2 text-[12px] text-[var(--iamx-fg-muted)]">New</td>
            <td className="px-3 py-2"><Input value={name} onChange={setName} placeholder="Group name" /></td>
            <td className="px-3 py-2"><Input value={code} onChange={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="CODE" /></td>
            <td />
            <td />
            <td className="px-3 py-2 text-right"><Button variant="primary" size="sm" icon="plus" disabled={!code || !name.trim()} onClick={add}>Add</Button></td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export default function ItemGroupsSettings() {
  return (
    <div className="grid gap-4 pb-6">
      <GroupList kind="ROLE" title="Role groups" />
      <GroupList kind="RESP" title="Responsibility groups" />
    </div>
  );
}
