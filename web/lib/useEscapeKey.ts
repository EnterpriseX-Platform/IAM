"use client";

import { useEffect } from "react";

/**
 * Calls `onEscape` when the user presses Escape, but only while `active` is
 * true. Use this to make modal backdrops dismiss-on-Escape:
 *
 *   const [showModal, setShowModal] = useState(false);
 *   useEscapeKey(showModal, () => setShowModal(false));
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}
