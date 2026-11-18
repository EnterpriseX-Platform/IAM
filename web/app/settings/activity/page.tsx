"use client";

// 3 แท็บ อ่านอย่างเดียว: Changes (ใครแก้อะไร) · Sign-ins (เข้า/ออก/ล้มเหลว) · Menu usage (ใครเข้าเมนูไหน)
// ข้อความบนจอเป็นภาษาอังกฤษตรง ๆ (หน้านี้ทำหลังเปลี่ยนระบบเป็นภาษาอังกฤษ)
import { Button, Input, PageHeader, Tabs } from "@/app/components/iamx";
import Select2 from "@/app/components/Select2";
import { Fragment, useEffect, useMemo, useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

type Tab = "changes" | "signins" | "usage";
type Page<T> = { items: T[]; total: number; page: number; pageSize: number; keycloak?: { enabled: boolean; error?: string } };
type Change = { at: string; actor: string; action: string; path: string; summary: string; ip: string; src: "api" | "db" };
type Signin = { at: string; user: string; result: "success" | "failed" | "logout"; detail: string; app: string; method: string; ip: string };
type Visit = { at: string; user: string; menu: string; module: string; domain: string; url: string; ip: string };
type MenuCount = { menu: string; module: string; domain: string; visits: number; users: number; last: string };

const PERIODS = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromForPeriod = (days: string) => {
  const d = new Date();
  d.setDate(d.getDate() - (Number(days) - 1));
  return ymd(d);
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtAt = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// ---- แปลง path ของ API เป็นประโยคที่คนอ่านเข้าใจ ----------------------------------
const RESOURCE: Record<string, string> = {
  users: "user", roles: "role", responsibilities: "responsibility", responsibility: "responsibility", "resp-ux": "responsibility",
  applications: "application", modules: "module", objects: "menu", domains: "domain", "object-types": "menu type",
  "console-admins": "IAMX admin", "user-roles": "user role", "role-mapping": "role assignment", permissions: "permissions",
  "data-access": "data access", "custom-objects": "per-user exception", "chat-groups": "chat group", "report-mapping": "report permission",
  "process-mappers": "process link", import: "import",
};
const TABLE: Record<string, [string, string]> = {
  ROLE_OBJECT_MAPPING: ["menu", "menus"], USER_ROLE_MAPPING: ["role", "roles"],
  USER_RESPONSIBILITY_MAPPING: ["responsibility", "responsibilities"], RESPONSIBILITY_ROLE_MAPPING: ["role", "roles"],
  RESPONSIBILITY: ["responsibility", "responsibilities"], ROLE: ["role", "roles"],
  USER_CUSTOM_OBJECT_MAPPING: ["per-user exception", "per-user exceptions"], USER_CUSTOM_DATA_ACCESS: ["data access", "data access"],
  RESPONSIBILITY_DATA_ACCESS: ["data access", "data access"],
};
const isId = (s: string) => /^\d+$/.test(s) || /^[0-9a-f-]{16,}$/i.test(s) || /^[a-z0-9]{20,}$/i.test(s);

function describe(c: Change): { what: string; on: string } {
  if (c.src === "db") {
    // summary = "จำนวน|รหัสบทบาท|ชื่อผู้ใช้|ชื่อความรับผิดชอบ"
    const [n, role, user, resp] = (c.summary || "").split("|");
    const count = Number(n) || 1;
    const verb = c.action === "INSERT" ? "Added" : c.action === "DELETE" ? "Removed" : "Updated";
    const noun = TABLE[c.path] ? TABLE[c.path][count === 1 ? 0 : 1] : c.path.toLowerCase().replace(/_/g, " ");
    const on = [user && `User ${user}`, role && `Role ${role}`, resp && `Responsibility ${resp}`].filter(Boolean).join(" · ");
    return { what: `${verb} ${count === 1 ? "" : count + " "}${noun}`.replace(/\s+/g, " "), on };
  }
  const segs = c.path.replace(/^\/iamx\/api\//, "").split("/").filter(Boolean);
  if (segs[0] === "admin" || segs[0] === "directory") segs.shift();
  const words = segs.filter((s) => !isId(s));
  const ids = segs.filter(isId);
  const last = words[words.length - 1] || "";
  const first = words[0] || "";
  const res = RESOURCE[last] || RESOURCE[first] || last.replace(/-/g, " ");
  let verb = c.action === "POST" ? "Created" : c.action === "DELETE" ? "Deleted" : "Updated";
  if (last === "status") verb = "Changed status of";
  if (last === "reset-password") verb = "Reset password of";
  if (c.action === "POST" && words.length > 1) verb = "Added";
  if (c.action === "DELETE" && words.length > 1) verb = "Removed";
  let on = ids.length ? `${RESOURCE[first] || first} #${ids[0]}` : "";
  try {
    const b = c.summary ? JSON.parse(c.summary) : null;
    const name = b && (b.code || b.name || b.user_name || b.username || b.role_code);
    if (name) on = `${on ? on + " · " : ""}${name}`;
    if (last === "status" && b && "status" in b) on = `${on} → ${b.status}`;
  } catch {
    /* summary may be truncated */
  }
  return { what: `${verb} ${res}`.trim(), on };
}

function csv(rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export default function ActivityPage() {
  const [tab, setTab] = useState<Tab>("changes");
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [period, setPeriod] = useState("30");
  const [group, setGroup] = useState<"visit" | "menu">("visit");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<any> | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { setPage(1); setOpenRow(null); }, [tab, qDeb, period, group]);

  const endpoint = tab === "changes" ? "changes" : tab === "signins" ? "signins" : "menu-usage";
  const qs = (p: number) => {
    const u = new URLSearchParams({ page: String(p), from: fromForPeriod(period), to: ymd(new Date()) });
    if (qDeb) u.set("q", qDeb);
    if (tab === "usage" && group === "menu") u.set("group", "menu");
    return u.toString();
  };

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setErr("");
    fetch(`${API_BASE}/admin/activity/${endpoint}?${qs(page)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j.success) throw new Error(j.message || "");
        setData(j.data);
      })
      .catch(() => !cancel && setErr("Couldn't load activity"))
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, qDeb, period, group, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: any[] = [];
      for (let p = 1; p <= 20; p++) {
        const j = await fetch(`${API_BASE}/admin/activity/${endpoint}?${qs(p)}`).then((r) => r.json());
        if (!j.success) break;
        all.push(...j.data.items);
        if (all.length >= j.data.total) break;
      }
      let rows: (string | number)[][] = [];
      if (tab === "changes") rows = [["When", "Changed by", "Change", "On", "IP", "Request"], ...all.map((c: Change) => { const d = describe(c); return [c.at, c.actor || "", d.what, d.on, c.ip || "", c.src === "api" ? `${c.action} ${c.path}` : ""]; })];
      else if (tab === "signins") rows = [["When", "User", "Result", "Detail", "App", "Method", "IP"], ...all.map((s: Signin) => [s.at, s.user, s.result, s.detail, s.app, s.method, s.ip])];
      else if (group === "menu") rows = [["Menu", "Module", "Domain", "Visits", "Users", "Last visit"], ...all.map((m: MenuCount) => [m.menu, m.module, m.domain, m.visits, m.users, m.last])];
      else rows = [["When", "User", "Menu", "Module", "Domain", "URL", "IP"], ...all.map((v: Visit) => [v.at, v.user, v.menu, v.module, v.domain, v.url, v.ip])];
      const blob = new Blob(["﻿" + csv(rows)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `iamx-${endpoint}${tab === "usage" && group === "menu" ? "-by-menu" : ""}-${ymd(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  };

  const searchHint = tab === "changes" ? "Search admin, item or request" : tab === "signins" ? "Search user or IP" : "Search user, menu name or code";
  const th = "text-left h-9 px-3 font-medium text-[11.5px] text-[var(--iamx-fg-muted)] whitespace-nowrap";
  const td = "px-3 py-2 align-top";
  const timeTd = "px-3 py-2 align-top whitespace-nowrap tabular-nums text-[var(--iamx-fg-muted)] w-[1%]";
  const items = data?.items || [];

  const body = useMemo(() => {
    if (tab === "changes") {
      return (
        <table className="cds--data-table cds--data-table--sm w-full min-w-[720px] table-fixed text-[13px] border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--iamx-bg)]"><tr className="border-b border-[var(--iamx-border)]"><th className={th + " w-[120px]"}>When</th><th className={th + " w-[150px]"}>Changed by</th><th className={th + " w-[34%]"}>Change</th><th className={th}>On</th></tr></thead>
          <tbody>
            {(items as Change[]).map((c, i) => {
              const d = describe(c);
              const open = openRow === i;
              return (
                <Fragment key={i}>
                  <tr onClick={() => setOpenRow(open ? null : i)} className={"border-b border-[var(--iamx-border)] cursor-pointer " + (open ? "bg-[var(--iamx-bg-hover)]" : "hover:bg-[var(--iamx-bg-hover)]")}>
                    <td className={timeTd}>{fmtAt(c.at)}</td>
                    <td className={td + " whitespace-nowrap"}>{c.actor || <span className="text-[var(--iamx-fg-muted)]">Not recorded</span>}</td>
                    <td className={td}>{d.what}</td>
                    <td className={td + " break-words"}>{d.on}</td>
                  </tr>
                  {open && (
                    <tr className="border-b border-[var(--iamx-border)] bg-[var(--iamx-surface)]">
                      <td />
                      <td colSpan={3} className="px-3 py-3 text-[12px]">
                        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                          {c.src === "api" ? (
                            <>
                              <span className="text-[var(--iamx-fg-muted)]">Request</span><span className="font-mono break-all">{c.action} {c.path}</span>
                              <span className="text-[var(--iamx-fg-muted)]">From</span><span className="font-mono">{c.ip || "—"}</span>
                              <span className="text-[var(--iamx-fg-muted)]">Data sent</span><span className="font-mono break-all whitespace-pre-wrap">{c.summary || "—"}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-[var(--iamx-fg-muted)]">Source</span><span>Database change log, before admin names were recorded</span>
                              <span className="text-[var(--iamx-fg-muted)]">Table</span><span className="font-mono">{c.path} · {c.action} · {(c.summary || "").split("|")[0]} rows</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      );
    }
    if (tab === "signins") {
      return (
        <table className="cds--data-table cds--data-table--sm w-full min-w-[760px] text-[13px] border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--iamx-bg)]"><tr className="border-b border-[var(--iamx-border)]"><th className={th}>When</th><th className={th}>User</th><th className={th}>Result</th><th className={th}>App</th><th className={th}>Method</th><th className={th}>IP</th></tr></thead>
          <tbody>
            {(items as Signin[]).map((s, i) => (
              <tr key={i} className="border-b border-[var(--iamx-border)]">
                <td className={timeTd}>{fmtAt(s.at)}</td>
                <td className={td}>{s.user || <span className="text-[var(--iamx-fg-muted)]">Unknown</span>}</td>
                <td className={td}>
                  {s.result === "failed" ? (
                    <span className="text-[11px] px-2 rounded-full bg-red-100 text-red-700 whitespace-nowrap">Failed{s.detail ? ` · ${s.detail.replace(/_/g, " ")}` : ""}</span>
                  ) : s.result === "logout" ? "Signed out" : "Signed in"}
                </td>
                <td className={td}>{s.app || "—"}</td>
                <td className={td}>{s.method || "—"}</td>
                <td className={td + " font-mono text-[12px]"}>{s.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (group === "menu") {
      return (
        <table className="cds--data-table cds--data-table--sm w-full min-w-[760px] text-[13px] border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--iamx-bg)]"><tr className="border-b border-[var(--iamx-border)]"><th className={th}>Menu</th><th className={th}>Domain</th><th className={th + " text-right"}>Visits</th><th className={th + " text-right"}>Users</th><th className={th}>Last visit</th></tr></thead>
          <tbody>
            {(items as MenuCount[]).map((m, i) => (
              <tr key={i} className="border-b border-[var(--iamx-border)]">
                <td className={td}>{m.menu || "—"} {m.module && <span className="ml-1 font-mono text-[11.5px] text-[var(--iamx-fg-muted)]">{m.module}</span>}</td>
                <td className={td}>{m.domain || "—"}</td>
                <td className={td + " text-right tabular-nums"}>{m.visits.toLocaleString("en-US")}</td>
                <td className={td + " text-right tabular-nums"}>{m.users.toLocaleString("en-US")}</td>
                <td className={timeTd}>{fmtAt(m.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return (
      <table className="cds--data-table cds--data-table--sm w-full min-w-[760px] text-[13px] border-collapse">
        <thead className="sticky top-0 z-10 bg-[var(--iamx-bg)]"><tr className="border-b border-[var(--iamx-border)]"><th className={th}>When</th><th className={th}>User</th><th className={th}>Menu</th><th className={th}>Domain</th><th className={th}>IP</th></tr></thead>
        <tbody>
          {(items as Visit[]).map((v, i) => (
            <tr key={i} className="border-b border-[var(--iamx-border)]">
              <td className={timeTd}>{fmtAt(v.at)}</td>
              <td className={td + " whitespace-nowrap"}>{v.user || "—"}</td>
              <td className={td}>{v.menu || v.url || "—"} {v.module && <span className="ml-1 font-mono text-[11.5px] text-[var(--iamx-fg-muted)]">{v.module}</span>}</td>
              <td className={td}>{v.domain || "—"}</td>
              <td className={td + " font-mono text-[12px]"}>{v.ip || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tab, group, openRow]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Activity"
        actions={<Button variant="secondary" icon="download" onClick={exportCsv} disabled={exporting || !data?.total}>{exporting ? "Exporting…" : "Export CSV"}</Button>}
      />
      <div className="px-6 bg-[var(--iamx-bg)]">
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          className="!mx-0 !px-0"
          tabs={[{ value: "changes", label: "Changes" }, { value: "signins", label: "Sign-ins" }, { value: "usage", label: "Menu usage" }]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)]">
        <div className="flex-1 min-w-[220px]"><Input value={q} onChange={setQ} placeholder={searchHint} icon="search" /></div>
        <div className="w-[170px]"><Select2 value={period} onChange={(v) => setPeriod(v || "30")} options={PERIODS} clearable={false} /></div>
        {tab === "usage" && (
          <div className="w-[170px]"><Select2 value={group} onChange={(v) => setGroup((v as "visit" | "menu") || "visit")} options={[{ value: "visit", label: "Each visit" }, { value: "menu", label: "Most used menus" }]} clearable={false} /></div>
        )}
        <span className="ml-auto text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
          {data ? (data.total ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total.toLocaleString("en-US")}` : "0 results") : ""}
        </span>
      </div>
      {tab === "signins" && data?.keycloak && !data.keycloak.enabled && (
        <div className="px-6 py-2.5 text-[12.5px] border-b border-[var(--iamx-border)] bg-amber-50 text-amber-700">
          Showing IAMX console sign-ins only. {data.keycloak.error ? `Keycloak sign-ins couldn't be loaded: ${data.keycloak.error}.` : "Keycloak sign-in events are off for this realm."}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto bg-layer">
        {err ? (
          <div className="px-6 py-6 text-[13px] text-red-600">{err}</div>
        ) : !data && loading ? (
          <div className="px-6 py-6 text-[13px] text-[var(--iamx-fg-muted)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-[var(--iamx-fg-muted)]">No activity in this period</div>
        ) : (
          body
        )}
      </div>
      {data && data.total > data.pageSize && (
        <div className="px-6 py-2.5 flex items-center justify-end gap-3 border-t border-[var(--iamx-border)] bg-[var(--iamx-bg)] text-[12px] text-[var(--iamx-fg-muted)] tabular-nums">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="hover:text-[var(--iamx-fg)] disabled:opacity-40">‹ Previous</button>
          <span>Page {page} of {totalPages.toLocaleString("en-US")}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="hover:text-[var(--iamx-fg)] disabled:opacity-40">Next ›</button>
        </div>
      )}
    </div>
  );
}
