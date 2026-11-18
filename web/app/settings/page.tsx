"use client";

import { tx } from "@/lib/i18n";
// หน้าแรก = สิ่งที่ผู้ดูแลต้องจัดการ (ตัวเลขจริง กดแล้วไปหน้ารายการที่กรองไว้) + เปลี่ยนแปลงล่าสุด
// เลิกการ์ดเมนู 6 ใบที่ซ้ำกับแถบซ้าย
import { PageHeader } from "@/app/components/iamx";
import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;

type Counts = Record<string, number>;
type Change = { table: string; action: string; at: string; count: number; role?: string; user?: string; resp?: string };

const TODO: Array<{ key: string; title: string; why: string; href: string; go: string }> = [
  { key: "users_no_role", title: tx("ผู้ใช้ที่ใช้งานอยู่แต่ยังไม่มีบทบาท"), why: tx("เข้าระบบได้ แต่ไม่เห็นเมนูใด"), href: "/settings/users?filter=norole", go: tx("ดูรายชื่อ") },
  { key: "users_type_mismatch", title: tx("ผู้ใช้ที่มีบทบาทไม่ตรงประเภท"), why: tx("เช่น ผู้ใช้ภายนอกถือบทบาทภายใน"), href: "/settings/users?filter=mismatch", go: tx("ดูรายชื่อ") },
  { key: "users_no_org", title: tx("ผู้ใช้ภายในที่ยังไม่มีสังกัด"), why: tx("ไม่มีกระทรวงและกรม · ระบบงานกรองข้อมูลตามสังกัดไม่ได้"), href: "/settings/users?filter=noorg", go: tx("ดูรายชื่อ") },
  { key: "roles_no_menu", title: tx("บทบาทที่ยังไม่มีเมนู"), why: tx("ผูกให้ผู้ใช้แล้วจะไม่เห็นอะไร"), href: "/settings/access?filter=nomenu", go: tx("ดูบทบาท") },
  { key: "roles_expiring", title: "Roles expired or expiring within 30 days", why: "Users lose these menus when the role expires", href: "/settings/access?filter=expiring", go: "View roles" },
  { key: "resps_no_role", title: tx("ความรับผิดชอบที่ยังไม่มีบทบาท"), why: tx("ผู้สมัครที่เลือกชุดนี้จะไม่ได้บทบาท"), href: "/settings/responsibility?filter=norole", go: tx("ดูชุด") },
];

const fmtAt = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const describe = (c: Change) => {
  const add = c.action === "INSERT";
  switch (c.table) {
    case "ROLE_OBJECT_MAPPING":
      return tx("{0} {1} เมนู · บทบาท {2}", add ? tx("ให้สิทธิ์") : tx("ถอนสิทธิ์"), c.count, c.role || "-");
    case "USER_ROLE_MAPPING":
      return `${add ? tx("ผูกบทบาท") : tx("ถอดบทบาท")} ${c.role || "-"} · ${c.user || tx("ผู้ใช้")}`;
    case "USER_RESPONSIBILITY_MAPPING":
      return `${add ? tx("ผูกความรับผิดชอบ") : tx("ถอดความรับผิดชอบ")} ${c.resp || ""} · ${c.user || tx("ผู้ใช้")}`;
    case "RESPONSIBILITY_ROLE_MAPPING":
      return tx("{0} {1} {2}ความรับผิดชอบ {3}", add ? "Added role" : "Removed role", c.role || "-", add ? tx("ใน") : tx("จาก"), c.resp || "");
    default:
      return `${c.table} ${c.action}`;
  }
};

export default function SettingsHomePage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/admin/dashboard-summary`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.message || "");
        setCounts(j.data.counts || {});
        setChanges(j.data.changes || []);
      })
      .catch(() => setErr(tx("โหลดข้อมูลสรุปไม่สำเร็จ")));
  }, []);

  const n = (k: string) => (counts && counts[k] >= 0 ? counts[k].toLocaleString("th-TH") : "–");

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="IAMX" />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-[960px] grid gap-5">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[var(--iamx-fg-muted)]">
            <span>{tx("ผู้ใช้")}{" "}<b className="text-[var(--iamx-fg)] tabular-nums">{n("users_active")}</b> {" "}{tx("ใช้งาน ·")}{" "}<b className="text-[var(--iamx-fg)] tabular-nums">{n("users_inactive")}</b> {" "}{tx("ปิดใช้งาน")}</span>
            <span>{tx("บทบาท")}{" "}<b className="text-[var(--iamx-fg)] tabular-nums">{n("roles")}</b></span>
            <span>{tx("ความรับผิดชอบ")}{" "}<b className="text-[var(--iamx-fg)] tabular-nums">{n("resps")}</b> {" "}{tx("ชุด")}</span>
          </div>
          {err && <div className="text-[13px] text-red-600">{err}</div>}

          <section className="bg-layer">
            <h2 className="px-4 pt-3.5 pb-2.5 text-[16px] font-medium text-[var(--iamx-fg)]">{tx("ต้องจัดการ")}</h2>
            <ul>
              {TODO.map((t) => (
                <li key={t.key}>
                  <Link href={t.href} className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-4 items-center px-4 py-3 border-t border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]">
                    <span className="text-[20px] text-right tabular-nums text-[var(--iamx-fg)]">{n(t.key)}</span>
                    <span className="min-w-0">
                      <span className="block font-medium text-[14px] text-[var(--iamx-fg)]">{t.title}</span>
                      <span className="block text-[12.5px] text-[var(--iamx-fg-muted)]">{t.why}</span>
                    </span>
                    <span className="text-[13px] text-[var(--iamx-accent)] whitespace-nowrap">{t.go} ›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-layer">
            <h2 className="px-4 pt-3.5 pb-2.5 text-[16px] font-medium text-[var(--iamx-fg)]">{tx("เปลี่ยนแปลงล่าสุด")}</h2>
            {changes.length === 0 ? (
              <div className="px-4 py-4 border-t border-[var(--iamx-border)] text-[13px] text-[var(--iamx-fg-muted)]">{counts ? tx("ยังไม่มีการเปลี่ยนแปลง") : tx("กำลังโหลด…")}</div>
            ) : (
              <table className="cds--data-table cds--data-table--sm w-full text-[13px]">
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={i} className="border-t border-[var(--iamx-border)]">
                      <td className="px-4 py-2.5 w-[1%] whitespace-nowrap tabular-nums text-[var(--iamx-fg-muted)]">{fmtAt(c.at)}</td>
                      <td className="px-4 py-2.5 text-[var(--iamx-fg)]">{describe(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
