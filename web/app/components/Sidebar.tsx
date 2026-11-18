"use client";

import { tx } from "@/lib/i18n";
import Link from "next/link";
import { Fragment } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Icon, IconName, Tip } from "./iamx";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  // เมนูย่อย = แท็บของหน้านั้น (?tab=) ลิงก์ตรงไปแท็บ
  subs?: { tab: string; label: string }[];
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    id: "main",
    label: "",
    items: [
      { href: "/settings/users", label: tx("ผู้ใช้งาน"), icon: "users" },
      { href: "/settings/access", label: tx("บทบาทและสิทธิ์"), icon: "shield" },
      { href: "/settings/responsibility", label: tx("ความรับผิดชอบ"), icon: "briefcase" },
      { href: "/settings/structure", label: tx("โครงสร้างเมนู"), icon: "layers" },
      { href: "/settings/chat-groups", label: tx("กลุ่มแชท"), icon: "chat" },
      { href: "/settings/activity", label: "Activity", icon: "activity" },
      { href: "/settings/general", label: tx("ตั้งค่าระบบ"), icon: "settings" },
    ],
  },
];

const COLLAPSE_KEY = "iamx-sidebar-collapsed";

function SidebarItem({
  item, active, collapsed, activeTab,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  activeTab: string | null;
}) {
  const link = (
    <Link
      href={item.href}
      className={
        `group/nav w-full flex items-center gap-3 h-10 ${collapsed ? "justify-center" : "px-4"} ` +
        "text-[14px] transition-colors " +
        (active
          ? "bg-[var(--iamx-bg-active)] text-[var(--iamx-fg)] font-semibold shadow-[inset_3px_0_0_#0f62fe]"
          : "text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)] hover:bg-[var(--iamx-sidebar-hover)]")
      }
    >
      {collapsed && <Icon name={item.icon} size={16} />}
      {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
    </Link>
  );
  if (collapsed) return <Tip tip={item.label} position="right">{link}</Tip>;
  if (!item.subs) return link;
  const cur = active ? (item.subs.find((x) => x.tab === activeTab) || item.subs[0]).tab : null;
  return (
    <div>
      {link}
      <div className="mt-0.5 space-y-0.5">
        {item.subs.map((sub) => {
          const on = cur === sub.tab;
          return (
            <Link
              key={sub.tab}
              href={`${item.href}?tab=${sub.tab}`}
              className={
                "w-full flex items-center h-7 pl-[31px] pr-2 rounded-md text-[12.5px] transition-colors " +
                (on
                  ? "bg-[var(--iamx-sidebar-active)] text-[var(--iamx-fg)] font-medium"
                  : "text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)] hover:bg-[var(--iamx-sidebar-hover)]")
              }
            >
              <span className="truncate">{sub.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarInner() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeTab = sp.get("tab");
  // จอ < 768px: drawer ทับหน้า เปิดจากปุ่ม ☰ ใน Topbar
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    const open = () => setDrawer(true);
    window.addEventListener("iamx-sidebar-open", open);
    return () => window.removeEventListener("iamx-sidebar-open", open);
  }, []);
  useEffect(() => { setDrawer(false); }, [pathname, activeTab]);
  const { user } = useAuth();

  let [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      if (stored !== null) setCollapsed(stored === "1");
      else if (window.innerWidth < 1024) setCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024) setCollapsed(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [envLabel, setEnvLabel] = useState("");
  useEffect(() => {
    const h = window.location.hostname;
    setEnvLabel(h.startsWith("uat") || h.includes("uat-") ? "UAT" : h === "localhost" || h === "127.0.0.1" ? tx("เครื่องพัฒนา") : h.includes("sit") ? "SIT" : "PROD");
  }, []);
  useEffect(() => {
    const t = () => toggleCollapse();
    window.addEventListener("iamx-sidebar-toggle", t);
    return () => window.removeEventListener("iamx-sidebar-toggle", t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCollapse = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  };

  const visibleNav = useMemo(() => {
    if (!user) return [];
    const role = user.role?.toUpperCase();
    if (role === "ADMIN") return NAV;
    return NAV.map((s) => ({
      ...s,
      items: s.items.filter((i) => i.href === "/settings/users"),
    })).filter((s) => s.items.length > 0);
  }, [user]);

  const isActive = (href: string) => pathname === href || (href !== "/settings" && pathname.startsWith(href + "/"));

  if (drawer) collapsed = false as boolean;
  return (
    <>
    {drawer && <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setDrawer(false)} />}
    <aside
      className={
        (drawer ? "fixed inset-y-0 left-0 z-50 flex w-[260px] " : `hidden md:flex ${collapsed ? "w-[48px]" : "w-[248px]"} `) +
        "shrink-0 h-full " +
        "bg-[var(--iamx-sidebar)] border-r border-[var(--iamx-border)] " +
        "flex-col transition-[width] duration-150"
      }
    >
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto pt-2 pb-3">
        {visibleNav.map((section, sIdx) => (
          <div key={section.id} className={sIdx > 0 ? "mt-5" : ""}>
            {!collapsed && (
              <div className="text-[10.5px] uppercase tracking-wider font-medium text-[var(--iamx-fg-muted)] px-2 mb-1.5">
                {section.label}
              </div>
            )}
            {collapsed && sIdx > 0 && (
              <div className="h-px bg-[var(--iamx-border)] my-3 mx-1" />
            )}
            <div>
              {section.items.map((item) => (
                <Fragment key={item.href}>
                {item.href === "/settings/activity" && <div className={"h-px bg-[var(--iamx-border)] my-2 " + (collapsed ? "mx-2" : "mx-4")} />}
                <SidebarItem
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                  activeTab={activeTab}
                />
                {item.href === "/settings" && <div className={"h-px bg-[var(--iamx-border)] my-2 " + (collapsed ? "mx-2" : "mx-4")} />}
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      {/* ท้ายแถบ: บอกสภาพแวดล้อม (กันแก้ผิดที่) + ปุ่มย่อ */}
      <div className={"shrink-0 h-10 border-t border-[var(--iamx-border)] flex items-center " + (collapsed ? "justify-center" : "justify-between pl-4 pr-1")}>
        {!collapsed && <span className="text-[12px] text-[var(--iamx-fg-muted)]">IAMX · {envLabel}</span>}
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={collapsed ? tx("ขยายแถบเมนู") : tx("ย่อแถบเมนู")}
          className="h-8 w-8 inline-flex items-center justify-center text-[var(--iamx-fg-muted)] hover:bg-[var(--iamx-sidebar-hover)] hover:text-[var(--iamx-fg)]"
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={14} />
        </button>
      </div>
    </aside>
    </>
  );
}

export default function Sidebar() {
  return (
    <Suspense fallback={null}>
      <SidebarInner />
    </Suspense>
  );
}
