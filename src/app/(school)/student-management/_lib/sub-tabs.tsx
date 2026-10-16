"use client";

// Second-level tabs inside a Student Management page (for example Leaving, Left, Alumni).
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubTabs({ tabs, label }: { tabs: { href: string; label: string; exact?: boolean; also?: string[]; not?: string[] }[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const on = !t.not?.some((n) => path === n || path.startsWith(`${n}/`)) && ((t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`)) || Boolean(t.also?.some((a) => path === a || path.startsWith(`${a}/`))));
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[15px] ${on ? "bg-brand/8 font-semibold text-brand" : "text-ink2 hover:bg-sunken hover:text-ink"}`}>{t.label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
