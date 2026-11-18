"use client";

import { tx } from "@/lib/i18n";
import { Check, ChevronDown, Search, X } from "@/app/components/iamx/carbonLucide";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label?: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = tx("เลือก..."),
  disabled = false,
  className = "",
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 13/11/69: Esc ปิดรายการก่อน · เลื่อนจอ/ย่อขยายหน้าต่างก็ปิด (รายการเป็น portal จะไม่ลอยค้าง)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); setIsOpen(false); setSearch(""); }
    };
    const onScroll = (e: Event) => {
      if (dropdownRef.current && e.target instanceof Node && dropdownRef.current.contains(e.target)) return;
      setIsOpen(false); setSearch("");
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 280;
      if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
        setDropdownStyle({ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 });
      } else {
        setDropdownStyle({ position: "fixed", bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, zIndex: 9999 });
      }
    }
  }, [isOpen]);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));

  const toggleOption = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label);

  const dropdown = isOpen && !disabled ? (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="bg-layer border border-[var(--iamx-border)] rounded-md shadow-lg overflow-hidden"
    >
      <div className="p-1.5 border-b border-[var(--iamx-border)]">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--iamx-fg-muted)]" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tx("ค้นหา...")}
            className="w-full pl-6 pr-2 py-1 text-[12px] border border-[var(--iamx-border)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--iamx-accent)]"
          />
        </div>
      </div>
      <div className="flex gap-3 px-3 py-1.5 border-b border-[var(--iamx-border)] bg-[var(--iamx-surface)]">
        <button
          type="button"
          onClick={() => onChange(filtered.map((o) => o.value))}
          className="text-[11.5px] text-[var(--iamx-accent)] hover:underline"
        >
          
          {tx("เลือกทั้งหมด")}
        </button>
        <span className="text-[var(--iamx-border-strong)]">·</span>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[11.5px] text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)] hover:underline"
        >
          
          {tx("ล้าง")}
        </button>
      </div>
      <div className="overflow-y-auto max-h-52">
        {filtered.length === 0 ? (
          <div className="px-3 py-2.5 text-[12px] text-[var(--iamx-fg-muted)] text-center">{tx("ไม่พบข้อมูล")}</div>
        ) : (
          filtered.map((opt) => {
            const sel = value.includes(opt.value);
            return (
              <div
                key={opt.value}
                onClick={() => toggleOption(opt.value)}
                className={[
                  "flex items-center gap-2 px-3 py-2 text-[12.5px] cursor-pointer transition-colors",
                  sel
                    ? "bg-[var(--iamx-bg-active)] text-[var(--iamx-fg)]"
                    : "text-[var(--iamx-fg)] hover:bg-[var(--iamx-surface-hover,#f4f4f4)]",
                ].join(" ")}
              >
                <div
                  className={[
                    "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                    sel ? "bg-[var(--iamx-accent)] border-[var(--iamx-accent)]" : "border-[var(--iamx-border-strong)] bg-layer",
                  ].join(" ")}
                >
                  {sel && <Check size={9} className="text-white" strokeWidth={3} />}
                </div>
                <span className={sel ? "font-medium" : ""}>{opt.label}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-[12px] font-medium text-[var(--iamx-fg-muted)] mb-1">{label}</label>
      )}
      <div
        ref={triggerRef}
        onClick={() => !disabled && setIsOpen((v) => !v)}
        className={[
          "w-full min-h-8 pl-2.5 pr-7 py-1 text-[13px] bg-[var(--iamx-field)] border-0 border-b rounded-none flex items-center flex-wrap gap-1 cursor-pointer select-none relative",
          disabled ? "opacity-50 cursor-not-allowed bg-[var(--iamx-surface-muted,#f4f4f4)]" : "hover:border-[var(--iamx-border-strong,#bbb)]",
          isOpen ? "border-[var(--iamx-border-strong)] outline outline-2 outline-[#0f62fe] -outline-offset-2" : "border-[var(--iamx-border-strong)]",
        ].join(" ")}
      >
        {value.length === 0 ? (
          <span className="text-[var(--iamx-fg-muted,#999)] text-[13px]">{placeholder}</span>
        ) : (
          <>
            {selectedLabels.slice(0, 2).map((lbl, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[var(--iamx-accent-soft)] text-[var(--iamx-accent)] text-[11.5px] rounded"
              >
                {lbl}
              </span>
            ))}
            {value.length > 2 && (
              <span className="inline-flex items-center px-1.5 py-0.5 bg-[var(--iamx-surface)] text-[var(--iamx-fg-muted)] text-[11.5px] rounded border border-[var(--iamx-border)]">
                +{value.length - 2}
              </span>
            )}
          </>
        )}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value.length > 0 && !disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange([]); setIsOpen(false); }}
              className="p-0.5 text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)]"
            >
              <X size={11} />
            </button>
          )}
          <ChevronDown size={14} className={`text-[var(--iamx-fg-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </div>
      {typeof document !== "undefined" && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
