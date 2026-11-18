export function LogoMark({ size = 20, color = "currentColor", accent = "#4589ff", stroke = 6 }: { size?: number; color?: string; accent?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path d="M4 44 V4 H30" fill="none" stroke={color} strokeWidth={stroke} />
      <path d="M44 4 V44 H18" fill="none" stroke={color} strokeWidth={stroke} />
      <rect x="18" y="18" width="12" height="12" fill={accent} />
    </svg>
  );
}

export function Logo({ size = 20, color, accent, textClass = "text-[14px] font-semibold" }: { size?: number; color?: string; accent?: string; textClass?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="IAMX">
      <LogoMark size={size} color={color} accent={accent} />
      <span className={textClass}>IAMX</span>
    </span>
  );
}
