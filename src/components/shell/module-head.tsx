"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Eye, Pin, User } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { Pill } from "@/components/ui/badge";
import { Tabs, type Tab } from "@/components/ui/tabs";
import { isPinned, togglePinned } from "./local-lists";
import { useT } from "@/lib/i18n/client";

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
 * A module page's head in the approved design (design/ui-prototype/src/kit.jsx ModuleHead): the module's
 * name as the title with "View only" or "Only yours" when the person's access is limited, one line of
 * context, the page's actions, then the module's pages as tabs. The pin adds this page (by its own
 * name) to Search's pinned pages (00-global.md §1.1).
 */
export function ModuleHead({ title, page: pageIn, pageName, href, userId, sub, access: accessIn, reach, actions, tabs, tabsLabel }: {
  title: string; page?: string; /** Same as page. */ pageName?: string; href: string; userId: string; sub?: React.ReactNode;
  access?: "full" | "own" | "view"; /** Same as access ("all" is full). */ reach?: "all" | "own" | "view";
  actions?: React.ReactNode; tabs?: Tab[] | null; tabsLabel?: string;
}) {
  const t = useT();
  const page = pageIn ?? pageName ?? title;
  const access = accessIn ?? (reach === "all" ? "full" : reach) ?? "full";
  const pinned = useSyncExternalStore(subscribe, () => isPinned(userId, href), () => false);
  const toggle = useCallback(() => {
    togglePinned(userId, { label: page, href });
    window.dispatchEvent(new Event(PINS_CHANGED));
  }, [userId, page, href]);
  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="font-display text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight">
              {t.any(title)}
              {access === "view" && <Pill tone="neutral" className="align-middle ml-2 !h-6"><Eye size={13} aria-hidden="true" />{t("View only")}</Pill>}
              {access === "own" && <Pill tone="brand" className="align-middle ml-2 !h-6"><User size={13} aria-hidden="true" />{t("Only yours")}</Pill>}
            </h1>
            <button type="button" onClick={toggle}
              aria-pressed={pinned} aria-label={pinned ? t("Unpin {page}", { page: t.any(page) }) : t("Pin {page} to Search", { page: t.any(page) })} title={pinned ? t("Pinned to Search") : t("Pin to Search")}
              className={cx("grid size-9 place-items-center rounded-xl transition hover:bg-sunken", pinned ? "text-brand" : "text-ink3")}>
              <Pin size={17} className={pinned ? "fill-current" : ""} aria-hidden="true" />
            </button>
          </div>
          {sub && <p className="text-ink3 text-[15px] mt-1">{typeof sub === "string" ? t.any(sub) : sub}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap items-center">{actions}</div>}
      </div>
      {tabs && tabs.length > 1 && <Tabs tabs={tabs} label={tabsLabel ?? t("{module} pages", { module: t.any(title) })} />}
    </>
  );
}
