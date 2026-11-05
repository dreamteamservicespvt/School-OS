"use client";

// A drop-down drawn in front of the page, next to its button (src/lib/menu-place.ts):
// a card's hidden overflow can no longer cut it off, it opens upward when there is
// more room above, and it scrolls when it is taller than the screen (owner test
// 2026-11-05, student profile "..." menu). Inside an open dialog it is drawn in
// the dialog, so it stays in front of it.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { placeMenu, type Placed } from "@/lib/menu-place";
import { cx } from "./cx";

export function Floating({ anchor, panel, align = "right", focusFirst, className, children, ...rest }: {
  /** The button (or its wrapper) the panel opens from. */
  anchor: React.RefObject<HTMLElement | null>;
  /** The panel itself, so the page can tell a click inside it from one outside. */
  panel: React.RefObject<HTMLDivElement | null>;
  align?: "left" | "right";
  /** Put the cursor on the first element matching this once the panel shows (a menu's first item). */
  focusFirst?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const [place, setPlace] = useState<Placed | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHost(anchor.current?.closest("dialog") ?? document.body));
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  useEffect(() => {
    const a = anchor.current;
    if (!host || !a) return;
    const update = () => {
      const p = panel.current;
      setPlace(placeMenu({
        anchor: a.getBoundingClientRect(), align,
        menu: { width: p?.offsetWidth ?? 240, height: p?.scrollHeight ?? 0 },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }));
    };
    // Drawn hidden first so its real size is known; then it follows the button when the page scrolls or resizes.
    const frame = requestAnimationFrame(() => {
      update();
      if (focusFirst) panel.current?.querySelector<HTMLElement>(focusFirst)?.focus({ preventScroll: true });
    });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [host, anchor, panel, align, focusFirst]);

  if (!host) return null;
  return createPortal(
    <div ref={panel} {...rest}
      style={{ position: "fixed", top: place?.top ?? 0, left: place?.left ?? 0, maxHeight: place?.maxHeight, visibility: place ? undefined : "hidden" }}
      className={cx("z-50 overflow-y-auto overscroll-contain scroll-thin", className)}>
      {children}
    </div>,
    host,
  );
}
