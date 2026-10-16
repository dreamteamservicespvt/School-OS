"use client";

// A module page's header in the approved design (design/ui-prototype/src/kit.jsx ModuleHead):
// the module's short name, one line about this page, the actions on the right, the "View only"
// or "Only yours" mark, the pin that adds the page to Search (00-global.md §1.1), and the
// module's pages as tabs underneath.

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Pin, User } from "lucide-react";
import { cx } from "./cx";
import { Pill } from "./badge";
import { Tabs, type Tab } from "./tabs";
import { isPinned, togglePinned } from "@/components/shell/local-lists";

const PINS_CHANGED = "sos:pins-changed";
function subscribe(onChange: () => void) {
  window.addEventListener(PINS_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PINS_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function PinButton({ label, href, userId }: { label: string; href: string; userId: string }) {
  const pinned = useSyncExternalStore(subscribe, () => isPinned(userId, href), () => false);
  const toggle = useCallback(() => {
    togglePinned(userId, { label, href });
    window.dispatchEvent(new Event(PINS_CHANGED));
  }, [userId, label, href]);
  return (
    <button type="button" onClick={toggle} aria-pressed={pinned} aria-label={pinned ? `Unpin ${label}` : `Pin ${label} to Search`} title={pinned ? "Pinned to Search" : "Pin to Search"}
      className={cx("grid size-9 place-items-center rounded-xl transition hover:bg-sunken shrink-0", pinned ? "text-brand" : "text-ink3")}>
      <Pin size={17} className={pinned ? "fill-current" : ""} aria-hidden="true" />
    </button>
  );
}

export type ModuleScope = "view" | "own" | null;

export function ModuleHead({ title, page, href, userId, sub, scope, actions, tabs, tabsLabel }: {
  /** The module's short name, e.g. "Students". */
  title: string;
  /** This page's name (blueprint words), used for the pin and the browser. */
  page: string;
  href: string;
  userId: string;
  sub?: React.ReactNode;
  scope?: ModuleScope;
  actions?: React.ReactNode;
  tabs?: Tab[];
  tabsLabel?: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="font-display text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight">
              {title}
              {scope === "view" && <Pill tone="neutral" className="align-middle ml-2 !h-6"><Eye size={13} aria-hidden="true" />View only</Pill>}
              {scope === "own" && <Pill tone="brand" className="align-middle ml-2 !h-6"><User size={13} aria-hidden="true" />Only yours</Pill>}
            </h1>
            <PinButton label={page} href={href} userId={userId} />
          </div>
          {sub && <p className="text-ink3 text-[15px] mt-1">{sub}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap items-center">{actions}</div>}
      </div>
      {tabs && tabs.length > 1 && <Tabs label={tabsLabel ?? `${title} pages`} tabs={tabs} />}
    </>
  );
}

/** "← Students / 7 B": the way back from a record to its list. */
export function BackLink({ href, label, sub }: { href: string; label: string; sub?: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <ArrowLeft size={17} aria-hidden="true" />{label} {sub && <span className="text-ink3 font-normal">/ {sub}</span>}
    </Link>
  );
}
