import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "./card";
import { cx } from "./cx";

// Numbers at the top of a page, with hairlines between tiles (design/ui-prototype/src/kit.jsx Stats).

export type Tone = "ok" | "warn" | "bad" | "info" | "brand";
export const TONE_TEXT: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", brand: "text-brand" };
export const TONE_SOFT: Record<Tone | "neutral", string> = { ok: "bg-ok/10 text-ok", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", brand: "bg-brand/10 text-brand", neutral: "bg-sunken text-ink2" };

export type StatItem = { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: LucideIcon; href?: string };

const GRID: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4", 5: "grid-cols-2 xl:grid-cols-5", 6: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" };

export function Stats({ items, className }: { items: StatItem[]; className?: string }) {
  const n = Math.min(items.length, 6);
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className={cx("grid gap-px bg-line/70", GRID[n])}>
        {items.map((m, i) => {
          const Ic = m.icon;
          const cls = cx("bg-surface text-left px-4 md:px-5 py-3.5 min-w-0 block", m.href && "hover:bg-sunken/60 transition", n === 5 && i === 4 && "col-span-2 xl:col-span-1");
          const body = (
            <>
              <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5 truncate">{Ic && <Ic size={14} className="shrink-0" aria-hidden="true" />}{m.label}</p>
              <p className={cx("font-semibold text-[19px] md:text-[21px] tnum mt-0.5 font-display tracking-tight leading-tight truncate", m.tone && TONE_TEXT[m.tone])}>{m.value}</p>
              {m.sub && <p className="text-[12px] text-ink3 truncate">{m.sub}</p>}
            </>
          );
          return m.href ? <Link key={m.label} href={m.href} className={cls}>{body}</Link> : <div key={m.label} className={cls}>{body}</div>;
        })}
      </div>
    </Card>
  );
}
