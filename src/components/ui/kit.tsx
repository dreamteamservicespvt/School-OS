// Shared building blocks for module pages, from the approved design
// (design/ui-prototype/src/kit.jsx). Nothing here needs browser code, so these
// parts work on the server and in client parts alike. Things a person clicks
// are links, so every filter and number can be shared as a page address (P2).

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Circle, CircleCheck, Info, Lightbulb, SearchX, Sparkles, TriangleAlert } from "lucide-react";
import { Card } from "./card";
import { Pill } from "./badge";
import { cx } from "./cx";

export type Tone = "ok" | "warn" | "bad" | "info" | "brand";
export const TONE_TEXT: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", brand: "text-brand" };
export const TONE_SOFT: Record<Tone | "neutral", string> = { ok: "bg-ok/10 text-ok", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", brand: "bg-brand/10 text-brand", neutral: "bg-sunken text-ink2" };

/* ---------- Numbers at the top of a page ---------- */
export type StatItem = { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: LucideIcon; href?: string };
const STAT_GRID: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 md:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4", 5: "grid-cols-2 xl:grid-cols-5", 6: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" };

/** Number tiles with hairlines between them, in one card. */
export function Stats({ items, className }: { items: StatItem[]; className?: string }) {
  const n = Math.min(items.length, 6);
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className={cx("grid gap-px bg-line/70", STAT_GRID[n])}>
        {items.map((m, i) => {
          const Ic = m.icon;
          const inner = (
            <>
              <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5 truncate">{Ic && <Ic size={14} className="shrink-0" aria-hidden="true" />}{m.label}</p>
              <p className={cx("font-semibold text-[19px] md:text-[21px] tnum mt-0.5 font-display tracking-tight leading-tight truncate", m.tone && TONE_TEXT[m.tone])}>{m.value}</p>
              {m.sub && <p className="text-[12px] text-ink3 truncate">{m.sub}</p>}
            </>
          );
          const cls = cx("block bg-surface text-left px-4 md:px-5 py-3.5 min-w-0", n === 5 && i === 4 && "col-span-2 xl:col-span-1", n === 3 && i === 2 && "col-span-2 md:col-span-1");
          return m.href
            ? <Link key={m.label} href={m.href} className={cx(cls, "hover:bg-sunken transition")}>{inner}</Link>
            : <div key={m.label} className={cls}>{inner}</div>;
        })}
      </div>
    </Card>
  );
}

/* ---------- The one bold moment on a page ---------- */
export type BandItem = { label: string; big: React.ReactNode; foot?: React.ReactNode; href?: string };
const BAND_GRID: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-2 lg:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4" };
const BAND_CELL: Record<number, string[]> = {
  2: ["border-r", ""],
  3: ["border-r border-b lg:border-b-0", "border-b lg:border-b-0 lg:border-r", "col-span-2 lg:col-span-1"],
  4: ["border-r border-b xl:border-b-0", "border-b xl:border-b-0 xl:border-r", "border-r", ""],
};

export function Band({ items, className, label }: { items: BandItem[]; className?: string; label?: string }) {
  const n = Math.max(2, Math.min(items.length, 4));
  return (
    <section aria-label={label} className={cx("relative overflow-hidden rounded-3xl bg-brand text-brandink shadow-pop", className)}>
      <div className="absolute inset-0 dotgrid opacity-60 pointer-events-none" aria-hidden="true" />
      <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full bg-white/10 blur-2xl pointer-events-none" aria-hidden="true" />
      <div className={cx("relative grid", BAND_GRID[n])}>
        {items.slice(0, 4).map((m, i) => {
          const inner = (
            <>
              <p className="text-[12.5px] md:text-[13px] font-semibold opacity-80 flex items-center gap-1">{m.label}{m.href && <ChevronRight size={14} className="opacity-60" aria-hidden="true" />}</p>
              <p className="font-display text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight tnum mt-1 truncate">{m.big}</p>
              {m.foot && <p className="text-[12px] md:text-[13px] opacity-75 mt-0.5 truncate">{m.foot}</p>}
            </>
          );
          const cls = cx("block text-left p-4 md:p-6 min-w-0 border-white/15", BAND_CELL[n][i]);
          return m.href
            ? <Link key={m.label} href={m.href} className={cx(cls, "hover:bg-white/[.07] transition")}>{inner}</Link>
            : <div key={m.label} className={cls}>{inner}</div>;
        })}
      </div>
    </section>
  );
}

/* ---------- Search and filters at the top of a list card ---------- */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col md:flex-row md:flex-wrap md:items-center gap-2.5 p-3 border-b border-line", className)}>{children}</div>;
}

export type ChipLink = { value: string; label: React.ReactNode; count?: number; href: string };

/** Filter chips as links; they scroll sideways on phones. */
export function Chips({ value, options, className, label }: { value: string; options: ChipLink[]; className?: string; label?: string }) {
  return (
    <nav aria-label={label} className={cx("-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar", className)}>
      <div className="flex gap-2 w-max pb-1">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <Link key={o.value} href={o.href} aria-current={on ? "true" : undefined} scroll={false}
              className={cx("h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2",
                on ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink")}>
              {o.label}{o.count != null && <span className={cx("text-[11.5px] tnum", on ? "opacity-70" : "text-ink3")}>{o.count}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------- Lists: a table on computers, cards on phones ---------- */
export type ListColumn<Row> = { key: string; label: React.ReactNode; render: (row: Row) => React.ReactNode; align?: "right" | "center"; className?: string; nowrap?: boolean };
export type MobileRow = { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; icon?: LucideIcon; iconTone?: Tone | "neutral"; lead?: React.ReactNode; pills?: React.ReactNode };

/**
 * A list in a card: a table from `bp` up, cards below it. When `href` is given
 * the whole row opens it. `select` adds a tick box per row sent with a form.
 */
export function DataList<Row>({ columns, rows, rowKey, href, mobile, empty, footer, minWidth = 640, bp = "lg", caption, select, rowClass }: {
  columns: ListColumn<Row>[]; rows: Row[]; rowKey: (r: Row) => string; href?: (r: Row) => string | null; mobile: (r: Row) => MobileRow;
  empty?: React.ReactNode; footer?: React.ReactNode | false; minWidth?: number; bp?: "md" | "lg"; caption?: string;
  select?: { form: string; name?: string; label: (r: Row) => string; disabled?: (r: Row) => boolean };
  rowClass?: (r: Row) => string | undefined;
}) {
  if (!rows.length) return <>{empty ?? <ListEmpty />}</>;
  const tick = (r: Row) => select && (
    <input type="checkbox" form={select.form} name={select.name ?? "id"} value={rowKey(r)} aria-label={select.label(r)} disabled={select.disabled?.(r)}
      data-bulk-row className="relative z-[1] size-5 rounded-md accent-brand cursor-pointer disabled:opacity-40" />
  );
  return (
    <>
      <div className={cx("hidden overflow-x-auto scroll-thin", bp === "md" ? "md:block" : "lg:block")}>
        <table className="w-full text-left text-[14px]" style={{ minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
              {select && <th scope="col" className="pl-4 pr-2 py-3 w-10"><input type="checkbox" data-bulk-all aria-label="Choose every row" className="size-5 rounded-md accent-brand cursor-pointer" /></th>}
              {columns.map((c, i) => <th key={c.key} scope="col" className={cx("px-3 py-3 font-semibold whitespace-nowrap", i === 0 && !select && "pl-5", i === columns.length - 1 && !href && "pr-5", c.align === "right" && "text-right", c.align === "center" && "text-center")}>{c.label}</th>)}
              {href && <th className="w-8"><span className="sr-only">Open</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const link = href?.(r) ?? null;
              return (
                <tr key={rowKey(r)} className={cx("border-b border-line/70 last:border-0 transition group", link && "relative hover:bg-sunken/60 cursor-pointer", rowClass?.(r))}>
                  {select && <td className="pl-4 pr-2 py-3">{tick(r)}</td>}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx("px-3 py-2.5 align-middle", i === 0 && !select && "pl-5", i === columns.length - 1 && !link && "pr-5", c.align === "right" && "text-right tnum", c.align === "center" && "text-center", c.nowrap && "whitespace-nowrap", c.className)}>
                      {c.render(r)}
                    </td>
                  ))}
                  {href && (
                    <td className="pr-3">
                      {link && <Link href={link} className="after:absolute after:inset-0 grid place-items-center text-ink3"><ChevronRight size={18} className="opacity-0 group-hover:opacity-100 transition" aria-hidden="true" /><span className="sr-only">Open</span></Link>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className={cx("divide-y divide-line/70", bp === "md" ? "md:hidden" : "lg:hidden")}>
        {rows.map((r) => {
          const m = mobile(r);
          const link = href?.(r) ?? null;
          const Ic = m.icon;
          return (
            <li key={rowKey(r)} className={cx("relative flex items-center gap-3 px-4 py-3", link && "active:bg-sunken", rowClass?.(r))}>
              {tick(r)}
              {m.lead ?? (Ic ? <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[m.iconTone ?? "neutral"])}><Ic size={19} aria-hidden="true" /></span> : null)}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate">{link ? <Link href={link} className="after:absolute after:inset-0">{m.title}</Link> : m.title}</p>
                {m.sub && <p className="text-[13px] text-ink3 truncate">{m.sub}</p>}
                {m.pills && <div className="flex gap-1.5 mt-1.5 flex-wrap">{m.pills}</div>}
              </div>
              {m.right && <div className="text-right shrink-0">{m.right}</div>}
              {link && <ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ul>
      {footer !== false && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3">
          <span className="tnum">{footer ?? `Showing 1 to ${rows.length} of ${rows.length}`}</span>
        </div>
      )}
    </>
  );
}

/** When a search or filter finds nothing. */
export function ListEmpty({ title = "Nothing matches", body = "Try a different search or filter.", action, icon: Ic = SearchX }: { title?: string; body?: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
      <span className="w-14 h-14 rounded-2xl bg-sunken text-ink3 grid place-items-center" aria-hidden="true"><Ic size={26} /></span>
      <h3 className="font-semibold text-[15px]">{title}</h3>
      {body && <div className="text-sm text-ink3 max-w-sm">{body}</div>}
      {action}
    </div>
  );
}

/* ---------- Settings rows ---------- */
export function SettingRow({ title, sub, children, htmlFor }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <label htmlFor={htmlFor} className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block">{title}</b>
        {sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}
      </label>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/* ---------- A calm message strip ---------- */
const BANNER: Record<Tone, string> = { info: "bg-info/8", ok: "bg-ok/10", warn: "bg-warn/12", bad: "bg-bad/10", brand: "bg-brand/8" };
const BANNER_ICON: Record<Tone, LucideIcon> = { info: Info, ok: CircleCheck, warn: TriangleAlert, bad: TriangleAlert, brand: Info };

export function Banner({ tone = "info", icon, title, children, action, className }: { tone?: Tone; icon?: LucideIcon; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const Ic = icon ?? BANNER_ICON[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("rounded-2xl px-4 py-3 flex flex-wrap md:flex-nowrap items-start md:items-center gap-3 text-[14px]", BANNER[tone], className)}>
      <Ic size={19} className={cx("shrink-0 mt-0.5 md:mt-0", TONE_TEXT[tone])} aria-hidden="true" />
      <p className="text-ink2 flex-1 min-w-0 basis-[calc(100%-2.5rem)] md:basis-auto">{title && <b className="font-semibold text-ink">{title} </b>}{children}</p>
      {action && <div className="shrink-0 flex gap-2 flex-wrap pl-8 md:pl-0">{action}</div>}
    </div>
  );
}

/* ---------- A suggestion: labelled, a different background, never acts by itself ---------- */
/** ai: written by the AI service; only then does it carry the AI sparkle (00-global.md §2.1 rules 3 and 8). */
export function Suggestion({ title = "Suggestion", children, source, actions, ai = false }: { title?: React.ReactNode; children: React.ReactNode; source?: React.ReactNode; actions?: React.ReactNode; ai?: boolean }) {
  const Mark = ai ? Sparkles : Lightbulb;
  return (
    <Card className="border-brand/25 bg-brand/[.03]">
      <div className="px-5 pt-4 pb-1 flex items-center gap-2">
        <Mark size={16} className="text-brand" aria-hidden="true" />
        <p className="font-semibold text-[14.5px]">{title}</p>
        <Pill tone="brand" className="!h-5 !text-[11px] ml-auto">Suggestion</Pill>
      </div>
      <div className="px-5 pb-4 text-[14px] leading-relaxed text-ink2">{children}</div>
      {source && <p className="px-5 pb-3 text-[12px] text-ink3">Based on: {source}</p>}
      {actions && <div className="px-5 pb-4 flex gap-2 flex-wrap">{actions}</div>}
    </Card>
  );
}

/* ---------- Small charts ---------- */
export function Progress({ value, tone = "brand", className, label }: { value: number; tone?: Tone; className?: string; label?: string }) {
  const c = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info" }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <span role={label ? "progressbar" : undefined} aria-label={label} aria-valuenow={label ? Math.round(v) : undefined} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined}
      className={cx("block h-1.5 rounded-full bg-sunken overflow-hidden", className)}>
      <span className={cx("block h-full rounded-full transition-all duration-700", c)} style={{ width: `${v}%` }} />
    </span>
  );
}

/** Horizontal bars with labels. A goal draws a thin tick. */
export function HBars({ rows, max = 100, goal, unit = "%", lowBelow, labelWidth = 64 }: { rows: { k: string; v: number; label?: string }[]; max?: number; goal?: number; unit?: string; lowBelow?: number; labelWidth?: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const low = lowBelow != null && r.v < lowBelow;
        return (
          <li key={r.k} className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: `${labelWidth}px 1fr 52px` }}>
            <span className="text-ink2 font-medium truncate" title={r.k}>{r.k}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
              <span className={cx("absolute inset-y-0 left-0 rounded-full", low ? "bg-warn" : "bg-brand")} style={{ width: `${Math.max(0, Math.min(100, (r.v / (max || 1)) * 100))}%` }} />
              {goal != null && <span className="absolute inset-y-0 w-px bg-ink3/50" style={{ left: `${(goal / max) * 100}%` }} />}
            </span>
            <span className={cx("text-right font-semibold tnum", low && "text-warn")}>{r.label ?? `${r.v}${unit}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical bars. `v2` draws a lighter bar behind, for a target or the earlier value. */
export function Bars({ data, max, height = 170, unit = "", ariaLabel = "Chart", ticks }: { data: { k: string; v: number; v2?: number; tone?: Tone }[]; max?: number; height?: number; unit?: string; ariaLabel?: string; ticks?: number[] }) {
  const W = 360, H = height, padL = 30, padB = 22, top = 8;
  const mx = max || Math.max(1, ...data.map((d) => Math.max(d.v, d.v2 ?? 0))) * 1.1;
  const y = (v: number) => top + (H - padB - top) * (1 - v / mx);
  const bw = (W - padL - 8) / Math.max(1, data.length);
  const tk = ticks ?? [0, mx / 3, (2 * mx) / 3].map((t) => Math.round(t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
      {tk.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} style={{ stroke: "rgb(var(--line))" }} strokeDasharray={t ? "3 4" : ""} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" style={{ fill: "rgb(var(--ink-3))" }}>{t}{unit}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * bw + bw * 0.18, w = bw * 0.64;
        return (
          <g key={d.k} className="[&:hover>rect.bar]:opacity-100 [&>rect.bar]:opacity-90">
            <title>{`${d.k}: ${d.v}${unit}${d.v2 != null ? ` (before: ${d.v2}${unit})` : ""}`}</title>
            <rect x={padL + i * bw} y={top} width={bw} height={H - padB - top} fill="transparent" />
            {d.v2 != null && <rect x={x} y={y(d.v2)} width={w} height={Math.max(0, y(0) - y(d.v2))} rx="4" style={{ fill: "rgb(var(--ink-3) / .22)" }} />}
            <rect className="bar" x={x} y={y(d.v)} width={w} height={Math.max(0, y(0) - y(d.v))} rx="4" style={{ fill: `rgb(var(--${d.tone ?? "brand"}))` }} />
            <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="500" style={{ fill: "rgb(var(--ink-2))" }}>{d.k}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-4 flex-wrap text-[12.5px] text-ink2">
      {items.map(([cls, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx("w-2.5 h-2.5 rounded-sm", cls)} aria-hidden="true" />{l}</span>)}
    </div>
  );
}

/* ---------- Label above value ---------- */
export function DL({ rows, cols = 2, className }: { rows: [string, React.ReactNode][]; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3.5 px-5 pb-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-2 xl:grid-cols-3", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-ink3 font-semibold">{k}</dt>
          <dd className="text-[14.5px] mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Timeline, newest first ---------- */
export function Timeline({ items }: { items: { what: React.ReactNode; when: React.ReactNode; icon?: LucideIcon; tone?: Tone | "neutral" }[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((t, i) => {
        const Ic = t.icon ?? Circle;
        return (
          <li key={i} className="grid grid-cols-[36px_1fr] gap-3">
            <span className="flex flex-col items-center">
              <span className={cx("w-9 h-9 rounded-full grid place-items-center", TONE_SOFT[t.tone ?? "neutral"])}><Ic size={16} aria-hidden="true" /></span>
              {i < items.length - 1 && <span className="w-px flex-1 bg-line my-1" aria-hidden="true" />}
            </span>
            <div className="pb-5 pt-1.5 min-w-0">
              <p className="text-[14.5px] leading-snug">{t.what}</p>
              <p className="text-[12.5px] text-ink3 mt-0.5">{t.when}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Month calendar grid ---------- */
export type DayCell = { tone?: Tone | "muted" | "none"; title?: string; dot?: Tone };
const DAY_TONE = { ok: "bg-ok/15 text-ok", bad: "bg-bad/15 text-bad", warn: "bg-warn/15 text-warn", info: "bg-info/10 text-info", brand: "bg-brand/12 text-brand", muted: "text-ink3/60", none: "text-ink2" };
const DOT = { brand: "bg-brand", bad: "bg-bad", warn: "bg-warn", info: "bg-info", ok: "bg-ok" };

/** One month, Monday first. `month` is 0 to 11. `cells` is keyed by day of the month. */
export function MonthGrid({ year, month, cells = {}, today, compact }: { year: number; month: number; cells?: Record<number, DayCell>; today?: number | null; compact?: boolean }) {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11.5px] font-semibold text-ink3 mb-1.5" aria-hidden="true">
        {(compact ? ["M", "T", "W", "T", "F", "S", "S"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
          const c = cells[d] ?? {};
          return (
            <span key={d} title={c.title} aria-label={c.title ? `${d}: ${c.title}` : undefined}
              className={cx("relative aspect-square rounded-xl grid place-items-center text-[13px] font-semibold tnum max-h-14", DAY_TONE[c.tone ?? "none"], d === today && "ring-2 ring-brand")}>
              {d}
              {c.dot && <span className={cx("absolute bottom-1.5 w-1.5 h-1.5 rounded-full", DOT[c.dot])} aria-hidden="true" />}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Main and side columns ---------- */
export function Split({ children, side = 340, className }: { children: React.ReactNode; side?: 300 | 340 | 380; className?: string }) {
  return <div className={cx("grid gap-5 lg:gap-6 items-start", side === 380 ? "xl:grid-cols-[minmax(0,1fr)_380px]" : side === 300 ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "xl:grid-cols-[minmax(0,1fr)_340px]", className)}>{children}</div>;
}
export function Col({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col gap-5 lg:gap-6 min-w-0", className)}>{children}</div>;
}

/** A tinted icon tile. */
export function IconTile({ icon: Ic, tone = "neutral", size = 40 }: { icon: LucideIcon; tone?: Tone | "neutral"; size?: number }) {
  return <span className={cx("rounded-xl grid place-items-center shrink-0", TONE_SOFT[tone])} style={{ width: size, height: size }}><Ic size={Math.round(size * 0.48)} aria-hidden="true" /></span>;
}

/** A line across points (percent 0 to 100); a point with no value shows as an empty ring. */
export function TrendLine({ points, ariaLabel = "Percentage across exams" }: { points: { k: string; v: number | null }[]; ariaLabel?: string }) {
  const W = 320, H = 116, pad = 28;
  const x = (i: number) => (points.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (points.length - 1));
  const y = (v: number) => 24 + (H - 48) * (1 - Math.max(0, Math.min(100, v)) / 100);
  const shown = points.map((p, i) => ({ ...p, i })).filter((p): p is { k: string; v: number; i: number } => p.v !== null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${ariaLabel}: ${shown.map((p) => `${p.k} ${Math.round(p.v)}%`).join(", ")}`}>
      {[50, 100].map((t) => <line key={t} x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} strokeDasharray="3 4" style={{ stroke: "rgb(var(--line))" }} />)}
      {shown.length > 1 && <polyline fill="none" strokeWidth="2.5" points={shown.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} style={{ stroke: "rgb(var(--brand))" }} />}
      {points.map((p, i) => (
        <g key={`${p.k}${i}`}>
          {p.v !== null ? <circle cx={x(i)} cy={y(p.v)} r="5" style={{ fill: "rgb(var(--brand))" }} /> : <circle cx={x(i)} cy={y(50)} r="4" fill="none" strokeDasharray="2 2" style={{ stroke: "rgb(var(--ink-3))" }} />}
          {p.v !== null && <text x={x(i)} y={y(p.v) - 10} textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: "rgb(var(--ink))" }}>{Math.round(p.v)}%</text>}
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" style={{ fill: "rgb(var(--ink-3))" }}>{p.k.length > 14 ? `${p.k.slice(0, 13)}…` : p.k}</text>
        </g>
      ))}
    </svg>
  );
}
