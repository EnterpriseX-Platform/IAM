"use client";

import { tx } from "@/lib/i18n";
import { Tag } from "@carbon/react";
import { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
type Size = "xs" | "sm";

// 16/11/69: ป้ายจาก @carbon/react Tag
const TYPE = { neutral: "gray", accent: "blue", success: "green", warning: "warm-gray", danger: "red" } as const;

export function Badge({ tone = "neutral", children, size = "sm" }: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  size?: Size;
}) {
  return <Tag type={TYPE[tone]} size={size === "xs" ? "sm" : "md"} className="!m-0">{children}</Tag>;
}

export function StatusPill({ active, activeLabel = tx("ใช้งาน"), inactiveLabel = tx("ปิดใช้งาน") }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--iamx-fg)]">
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-gray-300"}`} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
