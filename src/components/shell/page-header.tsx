"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Pin } from "lucide-react";
import { cx } from "@/components/ui/cx";
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

/**
 * Every page's title block in the approved design, with the pin that adds the page
 * to Search's pinned pages (00-global.md §1.1). Actions go in `children`.
 */
export function PageHeader({ title, href, userId, sub, crumbs, children, pinLabel, badge }: { title: string; href: string; userId: string; sub?: React.ReactNode; crumbs?: React.ReactNode; children?: React.ReactNode; /** The page's own name, when the title is the module's short name. */ pinLabel?: string; badge?: React.ReactNode }) {
  const label = pinLabel ?? title;
  const pinned = useSyncExternalStore(subscribe, () => isPinned(userId, href), () => false);
  const toggle = useCallback(() => {
    togglePinned(userId, { label, href });
    window.dispatchEvent(new Event(PINS_CHANGED));
  }, [userId, label, href]);
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-5">
      <div className="min-w-0">
        {crumbs && <div className="text-[13px] text-ink3 mb-1 flex items-center gap-1.5 flex-wrap">{crumbs}</div>}
        <div className="flex flex-wrap items-center gap-1.5">
          <h1 className="font-display text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight">{title}{badge}</h1>
          <button type="button" onClick={toggle}
            aria-pressed={pinned} aria-label={pinned ? `Unpin ${label}` : `Pin ${label} to Search`} title={pinned ? "Pinned to Search" : "Pin to Search"}
            className={cx("grid size-9 place-items-center rounded-xl transition hover:bg-sunken", pinned ? "text-brand" : "text-ink3")}>
            <Pin size={17} className={pinned ? "fill-current" : ""} aria-hidden="true" />
          </button>
        </div>
        {sub && <p className="text-ink3 text-[15px] mt-1">{sub}</p>}
      </div>
      {children && <div className="flex gap-2 flex-wrap items-center">{children}</div>}
    </div>
  );
}
