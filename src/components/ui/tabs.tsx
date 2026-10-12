"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";

export type Tab = { href: string; label: string; exact?: boolean; count?: number; /** Other page addresses (prefixes) that belong to this tab. */ also?: string[] };

/** A module's pages as tabs that scroll sideways on phones (design/ui-prototype/src/ui.jsx). */
export function Tabs({ tabs, label, className }: { tabs: Tab[]; label: string; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={cx("-mx-4 px-4 md:mx-0 md:px-0 mb-5", className)}>
      <ul className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line">
        {tabs.map((t) => {
          const on = (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`)) || Boolean(t.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
          return (
            <li key={t.href} className="shrink-0">
              <Link href={t.href} aria-current={on ? "page" : undefined}
                className={cx("relative flex items-center h-11 px-3.5 text-sm font-semibold whitespace-nowrap transition", on ? "text-brand" : "text-ink2 hover:text-ink")}>
                {t.label}
                {t.count != null && <span className="ml-1.5 text-xs text-ink3 tnum">{t.count}</span>}
                {on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-brand" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
