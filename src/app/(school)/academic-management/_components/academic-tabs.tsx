"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type AcademicTab = { href: string; label: string; exact?: boolean };

/** The module's pages as tabs; the year being viewed goes along (P18). */
export function AcademicTabs({ tabs }: { tabs: AcademicTab[] }) {
  const pathname = usePathname();
  const year = useSearchParams().get("year");
  return (
    <nav aria-label="Academic Management pages" className="no-print -mx-4 mb-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link href={year ? `${t.href}?year=${year}` : t.href} aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center border-b-2 px-3 text-[15px] ${active ? "border-brand font-medium text-brand-text" : "border-transparent text-ink-2 hover:text-ink"}`}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
