"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

export type ExamTab = { href: string; label: string; path: string };

/** The module's pages as tabs that scroll sideways on phones; the year being viewed goes along (P18). */
export function ExamTabs({ tabs }: { tabs: ExamTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Examination & Results pages" className="no-print -mx-4 px-4 md:mx-0 md:px-0 mb-5">
      <ul className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line">
        {tabs.map((t) => {
          const on = pathname === t.path || pathname.startsWith(`${t.path}/`);
          return (
            <li key={t.path} className="shrink-0">
              <Link href={t.href} aria-current={on ? "page" : undefined}
                className={cx("relative flex items-center h-11 px-3.5 text-sm font-semibold whitespace-nowrap transition", on ? "text-brand" : "text-ink2 hover:text-ink")}>
                {t.label}
                {on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-brand" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
