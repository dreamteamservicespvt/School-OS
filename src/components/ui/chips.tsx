import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Info, CircleCheck, TriangleAlert } from "lucide-react";
import { cx } from "./cx";
import { TONE_TEXT } from "./stats";
import { tx } from "@/lib/i18n/tx";

// Filter chips, in-page tabs and banners of the approved design (design/ui-prototype/src/kit.jsx, ui.jsx).

export type ChipOption = { value: string; label: React.ReactNode; count?: number | null; href: string };

/** One chip's look, for chip-like controls that are not links. */
export const chipCls = (on: boolean) => cx(
  "h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2 whitespace-nowrap",
  on ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink",
);

/** Quick filter chips that scroll sideways on phones. Each chip is a link that keeps the other filters. */
export function Chips({ value, options, className, label = "Quick filters" }: { value: string; options: ChipOption[]; className?: string; label?: string }) {
  return (
    <nav aria-label={label} className={cx("-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar", className)}>
      <div className="flex gap-2 w-max pb-1">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <Link key={o.value} href={o.href} scroll={false} aria-current={on ? "page" : undefined}
              className={chipCls(on)}>
              {tx(o.label)}{o.count != null && <span className={cx("text-[11.5px] tnum", on ? "opacity-70" : "text-ink3")}>{o.count}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Tabs inside a page, kept in the page address (?tab=). Same look as the module tabs. */
export function LinkTabs({ value, tabs, className, label = "Views" }: { value: string; tabs: { id: string; label: string; count?: number; href: string }[]; className?: string; label?: string }) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line">
        {tabs.map((t) => {
          const on = value === t.id;
          return (
            <li key={t.id} className="shrink-0">
              <Link href={t.href} scroll={false} aria-current={on ? "page" : undefined}
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

const BANNER: Record<string, string> = { info: "bg-info/8", ok: "bg-ok/10", warn: "bg-warn/12", bad: "bg-bad/10", brand: "bg-brand/8" };
const BANNER_ICON: Record<string, LucideIcon> = { info: Info, ok: CircleCheck, warn: TriangleAlert, bad: TriangleAlert, brand: Info };

/** A calm message strip. */
export function Banner({ tone = "info", icon, title, children, action, className }: { tone?: "info" | "ok" | "warn" | "bad" | "brand"; icon?: LucideIcon; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const Ic = icon ?? BANNER_ICON[tone];
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cx("rounded-2xl px-4 py-3 flex flex-wrap md:flex-nowrap items-start md:items-center gap-3 text-[14px]", BANNER[tone], className)}>
      <Ic size={19} className={cx("shrink-0 mt-0.5 md:mt-0", TONE_TEXT[tone])} aria-hidden="true" />
      <p className="text-ink2 flex-1 min-w-0 basis-[calc(100%-2.5rem)] md:basis-auto">{title && <b className="font-semibold text-ink">{tx(title)} </b>}{tx(children)}</p>
      {action && <div className="max-w-full md:shrink-0 flex gap-2 flex-wrap pl-8 md:pl-0">{action}</div>}
    </div>
  );
}
