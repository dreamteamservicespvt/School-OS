import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronRight, Circle } from "lucide-react";
import { Avatar } from "./avatar";
import { cx } from "./cx";
import { TONE_SOFT } from "./stats";

// Simple rows, label-over-value lists, timelines and progress bars (design/ui-prototype/src/kit.jsx).

/** One row in a simple list: avatar or icon, title, one line under it, something on the right. */
export function Row({ avatar, icon: Ic, iconTone = "neutral", title, sub, right, href, className }: { avatar?: string; icon?: LucideIcon; iconTone?: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; href?: string; className?: string }) {
  const body = (
    <>
      {avatar ? <Avatar name={avatar} size={38} /> : Ic ? <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[iconTone])}><Ic size={19} aria-hidden="true" /></span> : null}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14.5px] leading-snug truncate">{title}</p>
        {sub && <p className="text-[12.5px] text-ink3 truncate">{sub}</p>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </>
  );
  const cls = cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left", href && "hover:bg-sunken/70 transition", className);
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Label above value, in two or three columns. */
export function DL({ rows, cols = 2 }: { rows: [string, React.ReactNode][]; cols?: 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3.5 px-5 pb-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-2 xl:grid-cols-3")}>
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-ink3 font-semibold">{k}</dt>
          <dd className="text-[14.5px] mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export type TimelineItem = { what: React.ReactNode; when: React.ReactNode; icon?: LucideIcon; tone?: string };

/** Newest first. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((t, i) => {
        const Ic = t.icon ?? Circle;
        return (
          <li key={i} className="grid grid-cols-[36px_1fr] gap-3">
            <span className="flex flex-col items-center">
              <span className={cx("w-9 h-9 rounded-full grid place-items-center", TONE_SOFT[t.tone ?? "neutral"])}><Ic size={16} aria-hidden="true" /></span>
              {i < items.length - 1 && <span className="w-px flex-1 bg-line my-1" />}
            </span>
            <div className="pb-5 pt-1.5 min-w-0">
              <p className="text-[14.5px] leading-snug break-words">{t.what}</p>
              <p className="text-[12.5px] text-ink3 mt-0.5">{t.when}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Steps with a tick when done. */
export function Checklist({ items }: { items: { label: string; sub?: React.ReactNode; done: boolean; action?: React.ReactNode }[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((s, i) => (
        <li key={s.label} className="flex items-center gap-3 px-5 py-3 border-t border-line/70">
          <span className={cx("w-7 h-7 rounded-full grid place-items-center shrink-0 text-[12px] font-bold tnum", s.done ? "bg-ok/15 text-ok" : "bg-sunken text-ink3")}>{s.done ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className={cx("text-[14.5px] font-semibold", s.done && "text-ink2")}>{s.label}</p>
            {s.sub && <p className="text-[12.5px] text-ink3">{s.sub}</p>}
          </div>
          {!s.done && s.action}
        </li>
      ))}
    </ol>
  );
}

/** A thin progress bar. */
export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "ok" | "warn" | "bad" | "info"; className?: string }) {
  const c = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info" }[tone];
  return <span className={cx("block h-1.5 rounded-full bg-sunken overflow-hidden", className)} aria-hidden="true"><span className={cx("block h-full rounded-full transition-all duration-700", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>;
}

/** Horizontal bars with labels. */
export function HBars({ rows, max, unit = "%", lowBelow, labelWidth = 64 }: { rows: { k: string; v: number; label?: string }[]; max?: number; unit?: string; lowBelow?: number; labelWidth?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.v));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const low = lowBelow != null && r.v < lowBelow;
        return (
          <li key={r.k} className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: `${labelWidth}px 1fr 52px` }}>
            <span className="text-ink2 font-medium truncate" title={r.k}>{r.k}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden">
              <span className={cx("absolute inset-y-0 left-0 rounded-full", low ? "bg-warn" : "bg-brand")} style={{ width: `${(r.v / top) * 100}%` }} />
            </span>
            <span className={cx("text-right font-semibold tnum", low && "text-warn")}>{r.label ?? `${r.v}${unit}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Coloured squares that explain a chart. */
export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-4 flex-wrap text-[12.5px] text-ink2">
      {items.map(([cls, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx("w-2.5 h-2.5 rounded-sm", cls)} />{l}</span>)}
    </div>
  );
}

/** "Open" link at the right of a card's title. */
export function OpenLink({ href, children = "Open" }: { href: string; children?: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold text-ink2 hover:bg-sunken hover:text-ink transition shrink-0">{children}<ChevronRight size={16} aria-hidden="true" /></Link>;
}
