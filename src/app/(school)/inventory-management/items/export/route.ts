// Items with stock in hand for the search, filters and dates on screen.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatRupees } from "@/lib/format";
import { itemLabel } from "@/lib/inventory/items";
import { STOCK_STATE } from "@/lib/inventory/words";
import { invRoute, rangeWords } from "../../_lib/route";
import { itemsList, readItemsFilter, type ItemRow } from "../../_lib/lists";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await invRoute(req, "items");
  if (x instanceof Response) return x;
  const range = await x.range(null);
  const f = readItemsFilter(x.get, range);
  const title = f.lab ? "Lab stock" : "Items and stock in hand";
  const r = await withSchool(x.current.ctx, async (tx) => {
    const rows = await itemsList(tx, f, x.tz);
    const stores = await tx.storeLocation.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }, { name: "asc" }] });
    const cats = await tx.itemCategory.findMany();
    const cat = cats.find((c) => c.id === f.cat)?.name;
    const store = stores.find((s) => s.id === f.store)?.name;
    const filters = [range ? `Added: ${rangeWords(range)}` : "", cat ? `Category: ${cat}` : "", store ? `Store: ${store}` : "", f.state ? `Status: ${f.state === "low" ? "Low and out" : f.state === "out" ? "Out of stock" : "OK"}` : "", f.q ? `Search: ${f.q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: rows.length });
    return { rows, stores, cats: new Map(cats.map((c) => [c.id, c.name])), filters };
  }, { timeout: 60_000 });
  const columns: ExportColumn<ItemRow>[] = [
    { label: "Code", value: (row) => row.item.code },
    { label: "Item", value: (row) => itemLabel(row.item) },
    { label: "Category", value: (row) => r.cats.get(row.item.categoryId) ?? "" },
    { label: "Unit", value: (row) => row.item.unit },
    ...r.stores.map((s) => ({ label: s.name, value: (row: ItemRow) => row.stores.get(s.id) ?? 0 })),
    { label: "Total in stock", value: (row) => row.total },
    { label: "Reorder level", value: (row) => row.reorder },
    { label: "Price per unit", value: (row) => (row.item.pricePaise !== null ? formatRupees(row.item.pricePaise) : "") },
    { label: "Value", value: (row) => (row.item.pricePaise !== null ? formatRupees(row.value) : "") },
    { label: "Status", value: (row) => STOCK_STATE[row.state].label },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
