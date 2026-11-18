// (ตาราง IAMX.ITEM_GROUP) · บทบาท/ความรับผิดชอบเลือกกลุ่มเองได้ (GROUP_CODE) · ไม่มีกลุ่ม/กลุ่มปิด = "Ungrouped"
// เดิม 18/10/69 เดาจากรหัสบทบาทในโค้ด — เลิกแล้ว
import { useEffect, useState } from "react";

export type ItemGroup = { id: number; code: string; name: string; sort_order: number; is_active: number; used: number };
type Kind = "ROLE" | "RESP";

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;
const cache: Record<Kind, ItemGroup[] | null> = { ROLE: null, RESP: null };
const listeners = new Set<() => void>();
const loading: Partial<Record<Kind, Promise<void>>> = {};

export function loadItemGroups(kind: Kind, force = false): Promise<void> {
  if (!force && loading[kind]) return loading[kind]!;
  loading[kind] = fetch(`${API_BASE}/admin/item-groups?kind=${kind}`)
    .then((r) => r.json())
    .then((j) => { cache[kind] = j.success ? (j.data as ItemGroup[]) : []; })
    .catch(() => { cache[kind] = cache[kind] || []; })
    .finally(() => listeners.forEach((f) => f()));
  return loading[kind]!;
}

/** ใช้ในหน้าที่จัดกลุ่ม — โหลดกลุ่มครั้งแรก และวาดใหม่เมื่อกลุ่มเปลี่ยน */
export function useItemGroups(kind: Kind): ItemGroup[] {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    if (!cache[kind]) loadItemGroups(kind);
    return () => { listeners.delete(f); };
  }, [kind]);
  return cache[kind] || [];
}

export const UNGROUPED = "__none";

function groupBy<T>(kind: Kind, items: T[], codeOf: (x: T) => string | undefined | null) {
  const groups = (cache[kind] || []).filter((g) => g.is_active === 1);
  const known = new Set(groups.map((g) => g.code));
  const by: Record<string, T[]> = {};
  items.forEach((x) => {
    const c = codeOf(x) || "";
    (by[known.has(c) ? c : UNGROUPED] ||= []).push(x);
  });
  const out = groups.filter((g) => by[g.code]?.length).map((g) => ({ key: g.code, label: g.name, items: by[g.code] }));
  if (by[UNGROUPED]?.length) out.push({ key: UNGROUPED, label: "Ungrouped", items: by[UNGROUPED] });
  return out;
}

export function groupRoles<T extends object>(roles: T[]) {
  return groupBy("ROLE", roles, (r) => (r as { group_code?: string | null }).group_code);
}

export function groupResponsibilities<T>(items: T[], codeOf: (x: T) => string | undefined | null) {
  return groupBy("RESP", items, codeOf);
}
