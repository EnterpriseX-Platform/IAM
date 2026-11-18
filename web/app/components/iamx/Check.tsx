"use client";

// 16/11/69: checkbox / radio จาก @carbon/react — รับ props แบบ <input> เดิม (onChange ได้ event จริง e.target.checked)
import { Checkbox as CCheckbox, RadioButton as CRadio } from "@carbon/react";
import { ChangeEvent, forwardRef, InputHTMLAttributes, useId } from "react";

type P = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & { label?: string };

export const Checkbox = forwardRef<HTMLInputElement, P>(function Checkbox({ id, onChange, className, style, label, ...rest }, ref) {
  const auto = useId();
  return (
    <span className={`iamx-check inline-flex ${className || ""}`} onClick={(e) => e.stopPropagation()}>
      <CCheckbox
        {...(rest as Record<string, unknown>)}
        ref={ref}
        id={id || auto}
        labelText={label || ""}
        hideLabel={!label}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e)}
      />
    </span>
  );
});

export function Radio({ id, onChange, className, style, label, value, ...rest }: P) {
  const auto = useId();
  return (
    <span className={`iamx-check inline-flex ${className || ""}`}>
      <CRadio
        {...(rest as Record<string, unknown>)}
        id={id || auto}
        value={value as string}
        labelText={label || ""}
        hideLabel={!label}
        onChange={(_v: unknown, _n: unknown, e: ChangeEvent<HTMLInputElement>) => onChange?.(e)}
      />
    </span>
  );
}
