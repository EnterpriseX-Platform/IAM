"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import { tx } from "@/lib/i18n";
// 13/11/69: ตั้งสิทธิ์รายงานจากฝั่งบทบาท — เลือกบทบาทเดียว แล้วติ๊กหลายรายงานพร้อมกัน
// (เดิมต้องเปิดทีละรายงานจาก 455 รายงาน) ใช้ API เดิม: GET roles/:id/report-mappings · POST roles/:id/reports/:code/set-permissions
import { useEffect, useMemo, useState } from "react";
import Select2 from "@/app/components/Select2";
import { permLabel, sortPerms } from "../../components/iamx/perms";
import { showError, showSuccess } from "@/lib/swal";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

interface Report { code: string; name: string }
interface Role { id: string; code: string; name: string; is_active: number }

// 13/11/69: ใช้เป็นแท็บ "รายงาน" ในหน้าบทบาท — ส่ง roleId มา = บทบาทคงที่ ไม่มีตัวเลือกบทบาท
export default function ReportByRole({ roleId: fixedRoleId }: { roleId?: string } = {}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [permTypes, setPermTypes] = useState<string[]>(["VIEW", "EXPORT", "PRINT"]);
  const [roleIdSel, setRoleId] = useState("");
  const roleId = fixedRoleId ?? roleIdSel;
  const [granted, setGranted] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [onlyGranted, setOnlyGranted] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [r1, r2, r3] = await Promise.all([
          fetch(`${API_BASE}/admin/roles`).then((r) => r.json()),
          fetch(`${API_BASE}/admin/reports`).then((r) => r.json()),
          fetch(`${API_BASE}/admin/permission-types?group=REPORT`).then((r) => r.json()),
        ]);
        setRoles((r1.data || []).filter((r: Role) => r.is_active !== 0));
        if (!r2.success) showError(tx("ไม่สามารถดึงรายงานจาก Report Studio ได้"), r2.message || "");
        setReports(r2.data || []);
        const pt = (r3.data || []).map((p: any) => p.permission_type || p.code).filter(Boolean);
        if (pt.length) setPermTypes(pt);
      } catch {
        showError(tx("โหลดข้อมูลไม่สำเร็จ"), "");
      }
    })();
  }, []);

  useEffect(() => {
    if (!roleId) { setGranted({}); return; }
    setLoading(true);
    setPicked(new Set());
    fetch(`${API_BASE}/admin/roles/${roleId}/report-mappings`)
      .then((r) => r.json())
      .then((j) => {
        const m: Record<string, string[]> = {};
        (j.data || []).forEach((x: any) => { if (x.permissions?.length) m[x.report_code] = x.permissions; });
        setGranted(m);
      })
      .catch(() => showError(tx("โหลดสิทธิ์ของบทบาทไม่สำเร็จ"), ""))
      .finally(() => setLoading(false));
  }, [roleId]);

  const perms = sortPerms(permTypes);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) =>
      (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) &&
      (!onlyGranted || granted[r.code]?.length)
    );
  }, [reports, search, onlyGranted, granted]);

  const save = async (codes: string[], next: (code: string) => string[]) => {
    setBusy((b) => new Set([...b, ...codes]));
    let fail = 0;
    for (const code of codes) {
      const p = next(code);
      try {
        const res = await fetch(`${API_BASE}/admin/roles/${roleId}/reports/${encodeURIComponent(code)}/set-permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions: p }),
        });
        const j = await res.json();
        if (!res.ok || !j.success) throw new Error();
        setGranted((g) => { const n = { ...g }; if (p.length) n[code] = p; else delete n[code]; return n; });
      } catch { fail++; }
    }
    setBusy((b) => { const n = new Set(b); codes.forEach((c) => n.delete(c)); return n; });
    if (fail) showError(tx("บันทึกไม่สำเร็จ {0} รายงาน", fail), "");
    else if (codes.length > 1) showSuccess(tx("บันทึกแล้ว {0} รายงาน", codes.length));
  };

  const toggle = (code: string, perm: string) => {
    const cur = granted[code] || [];
    const next = cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm];
    save([code], () => next);
  };

  const bulk = (perm: string | "ALL", on: boolean) => {
    const codes = [...picked];
    if (!codes.length) return;
    save(codes, (code) => {
      const cur = granted[code] || [];
      if (perm === "ALL") return on ? [...perms] : [];
      return on ? Array.from(new Set([...cur, perm])) : cur.filter((p) => p !== perm);
    });
  };

  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.code));
  const role = roles.find((r) => r.id === roleId);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className={fixedRoleId ? "px-6 pt-4 pb-3" : "px-8 pt-6 pb-4 border-b border-[var(--iamx-border)]"}>
        {!fixedRoleId && <h1 className="text-[22px] font-semibold text-[var(--iamx-fg)]">{tx("สิทธิ์รายงานตามบทบาท")}</h1>}
        <div className={(fixedRoleId ? "" : "mt-4 ") + "flex flex-wrap items-center gap-2"}>
          {!fixedRoleId && <Select2
            value={roleId}
            onChange={setRoleId}
            placeholder={tx("เลือกบทบาท")}
            className="w-[320px]"
            options={roles.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))}
          />}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tx("ค้นหาชื่อรายงานหรือรหัส")}
            className="h-8 w-[280px] px-3 text-[13px] bg-[var(--iamx-surface)] border-b border-[var(--iamx-border-strong)] focus:outline-none focus:border-[var(--iamx-accent)]"
          />
          <button
            type="button"
            disabled={!roleId}
            onClick={() => setOnlyGranted((v) => !v)}
            className={"h-8 px-3 text-[12.5px] border " + (onlyGranted ? "border-[var(--iamx-accent)] text-[var(--iamx-accent)] bg-blue-100" : "border-[var(--iamx-border)] text-[var(--iamx-fg)]") + " disabled:opacity-40"}
          >
            
            {tx("เฉพาะที่ให้สิทธิ์แล้ว (")}{Object.keys(granted).length})
          </button>
          <span className="ml-auto text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">{rows.length} {" "}{tx("รายงาน")}</span>
        </div>
      </div>

      {roleId && picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-6 h-11 bg-blue-100 text-[13px] text-[var(--iamx-fg)]">
          <span>{tx("เลือกแล้ว")}{" "}{picked.size} {" "}{tx("รายงาน")}</span>
          <span className="mx-2 text-[var(--iamx-fg-muted)]">{tx("ให้สิทธิ์")}</span>
          {perms.map((p) => (
            <button key={p} type="button" onClick={() => bulk(p, true)} className="h-7 px-2.5 bg-layer border border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]">{permLabel(p)}</button>
          ))}
          <button type="button" onClick={() => bulk("ALL", true)} className="h-7 px-2.5 bg-[#0f62fe] text-white hover:bg-[#0353e9]">{tx("ทุกสิทธิ์")}</button>
          <button type="button" onClick={() => bulk("ALL", false)} className="h-7 px-2.5 text-red-600 hover:bg-red-50">{tx("ถอนทั้งหมด")}</button>
          <button type="button" onClick={() => setPicked(new Set())} className="ml-auto h-7 px-2.5 text-[var(--iamx-accent)]">{tx("ยกเลิกการเลือก")}</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {!roleId ? (
          <div className="p-16 text-center text-[13px] text-[var(--iamx-fg-muted)]">{tx("เลือกบทบาท")}</div>
        ) : (
          <table className="cds--data-table cds--data-table--sm w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-[var(--iamx-bg-active)]">
              <tr>
                <th className="w-10 pl-6 pr-2 h-10 text-left">
                  <Checkbox  checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.code)))} />
                </th>
                <th className="text-left px-3 font-semibold">{tx("รายงาน")}</th>
                <th className="text-left px-3 font-semibold w-40">{tx("รหัส")}</th>
                {perms.map((p) => <th key={p} className="w-16 text-center font-semibold">{permLabel(p)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const g = granted[r.code] || [];
                const isBusy = busy.has(r.code);
                return (
                  <tr key={r.code} className={"border-b border-[var(--iamx-border)] h-10 " + (picked.has(r.code) ? "bg-[var(--iamx-bg-active)]" : "hover:bg-[var(--iamx-bg-hover)]")}>
                    <td className="pl-6 pr-2">
                      <Checkbox  checked={picked.has(r.code)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.code)) n.delete(r.code); else n.add(r.code); return n; })} />
                    </td>
                    <td className="px-3 text-[var(--iamx-fg)]">{r.name}</td>
                    <td className="px-3 font-mono text-[11.5px] text-[var(--iamx-fg-muted)]">{r.code}</td>
                    {perms.map((p) => (
                      <td key={p} className="text-center">
                        <Checkbox  disabled={isBusy || loading} checked={g.includes(p)} onChange={() => toggle(r.code, p)} aria-label={`${permLabel(p)} ${r.name}`} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {role && <div className="px-6 h-9 flex items-center border-t border-[var(--iamx-border)] text-[12px] text-[var(--iamx-fg-muted)]">{role.code} {" "}{tx("· ให้สิทธิ์แล้ว")}{" "}{Object.keys(granted).length} {" "}{tx("รายงาน")}</div>}
    </div>
  );
}
