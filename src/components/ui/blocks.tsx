// Building blocks for module pages, copied from the approved design
// (design/ui-prototype/src/kit.jsx). None of them need browser code, so pages
// written on the server can use them directly.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, CircleCheck, FileText, FileWarning, Info, SearchX, SlidersHorizontal, Sparkles, TriangleAlert } from "lucide-react";
import { buttonClass } from "./button";
import { cx } from "./cx";
import { Card } from "./card";
import { Pill } from "./badge";
import { Avatar } from "./avatar";

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";
export const TONE_TEXT: Record<string, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", brand: "text-brand", neutral: "" };
export const TONE_SOFT: Record<Tone, string> = { ok: "bg-ok/10 text-ok", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", brand: "bg-brand/10 text-brand", neutral: "bg-sunken text-ink2" };

/* ---------- Numbers at the top of a page, with hairlines between tiles ---------- */
export type StatItem = { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: LucideIcon; href?: string };
const STAT_GRID: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 md:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4", 5: "grid-cols-2 xl:grid-cols-5", 6: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" };
export function Stats({ items, className, label = "Summary" }: { items: StatItem[]; className?: string; label?: string }) {
  const n = Math.min(items.length, 6);
  return (
    <Card className={cx("overflow-hidden", className)} aria-label={label}>
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
          const cls = cx("bg-surface text-left px-4 md:px-5 py-3.5 min-w-0 block", n === 5 && i === 4 && "col-span-2 xl:col-span-1", n === 3 && i === 2 && "col-span-2 md:col-span-1");
          return m.href
            ? <Link key={m.label} href={m.href} className={cx(cls, "hover:bg-sunken/60 transition")}>{body}</Link>
            : <div key={m.label} className={cls}>{body}</div>;
        })}
      </div>
    </Card>
  );
}

/* ---------- Filter chips (like the class picker), each a link so filters live in the address ---------- */
export type ChipOption = { value: string; label: React.ReactNode; count?: number | null; href: string };
export function Chips({ value, options, className, label }: { value: string; options: ChipOption[]; className?: string; label: string }) {
  return (
    <nav aria-label={label} className={cx("-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar", className)}>
      <ul className="flex gap-2 w-max pb-1">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <li key={o.value}>
              <Link href={o.href} scroll={false} aria-current={on ? "true" : undefined}
                className={cx("h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2",
                  on ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink")}>
                {o.label}
                {o.count != null && <span className={cx("text-[11.5px] tnum", on ? "opacity-70" : "text-ink3")}>{o.count.toLocaleString("en-IN")}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A segmented choice made of links (filters in the page address). */
export function SegLinks({ value, options, size = "md", className, label }: { value: string; options: { value: string; label: React.ReactNode; href: string }[]; size?: "sm" | "md"; className?: string; label: string }) {
  return (
    <nav aria-label={label} className={cx("inline-flex p-1 rounded-xl bg-sunken gap-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Link key={o.value} href={o.href} scroll={false} aria-current={on ? "true" : undefined}
            className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition whitespace-nowrap flex-1",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-[13px]",
              on ? "bg-surface text-ink shadow-card" : "text-ink2 hover:text-ink")}>
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ---------- The search and filters row at the top of a list card ---------- */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col md:flex-row gap-2.5 p-3 border-b border-line", className)}>{children}</div>;
}

/* ---------- One row in a simple list: icon or avatar, title, sub, right side ---------- */
export function Row({ avatar, avatarSrc, icon: Ic, iconTone = "neutral", title, sub, right, href, className }: {
  avatar?: string; avatarSrc?: string | null; icon?: LucideIcon; iconTone?: Tone; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; href?: string; className?: string;
}) {
  const body = (
    <>
      {avatar ? <Avatar name={avatar} src={avatarSrc} size={38} /> : Ic ? <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[iconTone])}><Ic size={19} aria-hidden="true" /></span> : null}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14.5px] leading-snug truncate">{title}</p>
        {sub && <p className="text-[12.5px] text-ink3 truncate">{sub}</p>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </>
  );
  const cls = cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left", href && "hover:bg-sunken/70 transition", className);
  return href ? <li><Link href={href} className={cls}>{body}</Link></li> : <li className={cls}>{body}</li>;
}

/* ---------- Settings rows ---------- */
export function SettingRow({ title, sub, children, htmlFor }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; htmlFor?: string }) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Label htmlFor={htmlFor} className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block">{title}</b>
        {sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}
      </Label>
      {children != null && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/* ---------- Banner: a calm message strip ---------- */
const BANNER: Record<string, string> = { info: "bg-info/8", ok: "bg-ok/10", warn: "bg-warn/12", bad: "bg-bad/10", brand: "bg-brand/8" };
const BANNER_ICON: Record<string, LucideIcon> = { info: Info, ok: CircleCheck, warn: TriangleAlert, bad: TriangleAlert, brand: Sparkles };
export function Banner({ tone = "info", icon, title, children, action, className }: { tone?: "info" | "ok" | "warn" | "bad" | "brand"; icon?: LucideIcon; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const Ic = icon ?? BANNER_ICON[tone];
  return (
    <div role={tone === "bad" || tone === "warn" ? "alert" : undefined} className={cx("rounded-2xl px-4 py-3 flex items-start md:items-center gap-3 text-[14px]", BANNER[tone], className)}>
      <Ic size={19} className={cx("shrink-0 mt-0.5 md:mt-0", TONE_TEXT[tone])} aria-hidden="true" />
      <div className="text-ink2 flex-1 min-w-0">{title && <b className="font-semibold text-ink">{title} </b>}{children}</div>
      {action}
    </div>
  );
}

/* ---------- Suggestion box: labelled, different background, never acts by itself ---------- */
export function Suggestion({ title = "Suggestion", children, source, actions }: { title?: string; children: React.ReactNode; source?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Card className="border-brand/25 bg-brand/[.03]">
      <div className="px-5 pt-4 pb-1 flex items-center gap-2">
        <Sparkles size={16} className="text-brand" aria-hidden="true" />
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
export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "ok" | "warn" | "bad" | "info"; className?: string }) {
  const c = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info" }[tone];
  return <span className={cx("block h-1.5 rounded-full bg-sunken overflow-hidden", className)} aria-hidden="true"><span className={cx("block h-full rounded-full transition-all duration-700", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>;
}
/** Horizontal bars with labels. rows: [{ k, v, label? }] */
export function HBars({ rows, max = 100, unit = "%", lowBelow, labelWidth = 64 }: { rows: { k: string; v: number; label?: string }[]; max?: number; unit?: string; lowBelow?: number; labelWidth?: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const low = lowBelow != null && r.v < lowBelow;
        return (
          <li key={r.k} className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: `${labelWidth}px 1fr 52px` }}>
            <span className="text-ink2 font-medium truncate">{r.k}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
              <span className={cx("absolute inset-y-0 left-0 rounded-full", low ? "bg-warn" : "bg-brand")} style={{ width: `${max ? Math.min(100, (r.v / max) * 100) : 0}%` }} />
            </span>
            <span className={cx("text-right font-semibold tnum", low && "text-warn")}>{r.label ?? `${r.v}${unit}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Definition list (label above value) ---------- */
export function DL({ rows, cols = 2, className }: { rows: [string, React.ReactNode][]; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3.5 px-5 pb-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-2 xl:grid-cols-3", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-ink3 font-semibold">{k}</dt>
          <dd className="text-[14.5px] mt-0.5 break-words">{v ?? <span className="text-ink3">Not added</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Timeline (newest first) ---------- */
export type TimelineItem = { what: React.ReactNode; when: React.ReactNode; icon?: LucideIcon; tone?: Tone; href?: string };
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((t, i) => {
        const Ic = t.icon ?? CircleCheck;
        return (
          <li key={i} className="grid grid-cols-[36px_1fr] gap-3">
            <span className="flex flex-col items-center">
              <span className={cx("w-9 h-9 rounded-full grid place-items-center", TONE_SOFT[t.tone ?? "neutral"])}><Ic size={16} aria-hidden="true" /></span>
              {i < items.length - 1 && <span className="w-px flex-1 bg-line my-1" aria-hidden="true" />}
            </span>
            <div className="pb-5 pt-1.5 min-w-0">
              <p className="text-[14.5px] leading-snug">{t.href ? <Link href={t.href} className="hover:underline">{t.what}</Link> : t.what}</p>
              <p className="text-[12.5px] text-ink3 mt-0.5">{t.when}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- File / document row ---------- */
export function FileRow({ name, meta, missing, actions }: { name: React.ReactNode; meta?: React.ReactNode; missing?: boolean; actions?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
      <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", missing ? "bg-warn/12 text-warn" : "bg-sunken text-ink2")} aria-hidden="true">{missing ? <FileWarning size={19} /> : <FileText size={19} />}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14px] truncate">{name}</p>
        <p className="text-[12.5px] text-ink3 truncate">{missing ? "Not collected yet" : meta}</p>
      </div>
      {actions && <div className="flex gap-1 shrink-0 flex-wrap justify-end">{actions}</div>}
    </li>
  );
}

/* ---------- Two-column layout: main + side ---------- */
export function Split({ children, side = 340, className }: { children: React.ReactNode; side?: 300 | 320 | 340 | 380; className?: string }) {
  const cols = { 300: "xl:grid-cols-[minmax(0,1fr)_300px]", 320: "xl:grid-cols-[minmax(0,1fr)_320px]", 340: "xl:grid-cols-[minmax(0,1fr)_340px]", 380: "xl:grid-cols-[minmax(0,1fr)_380px]" }[side];
  return <div className={cx("grid gap-5 lg:gap-6 items-start", cols, className)}>{children}</div>;
}
export function Col({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col gap-5 lg:gap-6 min-w-0", className)}>{children}</div>;
}

/* ---------- Empty, inside a card ---------- */
export function Empty({ icon: Icon = SearchX, title, body, action }: { icon?: LucideIcon; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
      <span className="w-14 h-14 rounded-2xl bg-sunken text-ink3 grid place-items-center" aria-hidden="true"><Icon size={26} /></span>
      <h2 className="font-semibold text-[15px]">{title}</h2>
      {body && <div className="text-sm text-ink3 max-w-sm">{body}</div>}
      {action}
    </div>
  );
}

/** A small uppercase heading inside a card or form. */
export const SubHead = ({ children }: { children: React.ReactNode }) => <p className="eyebrow text-ink3 -mb-1 pt-1">{children}</p>;

/** A list footer: "Showing 25 of 340" with a "Show more" link. */
export function ListFooter({ shown, total, moreHref, children }: { shown: number; total: number; moreHref?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3">
      <span className="tnum" aria-live="polite">Showing {shown.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}</span>
      {children}
      {moreHref && <Link href={moreHref} scroll={false} className="inline-flex items-center justify-center font-semibold whitespace-nowrap transition h-8 px-3 text-[13px] gap-1.5 rounded-lg bg-surface text-ink border border-line hover:bg-sunken">Show more</Link>}
    </div>
  );
}

/** A chevron that shows when a row is hovered. */
export const RowChevron = () => <ChevronRight size={18} className="text-ink3 opacity-0 group-hover:opacity-100 transition" aria-hidden="true" />;

/** "Filters": the less used filters of a list, in a small menu next to the search. */
export function FilterMenu({ on = 0, clearHref, children }: { on?: number; clearHref?: string | null; children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary className={buttonClass("secondary", "md", "list-none cursor-pointer h-11 [&::-webkit-details-marker]:hidden")}>
        <SlidersHorizontal size={17} aria-hidden="true" />Filters{on ? <span className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] text-brandink tnum">{on}</span> : null}
      </summary>
      <div className="absolute right-0 z-30 mt-1.5 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-3 shadow-pop animate-rise flex flex-col gap-2">
        {children}
        {on > 0 && clearHref && <Link href={clearHref} className={buttonClass("ghost", "sm", "self-start")}>Clear filters</Link>}
      </div>
    </details>
  );
}
