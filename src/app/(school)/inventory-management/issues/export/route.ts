// Issues for the filters and dates on screen (Issue Stock).
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { itemLabel } from "@/lib/inventory/items";
import { ISSUE_TO } from "@/lib/inventory/words";
import { invRoute, rangeWords } from "../../_lib/route";
import { issuesList, readIssuesFilter } from "../../_lib/lists";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await invRoute(req, "issue");
  if (x instanceof Response) return x;
  const range = await x.range(x.can.issue ? "today" : "thismonth");
  const f = readIssuesFilter(x.get, range);
  const title = "Stock issues";
  const r = await withSchool(x.current.ctx, async (tx) => {
    const list = await issuesList(tx, f, { skip: 0, take: 20000 });
    const filters = [rangeWords(range), f.to ? `Issued to: ${ISSUE_TO[f.to as "STAFF"]}` : "", f.open ? "Still to be returned" : "", f.sets ? "Book sets" : "", f.q ? `Search: ${f.q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: list.rows.length });
    return { ...list, filters };
  }, { timeout: 60_000 });
  type Row = (typeof r.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (i) => formatDate(i.date, "UTC") },
    { label: "Issue no.", value: (i) => i.number },
    { label: "Issued to", value: (i) => ISSUE_TO[i.toKind] },
    { label: "Name", value: (i) => r.to.get(i.id) ?? "" },
    { label: "Book set", value: (i) => (i.bookSetId ? r.sets.get(i.bookSetId) ?? "" : "") },
    { label: "Items", value: (i) => i.lines.map((l) => { const it = r.items.get(l.itemId); return `${it ? itemLabel(it) : "Item"} × ${l.qty}`; }).join("; ") },
    { label: "Quantity", value: (i) => i.lines.reduce((a, l) => a + l.qty, 0) },
    { label: "Charged to fees", value: (i) => (i.chargePaise > BigInt(0) ? formatRupees(i.chargePaise) : "") },
    { label: "Returnable", value: (i) => (i.returnable ? "Yes" : "No") },
    { label: "Returned", value: (i) => (i.returnable ? `${i.lines.reduce((a, l) => a + l.returnedQty, 0)} of ${i.lines.reduce((a, l) => a + l.qty, 0)}` : "") },
    { label: "Issued by", value: (i) => r.who.get(i.createdById ?? "") ?? "" },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
