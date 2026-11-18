"use client";

import { tx } from "@/lib/i18n";
import { ChangeConsolePassword } from "./ChangeConsolePassword";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "./iamx/Logo";
import { Asleep, Light } from "@carbon/icons-react";
import { isDarkNow, setTheme } from "@/lib/theme";

import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { Icon } from "./iamx";

// 13/11/69: ชื่อหน้าไม่ซ้ำในแถบบน (อยู่ในหัวเนื้อหาที่เดียว) — เลิก ROUTE_TITLES/เบรดครัมบ์
export default function Topbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username
    : tx("ผู้ใช้");

  const handleLogout = async () => {
    try {
      await logout?.();
    } finally {
      router.push("/login");
    }
  };

  // เมนูบัญชีแบบกดลง (แทนปุ่มเรียง 3 ชิ้น)
  const [acctOpen, setAcctOpen] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(isDarkNow()); }, []);
  const acctRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!acctOpen) return;
    const close = (e: MouseEvent) => { if (!acctRef.current?.contains(e.target as Node)) setAcctOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAcctOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [acctOpen]);

  return (
    <header className="h-12 shrink-0 flex items-center bg-[#161616] text-[#f4f4f4] z-30">
      {/* ☰: จอแคบเปิดแถบซ้ายเป็นลิ้นชัก · จอกว้างย่อ/ขยายแถบซ้าย */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(window.innerWidth < 768 ? "iamx-sidebar-open" : "iamx-sidebar-toggle"))}
        aria-label={tx("เมนู")}
        className="h-12 w-12 inline-flex items-center justify-center text-[#c6c6c6] hover:bg-[#2c2c2c] hover:text-white"
      >
        <Icon name="menu" size={18} />
      </button>
      <Link href="/settings" aria-label="Home" title="Home" className="flex items-center gap-2 pl-1 pr-4 h-12 whitespace-nowrap hover:bg-[#2c2c2c]">
        <Logo size={20} color="#f4f4f4" />
      </Link>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => { const next = dark ? "light" : "dark"; setTheme(next); setDark(!dark); }}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        title={dark ? "Light mode" : "Dark mode"}
        className="h-12 w-12 inline-flex items-center justify-center text-[#c6c6c6] hover:bg-[#2c2c2c] hover:text-white"
      >
        {dark ? <Light size={20} /> : <Asleep size={20} />}
      </button>
      <div ref={acctRef} className="relative">
        <button
          type="button"
          onClick={() => setAcctOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={acctOpen}
          className={"h-12 px-3 inline-flex items-center gap-2 text-[13px] hover:bg-[#2c2c2c] " + (acctOpen ? "bg-[#2c2c2c]" : "")}
        >
          <span className="h-[26px] w-[26px] rounded-full bg-[#393939] text-[#f4f4f4] inline-flex items-center justify-center text-[11px] font-semibold">
            {initials(displayName)}
          </span>
          <span className="hidden sm:inline max-w-[200px] truncate">{displayName}</span>
          <Icon name="chevronDown" size={13} className="text-[#c6c6c6]" />
        </button>
        {acctOpen && (
          <div role="menu" className="absolute right-0 top-12 min-w-[240px] bg-layer text-[var(--iamx-fg)] shadow-[0_2px_6px_rgba(0,0,0,0.3)] text-[13px]">
            <div className="px-4 py-3 border-b border-[var(--iamx-border)]">
              <div className="font-medium text-[var(--iamx-fg)] break-words">{displayName}</div>
              <div className="text-[12px] text-[var(--iamx-fg-muted)]">{user?.username}{user?.role ? ` · ${user.role}` : ""}</div>
            </div>
            <button type="button" role="menuitem" onClick={() => { setAcctOpen(false); setPwOpen(true); }} className="w-full text-left px-4 h-10 hover:bg-[var(--iamx-bg-hover)]">
              
              {tx("เปลี่ยนรหัสผ่าน")}
            </button>
            <button type="button" role="menuitem" onClick={handleLogout} className="w-full text-left px-4 h-10 hover:bg-[var(--iamx-bg-hover)]">
              
              {tx("ออกจากระบบ")}
            </button>
          </div>
        )}
      </div>
      <ChangeConsolePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </header>
  );
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";
