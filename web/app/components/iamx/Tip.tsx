"use client";

import { cloneElement, isValidElement, ReactElement, ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Position = "top" | "bottom" | "right" | "left";

function place(rect: DOMRect, position: Position) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const edge = 40;

  if (position === "top" && rect.top < edge) position = "bottom";
  else if (position === "bottom" && rect.bottom > vh - edge) position = "top";
  else if (position === "left" && rect.left < edge) position = "right";
  else if (position === "right" && rect.right > vw - edge) position = "left";

  switch (position) {
    case "top":
      return { left: rect.left + rect.width / 2, top: rect.top - 6, transform: "translate(-50%, -100%)" };
    case "bottom":
      return { left: rect.left + rect.width / 2, top: rect.bottom + 6, transform: "translate(-50%, 0)" };
    case "right":
      return { left: rect.right + 6, top: rect.top + rect.height / 2, transform: "translate(0, -50%)" };
    case "left":
      return { left: rect.left - 6, top: rect.top + rect.height / 2, transform: "translate(-100%, -50%)" };
  }
}

export function Tip({
  tip, children, position = "top",
}: {
  tip: ReactNode;
  children: ReactElement;
  position?: Position;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; transform: string } | null>(null);

  if (!isValidElement(children)) return <>{children}</>;

  const show = () => {
    const el = ref.current;
    if (!el) return;
    setCoords(place(el.getBoundingClientRect(), position));
  };
  const hide = () => setCoords(null);

  const child = cloneElement(children as ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      ref.current = node;
      const orig = (children as any).ref;
      if (typeof orig === "function") orig(node);
      else if (orig && typeof orig === "object") orig.current = node;
    },
    onMouseEnter: (e: any) => {
      (children.props as any).onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: any) => {
      (children.props as any).onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: any) => {
      (children.props as any).onFocus?.(e);
      show();
    },
    onBlur: (e: any) => {
      (children.props as any).onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {coords && typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[100] px-1.5 py-0.5 rounded text-[11px] bg-[var(--iamx-fg)] text-[var(--iamx-bg)] whitespace-nowrap shadow"
            style={{ left: coords.left, top: coords.top, transform: coords.transform }}
          >
            {tip}
          </span>,
          document.body
        )}
    </>
  );
}
