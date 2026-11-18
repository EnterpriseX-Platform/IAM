import { tx } from "@/lib/i18n";
// 13/11/69: ชื่อและลำดับสิทธิ์ชุดเดียวกันทุกจอ (สิทธิ์เมนู · ตั้งสิทธิ์เฉพาะคน · สิทธิ์รายงาน · เมนูที่เห็น)
export const PERM_ORDER = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT", "PRINT"] as const;

export const PERM_TH: Record<string, string> = {
  VIEW: tx("ดู"), CREATE: tx("สร้าง"), EDIT: tx("แก้ไข"), DELETE: tx("ลบ"), APPROVE: tx("อนุมัติ"), EXPORT: tx("ส่งออก"), PRINT: tx("พิมพ์"), ALL: tx("ทั้งหมด"),
};

export const permLabel = (p: string) => PERM_TH[p] || p;

export function sortPerms<T extends string>(list: readonly T[]): T[] {
  const rank = (p: string) => {
    const i = (PERM_ORDER as readonly string[]).indexOf(p);
    return i < 0 ? 99 : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}
