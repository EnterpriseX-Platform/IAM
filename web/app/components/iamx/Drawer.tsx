"use client";

import { tx } from "@/lib/i18n";
import { ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import { Tip } from "./Tip";

type Mode = "overlay" | "push";

export function Drawer({
  open, onClose, title, subtitle, width: defaultWidth = 720,
  minWidth = 420, maxWidth = 1100, footer, children, headerExtra,
  persistKey = "iamx-drawer",
}: {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  footer?: ReactNode;
  children?: ReactNode;
  headerExtra?: ReactNode;
  persistKey?: string;
}) {
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const stored = localStorage.getItem(`${persistKey}-w`);
      return stored ? Math.max(minWidth, Math.min(maxWidth, parseInt(stored))) : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "overlay";
    try {
      return (localStorage.getItem(`${persistKey}-mode`) as Mode) || "overlay";
    } catch {
      return "overlay";
    }
  });
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 13/11/69: เปิดลิ้นชักใหม่ให้เริ่มที่บนสุดเสมอ (เดิมค้างตำแหน่งเลื่อนของคนก่อน)
  useEffect(() => { if (open && bodyRef.current) bodyRef.current.scrollTop = 0; }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || mode !== "push") return;
    document.body.style.setProperty("--drawer-push-w", `${width}px`);
    document.body.setAttribute("data-drawer-push", "");
    return () => {
      document.body.style.removeProperty("--drawer-push-w");
      document.body.removeAttribute("data-drawer-push");
    };
  }, [open, mode, width]);

  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(`${persistKey}-w`, String(width));
    } catch {}
  }, [width, dragging, persistKey]);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(minWidth, Math.min(maxWidth, startW + (startX - ev.clientX)));
      setWidth(w);
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(`${persistKey}-mode`, m);
    } catch {}
  };

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      {mode === "overlay" && (
        <div
          className={`absolute inset-0 bg-black/30 transition-opacity duration-150 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={onClose}
        />
      )}
      <div
        ref={containerRef}
        className={
          "absolute right-0 top-0 h-full bg-[var(--iamx-bg)] flex flex-col " +
          (dragging ? "" : "transition-transform duration-200 ease-out ") +
          (open ? "translate-x-0 " : "translate-x-full ") +
          (mode === "overlay" ? "shadow-2xl" : "border-l border-[var(--iamx-border)]")
        }
        // 19/10/69: จอแคบเดิมลิ้นชักกว้าง 720px ล้นจอ → ไม่เกินความกว้างจอ
        style={{ width, maxWidth: "100vw" }}
      >
        <div
          onMouseDown={onDragStart}
          className={
            "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group/handle " +
            "hover:bg-[var(--iamx-accent)]/30 active:bg-[var(--iamx-accent)]/50 " +
            (dragging ? "bg-[var(--iamx-accent)]/50" : "")
          }
          title={tx("ลากเพื่อปรับขนาด")}
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-12 w-1 rounded-r bg-[var(--iamx-border-strong)] opacity-0 group-hover/handle:opacity-100 transition-opacity" />
        </div>

        <header className="flex items-center gap-2 px-5 h-12 border-b border-[var(--iamx-border)] shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h2 className="text-[14px] font-semibold text-[var(--iamx-fg)] truncate">{title}</h2>
            {subtitle && (
              <>
                <span className="text-[var(--iamx-fg-muted)] shrink-0">·</span>
                <span className="text-[12.5px] text-[var(--iamx-fg-muted)] truncate min-w-0">
                  {subtitle}
                </span>
              </>
            )}
          </div>
          {headerExtra && <div className="shrink-0">{headerExtra}</div>}
          <DrawerModeToggle mode={mode} onChange={switchMode} />
          <div className="h-4 w-px bg-[var(--iamx-border)] mx-1 shrink-0" />
          <IconButton icon="x" label={tx("ปิด · Esc")} onClick={onClose} />
        </header>
        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-2.5 border-t border-[var(--iamx-border)] shrink-0 bg-[var(--iamx-surface)]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

function DrawerModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex p-0.5 rounded-md bg-[var(--iamx-bg-hover)] gap-0.5">
      <Tip tip={tx("ทับเนื้อหา (overlay)")}>
        <button
          type="button"
          onClick={() => onChange("overlay")}
          aria-pressed={mode === "overlay"}
          className={
            "h-6 w-6 inline-flex items-center justify-center rounded " +
            (mode === "overlay"
              ? "bg-layer text-[var(--iamx-fg)] shadow-sm"
              : "text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)]")
          }
        >
          <Icon name="layers" size={12} />
        </button>
      </Tip>
      <Tip tip={tx("ดันเนื้อหา (push)")}>
        <button
          type="button"
          onClick={() => onChange("push")}
          aria-pressed={mode === "push"}
          className={
            "h-6 w-6 inline-flex items-center justify-center rounded " +
            (mode === "push"
              ? "bg-layer text-[var(--iamx-fg)] shadow-sm"
              : "text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)]")
          }
        >
          <Icon name="panel" size={12} />
        </button>
      </Tip>
    </div>
  );
}

export function DrawerSection({
  title, description, children, className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`px-5 py-4 border-b border-[var(--iamx-border)] last:border-b-0 ${className}`}>
      {title && (
        <div className="mb-3">
          <h3 className="text-[12.5px] font-semibold text-[var(--iamx-fg)] uppercase tracking-wider">
            {title}
          </h3>
          {description && (
            <p className="text-[11.5px] text-[var(--iamx-fg-muted)] mt-1 normal-case">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
