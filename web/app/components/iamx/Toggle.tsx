"use client";

// 16/11/69: สวิตช์จาก @carbon/react · props เดิมคงไว้
import { Toggle as CToggle } from "@carbon/react";
import { ReactNode, useId } from "react";

export function Toggle({ checked, onChange, size = "md", label, sublabel }: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  size?: "sm" | "md";
  label?: ReactNode;
  sublabel?: ReactNode;
}) {
  const id = useId();
  const sw = (
    <CToggle
      id={id}
      size={size === "sm" ? "sm" : "md"}
      toggled={checked}
      onToggle={(v: boolean) => onChange?.(v)}
      labelText=""
      aria-label={typeof label === "string" ? label : "Toggle"}
      hideLabel
    />
  );
  if (!label) return sw;
  return (
    <div className="inline-flex items-start gap-2.5">
      {sw}
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <div className="text-[13px] text-[var(--iamx-fg)]">{label}</div>
        {sublabel && <div className="text-[11.5px] text-[var(--iamx-fg-muted)] mt-0.5">{sublabel}</div>}
      </label>
    </div>
  );
}
