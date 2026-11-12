"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "./cx";
import { useT } from "@/lib/i18n/client";

export type Tab = { href: string; label: string; exact?: boolean; count?: number; /** Other page addresses (prefixes) that belong to this tab. */ also?: string[] };

/**
 * A module's pages as tabs that scroll sideways on phones (design/ui-prototype/src/ui.jsx).
 * When the row is wider than the page, ./scroll-hints.tsx marks the side with more (data-more),
 * which fades that edge; on a computer a round arrow button also shows on that side, so a tab
 * cut off at the edge ("Message Se…", QA LC19) is clearly more to see and one click away.
 * The arrows are for the mouse only: keyboard focus on a tab scrolls it into view by itself.
 */
export function Tabs({ tabs, label, className }: { tabs: Tab[]; label: string; className?: string }) {
  const t = useT();
  const pathname = usePathname();
  const row = useRef<HTMLUListElement>(null);
  const slide = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * Math.max(160, row.current.clientWidth * 0.6), behavior: "smooth" });
  const arrow = "absolute top-1/2 -translate-y-1/2 z-10 hidden size-8 place-items-center rounded-full border border-line bg-surface text-ink2 shadow-card hover:text-ink";
  return (
    <nav aria-label={t.any(label)} className={cx("relative -mx-4 px-4 md:mx-0 md:px-0 mb-5", className)}>
      <ul ref={row} className="peer flex gap-1 overflow-x-auto no-scrollbar border-b border-line">
        {tabs.map((tab) => {
          const on = (tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`)) || Boolean(tab.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
          return (
            <li key={tab.href} className="shrink-0">
              <Link href={tab.href} aria-current={on ? "page" : undefined}
                className={cx("relative flex items-center h-11 px-3.5 text-sm font-semibold whitespace-nowrap transition", on ? "text-brand" : "text-ink2 hover:text-ink")}>
                {t.any(tab.label)}
                {tab.count != null && <span className="ml-1.5 text-xs text-ink3 tnum">{tab.count}</span>}
                {on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-brand" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => slide(-1)}
        className={cx(arrow, "left-0 pointer-fine:peer-data-[more=left]:grid pointer-fine:peer-data-[more=both]:grid")}><ChevronLeft size={16} /></button>
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => slide(1)}
        className={cx(arrow, "right-0 pointer-fine:peer-data-[more=right]:grid pointer-fine:peer-data-[more=both]:grid")}><ChevronRight size={16} /></button>
    </nav>
  );
}
