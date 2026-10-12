import { cx } from "./cx";

// Display parts of the approved design that need no browser code.

/** A progress ring with something in the middle. */
export function Ring({ value, size = 64, stroke = 7, children, tone = "brand", track = "line" }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; tone?: "brand" | "ok" | "warn" | "bad" | "info" | "brand-ink"; track?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: track.startsWith("rgb") ? track : `rgb(var(--${track}))` }} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
          style={{ stroke: `rgb(var(--${tone}))`, transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** A thin bar for a share of a goal, coloured by how good it is. */
export function Meter({ value, tone, className }: { value: number; tone?: "brand" | "ok" | "warn" | "bad"; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone ?? (v >= 90 ? "ok" : v >= 80 ? "warn" : "bad");
  const bg = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[t];
  return (
    <span className={cx("block h-1.5 rounded-full bg-sunken overflow-hidden", className)} aria-hidden="true">
      <span className={cx("block h-full rounded-full", bg)} style={{ width: `${v}%` }} />
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-grid place-items-center min-w-[22px] h-[22px] px-1.5 rounded-md border border-line bg-surface text-[11px] font-semibold text-ink3 font-sans">{children}</kbd>;
}

/** A page's title block: optional crumbs, a big display title, one line under it, actions on the right. */
export function PageHead({ title, sub, actions, crumbs, className }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; crumbs?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-5", className)}>
      <div className="min-w-0">
        {crumbs && <div className="text-[13px] text-ink3 mb-1 flex items-center gap-1.5 flex-wrap">{crumbs}</div>}
        <h1 className="font-display text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight">{title}</h1>
        {sub && <p className="text-ink3 text-[15px] mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** A big number with a label, for summary rows. */
export function Stat({ label, value, sub, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "ok" | "warn" | "bad" | "brand" }) {
  const t = tone ? { ok: "text-ok", warn: "text-warn", bad: "text-bad", brand: "text-brand" }[tone] : "";
  return (
    <div className="bg-surface rounded-2xl border border-line/70 shadow-card px-4 py-3.5 min-w-0">
      <p className="text-[13px] text-ink3 font-medium truncate">{label}</p>
      <p className={cx("font-display text-[26px] font-semibold tnum leading-tight mt-1", t)}>{value}</p>
      {sub && <p className="text-[12.5px] text-ink3 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
