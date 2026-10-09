"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { href: string; label: string; exact?: boolean; /** Other page addresses (prefixes) that belong to this tab. */ also?: string[] };

/** The pages inside a module, as tabs that scroll sideways on phones. */
export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 mb-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`)) || Boolean(t.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined}
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
