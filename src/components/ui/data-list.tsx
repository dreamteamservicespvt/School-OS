// A list as a table on computers and as cards on phones, in the approved design
// (design/ui-prototype/src/kit.jsx DataList). Rendered on the server: a row opens
// its record through a link that covers the row, and tick boxes for bulk actions
// belong to a form elsewhere on the page (see InlineBulkBar).

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cx } from "./cx";
import { Avatar } from "./avatar";
import { TONE_SOFT, type Tone } from "./blocks";

export type DataColumn<Row> = {
  key: string;
  label: React.ReactNode;
  render: (row: Row) => React.ReactNode;
  align?: "right";
  nowrap?: boolean;
  className?: string;
  /** A sort link for the heading. */
  sortHref?: string;
  sorted?: "asc" | "desc" | null;
};

export type MobileCard = {
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  avatar?: string;
  avatarSrc?: string | null;
  icon?: LucideIcon;
  iconTone?: Tone;
  pills?: React.ReactNode[];
};

/** The look of a tick box in a list (the prototype's Checkbox), as a real form input. */
export const tickCls = "peer size-5 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-line bg-surface transition hover:border-ink3 checked:border-brand checked:bg-brand indeterminate:border-brand indeterminate:bg-brand bg-center bg-no-repeat checked:bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\")] checked:bg-[length:13px] indeterminate:bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round'%3E%3Cpath d='M6 12h12'/%3E%3C/svg%3E\")] indeterminate:bg-[length:12px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20";

export type ListSelect<Row> = { form: string; label: (row: Row) => string; value: (row: Row) => string; allLabel?: string };

export function DataList<Row>({ rows, columns, rowKey, rowHref, rowLabel, mobile, empty, select, selectOnPhone, footer, minWidth = 640, bp = "lg", caption, rowClass }: {
  rows: Row[];
  columns: DataColumn<Row>[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string | null;
  /** Words for the row link, for screen readers (e.g. "Open Aarav Sharma"). */
  rowLabel?: (row: Row) => string;
  mobile: (row: Row) => MobileCard;
  empty: React.ReactNode;
  select?: ListSelect<Row>;
  /** Tick boxes on the phone cards too (the design leaves them out of most lists). */
  selectOnPhone?: boolean;
  footer?: React.ReactNode;
  minWidth?: number;
  bp?: "md" | "lg";
  caption: string;
  rowClass?: (row: Row) => string | undefined;
}) {
  if (!rows.length) return <>{empty}</>;
  const tick = (r: Row) => select ? (
    <input type="checkbox" form={select.form} name="id" value={select.value(r)} aria-label={select.label(r)} data-bulk-row className={cx(tickCls, "relative z-[1]")} />
  ) : null;
  return (
    <>
      <div className={cx("hidden overflow-x-auto scroll-thin", bp === "md" ? "md:block" : "lg:block")}>
        <table className="w-full text-left text-[14px]" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
              {select && <th scope="col" className="pl-4 pr-2 py-3 w-10"><input type="checkbox" data-bulk-all aria-label={select.allLabel ?? "Select all on this page"} className={tickCls} /></th>}
              {columns.map((c, i) => (
                <th key={c.key} scope="col" aria-sort={c.sorted ? (c.sorted === "asc" ? "ascending" : "descending") : undefined}
                  className={cx("px-3 py-3 font-semibold whitespace-nowrap", i === 0 && !select && "pl-5", i === columns.length - 1 && !rowHref && "pr-5", c.align === "right" && "text-right")}>
                  {c.sortHref ? <Link href={c.sortHref} scroll={false} className="inline-flex items-center gap-1 hover:text-ink">{c.label}<span aria-hidden="true" className="text-[10px]">{c.sorted === "asc" ? "▲" : c.sorted === "desc" ? "▼" : ""}</span></Link> : c.label}
                </th>
              ))}
              {rowHref && <th scope="col" className="w-10"><span className="sr-only">Open</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = rowHref?.(r) ?? null;
              return (
                <tr key={rowKey(r)} className={cx("relative border-b border-line/70 last:border-0 transition group has-[:checked]:bg-brand/5", href && "cursor-pointer hover:bg-sunken/60", rowClass?.(r))}>
                  {select && <td className="pl-4 pr-2 py-3 align-middle">{tick(r)}</td>}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx("px-3 py-2.5 align-middle", i === 0 && !select && "pl-5", i === columns.length - 1 && !href && "pr-5", c.align === "right" && "text-right tnum", c.nowrap && "whitespace-nowrap", c.className)}>
                      {c.render(r)}
                    </td>
                  ))}
                  {href && (
                    <td className="pr-3 w-10">
                      <Link href={href} aria-label={rowLabel?.(r) ?? "Open"} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand">
                        <ChevronRight size={18} className="text-ink3 opacity-0 group-hover:opacity-100 transition" aria-hidden="true" />
                      </Link>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className={cx("divide-y divide-line/70", bp === "md" ? "md:hidden" : "lg:hidden")} aria-label={caption}>
        {rows.map((r) => {
          const m = mobile(r);
          const href = rowHref?.(r) ?? null;
          const Ic = m.icon;
          const body = (
            <>
              {m.avatar ? <Avatar name={m.avatar} src={m.avatarSrc} size={44} /> : Ic ? <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[m.iconTone ?? "neutral"])} aria-hidden="true"><Ic size={19} /></span> : null}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate">{m.title}</p>
                {m.sub && <p className="text-[13px] text-ink3 truncate">{m.sub}</p>}
                {m.pills && m.pills.length > 0 && <div className="flex gap-1.5 mt-1.5 flex-wrap">{m.pills}</div>}
              </div>
              {m.right && <div className="text-right shrink-0">{m.right}</div>}
              {href && <ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" />}
            </>
          );
          return (
            <li key={rowKey(r)} className="relative flex items-center has-[:checked]:bg-brand/5">
              {select && selectOnPhone && <span className="pl-4 grid place-items-center">{tick(r)}</span>}
              {href
                ? <Link href={href} className="w-full min-w-0 flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">{body}</Link>
                : <div className="w-full min-w-0 flex items-center gap-3 px-4 py-3">{body}</div>}
            </li>
          );
        })}
      </ul>
      {footer}
    </>
  );
}

/** A small pill size used on phone cards. */
export const cardPill = "!h-[22px] !text-[11.5px]";
