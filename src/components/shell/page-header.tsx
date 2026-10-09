"use client";

import { useCallback, useSyncExternalStore } from "react";
import { PinIcon } from "@/components/icons";
import { isPinned, togglePinned } from "./local-lists";

const PINS_CHANGED = "sos:pins-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(PINS_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PINS_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Every page's title bar, with the pin icon that adds it to Search's pinned pages (00-global.md §1.1). */
export function PageHeader({ title, href, userId, children }: { title: string; href: string; userId: string; children?: React.ReactNode }) {
  const pinned = useSyncExternalStore(subscribe, () => isPinned(userId, href), () => false);
  const toggle = useCallback(() => {
    togglePinned(userId, { label: title, href });
    window.dispatchEvent(new Event(PINS_CHANGED));
  }, [userId, title, href]);
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <button type="button" onClick={toggle}
          aria-pressed={pinned} aria-label={pinned ? `Unpin ${title}` : `Pin ${title} to Search`} title={pinned ? "Pinned to Search" : "Pin to Search"}
          className={`grid size-11 place-items-center rounded-lg hover:bg-surface-2 ${pinned ? "text-brand-text" : "text-ink-2"}`}>
          <PinIcon className={`size-5 ${pinned ? "fill-current" : ""}`} />
        </button>
      </div>
      {children}
    </div>
  );
}
