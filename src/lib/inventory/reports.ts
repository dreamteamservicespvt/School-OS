// Inventory Reports (14 §7): stock in hand with value, stock movements, low
// stock and the reorder list, issues by who received them, book sets issued
// by class, purchases by vendor, item and month, pending orders, unpaid
// bills, the asset register, asset value after depreciation, assets by
// location, warranty and AMC due, maintenance requests and costs, and stock
// and asset audit variances. Each report is one function returning a Table,
// so the Inventory Reports page, its files and the Reports & Analytics
// catalogue show the same rows. Stock figures are the store's own (Stock
// Balance), the same numbers as Items & Stock.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Row, Table } from "../reports/types";
import { inventorySettings } from "./settings";
import { reorderOf, totalsFor } from "./stock";
import { recipientWords } from "./issues";
import { bookValue, depreciation, placeNames, rateOf } from "./assets";
import { billsWithState } from "./purchases";
import { itemLabel } from "./items";
import { ASSET_STATUS, BASE, BILL_STATUS, ISSUE_TO, MAINT_STATUS, MOVE_KIND, ORDER_STATUS, PRIORITY, STOCK_STATE, billState, stockState, type MoveKind } from "./words";

export type InvFilter = {
  /** Inclusive dates (00:00 UTC) of the chosen period; null for all dates. */
  from: Date | null;
  to: Date | null;
  today: Date;
  /** Sections of the chosen class or section; null for all. */
  sectionIds: string[] | null;
  locationId?: string | null;
  categoryId?: string | null;
  /** Purchases: group by vendor, item or month. */
  group?: string | null;
};

const ZERO = BigInt(0);
const DAY = 86_400_000;
const range = (f: InvFilter) => (f.from && f.to ? { gte: f.from, lte: f.to } : undefined);
const moments = (f: InvFilter) => (f.from && f.to ? { gte: f.from, lt: new Date(f.to.getTime() + DAY) } : undefined);
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, ZERO);
const ym = (d: Date) => d.toISOString().slice(0, 7);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthWords = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

async function names(tx: Tx) {
  const [locs, cats] = await Promise.all([tx.storeLocation.findMany(), tx.itemCategory.findMany()]);
  return { loc: new Map(locs.map((l) => [l.id, l.name])), cat: new Map(cats.map((c) => [c.id, c.name])) };
}

/* ---------- Stock in hand ---------- */

export async function stockReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const n = await names(tx);
  const balances = await tx.stockBalance.findMany({ where: { qty: { not: 0 }, ...(f.locationId ? { locationId: f.locationId } : {}), item: { archivedAt: null, ...(f.categoryId ? { categoryId: f.categoryId } : {}) } }, include: { item: { include: { category: true } } } });
  const totals = await totalsFor(tx);
  const rows: Row[] = balances
    .sort((a, b) => a.item.name.localeCompare(b.item.name) || (n.loc.get(a.locationId) ?? "").localeCompare(n.loc.get(b.locationId) ?? ""))
    .map((b) => {
      const price = b.item.pricePaise ?? b.item.lastPricePaise ?? null;
      const total = totals.get(b.itemId) ?? 0;
      return {
        code: b.item.code, item: itemLabel(b.item), category: b.item.category.name, store: n.loc.get(b.locationId) ?? "", qty: b.qty, unit: b.item.unit,
        price, value: price !== null ? price * BigInt(b.qty) : null, status: STOCK_STATE[stockState(total, reorderOf(b.item, b.item.category))].label,
      };
    });
  return {
    columns: [{ key: "code", label: "Code" }, { key: "item", label: "Item" }, { key: "category", label: "Category" }, { key: "store", label: "Store" }, { key: "qty", label: "In stock", kind: "number" }, { key: "unit", label: "Unit" }, { key: "price", label: "Price", kind: "money" }, { key: "value", label: "Value", kind: "money" }, { key: "status", label: "Status" }],
    rows, totals: { code: "Total", qty: rows.reduce((a, r) => a + (r.qty as number), 0), value: sum(rows.map((r) => (r.value as bigint | null) ?? ZERO)) },
    note: "Value is the stock at each item's price (or its last purchase price).", empty: "No stock in hand.", links: [{ label: "Open Items & Stock", href: `${BASE}/items` }],
  };
}

/** Stock value by category (the page's chart and the dashboard). */
export async function valueByCategory(tx: Tx) {
  const balances = await tx.stockBalance.findMany({ where: { qty: { gt: 0 }, item: { archivedAt: null } }, include: { item: { include: { category: true } } } });
  const by = new Map<string, { name: string; value: bigint; qty: number }>();
  for (const b of balances) {
    const k = b.item.categoryId;
    const v = by.get(k) ?? { name: b.item.category.name, value: ZERO, qty: 0 };
    v.value += (b.item.pricePaise ?? b.item.lastPricePaise ?? ZERO) * BigInt(b.qty);
    v.qty += b.qty;
    by.set(k, v);
  }
  return [...by.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0));
}

/* ---------- Movements ---------- */

export async function movementsReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const n = await names(tx);
  const moves = await tx.stockMovement.findMany({ where: { date: range(f), ...(f.locationId ? { locationId: f.locationId } : {}), ...(f.categoryId ? { item: { categoryId: f.categoryId } } : {}) }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 10_000, include: { item: true } });
  const people = await tx.userLogin.findMany({ where: { id: { in: [...new Set(moves.map((m) => m.createdById).filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true } });
  const by = new Map(people.map((p) => [p.id, p.displayName]));
  const rows: Row[] = moves.map((m) => ({
    date: m.date, item: itemLabel(m.item), code: m.item.code, kind: MOVE_KIND[m.kind as MoveKind].label, qty: m.qty, store: n.loc.get(m.locationId) ?? "", after: m.balanceAfter,
    reference: m.reference ?? "", reason: m.reason ?? "", by: m.createdById ? by.get(m.createdById) ?? "" : "",
  }));
  return {
    columns: [{ key: "date", label: "Date", kind: "date" }, { key: "item", label: "Item" }, { key: "code", label: "Code" }, { key: "kind", label: "Movement" }, { key: "qty", label: "Quantity", kind: "number" }, { key: "store", label: "Store" }, { key: "after", label: "Stock after", kind: "number" }, { key: "reference", label: "Reference" }, { key: "reason", label: "Reason" }, { key: "by", label: "By" }],
    rows, note: `${rows.length.toLocaleString("en-IN")} movement${rows.length === 1 ? "" : "s"}. In is plus, out is minus.`, empty: "No stock moved on these dates.",
  };
}

/** Totals by kind of movement (the page's summary). */
export async function movementTotals(tx: Tx, f: InvFilter) {
  const rows = await tx.stockMovement.groupBy({ by: ["kind"], where: { date: range(f) }, _sum: { qty: true }, _count: { _all: true } });
  return rows.map((r) => ({ kind: r.kind as MoveKind, qty: r._sum.qty ?? 0, count: r._count._all }));
}

/* ---------- Low stock ---------- */

export async function lowReport(tx: Tx): Promise<Table> {
  const items = await tx.item.findMany({ where: { archivedAt: null }, include: { category: true } });
  const totals = await totalsFor(tx);
  const rows: Row[] = items
    .map((i) => ({ i, total: totals.get(i.id) ?? 0, reorder: reorderOf(i, i.category) }))
    .filter((x) => x.reorder > 0 && stockState(x.total, x.reorder) !== "OK")
    .sort((a, b) => a.total - a.reorder - (b.total - b.reorder))
    .map(({ i, total, reorder }) => {
      // Order enough for twice the reorder level (inferred).
      const suggest = Math.max(reorder * 2 - total, 1);
      const price = i.lastPricePaise ?? i.pricePaise;
      return { code: i.code, item: itemLabel(i), category: i.category.name, stock: total, reorder, short: Math.max(reorder - total, 0), suggest, price, value: price !== null ? price * BigInt(suggest) : null, status: STOCK_STATE[stockState(total, reorder)].label };
    });
  return {
    columns: [{ key: "code", label: "Code" }, { key: "item", label: "Item" }, { key: "category", label: "Category" }, { key: "stock", label: "In stock", kind: "number" }, { key: "reorder", label: "Reorder level", kind: "number" }, { key: "short", label: "Below level by", kind: "number" }, { key: "suggest", label: "Suggested order", kind: "number" }, { key: "price", label: "Last price", kind: "money" }, { key: "value", label: "Order value", kind: "money" }, { key: "status", label: "Status" }],
    rows, totals: { code: "Total", value: sum(rows.map((r) => (r.value as bigint | null) ?? ZERO)) },
    note: "Suggested order brings stock to twice the reorder level.", empty: "No item is at or below its reorder level.",
    links: [{ label: "Raise a purchase request", href: `${BASE}/purchases?tab=requests&new=1&low=1` }],
  };
}

/* ---------- Issues ---------- */

export async function issuesReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const issues = await tx.stockIssue.findMany({
    where: { date: range(f), ...(f.sectionIds ? { OR: [{ sectionId: { in: f.sectionIds } }, { studentSectionId: { in: f.sectionIds } }] } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 5000, include: { lines: true },
  });
  const items = new Map((await tx.item.findMany({ where: { id: { in: [...new Set(issues.flatMap((i) => i.lines.map((l) => l.itemId)))] } } })).map((i) => [i.id, i]));
  const rows: Row[] = [];
  for (const i of issues) {
    const to = await recipientWords(tx, i);
    rows.push({
      date: i.date, number: i.number, kind: ISSUE_TO[i.toKind], to,
      items: i.lines.map((l) => `${items.get(l.itemId)?.name ?? "Item"} × ${l.qty}`).join(", "), qty: i.lines.reduce((a, l) => a + l.qty, 0),
      charge: i.chargePaise > ZERO ? i.chargePaise : null, returnable: i.returnable ? "Yes" : "No",
      returned: i.returnable ? `${i.lines.reduce((a, l) => a + l.returnedQty, 0)} of ${i.lines.reduce((a, l) => a + l.qty, 0)}` : "",
    });
  }
  return {
    columns: [{ key: "date", label: "Date", kind: "date" }, { key: "number", label: "Issue no." }, { key: "kind", label: "Issued to" }, { key: "to", label: "Name" }, { key: "items", label: "Items" }, { key: "qty", label: "Quantity", kind: "number" }, { key: "charge", label: "Charged to fees", kind: "money" }, { key: "returnable", label: "Returnable" }, { key: "returned", label: "Returned" }],
    rows, totals: { date: null, number: "Total", qty: rows.reduce((a, r) => a + (r.qty as number), 0), charge: sum(rows.map((r) => (r.charge as bigint | null) ?? ZERO)) },
    empty: "Nothing was issued on these dates.", links: [{ label: "Open Issue Stock", href: BASE }],
  };
}

/** Issues by who received them (the page's chart). */
export async function issuesByKind(tx: Tx, f: InvFilter) {
  const rows = await tx.stockIssue.groupBy({ by: ["toKind"], where: { date: range(f) }, _count: { _all: true } });
  return rows.map((r) => ({ kind: r.toKind, label: ISSUE_TO[r.toKind], count: r._count._all }));
}

export async function setsReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const issues = await tx.stockIssue.findMany({ where: { bookSetId: { not: null }, date: range(f), ...(f.sectionIds ? { studentSectionId: { in: f.sectionIds } } : {}) }, select: { bookSetId: true, studentSectionId: true, chargePaise: true, missing: true } });
  const sets = new Map((await tx.bookSet.findMany()).map((s) => [s.id, s.name]));
  const secs = await tx.section.findMany({ where: { id: { in: [...new Set(issues.map((i) => i.studentSectionId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true, schoolClass: { select: { name: true, sortOrder: true } } } });
  const secOf = new Map(secs.map((s) => [s.id, s]));
  const by = new Map<string, { set: string; cls: string; sort: number; count: number; value: bigint; missing: number }>();
  for (const i of issues) {
    const s = i.studentSectionId ? secOf.get(i.studentSectionId) : null;
    const key = `${i.bookSetId}|${s?.id ?? ""}`;
    const v = by.get(key) ?? { set: sets.get(i.bookSetId!) ?? "Set", cls: s ? `${s.schoolClass.name} ${s.name}` : "No class", sort: s ? s.schoolClass.sortOrder * 100 + s.name.charCodeAt(0) : 99999, count: 0, value: ZERO, missing: 0 };
    v.count++;
    v.value += i.chargePaise;
    if (Array.isArray(i.missing) && i.missing.length) v.missing++;
    by.set(key, v);
  }
  const rows: Row[] = [...by.values()].sort((a, b) => a.sort - b.sort || a.set.localeCompare(b.set)).map((v) => ({ cls: v.cls, set: v.set, count: v.count, missing: v.missing, value: v.value }));
  return {
    columns: [{ key: "cls", label: "Class" }, { key: "set", label: "Book set" }, { key: "count", label: "Sets issued", kind: "number" }, { key: "missing", label: "With items to give", kind: "number" }, { key: "value", label: "Charged to fees", kind: "money" }],
    rows, totals: { cls: "Total", count: rows.reduce((a, r) => a + (r.count as number), 0), value: sum(rows.map((r) => r.value as bigint)) }, empty: "No book sets were issued on these dates.",
  };
}

/* ---------- Purchases ---------- */

export async function purchasesReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const orders = await tx.purchaseOrder.findMany({ where: { date: range(f), status: { notIn: ["CANCELLED", "WAITING"] } }, include: { lines: true }, orderBy: { date: "asc" } });
  const vendors = new Map((await tx.vendor.findMany({ where: { id: { in: [...new Set(orders.map((o) => o.vendorId))] } } })).map((v) => [v.id, v.name]));
  const items = new Map((await tx.item.findMany({ where: { id: { in: [...new Set(orders.flatMap((o) => o.lines.map((l) => l.itemId)))] } } })).map((i) => [i.id, i]));
  const group = f.group === "item" || f.group === "month" ? f.group : "vendor";
  const by = new Map<string, { label: string; orders: Set<string>; qty: number; ordered: bigint; received: bigint }>();
  for (const o of orders) for (const l of o.lines) {
    const key = group === "vendor" ? o.vendorId : group === "item" ? l.itemId : ym(o.date);
    const label = group === "vendor" ? vendors.get(o.vendorId) ?? "" : group === "item" ? (items.get(l.itemId) ? itemLabel(items.get(l.itemId)!) : "") : monthWords(ym(o.date));
    const v = by.get(key) ?? { label, orders: new Set(), qty: 0, ordered: ZERO, received: ZERO };
    v.orders.add(o.id);
    v.qty += l.qty;
    v.ordered += l.unitPricePaise * BigInt(l.qty);
    v.received += l.unitPricePaise * BigInt(Math.min(l.receivedQty, l.qty));
    by.set(key, v);
  }
  const list = [...by.entries()];
  if (group === "month") list.sort((a, b) => a[0].localeCompare(b[0]));
  else list.sort((a, b) => (b[1].ordered > a[1].ordered ? 1 : b[1].ordered < a[1].ordered ? -1 : 0));
  const rows: Row[] = list.map(([, v]) => ({ label: v.label, orders: v.orders.size, qty: v.qty, ordered: v.ordered, received: v.received }));
  return {
    columns: [{ key: "label", label: group === "vendor" ? "Vendor" : group === "item" ? "Item" : "Month" }, { key: "orders", label: "Orders", kind: "number" }, { key: "qty", label: "Quantity ordered", kind: "number" }, { key: "ordered", label: "Ordered", kind: "money" }, { key: "received", label: "Received", kind: "money" }],
    rows, totals: { label: "Total", ordered: sum(rows.map((r) => r.ordered as bigint)), received: sum(rows.map((r) => r.received as bigint)) },
    empty: "No purchase orders on these dates.", links: [{ label: "Open Purchases & Vendors", href: `${BASE}/purchases?tab=orders` }],
  };
}

export async function pendingOrdersReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const orders = await tx.purchaseOrder.findMany({ where: { status: { in: ["WAITING", "SENT", "PART_RECEIVED"] } }, include: { lines: true }, orderBy: { date: "asc" } });
  const vendors = new Map((await tx.vendor.findMany({ where: { id: { in: orders.map((o) => o.vendorId) } } })).map((v) => [v.id, v.name]));
  const rows: Row[] = orders.map((o) => {
    const ordered = o.lines.reduce((a, l) => a + l.qty, 0);
    const got = o.lines.reduce((a, l) => a + Math.min(l.receivedQty, l.qty), 0);
    const late = o.expectedOn && o.expectedOn < f.today ? Math.round((f.today.getTime() - o.expectedOn.getTime()) / DAY) : 0;
    return { number: o.number, date: o.date, vendor: vendors.get(o.vendorId) ?? "", total: o.totalPaise, received: ordered ? Math.round((got / ordered) * 100) : 0, expected: o.expectedOn, late: late || null, status: ORDER_STATUS[o.status].label };
  });
  return {
    columns: [{ key: "number", label: "Order no." }, { key: "date", label: "Date", kind: "date" }, { key: "vendor", label: "Vendor" }, { key: "total", label: "Amount", kind: "money" }, { key: "received", label: "Received", kind: "percent" }, { key: "expected", label: "Expected by", kind: "date" }, { key: "late", label: "Days late", kind: "number" }, { key: "status", label: "Status" }],
    rows, totals: { number: "Total", total: sum(rows.map((r) => r.total as bigint)) }, empty: "No orders are waiting for goods.",
  };
}

export async function unpaidBillsReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const bills = (await billsWithState(tx)).filter((b) => b.expense && ["UNPAID", "PART_PAID", "WAITING"].includes(billState(b.expense)));
  const vendors = new Map((await tx.vendor.findMany({ where: { id: { in: bills.map((b) => b.bill.vendorId) } } })).map((v) => [v.id, v.name]));
  const orders = new Map((await tx.purchaseOrder.findMany({ where: { id: { in: bills.map((b) => b.bill.orderId).filter((x): x is string => Boolean(x)) } }, select: { id: true, number: true } })).map((o) => [o.id, o.number]));
  const rows: Row[] = bills
    .sort((a, b) => (a.bill.dueDate ?? a.bill.billDate).getTime() - (b.bill.dueDate ?? b.bill.billDate).getTime())
    .map(({ bill, expense }) => {
      const overdue = bill.dueDate && bill.dueDate < f.today ? Math.round((f.today.getTime() - bill.dueDate.getTime()) / DAY) : 0;
      return { billNo: bill.billNo, vendor: vendors.get(bill.vendorId) ?? "", order: bill.orderId ? orders.get(bill.orderId) ?? "" : "", billDate: bill.billDate, due: bill.dueDate, amount: expense!.amountPaise, paid: expense!.paidPaise, balance: expense!.amountPaise - expense!.paidPaise, overdue: overdue || null, status: BILL_STATUS[billState(expense!)].label };
    });
  return {
    columns: [{ key: "billNo", label: "Bill no." }, { key: "vendor", label: "Vendor" }, { key: "order", label: "Order" }, { key: "billDate", label: "Bill date", kind: "date" }, { key: "due", label: "Due", kind: "date" }, { key: "amount", label: "Amount", kind: "money" }, { key: "paid", label: "Paid", kind: "money" }, { key: "balance", label: "Balance", kind: "money" }, { key: "overdue", label: "Days overdue", kind: "number" }, { key: "status", label: "Status" }],
    rows, totals: { billNo: "Total", amount: sum(rows.map((r) => r.amount as bigint)), paid: sum(rows.map((r) => r.paid as bigint)), balance: sum(rows.map((r) => r.balance as bigint)) },
    note: "Bills are expenses in Finance Management; they reach the Day Book when paid.", empty: "No vendor bills are unpaid.",
  };
}

/* ---------- Assets ---------- */

export async function assetRegisterReport(tx: Tx, ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const s = await inventorySettings(tx, ctx);
  const assets = await tx.asset.findMany({ where: { archivedAt: null, ...(f.from && f.to ? { purchaseDate: range(f) } : {}) }, orderBy: { tag: "asc" } });
  const place = await placeNames(tx, assets);
  const vendors = new Map((await tx.vendor.findMany({ where: { id: { in: assets.map((a) => a.vendorId).filter((x): x is string => Boolean(x)) } } })).map((v) => [v.id, v.name]));
  const rows: Row[] = assets.map((a) => ({
    tag: a.tag, name: a.name, type: a.type, place: a.status === "DISPOSED" ? "" : place(a), purchased: a.purchaseDate, cost: a.costPaise, value: a.costPaise !== null ? bookValue(a, s.depreciationMethod, rateOf(a, s), f.today) : null,
    vendor: a.vendorId ? vendors.get(a.vendorId) ?? "" : "", warranty: a.warrantyEnd, amc: a.amcEnd, condition: a.condition, status: ASSET_STATUS[a.status].label,
  }));
  return {
    columns: [{ key: "tag", label: "Tag" }, { key: "name", label: "Asset" }, { key: "type", label: "Type" }, { key: "place", label: "Location or person" }, { key: "purchased", label: "Purchased", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }, { key: "value", label: "Value now", kind: "money" }, { key: "vendor", label: "Vendor" }, { key: "warranty", label: "Warranty end", kind: "date" }, { key: "amc", label: "AMC end", kind: "date" }, { key: "condition", label: "Condition" }, { key: "status", label: "Status" }],
    rows, totals: { tag: "Total", cost: sum(rows.map((r) => (r.cost as bigint | null) ?? ZERO)), value: sum(rows.map((r) => (r.value as bigint | null) ?? ZERO)) },
    note: "Disposed assets stay in the register.", empty: "No assets in the register.", links: [{ label: "Open Assets", href: `${BASE}/assets` }],
  };
}

export async function depreciationReport(tx: Tx, ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const s = await inventorySettings(tx, ctx);
  const assets = await tx.asset.findMany({ where: { archivedAt: null, status: { not: "DISPOSED" }, costPaise: { not: null } }, orderBy: { tag: "asc" } });
  const rows: Row[] = assets.map((a) => {
    const rate = rateOf(a, s);
    const sched = depreciation(a, s.depreciationMethod, rate, f.today);
    const dep = sum(sched.map((x) => x.depreciation));
    const thisYear = depreciation(a, s.depreciationMethod, rate, new Date(f.today.getTime() + 366 * DAY)).at(sched.length)?.depreciation ?? null;
    return { tag: a.tag, name: a.name, type: a.type, purchased: a.purchaseDate, cost: a.costPaise, rate, years: sched.length, dep, value: (a.costPaise ?? ZERO) - dep, next: thisYear };
  });
  return {
    columns: [{ key: "tag", label: "Tag" }, { key: "name", label: "Asset" }, { key: "type", label: "Type" }, { key: "purchased", label: "Purchased", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }, { key: "rate", label: "Rate %", kind: "number" }, { key: "years", label: "Full years", kind: "number" }, { key: "dep", label: "Depreciation so far", kind: "money" }, { key: "value", label: "Value now", kind: "money" }, { key: "next", label: "Next year's depreciation", kind: "money" }],
    rows, totals: { tag: "Total", cost: sum(rows.map((r) => (r.cost as bigint | null) ?? ZERO)), dep: sum(rows.map((r) => r.dep as bigint)), value: sum(rows.map((r) => r.value as bigint)) },
    note: `${s.depreciationMethod === "WDV" ? "Written-down value" : "Straight line"} method, from Inventory Settings. Assets without a cost or purchase date keep their cost.`, empty: "No assets with a cost.",
  };
}

export async function assetsByPlaceReport(tx: Tx, ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const s = await inventorySettings(tx, ctx);
  const assets = await tx.asset.findMany({ where: { archivedAt: null, status: { not: "DISPOSED" } } });
  const place = await placeNames(tx, assets);
  const by = new Map<string, { place: string; kind: string; count: number; repair: number; cost: bigint; value: bigint }>();
  for (const a of assets) {
    const k = a.roomId ?? a.departmentId ?? a.staffId ?? "none";
    const v = by.get(k) ?? { place: place(a), kind: a.roomId ? "Room" : a.departmentId ? "Department" : a.staffId ? "Person" : "", count: 0, repair: 0, cost: ZERO, value: ZERO };
    v.count++;
    if (a.status === "IN_REPAIR") v.repair++;
    v.cost += a.costPaise ?? ZERO;
    v.value += bookValue(a, s.depreciationMethod, rateOf(a, s), f.today);
    by.set(k, v);
  }
  const rows: Row[] = [...by.values()].sort((a, b) => a.place.localeCompare(b.place, undefined, { numeric: true })).map((v) => ({ ...v }));
  return {
    columns: [{ key: "place", label: "Location or person" }, { key: "kind", label: "Kind" }, { key: "count", label: "Assets", kind: "number" }, { key: "repair", label: "In repair", kind: "number" }, { key: "cost", label: "Cost", kind: "money" }, { key: "value", label: "Value now", kind: "money" }],
    rows, totals: { place: "Total", count: rows.reduce((a, r) => a + (r.count as number), 0), cost: sum(rows.map((r) => r.cost as bigint)), value: sum(rows.map((r) => r.value as bigint)) }, empty: "No assets in use.",
  };
}

export async function warrantyReport(tx: Tx, ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const until = new Date(f.today.getTime() + 90 * DAY);
  const assets = await tx.asset.findMany({ where: { archivedAt: null, status: { not: "DISPOSED" }, OR: [{ warrantyEnd: { lte: until, gte: new Date(f.today.getTime() - 30 * DAY) } }, { amcEnd: { lte: until, gte: new Date(f.today.getTime() - 30 * DAY) } }] } });
  const place = await placeNames(tx, assets);
  const rows: Row[] = [];
  for (const a of assets) {
    for (const [what, end] of [["Warranty", a.warrantyEnd], ["AMC", a.amcEnd]] as const) {
      if (!end || end > until || end.getTime() < f.today.getTime() - 30 * DAY) continue;
      const days = Math.round((end.getTime() - f.today.getTime()) / DAY);
      rows.push({ end, what, tag: a.tag, name: a.name, place: place(a), days, state: days < 0 ? "Ended" : days <= 30 ? "Ending soon" : "Coming up" });
    }
  }
  rows.sort((a, b) => (a.end as Date).getTime() - (b.end as Date).getTime());
  void ctx;
  return {
    columns: [{ key: "end", label: "Ends on", kind: "date" }, { key: "what", label: "Cover" }, { key: "tag", label: "Tag" }, { key: "name", label: "Asset" }, { key: "place", label: "Location or person" }, { key: "days", label: "Days left", kind: "number" }, { key: "state", label: "Status" }],
    rows, note: "Ended in the last 30 days or ending in the next 90 days.", empty: "No warranty or AMC ends in the next 90 days.",
  };
}

/* ---------- Maintenance ---------- */

export async function maintenanceReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const [reqs, repairs] = await Promise.all([
    tx.maintenanceRequest.findMany({ where: { raisedAt: moments(f) }, orderBy: { raisedAt: "desc" }, take: 5000 }),
    tx.assetMaintenanceLog.findMany({ where: { date: range(f) }, orderBy: { date: "desc" }, take: 5000, include: { asset: true } }),
  ]);
  const rooms = new Map((await tx.room.findMany({ where: { id: { in: reqs.map((r) => r.roomId) } } })).map((r) => [r.id, r.name]));
  const tech = new Map((await tx.staff.findMany({ where: { id: { in: reqs.map((r) => r.technicianStaffId).filter((x): x is string => Boolean(x)) } } })).map((s) => [s.id, s.fullName]));
  const vendors = new Map((await tx.vendor.findMany({ where: { id: { in: [...reqs.map((r) => r.vendorId), ...repairs.map((r) => r.vendorId)].filter((x): x is string => Boolean(x)) } } })).map((v) => [v.id, v.name]));
  const rows: Row[] = [
    ...reqs.map((r) => ({
      date: new Date(`${r.raisedAt.toISOString().slice(0, 10)}T00:00:00Z`), number: r.number, kind: "Maintenance request", place: rooms.get(r.roomId) ?? "", problem: r.problem, priority: PRIORITY[r.priority].label,
      who: r.technicianStaffId ? tech.get(r.technicianStaffId) ?? "" : r.technicianName ?? (r.vendorId ? vendors.get(r.vendorId) ?? "" : ""), status: MAINT_STATUS[r.status].label, done: r.doneOn, cost: r.costPaise,
    })),
    ...repairs.map((r) => ({
      date: r.date, number: r.asset.tag, kind: "Asset repair", place: r.asset.name, problem: r.problem, priority: "", who: r.vendorId ? vendors.get(r.vendorId) ?? "" : "", status: MAINT_STATUS[r.status].label, done: r.doneOn, cost: r.costPaise,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  return {
    columns: [{ key: "date", label: "Raised", kind: "date" }, { key: "number", label: "Number or tag" }, { key: "kind", label: "Kind" }, { key: "place", label: "Place or asset" }, { key: "problem", label: "Problem" }, { key: "priority", label: "Priority" }, { key: "who", label: "Technician" }, { key: "status", label: "Status" }, { key: "done", label: "Done on", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }],
    rows, totals: { date: null, number: "Total", cost: sum(rows.map((r) => (r.cost as bigint | null) ?? ZERO)) }, empty: "No maintenance requests or repairs on these dates.",
  };
}

/* ---------- Audit variances ---------- */

export async function auditVarianceReport(tx: Tx, _ctx: SchoolContext, f: InvFilter): Promise<Table> {
  const [audits, assetAudits] = await Promise.all([
    tx.stockAudit.findMany({ where: { startedOn: range(f), status: { not: "OPEN" } }, include: { lines: true }, orderBy: { startedOn: "desc" } }),
    tx.assetAudit.findMany({ where: { startedAt: moments(f), status: "CLOSED" }, orderBy: { startedAt: "desc" } }),
  ]);
  const n = await names(tx);
  const items = new Map((await tx.item.findMany({ where: { id: { in: [...new Set(audits.flatMap((a) => a.lines.map((l) => l.itemId)))] } } })).map((i) => [i.id, i]));
  const AUDIT_WORDS: Record<string, string> = { WAITING: "Waiting approval", APPROVED: "Approved, posted", REJECTED: "Not approved" };
  const rows: Row[] = [];
  for (const a of audits) for (const l of a.lines) {
    if (l.countedQty === null || l.countedQty === l.systemQty) continue;
    const item = items.get(l.itemId);
    const diff = l.countedQty - l.systemQty;
    rows.push({ date: a.startedOn, audit: `${a.number} ${a.name}`, kind: "Stock", where: n.loc.get(a.locationId) ?? "", what: item ? itemLabel(item) : "", system: l.systemQty, counted: l.countedQty, diff, value: item?.pricePaise != null ? item.pricePaise * BigInt(diff) : null, status: AUDIT_WORDS[a.status] ?? a.status });
  }
  for (const a of assetAudits) {
    const r = (a.result ?? {}) as { missing?: { tag: string; name: string; place: string }[]; misplaced?: { tag: string; name: string; registered: string; foundIn: string }[] };
    const d = new Date(`${a.startedAt.toISOString().slice(0, 10)}T00:00:00Z`);
    for (const m of r.missing ?? []) rows.push({ date: d, audit: a.name, kind: "Asset missing", where: m.place, what: `${m.name} ${m.tag}`, system: 1, counted: 0, diff: -1, value: null, status: "Closed" });
    for (const m of r.misplaced ?? []) rows.push({ date: d, audit: a.name, kind: "Asset misplaced", where: `Found in ${m.foundIn}`, what: `${m.name} ${m.tag} (registered: ${m.registered})`, system: null, counted: null, diff: null, value: null, status: "Closed" });
  }
  return {
    columns: [{ key: "date", label: "Date", kind: "date" }, { key: "audit", label: "Audit" }, { key: "kind", label: "Kind" }, { key: "where", label: "Store or place" }, { key: "what", label: "Item or asset" }, { key: "system", label: "System", kind: "number" }, { key: "counted", label: "Counted", kind: "number" }, { key: "diff", label: "Difference", kind: "number" }, { key: "value", label: "Value", kind: "money" }, { key: "status", label: "Status" }],
    rows, totals: { date: null, audit: "Total", value: sum(rows.map((r) => (r.value as bigint | null) ?? ZERO)) }, empty: "No differences found in stock or asset audits on these dates.",
  };
}

export const INVENTORY_REPORT_LIST = [
  { key: "inv-stock", name: "Stock in hand", sub: "Every item by store and category, with its value", dated: false, byClass: false, run: stockReport },
  { key: "inv-movements", name: "Stock movements", sub: "Stock in, out, transfers, losses and audit adjustments by date", dated: true, byClass: false, run: movementsReport },
  { key: "inv-low", name: "Low stock and reorder list", sub: "Items at or below their reorder level, with a suggested order", dated: false, byClass: false, run: (tx: Tx) => lowReport(tx) },
  { key: "inv-issues", name: "Issues", sub: "Items given to departments, classes, staff and students", dated: true, byClass: true, run: issuesReport },
  { key: "inv-sets", name: "Book sets issued by class", sub: "Sets issued to students of each class, with the charges", dated: true, byClass: true, run: setsReport },
  { key: "inv-purchases", name: "Purchases", sub: "Orders by vendor, item or month, ordered and received", dated: true, byClass: false, run: purchasesReport },
  { key: "inv-pending", name: "Pending orders", sub: "Orders still waiting for goods, with days late", dated: false, byClass: false, run: pendingOrdersReport },
  { key: "inv-unpaid", name: "Unpaid bills", sub: "Vendor bills not paid in full, oldest due first", dated: false, byClass: false, run: unpaidBillsReport },
  { key: "inv-assets", name: "Asset register", sub: "Every asset with its place, cost, value, warranty and status", dated: false, byClass: false, run: assetRegisterReport },
  { key: "inv-depreciation", name: "Asset value after depreciation", sub: "Cost, depreciation so far and value now, by the settings' method", dated: false, byClass: false, run: depreciationReport },
  { key: "inv-asset-places", name: "Assets by location", sub: "Assets in each room, department or with each person", dated: false, byClass: false, run: assetsByPlaceReport },
  { key: "inv-warranty", name: "Warranty and AMC due", sub: "Covers ending in the next 90 days", dated: false, byClass: false, run: warrantyReport },
  { key: "inv-maintenance", name: "Maintenance requests and costs", sub: "Requests and asset repairs with technician, status and cost", dated: true, byClass: false, run: maintenanceReport },
  { key: "inv-variance", name: "Stock and asset audit variances", sub: "Differences found in stock audits and asset checks", dated: true, byClass: false, run: auditVarianceReport },
] as const;

export type InventoryReportKey = (typeof INVENTORY_REPORT_LIST)[number]["key"];
