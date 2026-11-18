"use client";

import { tx } from "@/lib/i18n";
import { ReactNode } from "react";
import { Input } from "./Input";
import { Icon } from "./Icon";

export function Toolbar({
  search, onSearchChange, searchPlaceholder = tx("ค้นหา..."), filters, right,
  selectedCount = 0, onClearSelection, bulkActions,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  right?: ReactNode;
  selectedCount?: number;
  onClearSelection?: () => void;
  bulkActions?: ReactNode;
}) {
  if (selectedCount > 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2 min-h-12 border-b border-[var(--iamx-border)] bg-[var(--iamx-accent-soft)]">
        <div className="text-[13px] font-medium text-[var(--iamx-accent)] whitespace-nowrap">
          
          {selectedCount} selected
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          className="text-[12px] text-[var(--iamx-fg-muted)] hover:text-[var(--iamx-fg)] underline whitespace-nowrap"
        >
          
          {tx("ยกเลิก")}
        </button>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-1.5">{bulkActions}</div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-6 h-12 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)]">
      {onSearchChange && (
        <Input
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          icon="search"
          className="max-w-xs"
        />
      )}
      {filters}
      <div className="flex-1" />
      {right && <div className="shrink-0 whitespace-nowrap">{right}</div>}
    </div>
  );
}

export function FilterChip({
  label, value, onClear, onClick, active,
}: {
  label: ReactNode;
  value?: ReactNode;
  onClear?: () => void;
  onClick?: () => void;
  active?: boolean;
}) {
  const on = active || value != null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        // 13/11/69: เลิกเส้นประ (ดูเหมือนยังไม่เสร็จ) → เส้นทึบบาง · เปิดอยู่ = พื้นฟ้าอ่อนไม่มีกรอบ
        "group inline-flex items-center gap-1.5 h-8 px-2.5 border text-[12.5px] transition-colors " +
        (on
          ? "border-transparent bg-blue-100 text-blue-700"
          : "border-[var(--iamx-border)] bg-layer text-[var(--iamx-fg)] hover:bg-[var(--iamx-bg-hover)]")
      }
    >
      {!value && on && <Icon name="check" size={12} />}
      <span>{label}</span>
      {value != null && (
        <>
          <span className="opacity-50">·</span>
          <span className="font-medium">{value}</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onClear?.();
            }}
            className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-white/50 ml-0.5"
          >
            <Icon name="x" size={11} />
          </span>
        </>
      )}
    </button>
  );
}
