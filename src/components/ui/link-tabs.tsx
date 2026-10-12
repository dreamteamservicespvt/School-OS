import Link from "next/link";
import { cx } from "./cx";

export type LinkTab = { href: string; label: string; count?: number | null; on: boolean };

/** Tabs inside a card or page section, each a link that keeps the page address (design/ui-prototype/src/ui.jsx Tabs). */
export function LinkTabs({ tabs, label, className }: { tabs: LinkTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx("flex gap-1 overflow-x-auto no-scrollbar border-b border-line", className)}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} scroll={false} aria-current={t.on ? "page" : undefined}
          className={cx("relative inline-flex items-center h-11 px-3.5 text-sm font-semibold whitespace-nowrap transition shrink-0", t.on ? "text-brand" : "text-ink2 hover:text-ink")}>
          {t.label}
          {t.count != null && <span className="ml-1.5 text-xs text-ink3 tnum">{t.count}</span>}
          {t.on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-brand" aria-hidden="true" />}
        </Link>
      ))}
    </nav>
  );
}
