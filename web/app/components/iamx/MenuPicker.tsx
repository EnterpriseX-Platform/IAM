"use client";
import { Checkbox } from "@/app/components/iamx/Check";

import { tx } from "@/lib/i18n";
// ซ้าย = ระบบงาน (พร้อมจำนวนที่ให้สิทธิ์แล้ว) · ขวา = เมนูของระบบงานนั้นเรียงแบน มีหัวโมดูลให้ติ๊กทั้งกลุ่ม
// ค้นหา = ข้ามทุกระบบงาน · ใช้ในหน้าบทบาท (แท็บเมนู) และข้อยกเว้นรายคน
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Select2 from "../Select2";

export type PickerNode = { id: number; label: string; code: string; children?: PickerNode[] };
export type PickerGroups = { [domain: string]: { [app: string]: { [module: string]: PickerNode[] } } };

type Row = { node: PickerNode; parent?: string };
type Mod = { key: string; name: string; rows: Row[] };
type App = { key: string; domain: string; name: string; mods: Mod[] };

const flatten = (nodes: PickerNode[], parent?: string): Row[] =>
  nodes.flatMap((n) => {
    // ลูกเดียวชื่อเดียวกับตัวเอง = ชั้นซ้ำ → แสดงลูกแทน
    if (n.children?.length === 1 && n.children[0].label === n.label) return flatten(n.children, parent);
    return [{ node: n, parent }, ...flatten(n.children || [], n.label)];
  });

export function MenuPicker({
  groups,
  isOn,
  renderCells,
  onGroup,
  busy,
  toolbar,
  header,
}: {
  groups: PickerGroups;
  /** เมนูนี้ "ดู" ได้แล้วหรือยัง (ใช้นับและติ๊กทั้งกลุ่ม) */
  isOn: (n: PickerNode) => boolean;
  /** ช่องติ๊กของแถวเมนู (ดู + สิทธิ์ย่อยถ้าเปิด) */
  renderCells: (n: PickerNode) => ReactNode;
  /** ติ๊ก/เอาออกทั้งโมดูล */
  onGroup?: (label: string, nodes: PickerNode[], on: boolean) => void;
  busy?: boolean;
  /** ปุ่ม/ตัวกรองเพิ่มเติมข้างช่องค้นหา */
  toolbar?: ReactNode;
  /** หัวคอลัมน์ช่องติ๊ก (ชื่อสิทธิ์) */
  header?: ReactNode;
}) {
  const apps: App[] = useMemo(() => {
    const out: App[] = [];
    Object.entries(groups).forEach(([domain, appMap]) =>
      Object.entries(appMap).forEach(([app, mods]) =>
        out.push({
          key: `${domain}|${app}`,
          domain,
          name: app,
          mods: Object.entries(mods).map(([m, nodes]) => ({ key: `${domain}|${app}|${m}`, name: m, rows: flatten(nodes) })),
        })
      )
    );
    return out.sort((x, y) => x.name.localeCompare(y.name, "th", { numeric: true }));
  }, [groups]);

  const [cur, setCur] = useState<string>("");
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!apps.find((a) => a.key === cur)) setCur(apps[0]?.key || "");
  }, [apps, cur]);

  // พื้นที่แคบ (เช่น แผงขวาของความรับผิดชอบ) → รายการระบบงานเป็น dropdown ด้านบนแทนแถบซ้าย
  const boxRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = (rows: Row[]) => rows.filter((r) => isOn(r.node)).length;
  const query = q.trim().toLowerCase();

  // ค้นหา: แสดงผลข้ามทุกระบบงาน · ไม่ค้นหา: เฉพาะระบบงานที่เลือก
  const shown: Array<{ app: App; mods: Mod[] }> = query
    ? apps
        .map((a) => ({
          app: a,
          mods: a.mods
            .map((m) => ({ ...m, rows: m.rows.filter((r) => `${r.node.label} ${r.node.code} ${m.name} ${a.name}`.toLowerCase().includes(query)) }))
            .filter((m) => m.rows.length),
        }))
        .filter((x) => x.mods.length)
    : apps.filter((a) => a.key === cur).map((a) => ({ app: a, mods: a.mods }));

  const appName = (a: App) => (a.name === a.domain ? a.name : a.name);
  const dupName = (a: App) => apps.filter((x) => x.name === a.name).length > 1;

  return (
    <div ref={boxRef} className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 flex flex-wrap items-center gap-2 mb-3">
        {narrow && (
          <Select2
            value={cur}
            onChange={(v) => { if (v) { setCur(v); setQ(""); } }}
            clearable={false}
            className="w-[260px] max-w-full"
            options={apps.map((a) => {
              const total = a.mods.reduce((s, m) => s + m.rows.length, 0);
              const on = a.mods.reduce((s, m) => s + count(m.rows), 0);
              return { value: a.key, label: `${a.name} · ${on}/${total}` };
            })}
          />
        )}
        <div className="relative w-[280px] max-w-full">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tx("ค้นหาเมนู / รหัส ทุกระบบงาน")}
            className="w-full h-8 pl-3 pr-3 text-[13px] bg-[var(--iamx-surface)] border-b border-[var(--iamx-border-strong)] focus:outline-none focus:border-[var(--iamx-accent)]"
          />
        </div>
        {toolbar}
      </div>

      {/* 13/11/69: ไม่มีกรอบนอก — แยกฝั่งด้วยสีพื้น (ซ้ายเทา ขวาขาว) */}
      <div className={"flex-1 min-h-0 grid bg-layer " + (narrow ? "grid-cols-1" : "grid-cols-[220px_minmax(0,1fr)]")}>
        {/* ซ้าย: ระบบงาน */}
        <div className={"min-h-0 overflow-y-auto bg-[var(--iamx-surface)]" + (narrow ? " hidden" : "")}>
          {apps.map((a) => {
            const total = a.mods.reduce((s, m) => s + m.rows.length, 0);
            const on = a.mods.reduce((s, m) => s + count(m.rows), 0);
            const active = !query && a.key === cur;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => { setCur(a.key); setQ(""); }}
                className={
                  "w-full text-left px-3 py-2 flex items-start gap-2 " +
                  (active ? "bg-layer shadow-[inset_3px_0_0_#0f62fe]" : "hover:bg-[var(--iamx-bg-hover)]")
                }
              >
                <span className="flex-1 min-w-0">
                  <span className={"block text-[13px] break-words " + (active ? "font-medium text-[var(--iamx-fg)]" : "text-[var(--iamx-fg)]")}>{appName(a)}</span>
                  {dupName(a) && <span className="block text-[11px] text-[var(--iamx-fg-muted)]">{a.domain}</span>}
                </span>
                <span className={"shrink-0 text-[11.5px] tabular-nums " + (on ? "text-[var(--iamx-accent)] font-medium" : "text-[var(--iamx-fg-muted)]")}>
                  {on}/{total}
                </span>
              </button>
            );
          })}
        </div>

        {/* ขวา: เมนูแบน */}
        <div className="min-h-0 overflow-y-auto">
          {header && (
            <div className="sticky top-0 z-[1] flex items-center gap-2 px-3 h-9 bg-[var(--iamx-bg-active)] text-[12px] font-semibold text-[var(--iamx-fg)]">
              <span className="flex-1">{query ? tx("ผลค้นหา \"{0}\"", q.trim()) : apps.find((a) => a.key === cur)?.name}</span>
              {header}
            </div>
          )}
          {shown.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-[var(--iamx-fg-muted)]">{query ? tx("ไม่พบเมนู") : tx("ไม่มีเมนู")}</div>}
          {shown.map(({ app, mods }) => (
            <div key={app.key}>
              {query && <div className="px-3 pt-3 pb-1 text-[12px] font-semibold text-[var(--iamx-fg-muted)]">{app.name}</div>}
              {mods.map((m) => {
                const n = count(m.rows);
                const all = n === m.rows.length && n > 0;
                return (
                  <div key={m.key}>
                    <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--iamx-border)] bg-[var(--iamx-surface)]">
                      {onGroup ? (
                        <Checkbox
                          
                          className="h-4 w-4 accent-[#0f62fe] cursor-pointer"
                          checked={all}
                          ref={(el) => { if (el) el.indeterminate = n > 0 && !all; }}
                          disabled={busy}
                          onChange={() => onGroup(m.name, m.rows.map((r) => r.node), !all)}
                          aria-label={tx("ดูทั้งโมดูล {0}", m.name)}
                        />
                      ) : null}
                      <span className="flex-1 text-[12.5px] font-medium text-[var(--iamx-fg)]">{m.name}</span>
                      <span className="text-[11.5px] tabular-nums text-[var(--iamx-fg-muted)]">{n}/{m.rows.length}</span>
                    </div>
                    {m.rows.map((r) => (
                      <div key={r.node.id} className="flex items-center gap-2 pl-9 pr-3 py-1.5 border-b border-[var(--iamx-border)] hover:bg-[var(--iamx-bg-hover)]">
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] text-[var(--iamx-fg)] break-words">
                            {r.parent && <span className="text-[var(--iamx-fg-muted)]">{r.parent} › </span>}
                            {r.node.label}
                          </span>
                          <span className="block font-mono text-[11px] text-[var(--iamx-fg-muted)]">{r.node.code}</span>
                        </span>
                        {renderCells(r.node)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
