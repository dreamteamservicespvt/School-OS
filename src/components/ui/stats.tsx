import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Card } from "./card";
import { cx } from "./cx";

// Numbers at the top of a page and the one bold moment (design/ui-prototype/src/kit.jsx Stats, Band).

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";
export const TONE_TEXT: Record<string, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", brand: "text-brand", neutral: "" };
export const TONE_SOFT: Record<string, string> = { ok: "bg-ok/10 text-ok", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", brand: "bg-brand/10 text-brand", neutral: "bg-sunken text-ink2" };

export type StatItem = { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: LucideIcon; href?: string };

const STAT_GRID: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4", 5: "grid-cols-2 xl:grid-cols-5", 6: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" };

/** Hairline-separated number tiles in one card. */
export function Stats({ items, className }: { items: StatItem[]; className?: string }) {
  const n = Math.min(items.length, 6);
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className={cx("grid gap-px bg-line/70", STAT_GRID[n])}>
        {items.map((m, i) => {
          const Ic = m.icon;
          const body = (
            <>
              <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5 truncate">{Ic && <Ic size={14} className="shrink-0" aria-hidden="true" />}{m.label}</p>
              <p className={cx("font-semibold text-[19px] md:text-[21px] tnum mt-0.5 font-display tracking-tight leading-tight truncate", m.tone && TONE_TEXT[m.tone])}>{m.value}</p>
              {m.sub && <p className="text-[12px] text-ink3 truncate">{m.sub}</p>}
            </>
          );
          const cls = cx("block bg-surface text-left px-4 md:px-5 py-3.5 min-w-0", m.href && "hover:bg-sunken/60 transition", n === 5 && i === 4 && "col-span-2 xl:col-span-1");
          return m.href ? <Link key={m.label} href={m.href} className={cls}>{body}</Link> : <div key={m.label} className={cls}>{body}</div>;
        })}
      </div>
    </Card>
  );
}

export type BandItem = { label: string; big: React.ReactNode; foot?: React.ReactNode; href?: string };

const BAND_GRID: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-2 lg:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4" };
const BAND_CELL: Record<number, string[]> = {
  2: ["border-r", ""],
  3: ["border-r border-b lg:border-b-0", "border-b lg:border-b-0 lg:border-r", "col-span-2 lg:col-span-1"],
  4: ["border-r border-b xl:border-b-0", "border-b xl:border-b-0 xl:border-r", "border-r", ""],
};

/** The one bold coloured moment on a page. */
export function Band({ items, className }: { items: BandItem[]; className?: string }) {
  const n = Math.max(2, Math.min(items.length, 4));
  return (
    <section className={cx("relative overflow-hidden rounded-3xl bg-brand text-brandink shadow-pop", className)}>
      <div className="absolute inset-0 dotgrid opacity-60 pointer-events-none" aria-hidden="true" />
      <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full bg-white/10 blur-2xl pointer-events-none" aria-hidden="true" />
      <div className={cx("relative grid", BAND_GRID[n])}>
        {items.slice(0, 4).map((m, i) => {
          const body = (
            <>
              <p className="text-[12.5px] md:text-[13px] font-semibold opacity-80 flex items-center gap-1">{m.label}{m.href && <ChevronRight size={14} className="opacity-60" aria-hidden="true" />}</p>
              <p className="font-display text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight tnum mt-1 truncate">{m.big}</p>
              {m.foot && <p className="text-[12px] md:text-[13px] opacity-75 mt-0.5 truncate">{m.foot}</p>}
            </>
          );
          const cls = cx("block text-left p-4 md:p-6 min-w-0 border-white/15", m.href && "hover:bg-white/[.07] transition", BAND_CELL[n][i]);
          return m.href ? <Link key={m.label} href={m.href} className={cls}>{body}</Link> : <div key={m.label} className={cls}>{body}</div>;
        })}
      </div>
    </section>
  );
}
