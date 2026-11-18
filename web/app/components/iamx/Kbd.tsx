"use client";

import { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded text-[10.5px] font-mono text-[var(--iamx-fg-muted)] bg-[var(--iamx-bg-hover)] border border-[var(--iamx-border)]">
      {children}
    </kbd>
  );
}
