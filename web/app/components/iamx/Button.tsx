"use client";

import { Button as CButton, IconButton as CIconButton } from "@carbon/react";
import { ButtonHTMLAttributes, ReactNode } from "react";
import { carbonIcon, IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerPrimary";
type Size = "xs" | "sm" | "md";

const KIND = {
  primary: "primary", secondary: "secondary", ghost: "ghost", danger: "danger--tertiary", dangerPrimary: "danger",
} as const;
const SIZE = { xs: "sm", sm: "sm", md: "md" } as const;

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  children?: ReactNode;
  type?: "button" | "submit" | "reset";
}

export function Button({ variant = "primary", size = "sm", icon, children, className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <CButton
      {...(rest as Record<string, unknown>)}
      type={type}
      kind={KIND[variant]}
      size={SIZE[size]}
      renderIcon={icon ? carbonIcon(icon) : undefined}
      hasIconOnly={false}
      className={`iamx-btn ${className}`}
    >
      {children}
    </CButton>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  icon: IconName;
  label: string;
  variant?: "default" | "danger";
}

export function IconButton({ icon, label, variant = "default", className = "", ...rest }: IconButtonProps) {
  const Cmp = carbonIcon(icon);
  return (
    <CIconButton
      {...(rest as Record<string, unknown>)}
      label={label}
      kind="ghost"
      size="sm"
      align="bottom"
      className={`${variant === "danger" ? "iamx-icon-danger " : ""}${className}`}
    >
      <Cmp size={16} />
    </CIconButton>
  );
}
