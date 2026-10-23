// Purchases & Vendors for the tab, filters and dates on screen: requests,
// orders, goods received, bills or vendors. Vendor bank details are never
// exported.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { dateWhere } from "@/lib/periods";
import { itemLabel } from "@/lib/inventory/items";
import { vendorsWithDetail } from "@/lib/inventory/vendors";
import { BILL_STATUS, ORDER_STATUS, REQUEST_STATUS, billState } from "@/lib/inventory/words";
import { invRoute, rangeWords } from "../../_lib/route";
import { billsList, ordersWhere, readBillsFilter, readOrdersFilter } from "../../_lib/lists";

export const dynamic = "force-dynamic";
const day = (d: Date | null) => (d ? formatDate(d, "UTC") : "");
type Cell = string | number | null | undefined;

export async function GET(req: Request) {
  const x = await invRoute(req, "purchases");
  if (x instanceof Response) return x;
  const tab = ["requests", "orders", "receipts", "bills", "vendors"].includes(x.get("tab")) ? x.get("tab") : x.can.purchase ? "orders" : "bills";
  const range = tab === "vendors" ? null : await x.range("finyear");
  const status = x.get("status");
  const q = x.get("q").trim();
  const out = await withSchool(x.current.ctx, async (tx) => {
    const vendors = new Map((await tx.vendor.findMany({ select: { id: true, name: true } })).map((v) => [v.id, v.name]));
    const itemName = async (ids: string[]) => new Map((await tx.item.findMany({ where: { id: { in: [...new Set(ids)] } } })).map((i) => [i.id, itemLabel(i)]));
    let title = "";
    let columns: { label: string; value: (r: Record<string, Cell>) => Cell }[] = [];
    let rows: Record<string, Cell>[] = [];
    const col = (label: string, key: string) => ({ label, value: (r: Record<string, Cell>) => r[key] });
    if (tab === "requests") {
      title = "Purchase requests";
      const list = await tx.purchaseRequest.findMany({ where: { ...(status in REQUEST_STATUS ? { status: status as "WAITING" } : {}), ...(range ? { date: dateWhere(range) } : {}), ...(q ? { number: { contains: q, mode: "insensitive" } } : {}) }, orderBy: { date: "desc" }, take: 20000, include: { lines: true } });
      const names = await itemName(list.flatMap((r) => r.lines.map((l) => l.itemId)));
      rows = list.map((r) => ({ date: day(r.date), number: r.number, items: r.lines.map((l) => `${names.get(l.itemId) ?? "Item"} × ${l.qty}`).join("; "), reason: r.reason, estimate: formatRupees(r.estimatePaise), needed: day(r.neededBy), status: REQUEST_STATUS[r.status].label }));
      columns = [col("Date", "date"), col("Number", "number"), col("Items", "items"), col("Reason", "reason"), col("Estimate", "estimate"), col("Needed by", "needed"), col("Status", "status")];
    } else if (tab === "orders") {
      title = "Purchase orders";
      const list = await tx.purchaseOrder.findMany({ where: ordersWhere(readOrdersFilter(x.get, range)), orderBy: { date: "desc" }, take: 20000, include: { lines: true } });
      const names = await itemName(list.flatMap((o) => o.lines.map((l) => l.itemId)));
      rows = list.map((o) => ({ date: day(o.date), number: o.number, vendor: vendors.get(o.vendorId) ?? "", items: o.lines.map((l) => `${names.get(l.itemId) ?? "Item"} × ${l.qty} (received ${l.receivedQty})`).join("; "), amount: formatRupees(o.totalPaise), expected: day(o.expectedOn), status: ORDER_STATUS[o.status].label }));
      columns = [col("Date", "date"), col("Number", "number"), col("Vendor", "vendor"), col("Items", "items"), col("Amount", "amount"), col("Expected by", "expected"), col("Status", "status")];
    } else if (tab === "receipts") {
      title = "Goods received";
      const vendor = x.get("vendor");
      const list = await tx.goodsReceipt.findMany({ where: { ...(range ? { date: dateWhere(range) } : {}), ...(/^[0-9a-f-]{36}$/i.test(vendor) ? { order: { vendorId: vendor } } : {}) }, orderBy: { date: "desc" }, take: 20000, include: { lines: true, order: true } });
      const names = await itemName(list.flatMap((r) => r.lines.map((l) => l.itemId)));
      rows = list.map((r) => ({ date: day(r.date), number: r.number, order: r.order.number, vendor: vendors.get(r.order.vendorId) ?? "", items: r.lines.map((l) => `${names.get(l.itemId) ?? "Item"} × ${l.qty}`).join("; "), extra: r.extraReason ?? "" }));
      columns = [col("Date", "date"), col("Number", "number"), col("Order", "order"), col("Vendor", "vendor"), col("Items", "items"), col("More than ordered", "extra")];
    } else if (tab === "bills") {
      title = "Vendor bills";
      const list = await billsList(tx, readBillsFilter(x.get, range, x.today));
      rows = list.map((b) => { const st = b.expense ? billState(b.expense) : "CANCELLED"; return { date: day(b.bill.billDate), billNo: b.bill.billNo, vendor: vendors.get(b.bill.vendorId) ?? "", amount: formatRupees(b.bill.amountPaise), paid: b.expense ? formatRupees(b.expense.paidPaise) : "", due: day(b.bill.dueDate), expense: b.expense?.number ?? "", status: BILL_STATUS[st].label }; });
      columns = [col("Bill date", "date"), col("Bill number", "billNo"), col("Vendor", "vendor"), col("Amount", "amount"), col("Paid", "paid"), col("Due", "due"), col("Finance expense", "expense"), col("Status", "status")];
    } else {
      title = "Vendors";
      const list = (await vendorsWithDetail(tx, { archived: status === "archived" })).filter((v) => !q || [v.name, v.phone ?? "", v.gstin ?? ""].some((s) => s.toLowerCase().includes(q.toLowerCase())));
      rows = list.map((v) => ({ name: v.name, contact: v.detail?.contactName ?? "", phone: v.phone ?? "", email: v.detail?.email ?? "", gstin: v.gstin ?? "", address: v.address ?? "", items: v.detail?.itemsSupplied ?? "" }));
      columns = [col("Vendor", "name"), col("Contact", "contact"), col("Phone", "phone"), col("Email", "email"), col("GSTIN", "gstin"), col("Address", "address"), col("Items supplied", "items")];
    }
    const filters = [range ? rangeWords(range) : "", status ? `Status: ${status}` : "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: rows.length });
    return { title, columns, rows, filters };
  }, { timeout: 60_000 });
  return exportResponse(await buildExport(x.format, out.columns as ExportColumn<Record<string, Cell>>[], out.rows, { title: out.title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: out.filters }));
}
