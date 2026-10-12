import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cx } from "./cx";

// The one bold moment on a page: two to four numbers on the brand colour
// (the approved design's "School today" band, kit.jsx Band and HeroStat).
// Each number opens the exact list behind it when it has an address.

export type BandCell = {
  key: string;
  label: string;
  big: string;
  /** Shown smaller after the number, such as "/ 86". */
  of?: string;
  foot?: string;
  href?: string;
  /** A share (0 to 100) drawn as a ring on wide screens. */
  ring?: number;
};

const GRID: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-2 lg:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4" };
const CELL: Record<number, string[]> = {
  2: ["border-r", ""],
  3: ["border-r border-b lg:border-b-0", "border-b lg:border-b-0 lg:border-r", "col-span-2 lg:col-span-1"],
  4: ["border-r border-b xl:border-b-0", "border-b xl:border-b-0 xl:border-r", "border-r", ""],
};

function HeroRing({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const c = 2 * Math.PI * 24;
  return (
    <svg width="58" height="58" className="-rotate-90 hidden lg:block shrink-0" aria-hidden="true">
      <circle cx="29" cy="29" r="24" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="6" />
      <circle cx="29" cy="29" r="24" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)" }} />
    </svg>
  );
}

export function Band({ items, label, className }: { items: BandCell[]; label: string; className?: string }) {
  const shown = items.slice(0, 4);
  const count = Math.max(2, shown.length);
  return (
    <section aria-label={label} className={cx("relative overflow-hidden rounded-3xl bg-brand text-brandink shadow-pop", className)}>
      <div className="absolute inset-0 dotgrid opacity-60 pointer-events-none" />
      <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className={cx("relative grid", GRID[count])}>
        {shown.map((m, i) => {
          const body = (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] md:text-[13px] font-semibold opacity-80 flex items-center gap-1">
                  <span className="truncate">{m.label}</span>{m.href && <ChevronRight size={14} className="opacity-60 shrink-0" aria-hidden="true" />}
                </p>
                <p className="font-display text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight tnum mt-1 truncate">
                  {m.big}{m.of && <span className="text-[0.55em] opacity-70 font-medium"> {m.of}</span>}
                </p>
                {m.foot && <p className="text-[12px] md:text-[13px] opacity-75 mt-0.5 truncate">{m.foot}</p>}
              </div>
              {m.ring != null && <HeroRing value={m.ring} />}
            </>
          );
          const cls = cx("text-left p-4 md:p-6 min-w-0 border-white/15 flex items-center gap-4", CELL[count][i]);
          return m.href
            ? <Link key={m.key} href={m.href} className={cx(cls, "hover:bg-white/[.07] transition focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-brandink")}>{body}</Link>
            : <div key={m.key} className={cls}>{body}</div>;
        })}
      </div>
    </section>
  );
}

/** Horizontal bars with labels, like "Syllabus progress" (kit.jsx HBars). A goal draws a tick. */
export function HBars({ rows, goal, lowBelow, labelWidth = 64 }: { rows: { key: string; label: string; value: number; href?: string }[]; goal?: number; lowBelow?: number; labelWidth?: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const low = lowBelow != null && r.value < lowBelow;
        const inner = (
          <>
            <span className="text-ink2 font-medium truncate">{r.label}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden">
              <span className={cx("absolute inset-y-0 left-0 rounded-full", low ? "bg-warn" : "bg-brand")} style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }} />
              {goal != null && <span className="absolute inset-y-0 w-px bg-ink3/50" style={{ left: `${goal}%` }} />}
            </span>
            <span className={cx("text-right font-semibold tnum", low && "text-warn")}>{r.value}%</span>
          </>
        );
        const cls = "grid items-center gap-3 text-[13px]";
        const style = { gridTemplateColumns: `${labelWidth}px 1fr 52px` };
        return (
          <li key={r.key}>
            {r.href
              ? <Link href={r.href} className={cx(cls, "rounded-lg hover:text-brand")} style={style} aria-label={`${r.label}: ${r.value}%`}>{inner}</Link>
              : <div className={cls} style={style}>{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}
