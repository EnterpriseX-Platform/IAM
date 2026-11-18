"use client";
import Select2 from "../Select2";

import { Search, TextArea, TextInput } from "@carbon/react";
import { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes, SelectHTMLAttributes, useId } from "react";
import { IconName } from "./Icon";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value?: string;
  onChange?: (v: string) => void;
  icon?: IconName;
  suffix?: ReactNode;
}

export function Input({ value, onChange, icon, suffix, className = "", id, ...rest }: InputProps) {
  const auto = useId();
  // 16/11/69: ช่องกรอกจาก @carbon/react · ช่องค้นหา (icon=search) ใช้ Carbon Search
  if (icon === "search") {
    return (
      <div className={`w-full ${className}`}>
        <Search
          size="md"
          id={id || auto}
          labelText={String(rest.placeholder || "Search")}
          placeholder={rest.placeholder}
          value={value ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement> | { target: HTMLInputElement | { value: string } }) => onChange?.((e.target as HTMLInputElement).value ?? "")}
          onKeyDown={rest.onKeyDown}
          disabled={rest.disabled}
          autoComplete="off"
        />
      </div>
    );
  }
  return (
    <div className={`relative w-full ${className}`}>
      <TextInput
        {...(rest as Record<string, unknown>)}
        id={id || auto}
        size="md"
        labelText=""
        hideLabel
        value={value ?? ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--iamx-fg-muted)] text-[12px] pointer-events-none">{suffix}</span>}
    </div>
  );
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value?: string;
  onChange?: (v: string) => void;
}

export function Textarea({ value, onChange, rows = 3, className = "", id, ...rest }: TextareaProps) {
  const auto = useId();
  return (
    <div className={className}>
      <TextArea
        {...(rest as Record<string, unknown>)}
        id={id || auto}
        rows={rows}
        labelText=""
        hideLabel
        value={value ?? ""}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value)}
      />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value?: string;
  onChange?: (v: string) => void;
  options: (string | SelectOption)[];
  placeholder?: string;
}

// 13/11/69: ห้ามใช้ native select — ใช้ dropdown ของระบบ (Select2) แทน คง props เดิม
export function Select({
  value, onChange, options, placeholder, className = "", disabled, clearable,
}: SelectProps & { clearable?: boolean }) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : { value: String(o.value), label: o.label }));
  const all = placeholder ? [{ value: "", label: placeholder }, ...opts] : opts;
  return (
    <Select2
      value={value == null ? "" : String(value)}
      onChange={(v) => onChange?.(v)}
      options={all}
      placeholder={placeholder}
      disabled={disabled}
      clearable={clearable ?? !!placeholder}
      className={className}
    />
  );
}

export function FormField({
  label, hint, required, children, className = "",
}: {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-1 ${className}`}>
      {label && (
        <label className="cds--label flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="cds--form__helper-text">{hint}</p>}
    </div>
  );
}
