import Link from "next/link";
import { cx } from "./cx";

// Filter chips (design/ui-prototype/src/kit.jsx Chips). Each chip is a link,
// so the choice lives in the page address and can be shared (P2). They scroll
// sideways on phones.

export type ChipOption = { value: string; label: React.ReactNode; count?: number | null; href: string };

export const chipCls = (on: boolean) => cx(
  "h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2 whitespace-nowrap",
  on ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink",
);

export function Chips({ value, options, className, label }: { value: string; options: ChipOption[]; className?: string; label: string }) {
  return (
    <nav aria-label={label} className={cx("-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar", className)}>
      <div className="flex gap-2 w-max pb-1">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <Link key={o.value} href={o.href} scroll={false} aria-current={on ? "true" : undefined} className={chipCls(on)}>
              {o.label}
              {o.count != null && <span className={cx("text-[11.5px] tnum", on ? "opacity-70" : "text-ink3")}>{o.count}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
