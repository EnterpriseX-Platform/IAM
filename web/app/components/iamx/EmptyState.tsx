"use client";

import { ReactNode } from "react";
import { Icon, IconName } from "./Icon";

export function EmptyState({
  icon = "box", title, hint, action,
}: {
  icon?: IconName;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-10 w-10 rounded-lg bg-[var(--iamx-bg-hover)] text-[var(--iamx-fg-muted)] flex items-center justify-center mb-3">
        <Icon name={icon} size={18} />
      </div>
      <div className="text-[14px] font-medium text-[var(--iamx-fg)]">{title}</div>
      {hint && <div className="text-[12.5px] text-[var(--iamx-fg-muted)] mt-1 max-w-sm">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
