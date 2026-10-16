import { cx } from "./cx";

// A month as a calendar (design/ui-prototype/src/kit.jsx MonthGrid). Monday first.

export type MonthCellTone = "ok" | "bad" | "warn" | "info" | "brand" | "muted" | "none";
export type MonthCell = { tone?: MonthCellTone; title?: string; dot?: "brand" | "bad" | "warn" | "info" | "ok"; letter?: string };

const C: Record<MonthCellTone, string> = { ok: "bg-ok/15 text-ok", bad: "bg-bad/15 text-bad", warn: "bg-warn/15 text-warn", info: "bg-info/10 text-info", brand: "bg-brand/12 text-brand", muted: "text-ink3/60", none: "text-ink2" };
const DOT = { brand: "bg-brand", bad: "bg-bad", warn: "bg-warn", info: "bg-info", ok: "bg-ok" };

/** year and month0 (0 = January); today is a day of that month to ring, if any. */
export function MonthGrid({ year, month0, cell, today, compact }: { year: number; month0: number; cell: (day: number) => MonthCell; today?: number | null; compact?: boolean }) {
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month0, 1)).getUTCDay() + 6) % 7;
  const names = compact ? ["M", "T", "W", "T", "F", "S", "S"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11.5px] font-semibold text-ink3 mb-1.5" aria-hidden="true">{names.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => <span key={"x" + i} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
          const c = cell(d);
          return (
            <span key={d} title={c.title} aria-label={c.title ? `${d}: ${c.title}` : String(d)}
              className={cx("relative aspect-square rounded-xl grid place-items-center text-[13px] font-semibold tnum max-h-14", C[c.tone ?? "none"], d === today && "ring-2 ring-brand")}>
              {d}
              {c.dot && <span className={cx("absolute bottom-1.5 w-1.5 h-1.5 rounded-full", DOT[c.dot])} aria-hidden="true" />}
            </span>
          );
        })}
      </div>
    </div>
  );
}
