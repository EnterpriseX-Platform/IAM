// มาจาก System settings › User types (ตาราง IAMX.USER_TYPE) · รหัสเดิม internal/agency คงไว้ให้ token/ระบบอื่น
import { useEffect, useState } from "react";

export type UserType = { code: string; name: string; is_staff: boolean; aliases: string[] | null; sort_order: number; is_active: boolean; used?: number };
export type MenuType = string;

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080"}/iamx/api`;
const FALLBACK: UserType[] = [
  { code: "internal", name: "Internal user", is_staff: true, aliases: [], sort_order: 10, is_active: true },
  { code: "agency", name: "External user / agency", is_staff: false, aliases: ["external"], sort_order: 20, is_active: true },
];
let cache: UserType[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadUserTypes(force = false): Promise<void> {
  if (!force && loading) return loading;
  loading = fetch(`${API_BASE}/admin/user-types`)
    .then((r) => r.json())
    .then((j) => { if (j.success && j.data?.length) cache = j.data as UserType[]; })
    .catch(() => {})
    .finally(() => listeners.forEach((f) => f()));
  return loading;
}

/** ทุกประเภท (รวมที่ปิด) — โหลดครั้งแรกและวาดใหม่เมื่อค่าตั้งเปลี่ยน */
export function useUserTypes(): UserType[] {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    if (!cache) loadUserTypes();
    return () => { listeners.delete(f); };
  }, []);
  return allUserTypes();
}

export const allUserTypes = (): UserType[] => cache || FALLBACK;
/** ประเภทที่เปิดใช้ ตามลำดับที่ตั้ง — ใช้เป็นตัวเลือก */
export const activeUserTypes = (): UserType[] => allUserTypes().filter((t) => t.is_active);
export const staffCode = (): string => (activeUserTypes().find((t) => t.is_staff) || allUserTypes()[0]).code;
export const isStaffType = (code?: string | null): boolean => !!allUserTypes().find((t) => t.code === normalizeUserType(code))?.is_staff;
export const userTypeName = (code?: string | null): string => {
  const c = normalizeUserType(code);
  return allUserTypes().find((t) => t.code === c)?.name || c;
};

/** ประเภทผู้ใช้สำหรับแสดงผล/กรอง — แปลงค่าเก่าตาม aliases · ว่าง/ไม่รู้จัก = ประเภทบุคลากร */
export function normalizeUserType(t?: string | null): string {
  const v = (t || "").trim().toLowerCase();
  const hit = allUserTypes().find((x) => x.code === v || (x.aliases || []).includes(v));
  return hit ? hit.code : staffCode();
}

/** แยกค่า MENU_TYPE เป็นรายการ — เก็บเฉพาะค่าที่รู้จัก เรียงตามลำดับประเภท ไม่ซ้ำ */
export function parseMenuTypes(raw?: string | null): string[] {
  const parts = (raw || "").split(",").map((s) => s.trim().toLowerCase());
  return allUserTypes().map((t) => t.code).filter((c) => parts.includes(c));
}

/** โดเมนนี้ใช้กับผู้ใช้/บทบาทประเภท type ได้หรือไม่ (ไม่มีค่า = ไม่จำกัด เหมือนเดิม) */
export function domainAllowsType(raw: string | null | undefined, type: string): boolean {
  if (!raw) return true;
  return raw.split(",").map((s) => s.trim()).includes(type);
}
