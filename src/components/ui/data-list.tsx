import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Avatar } from "./avatar";
import { cx } from "./cx";
import { TONE_SOFT, type SoftTone } from "./stats";

// A list as a table on computers and cards on phones (design/ui-prototype/src/kit.jsx DataList).
// A row opens by its link (usually "?open=<id>", which shows a sheet), so it works without
// browser code and the open record can be shared.

export type DataColumn<R> = { key: string; label: string; render: (row: R) => React.ReactNode; align?: "right"; className?: string; nowrap?: boolean };
export type MobileRow = { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; avatar?: string; icon?: LucideIcon; iconTone?: SoftTone; pills?: React.ReactNode };

export function DataList<R>({ columns, rows, rowKey, href, mobile, empty, footer, minWidth = 640, caption, actions, lead }: {
  columns: DataColumn<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  href?: (r: R) => string | null;
  mobile: (r: R) => MobileRow;
  empty: React.ReactNode;
  footer?: React.ReactNode | false;
  minWidth?: number;
  caption: string;
  /** A cell at the end of each row, e.g. a "…" menu. It stays clickable over the row link. */
  actions?: (r: R) => React.ReactNode;
  /** A cell at the start of each row, e.g. a tick box. */
  lead?: { header: React.ReactNode; cell: (r: R) => React.ReactNode };
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      <div className="hidden lg:block overflow-x-auto scroll-thin">
        <table className="w-full text-left text-[14px]" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
              {lead && <th scope="col" className="pl-4 pr-2 py-3 w-10">{lead.header}</th>}
              {columns.map((c, i) => <th key={c.key} scope="col" className={cx("px-3 py-3 font-semibold whitespace-nowrap", i === 0 && !lead && "pl-5", i === columns.length - 1 && !actions && !href && "pr-5", c.align === "right" && "text-right")}>{c.label}</th>)}
              {actions && <th scope="col" className="w-12 pr-5"><span className="sr-only">Actions</span></th>}
              {href && !actions && <th className="w-8" aria-hidden="true" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const to = href?.(r) ?? null;
              return (
                <tr key={rowKey(r)} className={cx("border-b border-line/70 last:border-0 transition group", to && "relative cursor-pointer hover:bg-sunken/60")}>
                  {lead && <td className="pl-4 pr-2 py-3 relative z-10">{lead.cell(r)}</td>}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx("px-3 py-2.5 align-middle", i === 0 && !lead && "pl-5", i === columns.length - 1 && !to && !actions && "pr-5", c.align === "right" && "text-right tnum", c.nowrap && "whitespace-nowrap", c.className)}>
                      {i === 0 && to ? <Link href={to} scroll={false} className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand focus-visible:after:rounded-lg">{c.render(r)}</Link> : c.render(r)}
                    </td>
                  ))}
                  {actions && <td className="pr-5 py-2 relative z-10 text-right">{actions(r)}</td>}
                  {to && !actions && <td className="pr-3"><ChevronRight size={18} className="text-ink3 opacity-0 group-hover:opacity-100 transition" aria-hidden="true" /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="lg:hidden divide-y divide-line/70" aria-label={caption}>
        {rows.map((r) => {
          const m = mobile(r);
          const to = href?.(r) ?? null;
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
              {to && <ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" />}
            </>
          );
          return (
            <li key={rowKey(r)} className="flex items-center">
              {lead && <div className="pl-4">{lead.cell(r)}</div>}
              {to ? <Link href={to} scroll={false} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">{body}</Link>
                : <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">{body}</div>}
              {actions && <div className="pr-3">{actions(r)}</div>}
            </li>
          );
        })}
      </ul>
      {footer !== false && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3 flex-wrap">
          {footer ?? <span className="tnum">Showing {rows.length} of {rows.length}</span>}
        </div>
      )}
    </>
  );
}

/** "Showing 1 to 25 of 86" with Previous and Next links. */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <>
      <span className="tnum" aria-live="polite">Showing {from} to {to} of {total.toLocaleString("en-IN")}</span>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-2">
          {page > 1 && <Link href={href(page - 1)} scroll={false} className="h-8 px-3 rounded-lg border border-line bg-surface text-ink font-semibold inline-flex items-center hover:bg-sunken">Previous</Link>}
          <span className="tnum">Page {page} of {pages}</span>
          {page < pages && <Link href={href(page + 1)} scroll={false} className="h-8 px-3 rounded-lg border border-line bg-surface text-ink font-semibold inline-flex items-center hover:bg-sunken">Next</Link>}
        </nav>
      )}
    </>
  );
}
