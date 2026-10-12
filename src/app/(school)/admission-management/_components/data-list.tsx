"use client";

// A list as a table on computers and as cards on phones (design/ui-prototype/src/kit.jsx DataList),
// with tick boxes for bulk actions and paging kept in the page address (00-global.md P1, P11).

import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { cx } from "@/components/ui/cx";
import { TONE_SOFT } from "@/components/ui/stats";

type Sel = { ids: Set<string>; set: (s: Set<string>) => void };
const SelectionCtx = createContext<Sel | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [ids, set] = useState<Set<string>>(new Set());
  const v = useMemo(() => ({ ids, set }), [ids]);
  return <SelectionCtx.Provider value={v}>{children}</SelectionCtx.Provider>;
}

export function useSelection() {
  return useContext(SelectionCtx) ?? { ids: new Set<string>(), set: () => {} };
}

/** Bar shown when rows are ticked. */
export function BulkBar({ children }: { children: React.ReactNode }) {
  const { ids, set } = useSelection();
  if (!ids.size) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-brand/8 border-b border-brand/20 animate-fade flex-wrap" role="region" aria-label="Actions for ticked rows">
      <p className="text-[13.5px] font-semibold text-brand mr-2">{ids.size} selected</p>
      {children}
      <Button size="sm" variant="ghost" onClick={() => set(new Set())}>Clear</Button>
    </div>
  );
}

export type ListColumn = { key: string; label: string; align?: "right"; nowrap?: boolean; className?: string };
export type MobileCard = { title: React.ReactNode; sub?: React.ReactNode; avatar?: string; icon?: React.ReactNode; iconTone?: string; pills?: React.ReactNode[]; right?: React.ReactNode };
export type ListRow = { key: string; href?: string; cells: React.ReactNode[]; mobile: MobileCard; active?: boolean };

export function DataList({ columns, rows, empty, footer, minWidth = 640, bp = "lg", selectable, label }: {
  columns: ListColumn[]; rows: ListRow[]; empty: React.ReactNode; footer?: React.ReactNode | false; minWidth?: number; bp?: "md" | "lg"; selectable?: boolean; label: string;
}) {
  const router = useRouter();
  const { ids, set } = useSelection();
  if (!rows.length) return <>{empty}</>;
  const allOn = rows.every((r) => ids.has(r.key));
  const someOn = rows.some((r) => ids.has(r.key));
  const toggle = (k: string) => { const n = new Set(ids); if (n.has(k)) n.delete(k); else n.add(k); set(n); };
  const hasHref = rows.some((r) => r.href);
  return (
    <>
      <div className={cx("hidden overflow-x-auto scroll-thin", bp === "md" ? "md:block" : "lg:block")}>
        <table className="w-full text-left text-[14px]" style={{ minWidth }}>
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
              {selectable && <th className="pl-4 pr-2 py-3 w-10"><Checkbox label="Select all" checked={allOn} indeterminate={!allOn && someOn} onChange={() => set(allOn ? new Set() : new Set(rows.map((r) => r.key)))} /></th>}
              {columns.map((c, i) => <th key={c.key} scope="col" className={cx("px-3 py-3 font-semibold whitespace-nowrap", i === 0 && !selectable && "pl-5", i === columns.length - 1 && "pr-5", c.align === "right" && "text-right")}>{c.label}</th>)}
              {hasHref && <th className="w-8"><span className="sr-only">Open</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={r.href ? (e) => { if ((e.target as HTMLElement).closest("a,button,input,label")) return; router.push(r.href!, { scroll: false }); } : undefined}
                className={cx("border-b border-line/70 last:border-0 transition group", r.href && "cursor-pointer", ids.has(r.key) || r.active ? "bg-brand/5" : r.href && "hover:bg-sunken/60")}>
                {selectable && <td className="pl-4 pr-2 py-3"><Checkbox label="Select row" checked={ids.has(r.key)} onChange={() => toggle(r.key)} /></td>}
                {r.cells.map((cell, i) => {
                  const c = columns[i];
                  return <td key={c?.key ?? i} className={cx("px-3 py-2.5 align-middle", i === 0 && !selectable && "pl-5", i === columns.length - 1 && !hasHref && "pr-5", c?.align === "right" && "text-right tnum", c?.nowrap && "whitespace-nowrap", c?.className)}>{cell}</td>;
                })}
                {hasHref && <td className="pr-3">{r.href && <Link href={r.href} scroll={false} aria-label="Open" className="grid place-items-center text-ink3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"><ChevronRight size={18} aria-hidden="true" /></Link>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={cx("divide-y divide-line/70", bp === "md" ? "md:hidden" : "lg:hidden")} aria-label={label}>
        {rows.map((r) => {
          const m = r.mobile;
          const body = (
            <>
              {m.avatar ? <Avatar name={m.avatar} size={42} /> : m.icon ? <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[m.iconTone ?? "neutral"])}>{m.icon}</span> : null}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate">{m.title}</p>
                {m.sub && <p className="text-[13px] text-ink3 truncate">{m.sub}</p>}
                {m.pills && m.pills.filter(Boolean).length > 0 && <div className="flex gap-1.5 mt-1.5 flex-wrap">{m.pills}</div>}
              </div>
              {m.right && <div className="text-right shrink-0">{m.right}</div>}
              {r.href && <ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" />}
            </>
          );
          return (
            <li key={r.key} className={cx("flex items-center", (ids.has(r.key) || r.active) && "bg-brand/5")}>
              {selectable && <span className="pl-4"><Checkbox label="Select row" checked={ids.has(r.key)} onChange={() => toggle(r.key)} /></span>}
              {r.href ? <Link href={r.href} scroll={false} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">{body}</Link>
                : <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">{body}</div>}
            </li>
          );
        })}
      </ul>
      {footer !== false && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3 flex-wrap">
          {footer ?? <span className="tnum">Showing {rows.length}</span>}
        </div>
      )}
    </>
  );
}

/** "Showing 1 to 25 of 140" with Previous and Next, for the footer of a DataList. */
export function Pager({ page, pageSize, total, prevHref, nextHref }: { page: number; pageSize: number; total: number; prevHref: string; nextHref: string }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <>
      <span className="tnum" aria-live="polite">Showing {from}{to > from ? ` to ${to}` : ""} of {total.toLocaleString("en-IN")}</span>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1.5">
          {page > 1 ? <Link href={prevHref} scroll={false} aria-label="Previous page" className="grid size-9 place-items-center rounded-lg border border-line text-ink2 hover:bg-sunken"><ChevronLeft size={17} aria-hidden="true" /></Link> : null}
          <span className="tnum px-1">Page {page} of {pages}</span>
          {page < pages ? <Link href={nextHref} scroll={false} aria-label="Next page" className="grid size-9 place-items-center rounded-lg border border-line text-ink2 hover:bg-sunken"><ChevronRight size={17} aria-hidden="true" /></Link> : null}
        </nav>
      )}
    </>
  );
}
