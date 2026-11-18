// 13/11/69: ธีมสว่าง/มืดทั้งระบบ — ค่าเก็บใน localStorage "iamx.theme" (light|dark) ไม่มีค่า = ตามเครื่อง
export const THEME_KEY = "iamx.theme";

export function isDarkNow(): boolean {
  const cur = document.documentElement.getAttribute("data-theme");
  if (cur) return cur === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function setTheme(t: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", t);
  try { window.localStorage.setItem(THEME_KEY, t); } catch { /* storage unavailable */ }
}

// ใส่ใน <head> ให้ตั้งธีมก่อนวาดหน้า (กันจอขาวแวบตอนเปิดในโหมดมืด)
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
