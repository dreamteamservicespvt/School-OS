import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, SearchX } from "lucide-react";
import { Avatar } from "./avatar";
import { cx } from "./cx";
import { EmptyState } from "../empty-state";
import { TONE_SOFT, type Tone } from "./stats";

// A list in the approved design (design/ui-prototype/src/kit.jsx DataList): a table on computers and
// cards on phones, inside a card. Rows open their record by link. Optional tick boxes for bulk actions
// (each with form= so a bar elsewhere on the page can read them) and paging links in the footer.

export type ListColumn<R> = { key: string; label: string; render: (row: R) => React.ReactNode; align?: "right"; nowrap?: boolean; className?: string };
export type ListCard = { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; avatar?: string; icon?: LucideIcon; iconTone?: Tone | "neutral"; pills?: React.ReactNode[] };
export type Paging = { page: number; pageSize: number; total: number; href: (page: number) => string };

export function DataList<R>({ columns, rows, rowKey, href, mobile, empty, footer, minWidth = 640, bp = "lg", select, paging, caption }: {
  columns: ListColumn<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  href?: (row: R) => string;
  mobile: (row: R) => ListCard;
  empty?: React.ReactNode;
  footer?: React.ReactNode | false;
  minWidth?: number;
  bp?: "md" | "lg";
  select?: { form: string; name?: string; label: (row: R) => string };
  paging?: Paging;
  caption: string;
}) {
  if (!rows.length) return <>{empty ?? <EmptyState bare Icon={SearchX} title="Nothing matches">Try a different search or filter.</EmptyState>}</>;
  const tick = (r: R, phone = false) => select ? (
    <input type="checkbox" form={select.form} name={select.name ?? "id"} value={rowKey(r)} aria-label={select.label(r)} data-bulk-row
      className={cx("size-5 rounded-md accent-brand shrink-0", phone && "relative z-10")} />
  ) : null;
  const from = paging ? (paging.page - 1) * paging.pageSize + 1 : 1;
  const to = paging ? Math.min(paging.total, paging.page * paging.pageSize) : rows.length;
  const pages = paging ? Math.max(1, Math.ceil(paging.total / paging.pageSize)) : 1;
  return (
    <>
      <div className={cx("hidden overflow-x-auto scroll-thin", bp === "md" ? "md:block" : "lg:block")}>
        <table className="w-full text-left text-[14px]" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
              {select && <th scope="col" className="pl-4 pr-2 py-3 w-10"><input type="checkbox" data-bulk-all={select.form} aria-label="Choose every row on this page" className="size-5 rounded-md accent-brand" /></th>}
              {columns.map((c, i) => <th scope="col" key={c.key} className={cx("px-3 py-3 font-semibold whitespace-nowrap", i === 0 && !select && "pl-5", i === columns.length - 1 && "pr-5", c.align === "right" && "text-right")}>{c.label}</th>)}
              {href && <th className="w-8"><span className="sr-only">Open</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const link = href?.(r);
              return (
                <tr key={rowKey(r)} className={cx("border-b border-line/70 last:border-0 transition group relative", link && "hover:bg-sunken/60 has-[:checked]:bg-brand/5")}>
                  {select && <td className="pl-4 pr-2 py-3 relative z-10">{tick(r)}</td>}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx("px-3 py-2.5 align-middle", i === 0 && !select && "pl-5", i === columns.length - 1 && !link && "pr-5", c.align === "right" && "text-right tnum", c.nowrap && "whitespace-nowrap", c.className)}>
                      {i === 0 && link ? <Link href={link} className="after:absolute after:inset-0 outline-offset-[-2px]">{c.render(r)}</Link> : c.render(r)}
                    </td>
                  ))}
                  {link && <td className="pr-3"><ChevronRight size={18} className="text-ink3 opacity-0 group-hover:opacity-100 transition" aria-hidden="true" /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className={cx("divide-y divide-line/70", bp === "md" ? "md:hidden" : "lg:hidden")} aria-label={caption}>
        {rows.map((r) => {
          const m = mobile(r);
          const link = href?.(r);
          const Ic = m.icon;
          return (
            <li key={rowKey(r)} className="relative flex items-center gap-3 px-4 py-3 active:bg-sunken">
              {tick(r, true)}
              {m.avatar ? <Avatar name={m.avatar} size={42} /> : Ic ? <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[m.iconTone || "neutral"])}><Ic size={19} aria-hidden="true" /></span> : null}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate">{link ? <Link href={link} className="after:absolute after:inset-0">{m.title}</Link> : m.title}</p>
                {m.sub && <p className="text-[13px] text-ink3 truncate">{m.sub}</p>}
                {m.pills && m.pills.some(Boolean) && <div className="flex gap-1.5 mt-1.5 flex-wrap">{m.pills}</div>}
              </div>
              {m.right && <div className="text-right shrink-0">{m.right}</div>}
              {link && <ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ul>
      {footer !== false && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3 flex-wrap">
          <span className="tnum" aria-live="polite">{footer ?? (paging ? `Showing ${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")} of ${paging.total.toLocaleString("en-IN")}` : `Showing ${rows.length} of ${rows.length}`)}</span>
          {paging && pages > 1 && (
            <nav aria-label="Pages" className="flex items-center gap-1.5">
              {paging.page > 1 ? <Link className="h-8 px-3 rounded-lg border border-line bg-surface text-ink2 font-semibold grid place-items-center hover:bg-sunken" href={paging.href(paging.page - 1)}>Previous</Link> : null}
              <span className="px-2 tnum">Page {paging.page} of {pages}</span>
              {paging.page < pages ? <Link className="h-8 px-3 rounded-lg border border-line bg-surface text-ink2 font-semibold grid place-items-center hover:bg-sunken" href={paging.href(paging.page + 1)}>Next</Link> : null}
            </nav>
          )}
        </div>
      )}
    </>
  );
}
