"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { Pin } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { isPinned, togglePinned } from "./local-lists";
import { useT } from "@/lib/i18n/client";
import { screenLine } from "@/lib/i18n/messages";
import { findModule } from "@/lib/modules";

const PINS_CHANGED = "sos:pins-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(PINS_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PINS_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** A module's page tabs, set by the module's layout, so PageHeader shows them under the title as every other module does (layman loop 5). */
const PageTabsContext = createContext<React.ReactNode>(null);
export function PageTabs({ tabs, children }: { tabs: React.ReactNode; children: React.ReactNode }) {
  return <PageTabsContext.Provider value={tabs}>{children}</PageTabsContext.Provider>;
}

/** The module's menu name for a page address ("/settings/users" → "Settings"), shown small above a page title that differs from it. */
export function moduleNameFor(href: string): string | null {
  return findModule(href.split(/[/?#]/)[1] ?? "")?.name ?? null;
}

/**
 * Every page's title block in the approved design, with the pin that adds the page
 * to Search's pinned pages (00-global.md §1.1). Actions go in `children`.
 */
export function PageHeader({ title, href, userId, sub, crumbs, children, pinLabel, badge }: { title: string; href: string; userId: string; sub?: React.ReactNode; crumbs?: React.ReactNode; children?: React.ReactNode; /** The page's own name, when the title is the module's short name. */ pinLabel?: string; badge?: React.ReactNode }) {
  const t = useT();
  const tabs = useContext(PageTabsContext);
  const label = pinLabel ?? title;
  const moduleName = moduleNameFor(href);
  const pinned = useSyncExternalStore(subscribe, () => isPinned(userId, href), () => false);
  const toggle = useCallback(() => {
    togglePinned(userId, { label, href });
    window.dispatchEvent(new Event(PINS_CHANGED));
  }, [userId, label, href]);
  return (
    <>
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-5">
      <div className="min-w-0">
        {crumbs ? <div className="text-[13px] text-ink3 mb-1 flex items-center gap-1.5 flex-wrap">{crumbs}</div>
          : moduleName && moduleName.toLowerCase() !== title.trim().toLowerCase() ? <p className="text-[13px] font-semibold text-ink3 mb-0.5">{t.any(moduleName)}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <h1 className="font-display text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight">{t.any(title)}{badge}</h1>
          <button type="button" onClick={toggle}
            aria-pressed={pinned} aria-label={pinned ? t("Unpin {page}", { page: t.any(label) }) : t("Pin {page} to Search", { page: t.any(label) })} title={pinned ? t("Pinned to Search") : t("Pin to Search")}
            className={cx("grid size-9 max-md:size-11 place-items-center rounded-xl transition hover:bg-sunken", pinned ? "text-brand" : "text-ink3")}>
            <Pin size={17} className={pinned ? "fill-current" : ""} aria-hidden="true" />
          </button>
        </div>
        {sub && <p className="text-ink3 text-[15px] mt-1">{typeof sub === "string" ? screenLine(t, sub) : sub}</p>}
      </div>
      {children && <div className="flex gap-2 flex-wrap items-center">{children}</div>}
    </div>
    {tabs}
    </>
  );
}
