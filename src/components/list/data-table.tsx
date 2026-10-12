// A list as a table on computers and as cards on phones (00-global.md P1, §6 rule 2).

import Link from "next/link";
import { listHref, PAGE_SIZE, type ListParams } from "@/lib/list";

export type Column<Row> = {
  key: string;
  label: string;
  cell: (row: Row) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  /** Shown on phone cards: "title" is the card's first line, "meta" the smaller lines. Others are hidden on phones. */
  phone?: "title" | "meta" | "badge";
};

type Props<Row> = {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  total: number;
  params: ListParams;
  path: string;
  /** Actions on each row (P12). */
  actions?: (row: Row) => React.ReactNode;
  caption: string;
  pageSize?: number;
  empty: React.ReactNode;
  /** Bulk actions (P11): a tick box on each row, sent with the form named here. */
  select?: { form: string; name?: string; label: (row: Row) => string; value: (row: Row) => string };
};

export function DataTable<Row>({ rows, columns, rowKey, rowHref, total, params, path, actions, caption, pageSize = PAGE_SIZE, empty, select }: Props<Row>) {
  if (total === 0) return <>{empty}</>;
  const from = (params.page - 1) * pageSize + 1;
  const to = Math.min(total, params.page * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const sortLink = (key: string) => listHref(path, params, { sort: key, dir: params.sort === key && params.dir === "asc" ? "desc" : "asc", page: null });
  const titleCol = columns.find((c) => c.phone === "title") ?? columns[0];
  const tick = (row: Row) => select ? (
    <input type="checkbox" form={select.form} name={select.name ?? "id"} value={select.value(row)} aria-label={select.label(row)} data-bulk-row
      className="size-5 accent-brand" />
  ) : null;

  return (
    <div>
      {/* Computers and tablets */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-line bg-surface-2 text-sm text-ink-2">
            <tr>
              {select && <th scope="col" className="w-12 px-4 py-3"><input type="checkbox" data-bulk-all aria-label="Choose every student on this page" className="size-5 accent-brand" /></th>}
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 font-medium ${c.className ?? ""}`}
                  aria-sort={params.sort === c.key ? (params.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.sortable ? (
                    <Link href={sortLink(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.label}
                      <span aria-hidden="true">{params.sort === c.key ? (params.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                    </Link>
                  ) : c.label}
                </th>
              ))}
              {actions && <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-surface-2/60">
                {select && <td className="px-4 py-3">{tick(row)}</td>}
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ""}`}>
                    {i === 0 && rowHref ? <Link href={rowHref(row)} className="font-medium text-brand-text hover:underline">{c.cell(row)}</Link> : c.cell(row)}
                  </td>
                ))}
                {actions && <td className="px-4 py-2 text-right">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones */}
      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const meta = columns.filter((c) => c.phone === "meta");
          const badge = columns.find((c) => c.phone === "badge");
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{titleCol.cell(row)}</span>
                {badge && badge.cell(row)}
              </div>
              {meta.map((c) => (
                <p key={c.key} className="text-sm text-ink-2"><span className="sr-only">{c.label}: </span>{c.cell(row)}</p>
              ))}
            </>
          );
          return (
            <li key={rowKey(row)} className={`rounded-xl border border-line bg-surface ${select ? "flex items-start" : ""}`}>
              {select && <label className="grid min-h-11 min-w-11 place-items-center self-stretch pl-3"><span className="sr-only">Choose</span>{tick(row)}</label>}
              <div className="min-w-0 flex-1">
              {rowHref ? <Link href={rowHref(row)} className="block p-4">{body}</Link> : <div className="p-4">{body}</div>}
              {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-3 py-2">{actions(row)}</div>}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
        <p aria-live="polite">Showing {from} to {to} of {total.toLocaleString("en-IN")}</p>
        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-2">
            {params.page > 1 ? <Link className="min-h-11 rounded-lg border border-line px-3 py-2.5 hover:bg-surface-2" href={listHref(path, params, { page: params.page - 1 })}>Previous</Link> : null}
            <span>Page {params.page} of {pages}</span>
            {params.page < pages ? <Link className="min-h-11 rounded-lg border border-line px-3 py-2.5 hover:bg-surface-2" href={listHref(path, params, { page: params.page + 1 })}>Next</Link> : null}
          </nav>
        )}
      </div>
    </div>
  );
}
