import { cx } from "./cx";
import { BarsChart, type BarDatum } from "./bars-chart";

// Small charts (design/ui-prototype/src/kit.jsx): a progress line, labelled horizontal bars, and vertical bars.

export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "ok" | "warn" | "bad" | "info"; className?: string }) {
  const c = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info" }[tone];
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <span className={cx("block h-1.5 rounded-full bg-sunken overflow-hidden", className)} role="presentation">
      <span className={cx("block h-full rounded-full transition-all duration-700", c)} style={{ width: `${v}%` }} />
    </span>
  );
}

/** Horizontal bars with labels. rows: { k, v, label? }; values below lowBelow show in amber. */
export function HBars({ rows, max, unit = "%", lowBelow, labelWidth = 64, ariaLabel }: { rows: { k: string; v: number; label?: string }[]; max?: number; unit?: string; lowBelow?: number; labelWidth?: number; ariaLabel?: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.v));
  return (
    <ul className="flex flex-col gap-2.5" aria-label={ariaLabel}>
      {rows.map((r) => {
        const low = lowBelow != null && r.v < lowBelow;
        return (
          <li key={r.k} className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: `${labelWidth}px 1fr 52px` }}>
            <span className="text-ink2 font-medium truncate">{r.k}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
              <span className={cx("absolute inset-y-0 left-0 rounded-full", low ? "bg-warn" : "bg-brand")} style={{ width: `${Math.min(100, (r.v / top) * 100)}%` }} />
            </span>
            <span className={cx("text-right font-semibold tnum", low && "text-warn")}>{r.label ?? `${r.v}${unit}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Bars(props: { data: BarDatum[]; max?: number; height?: number; ariaLabel: string; ticks?: number[] }) {
  return <BarsChart {...props} />;
}
