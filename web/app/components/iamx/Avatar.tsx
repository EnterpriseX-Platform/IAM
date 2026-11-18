"use client";

import { useEffect, useState } from "react";

// Carbon g10: อักษรย่อพื้นเทาเดียว ไม่สุ่มสี (MaintainX design system)
const COLORS = ["var(--iamx-bg-active)"];

// 21/10/69: มีรูป (src) แสดงรูป · โหลดไม่ได้หรือไม่มีรูป ใช้อักษรย่อสีเดิม
export function Avatar({ name, size = 24, src }: { name?: string; size?: number; src?: string }) {
  const [broken, setBroken] = useState(false);
  // รูปต้องส่ง token ไปด้วย (fetch ของจอแนบให้) — <img src> ตรง ๆ ได้ 401 จึงดึงเป็น blob
  const [blobUrl, setBlobUrl] = useState<string>();
  useEffect(() => {
    if (!src) { setBlobUrl(undefined); return; }
    let url: string | undefined; let alive = true;
    fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => { url = URL.createObjectURL(b); if (alive) { setBlobUrl(url); setBroken(false); } }).catch(() => alive && setBroken(true));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [src]);
  const initials =
    (name || "")
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map((p) => p[0] || "")
      .join("").toUpperCase() || "?";
  const hash = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = COLORS[hash % COLORS.length];
  if (src && blobUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={blobUrl} alt="" onError={() => setBroken(true)} className="rounded-full object-cover shrink-0 bg-[var(--iamx-bg-hover)]" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[var(--iamx-fg)] font-medium select-none shrink-0"
      style={{ width: size, height: size, backgroundColor: bg, fontSize: Math.max(10, size * 0.4) }}
    >
      {initials}
    </span>
  );
}
