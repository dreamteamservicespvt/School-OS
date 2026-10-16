// Stock movements for the item, kind, store, search and dates on screen.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { itemLabel } from "@/lib/inventory/items";
import { MOVE_KIND } from "@/lib/inventory/words";
import { invRoute, rangeWords } from "../../../_lib/route";
import { movesList, readMovesFilter } from "../../../_lib/lists";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await invRoute(req, "items");
  if (x instanceof Response) return x;
  const f = readMovesFilter(x.get, null);
  // The item page shows all dates unless chosen; the movements view starts at this month.
  const range = await x.range(f.item ? null : "thismonth");
  f.range = range;
  const title = "Stock movements";
  const r = await withSchool(x.current.ctx, async (tx) => {
    const list = await movesList(tx, f, { skip: 0, take: 20000 });
    const stores = new Map((await tx.storeLocation.findMany()).map((s) => [s.id, s.name]));
    const item = f.item ? await tx.item.findFirst({ where: { id: f.item } }) : null;
    const filters = [rangeWords(range), item ? `Item: ${itemLabel(item)}` : "", f.kind ? `Kind: ${f.kind}` : "", f.store ? `Store: ${stores.get(f.store) ?? ""}` : "", f.q ? `Search: ${f.q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: list.rows.length });
    return { ...list, stores, filters };
  }, { timeout: 60_000 });
  type Row = (typeof r.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (m) => formatDate(m.date, "UTC") },
    { label: "Code", value: (m) => m.item.code },
    { label: "Item", value: (m) => itemLabel(m.item) },
    { label: "Movement", value: (m) => MOVE_KIND[m.kind].label },
    { label: "Quantity", value: (m) => m.qty },
    { label: "Balance after", value: (m) => m.balanceAfter },
    { label: "Store", value: (m) => r.stores.get(m.locationId) ?? "" },
    { label: "Reference", value: (m) => m.reference ?? "" },
    { label: "Reason", value: (m) => m.reason ?? "" },
    { label: "By", value: (m) => r.who.get(m.createdById ?? "") ?? "" },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
