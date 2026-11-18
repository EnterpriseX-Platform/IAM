"use client";

import { Fragment, ReactNode } from "react";
import { Icon } from "./Icon";

export function PageHeader({
  title, description, actions, breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode[];
}) {
  return (
    <div className="pt-5 pb-4 px-6 border-b border-[var(--iamx-border)] bg-[var(--iamx-bg)] sticky top-0 z-20">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1.5 text-[12px] text-[var(--iamx-fg-muted)] mb-2">
          {breadcrumb.map((b, i) => (
            <Fragment key={i}>
              {i > 0 && <Icon name="chevronRight" size={12} className="opacity-60" />}
              <span className={i === breadcrumb.length - 1 ? "text-[var(--iamx-fg)] font-medium" : ""}>
                {b}
              </span>
            </Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-[var(--iamx-fg)] tracking-tight">{title}</h1>
          {description && (
            <p className="text-[13px] text-[var(--iamx-fg-muted)] mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
