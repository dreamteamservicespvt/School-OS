// Building blocks of module pages in the approved design (design/ui-prototype/src/kit.jsx).
// None of these need browser code: links instead of click handlers, so pages
// written on the server can use them directly.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, CircleCheck, Info, Sparkles, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";

export const TONE_TEXT: Record<string, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", brand: "text-brand", neutral: "" };
export const TONE_SOFT: Record<Tone, string> = { ok: "bg-ok/10 text-ok", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", brand: "bg-brand/10 text-brand", neutral: "bg-sunken text-ink2" };

/* ---------- Numbers at the top of a page, with hairlines between tiles ---------- */
export type StatItem = { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: LucideIcon; href?: string; active?: boolean };
const STAT_GRID: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4", 5: "grid-cols-2 xl:grid-cols-5", 6: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" };

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
              <p className={cx("font-semibold text-[19px] md:text-[21px] tnum mt-0.5 font-display tracking-tight leading-tight truncate", m.tone ? TONE_TEXT[m.tone] : "")}>{m.value}</p>
              {m.sub && <p className="text-[12px] text-ink3 truncate">{m.sub}</p>}
            </>
          );
          const cls = cx("block bg-surface text-left px-4 md:px-5 py-3.5 min-w-0", m.href && "hover:bg-sunken/60 transition", m.active && "bg-brand/5", n === 5 && i === 4 && "col-span-2 xl:col-span-1");
          return m.href ? <Link key={m.label} href={m.href} scroll={false} className={cls} aria-current={m.active ? "true" : undefined}>{inner}</Link> : <div key={m.label} className={cls}>{inner}</div>;
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
export function Band({ items, className }: { items: BandItem[]; className?: string }) {
  const n = Math.max(2, Math.min(items.length, 4));
  return (
    <section className={cx("relative overflow-hidden rounded-3xl bg-brand text-brandink shadow-pop", className)}>
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
          const cls = cx("block text-left p-4 md:p-6 min-w-0 border-white/15", m.href && "hover:bg-white/[.07] transition", BAND_CELL[n][i]);
          return m.href ? <Link key={m.label} href={m.href} className={cls}>{inner}</Link> : <div key={m.label} className={cls}>{inner}</div>;
        })}
      </div>
    </section>
  );
}

/* ---------- A calm message strip ---------- */
const BANNER: Record<string, string> = { info: "bg-info/8", ok: "bg-ok/10", warn: "bg-warn/12", bad: "bg-bad/10", brand: "bg-brand/8" };
const BANNER_ICON: Record<string, LucideIcon> = { info: Info, ok: CircleCheck, warn: TriangleAlert, bad: TriangleAlert, brand: Sparkles };
export function Banner({ tone = "info", icon, title, children, action, className }: { tone?: "info" | "ok" | "warn" | "bad" | "brand"; icon?: LucideIcon; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const Ic = icon ?? BANNER_ICON[tone];
  return (
    // On a phone the action goes under the words, so the words keep the full width.
    <div role={tone === "bad" ? "alert" : undefined} className={cx("rounded-2xl px-4 py-3 flex flex-wrap md:flex-nowrap items-start md:items-center gap-3 text-[14px]", BANNER[tone], className)}>
      <Ic size={19} className={cx("shrink-0 mt-0.5 md:mt-0", TONE_TEXT[tone])} aria-hidden="true" />
      <p className="text-ink2 flex-1 min-w-0 basis-[calc(100%-2.5rem)] md:basis-auto">{title && <b className="font-semibold text-ink">{title} </b>}{children}</p>
      {action && <div className="shrink-0 flex gap-2 flex-wrap pl-8 md:pl-0">{action}</div>}
    </div>
  );
}

/* ---------- Suggestion box: labelled, a different background, never acts by itself ---------- */
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
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return <span className={cx("block h-1.5 rounded-full bg-sunken overflow-hidden", className)} aria-hidden="true"><span className={cx("block h-full rounded-full transition-all duration-700", c)} style={{ width: `${v}%` }} /></span>;
}

/** Horizontal bars with a label and a value, like "Overdue by class". */
export function HBars({ rows, labelWidth = 72, valueWidth = 92 }: { rows: { key: string; label: string; value: number; text: React.ReactNode; href?: string; active?: boolean; tone?: "brand" | "warn" | "bad" | "ok" }[]; labelWidth?: number; valueWidth?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="text-ink2 font-medium truncate">{r.label}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden"><span className={cx("absolute inset-y-0 left-0 rounded-full", r.tone === "warn" ? "bg-warn" : r.tone === "bad" ? "bg-bad" : r.tone === "ok" ? "bg-ok" : "bg-brand")} style={{ width: `${(r.value / max) * 100}%` }} /></span>
            <span className="text-right font-semibold tnum">{r.text}</span>
          </>
        );
        const cls = cx("w-full grid items-center gap-3 text-[13px] rounded-lg -mx-1 px-1 py-0.5 text-left", r.href && (r.active ? "bg-brand/8" : "hover:bg-sunken/70"));
        const style = { gridTemplateColumns: `${labelWidth}px 1fr ${valueWidth}px` };
        return <li key={r.key}>{r.href ? <Link href={r.href} scroll={false} className={cls} style={style} aria-current={r.active ? "true" : undefined}>{inner}</Link> : <div className={cls} style={style}>{inner}</div>}</li>;
      })}
    </ul>
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
export function DL({ rows, cols = 2, className }: { rows: [string, React.ReactNode][]; cols?: 2 | 3; className?: string }) {
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

/** A small label and value, used inside sheets. */
export function Mini({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-ink3 font-semibold">{k}</p>
      <div className="text-[14px] mt-0.5 break-words">{v}</div>
    </div>
  );
}

/* ---------- Timeline (newest first) ---------- */
export function Timeline({ items }: { items: { icon: LucideIcon; tone?: Tone; what: React.ReactNode; when: React.ReactNode }[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((t, i) => {
        const Ic = t.icon;
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

/* ---------- Layout: main and side ---------- */
export function Split({ children, side = 340, className }: { children: React.ReactNode; side?: 300 | 340 | 380; className?: string }) {
  return <div className={cx("grid gap-5 lg:gap-6 items-start", side === 380 ? "xl:grid-cols-[minmax(0,1fr)_380px]" : side === 300 ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "xl:grid-cols-[minmax(0,1fr)_340px]", className)}>{children}</div>;
}
export function Col({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col gap-5 lg:gap-6 min-w-0", className)}>{children}</div>;
}
/** The page body under the header: cards with the standard gap. */
export function Stack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col gap-5 lg:gap-6", className)}>{children}</div>;
}

/* ---------- Search and filters at the top of a list card ---------- */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col md:flex-row md:flex-wrap md:items-center gap-2.5 p-3 border-b border-line", className)}>{children}</div>;
}

/* ---------- Settings rows: title, one line under it, a control on the right ---------- */
export function SettingRow({ title, sub, children, htmlFor }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; htmlFor?: string }) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Label {...(htmlFor ? { htmlFor } : {})} className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block">{title}</b>
        {sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}
      </Label>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/* ---------- One row in a simple list ---------- */
export function ListRow({ avatar, icon, iconTone = "neutral", title, sub, right, href, className }: { avatar?: string; icon?: LucideIcon; iconTone?: Tone; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; href?: string; className?: string }) {
  const Ic = icon;
  const inner = (
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
  return href ? <Link href={href} scroll={false} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/* ---------- A plain table for reports: scrolls sideways inside its card on phones ---------- */
export type SimpleCol<R> = { label: string; right?: boolean; nowrap?: boolean; render: (r: R) => React.ReactNode };
export function SimpleTable<R>({ cols, rows, foot, minWidth = 560, rowKey, caption }: { cols: SimpleCol<R>[]; rows: R[]; foot?: React.ReactNode[]; minWidth?: number; rowKey?: (r: R, i: number) => string | number; caption?: string }) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-[13.5px]" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="text-[12px] text-ink3 border-y border-line text-left">
            {cols.map((c, i) => <th key={c.label + i} scope="col" className={cx("py-2.5 font-semibold whitespace-nowrap", i === 0 ? "pl-5 pr-3 sticky left-0 bg-surface" : "px-3", i === cols.length - 1 && "pr-5", c.right && "text-right")}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey ? rowKey(r, ri) : ri} className="border-b border-line/70 last:border-0">
              {cols.map((c, i) => <td key={c.label + i} className={cx("py-2.5 align-middle", i === 0 ? "pl-5 pr-3 sticky left-0 bg-surface font-medium" : "px-3", i === cols.length - 1 && "pr-5", c.right && "text-right tnum", c.nowrap !== false && "whitespace-nowrap")}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-line font-semibold">
              {cols.map((c, i) => <td key={c.label + i} className={cx("py-2.5 whitespace-nowrap", i === 0 ? "pl-5 pr-3 sticky left-0 bg-surface" : "px-3", i === cols.length - 1 && "pr-5", c.right && "text-right tnum")}>{foot[i]}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* ---------- Lists: a table on computers, cards on phones ---------- */
export type DataCol<R> = { key: string; label: string; render: (r: R) => React.ReactNode; align?: "right"; nowrap?: boolean; className?: string };
export type PhoneCard = { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; avatar?: string; icon?: LucideIcon; iconTone?: Tone; pills?: React.ReactNode };

export function DataList<R>({ columns, rows, rowKey, rowHref, phone, empty, footer, minWidth = 640, caption, rowClass }: {
  columns: DataCol<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  rowHref?: (r: R) => string | null;
  phone: (r: R) => PhoneCard;
  empty?: React.ReactNode;
  footer?: React.ReactNode | false;
  minWidth?: number;
  caption?: string;
  rowClass?: (r: R) => string | false | null | undefined;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      <div className="hidden lg:block overflow-x-auto scroll-thin">
        <table className="w-full text-left text-[14px]" style={{ minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
              {columns.map((c, i) => <th key={c.key} scope="col" className={cx("px-3 py-3 font-semibold whitespace-nowrap", i === 0 && "pl-5", i === columns.length - 1 && !rowHref && "pr-5", c.align === "right" && "text-right")}>{c.label}</th>)}
              {rowHref && <th className="w-8"><span className="sr-only">Open</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = rowHref?.(r) ?? null;
              return (
                <tr key={rowKey(r)} className={cx("border-b border-line/70 last:border-0 transition group relative", href && "hover:bg-sunken/60", rowClass?.(r))}>
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx("px-3 py-2.5 align-middle", i === 0 && "pl-5", i === columns.length - 1 && !href && "pr-5", c.align === "right" && "text-right tnum", c.nowrap && "whitespace-nowrap", c.className)}>
                      {c.render(r)}
                    </td>
                  ))}
                  {href && (
                    <td className="pr-3">
                      <Link href={href} scroll={false} className="absolute inset-0 z-0" aria-label="Open" />
                      <ChevronRight size={18} className="text-ink3 opacity-0 group-hover:opacity-100 transition" aria-hidden="true" />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="lg:hidden divide-y divide-line/70">
        {rows.map((r) => {
          const m = phone(r);
          const href = rowHref?.(r) ?? null;
          const Ic = m.icon;
          const body = (
            <>
              {m.avatar ? <Avatar name={m.avatar} size={42} /> : Ic ? <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[m.iconTone ?? "neutral"])}><Ic size={19} aria-hidden="true" /></span> : null}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate">{m.title}</p>
                {m.sub && <p className="text-[13px] text-ink3 truncate">{m.sub}</p>}
                {m.pills && <div className="flex gap-1.5 mt-1.5 flex-wrap">{m.pills}</div>}
              </div>
              {m.right && <div className="text-right shrink-0">{m.right}</div>}
              {href && <ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" />}
            </>
          );
          return (
            <li key={rowKey(r)}>
              {href ? <Link href={href} scroll={false} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">{body}</Link>
                : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}
            </li>
          );
        })}
      </ul>
      {footer !== false && footer !== undefined && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3">
          {footer}
        </div>
      )}
    </>
  );
}

/** Empty state inside a card (no extra card around it). */
export function Empty({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
      <span className="w-14 h-14 rounded-2xl bg-sunken text-ink3 grid place-items-center" aria-hidden="true"><Icon size={26} /></span>
      <h3 className="font-semibold text-[15px]">{title}</h3>
      {body && <div className="text-sm text-ink3 max-w-sm">{body}</div>}
      {action}
    </div>
  );
}
