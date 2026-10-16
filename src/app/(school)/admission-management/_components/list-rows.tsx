// Admission lists build each row as its cells plus a phone card, then show
// them with the shared DataList (src/components/ui/data-list.tsx).
import type { DataColumn, MobileCard } from "@/components/ui/data-list";

export type ListRow = { key: string; href?: string; cells: React.ReactNode[]; mobile: MobileCard; active?: boolean };

/** The shared DataList's props for rows made of cells; the open row (?id=) is highlighted. */
export function rowList(columns: { key: string; label: string; align?: "right"; nowrap?: boolean; className?: string }[]) {
  return {
    columns: columns.map((c, i): DataColumn<ListRow> => ({ ...c, render: (r) => r.cells[i] })),
    rowKey: (r: ListRow) => r.key,
    rowHref: (r: ListRow) => r.href ?? null,
    mobile: (r: ListRow) => r.mobile,
    rowClass: (r: ListRow) => (r.active ? "bg-brand/5" : undefined),
    scroll: false,
  };
}
