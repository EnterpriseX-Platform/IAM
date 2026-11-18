// ข้อความในโค้ดยังเป็นภาษาไทย (ใช้เป็น key) — tx() แปลเป็นอังกฤษจาก i18n-en.json
// เปิดภาษาไทยกลับ: เปลี่ยน LANG เป็น "th" (ข้อความไทยเดิมแสดงตามโค้ด)
import en from "./i18n-en.json";

export type Lang = "th" | "en";
export const LANG: Lang = "en";

const EN = en as Record<string, string>;

export function tx(s: string, ...args: unknown[]): string {
  const key = s.replace(/\s+/g, " ").trim();
  const out = LANG === "en" ? EN[key] ?? key : key;
  return args.length ? out.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? "")) : out;
}
