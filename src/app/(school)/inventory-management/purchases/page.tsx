// Purchases & Vendors (14 §2): Requests, Purchase orders, Goods received,
// Bills and Vendors. Request (Waiting, Approved, Rejected) → order (Sent,
// Part received, Received, Closed) → goods received → bill (Unpaid, Part
// paid, Paid). The store keeper raises requests and orders, receives goods
// and records bills; the Accountant (and the Principal) pay bills; the
// approver decides requests here or in the top bar's Approvals.
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, FileText, Plus, Receipt, ShoppingCart, Store, Truck } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/list";
import { dateWhere } from "@/lib/periods";
import { fileLink } from "@/lib/files";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { UrlSheet } from "@/components/ui/url-sheet";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Stack, Toolbar, DataList, Empty, DL, SimpleTable, type StatItem } from "@/components/money/kit";
import { itemLabel } from "@/lib/inventory/items";
import { departmentOf } from "@/lib/inventory/purchases";
import { vendorsWithDetail } from "@/lib/inventory/vendors";
import { itemOptions, departmentOptions, locationOptions, vendorOptions } from "@/lib/inventory/lookup";
import { lowStockItems } from "@/lib/inventory/stock";
import { BILL_STATUS, ORDER_STATUS, REQUEST_STATUS, billState, paiseToField, plural } from "@/lib/inventory/words";
import { InvHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { DecideBox } from "../_components/decide";
import { BASE, invGuard, invPeriod, one, qs, addQ, uuidOr, type SearchParams } from "../_lib/page";
import { billsList, decidable, ordersWhere, readBillsFilter, readOrdersFilter, whoNames } from "../_lib/lists";
import { decideAction } from "../actions";
import { archiveVendorAction, restoreVendorAction } from "./actions";
import { BillSheet, CancelBillSheet, CancelRequestSheet, OrderSheet, PayBillSheet, RequestSheet, VendorSheet, type VendorStart } from "./sheets";

export const metadata: Metadata = { title: "Purchases & Vendors · Inventory Management" };

const TABS = ["requests", "orders", "receipts", "bills", "vendors"] as const;
type Tab = (typeof TABS)[number];
const ZERO = BigInt(0);
const day = (d: Date) => formatDate(d, "UTC");
const rupees = (p: bigint) => Number(p) / 100;

export default async function PurchasesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await invGuard("purchases");
  const { current, can, today, todayStr, settings: s } = p;
  const ctx = current.ctx;
  const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as Tab) : can.purchase ? "orders" : "bills";
  const per = invPeriod(sp, p.dates, tab === "vendors" ? null : "finyear");
  const page = Math.max(1, Math.min(500, Number(one(sp.page)) || 1));
  const status = one(sp.status);
  const vendorF = uuidOr(one(sp.vendor));
  const q = one(sp.q).trim().slice(0, 80);

  // Sheets opened by the address.
  const newRequest = can.purchase && one(sp.new) === "1";
  const newOrder = can.purchase && one(sp.order) === "new";
  const newBill = (can.purchase || can.pay) && one(sp.bill) === "new";
  const payId = can.pay ? uuidOr(one(sp.pay)) : "";
  const cancelBillId = can.purchase || can.pay ? uuidOr(one(sp.cancelbill)) : "";
  const requestId = uuidOr(one(sp.request));
  const cancelReqId = can.purchase ? uuidOr(one(sp.cancelreq)) : "";
  const editVendor = can.purchase || can.pay ? one(sp.editvendor) : "";
  const vendorView = tab === "vendors" ? vendorF : "";

  const d = await withSchool(ctx, async (tx) => {
    const range = per.range ? dateWhere(per.range) : undefined;
    const [waitingReq, openOrders, lateOrders, billsAll] = await Promise.all([
      tx.purchaseRequest.count({ where: { status: "WAITING" } }),
      tx.purchaseOrder.count({ where: { status: { in: ["SENT", "PART_RECEIVED"] } } }),
      tx.purchaseOrder.count({ where: { status: { in: ["SENT", "PART_RECEIVED"] }, expectedOn: { lt: today } } }),
      billsList(tx, { status: "unpaid", vendor: "", range: null }),
    ]);
    const unpaid = billsAll.reduce((a, b) => a + (b.expense ? b.expense.amountPaise - b.expense.paidPaise : ZERO), ZERO);
    const vendors = await vendorOptions(tx);
    const vendorName = new Map(vendors.map((v) => [v.value, v.label]));

    let requests: Awaited<ReturnType<typeof tx.purchaseRequest.findMany<{ include: { lines: true } }>>> = [];
    let orders: Awaited<ReturnType<typeof tx.purchaseOrder.findMany<{ include: { lines: true } }>>> = [];
    let receipts: Awaited<ReturnType<typeof tx.goodsReceipt.findMany<{ include: { lines: true; order: true } }>>> = [];
    let bills: typeof billsAll = [];
    let total = 0;
    if (tab === "requests") {
      const where = { ...(["WAITING", "APPROVED", "REJECTED", "ORDERED", "CANCELLED"].includes(status) ? { status: status as "WAITING" } : {}), ...(range ? { date: range } : {}), ...(q ? { number: { contains: q, mode: "insensitive" as const } } : {}) };
      [total, requests] = await Promise.all([tx.purchaseRequest.count({ where }), tx.purchaseRequest.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { lines: true } })]);
    } else if (tab === "orders") {
      const where = ordersWhere(readOrdersFilter((k) => one(sp[k]), per.range));
      [total, orders] = await Promise.all([tx.purchaseOrder.count({ where }), tx.purchaseOrder.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { lines: true } })]);
    } else if (tab === "receipts") {
      const where = { ...(range ? { date: range } : {}), ...(vendorF ? { order: { vendorId: vendorF } } : {}), ...(q ? { number: { contains: q, mode: "insensitive" as const } } : {}) };
      [total, receipts] = await Promise.all([tx.goodsReceipt.count({ where }), tx.goodsReceipt.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { lines: true, order: true } })]);
    } else if (tab === "bills") {
      bills = await billsList(tx, readBillsFilter((k) => one(sp[k]), per.range));
      total = bills.length;
      bills = bills.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    }
    const vendorRows = tab === "vendors" ? await vendorsWithDetail(tx, { archived: status === "archived" }) : [];
    const itemIds = [...new Set([...requests.flatMap((r) => r.lines.map((l) => l.itemId)), ...orders.flatMap((o) => o.lines.map((l) => l.itemId)), ...receipts.flatMap((r) => r.lines.map((l) => l.itemId))])];
    const items = new Map((await tx.item.findMany({ where: { id: { in: itemIds } } })).map((i) => [i.id, i]));
    const depts = await departmentOptions(tx);
    const who = await whoNames(tx, [...requests.map((r) => r.requestedById), ...receipts.map((r) => r.receivedById)]);
    const stores = await locationOptions(tx);

    // The open request (detail sheet), with its approval when it waits for this person.
    const req = requestId ? await tx.purchaseRequest.findFirst({ where: { id: requestId }, include: { lines: true, orders: true } }) : null;
    const reqItems = req ? new Map((await tx.item.findMany({ where: { id: { in: req.lines.map((l) => l.itemId) } } })).map((i) => [i.id, i])) : new Map();
    const mine = await decidable(tx, ctx, [req?.approvalId, ...requests.map((r) => r.approvalId), ...orders.map((o) => o.approvalId)]);

    // Forms.
    const needItems = newRequest || newOrder;
    const itemsOpt = needItems ? await itemOptions(tx) : [];
    const low = newRequest && one(sp.low) === "1" ? await lowStockItems(tx) : [];
    const fromReq = newOrder && uuidOr(one(sp.from)) ? await tx.purchaseRequest.findFirst({ where: { id: one(sp.from) }, include: { lines: true } }) : null;
    const myDept = newRequest ? await departmentOf(tx, ctx.userId) : null;
    const billOrders = newBill ? await tx.purchaseOrder.findMany({ where: { status: { in: ["SENT", "PART_RECEIVED", "RECEIVED", "CLOSED"] } }, orderBy: { date: "desc" }, take: 100, include: { invoices: true } }) : [];
    const billed = billOrders.length ? new Map((await tx.expense.findMany({ where: { id: { in: billOrders.flatMap((o) => o.invoices.map((i) => i.expenseId)) }, status: { not: "CANCELLED" } }, select: { id: true, amountPaise: true } })).map((e) => [e.id, e.amountPaise])) : new Map<string, bigint>();
    const pay = payId ? (await billsWithStateOne(tx, payId)) : null;
    const cancelBill = cancelBillId ? await billsWithStateOne(tx, cancelBillId) : null;
    const accounts = payId ? await tx.bankAccount.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, kind: true, isMain: true, accountLast4: true } }) : [];
    const vendorEdit = editVendor && editVendor !== "new" && uuidOr(editVendor) ? (await vendorsWithDetail(tx)).find((v) => v.id === editVendor) ?? null : null;
    const vendorOne = vendorView ? (await vendorsWithDetail(tx, {})).find((v) => v.id === vendorView) ?? (await vendorsWithDetail(tx, { archived: true })).find((v) => v.id === vendorView) ?? null : null;
    const vendorStats = vendorOne ? await Promise.all([
      tx.purchaseOrder.count({ where: { vendorId: vendorOne.id } }),
      tx.purchaseOrder.aggregate({ where: { vendorId: vendorOne.id, status: { not: "CANCELLED" } }, _sum: { totalPaise: true } }),
      billsList(tx, { status: "unpaid", vendor: vendorOne.id, range: null }),
    ]) : null;
    return { waitingReq, openOrders, lateOrders, unpaid, unpaidCount: billsAll.length, vendors, vendorName, requests, orders, receipts, bills, total, vendorRows, items, depts, who, stores, req, reqItems, mine, itemsOpt, low, fromReq, myDept, billOrders, billed, pay, cancelBill, accounts, vendorEdit, vendorOne, vendorStats };
  });

  const keep = { tab, status: status || null, vendor: vendorF || null, q: q || null, ...per.keep };
  const here = (change: Record<string, string | null>) => addQ(qs(`${BASE}/purchases`, keep), { page: null, ...change });
  const tabHref = (t: Tab) => qs(`${BASE}/purchases`, { tab: t, ...per.keep });
  const deptName = new Map(d.depts.map((x) => [x.value, x.label]));
  const storesOpt = d.stores.map(({ value, label }) => ({ value, label }));
  const main = d.stores.find((x) => x.isMain)?.value ?? d.stores[0]?.value ?? "";
  const linesWords = (ls: { itemId: string; qty: number }[]) => ls.map((l) => `${d.items.get(l.itemId)?.name ?? "Item"} × ${l.qty}`).join(", ");

  const stats: StatItem[] = [
    { label: "Requests waiting", value: d.waitingReq.toLocaleString("en-IN"), tone: d.waitingReq ? "info" : undefined, href: qs(`${BASE}/purchases`, { tab: "requests", status: "WAITING" }) },
    { label: "Orders to receive", value: d.openOrders.toLocaleString("en-IN"), sub: d.lateOrders ? `${d.lateOrders} late` : undefined, tone: d.lateOrders ? "warn" : undefined, href: qs(`${BASE}/purchases`, { tab: "orders", status: "open" }) },
    { label: "Unpaid bills", value: formatRupees(d.unpaid), sub: plural(d.unpaidCount, "bill"), tone: d.unpaidCount ? "warn" : undefined, href: qs(`${BASE}/purchases`, { tab: "bills", status: "unpaid" }) },
  ];

  const actions = can.purchase ? (
    <div className="flex gap-2">
      <ButtonLink href={here({ new: "1" })} variant="secondary" icon={ClipboardList} scroll={false}>Raise request</ButtonLink>
      <ButtonLink href={here({ order: "new" })} variant="primary" icon={ShoppingCart} scroll={false}>New order</ButtonLink>
    </div>
  ) : can.pay ? <ButtonLink href={here({ bill: "new" })} variant="secondary" icon={Receipt} scroll={false}>Record bill</ButtonLink> : undefined;

  const statusChips: Record<Tab, { value: string; label: string }[]> = {
    requests: [{ value: "", label: "All" }, ...Object.entries(REQUEST_STATUS).map(([value, v]) => ({ value, label: v.label }))],
    orders: [{ value: "", label: "All" }, { value: "open", label: "To receive" }, ...Object.entries(ORDER_STATUS).map(([value, v]) => ({ value, label: v.label }))],
    receipts: [],
    bills: [{ value: "", label: "All" }, { value: "unpaid", label: "Unpaid" }, { value: "waiting", label: "Waiting approval" }, { value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }],
    vendors: [{ value: "", label: "Active" }, { value: "archived", label: "Archived" }],
  };
  const pager = d.total > PAGE_SIZE ? <Pager page={page} pageSize={PAGE_SIZE} total={d.total} prevHref={here({ page: page > 2 ? String(page - 1) : null })} nextHref={here({ page: String(page + 1) })} /> : null;
  const exportHref = qs(`${BASE}/purchases/export`, keep);

  return (
    <>
      <InvHead pageName="Purchases & Vendors" href={`${BASE}/purchases`} mode={p.mode} actions={actions} />
      <Stack>
        <Stats items={stats} />
        <SegLinks label="Purchases tabs" value={tab} options={[
          { value: "requests", label: "Requests", href: tabHref("requests") },
          { value: "orders", label: "Purchase orders", href: tabHref("orders") },
          { value: "receipts", label: "Goods received", href: tabHref("receipts") },
          { value: "bills", label: "Bills", href: tabHref("bills") },
          { value: "vendors", label: "Vendors", href: qs(`${BASE}/purchases`, { tab: "vendors" }) },
        ]} />
        <Card>
          <Toolbar className="md:flex-wrap">
            {tab !== "bills" && <UrlSearch placeholder={tab === "vendors" ? "Search vendor, phone or GSTIN" : "Search number"} label="Search" className="flex-1 md:min-w-[220px]" id="purchases-search" />}
            <div className="flex gap-2 flex-wrap">
              {statusChips[tab].length > 0 && <UrlSelect param="status" label="Status" value={status} options={statusChips[tab]} />}
              {["orders", "receipts", "bills"].includes(tab) && <UrlSelect param="vendor" label="Vendor" options={[{ value: "", label: "All vendors" }, ...d.vendors]} className="max-w-[220px]" />}
              {tab !== "vendors" && <PeriodFilter {...p.dates} fallback="finyear" />}
              {can.export && <ExportButton href={exportHref} />}
              {tab === "vendors" && (can.purchase || can.pay) && <ButtonLink href={here({ editvendor: "new" })} icon={Plus} scroll={false}>Add vendor</ButtonLink>}
              {tab === "bills" && can.purchase && <ButtonLink href={here({ bill: "new" })} icon={Plus} scroll={false}>Record bill</ButtonLink>}
            </div>
          </Toolbar>

          {tab === "requests" && (
            <DataList rows={d.requests} rowKey={(r) => r.id} rowHref={(r) => here({ request: r.id })} minWidth={860} caption="Purchase requests"
              empty={<Empty icon={ClipboardList} title="No purchase requests on these dates" body={can.purchase ? "Raise one from here, or from a low-stock alert." : "Requests raised by the store keeper show here."} />}
              columns={[
                { key: "date", label: "Date", nowrap: true, render: (r) => <span className="tnum">{day(r.date)}<span className="block text-[12px] text-ink3 font-mono">{r.number}</span></span> },
                { key: "items", label: "Items", render: (r) => <span className="block min-w-[200px] text-[13.5px]">{linesWords(r.lines)}</span> },
                { key: "reason", label: "Reason", render: (r) => <span className="text-[13px] text-ink2">{r.reason}</span> },
                { key: "dept", label: "Department", render: (r) => (r.departmentId ? deptName.get(r.departmentId) ?? "" : "") },
                { key: "amount", label: "Estimate", align: "right", nowrap: true, render: (r) => formatRupees(r.estimatePaise) },
                { key: "status", label: "Status", render: (r) => <span className="flex flex-col items-start gap-1"><Pill tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Pill>{r.approvalId && d.mine.has(r.approvalId) && <span className="text-[12px] font-semibold text-info">Waiting for you</span>}</span> },
              ]}
              phone={(r) => ({ title: linesWords(r.lines), sub: `${r.number} · ${day(r.date)} · ${formatRupees(r.estimatePaise)}`, icon: ClipboardList, iconTone: "brand", pills: <Pill tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Pill> })}
            />
          )}

          {tab === "orders" && (
            <DataList rows={d.orders} rowKey={(o) => o.id} rowHref={(o) => `${BASE}/purchases/orders/${o.id}`} minWidth={860} caption="Purchase orders"
              empty={<Empty icon={ShoppingCart} title="No purchase orders on these dates" body={can.purchase ? "Make one from an approved request, or for a small purchase." : "Orders made by the store keeper show here."} />}
              columns={[
                { key: "date", label: "Date", nowrap: true, render: (o) => <span className="tnum">{day(o.date)}<span className="block text-[12px] text-ink3 font-mono">{o.number}</span></span> },
                { key: "vendor", label: "Vendor", render: (o) => <b className="font-semibold">{d.vendorName.get(o.vendorId) ?? ""}</b> },
                { key: "items", label: "Items", render: (o) => <span className="block min-w-[200px] text-[13.5px]">{linesWords(o.lines)}</span> },
                { key: "amount", label: "Amount", align: "right", nowrap: true, render: (o) => formatRupees(o.totalPaise) },
                { key: "expected", label: "Expected", nowrap: true, render: (o) => (o.expectedOn ? <span className={o.expectedOn < today && ["SENT", "PART_RECEIVED"].includes(o.status) ? "text-bad font-semibold" : ""}>{day(o.expectedOn)}</span> : "") },
                { key: "status", label: "Status", render: (o) => <span className="flex flex-col items-start gap-1"><Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill>{o.approvalId && d.mine.has(o.approvalId) && o.status === "WAITING" && <span className="text-[12px] font-semibold text-info">Waiting for you</span>}</span> },
              ]}
              phone={(o) => ({ title: d.vendorName.get(o.vendorId) ?? "", sub: `${o.number} · ${day(o.date)} · ${linesWords(o.lines)}`, right: formatRupees(o.totalPaise), icon: ShoppingCart, iconTone: "brand", pills: <Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill> })}
            />
          )}

          {tab === "receipts" && (
            <DataList rows={d.receipts} rowKey={(r) => r.id} rowHref={(r) => `${BASE}/purchases/orders/${r.orderId}`} minWidth={820} caption="Goods received"
              empty={<Empty icon={Truck} title="No goods received on these dates" body="Receipts are recorded against a purchase order." />}
              columns={[
                { key: "date", label: "Date", nowrap: true, render: (r) => <span className="tnum">{day(r.date)}<span className="block text-[12px] text-ink3 font-mono">{r.number}</span></span> },
                { key: "order", label: "Order", render: (r) => <span className="font-mono text-[13px]">{r.order.number}</span> },
                { key: "vendor", label: "Vendor", render: (r) => d.vendorName.get(r.order.vendorId) ?? "" },
                { key: "items", label: "Items", render: (r) => <span className="block min-w-[200px] text-[13.5px]">{linesWords(r.lines)}</span> },
                { key: "store", label: "Store", render: (r) => d.stores.find((x) => x.value === r.locationId)?.label ?? "" },
                { key: "by", label: "Received by", render: (r) => d.who.get(r.receivedById ?? "") ?? "" },
              ]}
              phone={(r) => ({ title: linesWords(r.lines), sub: `${r.number} · ${day(r.date)} · ${r.order.number}`, icon: Truck, iconTone: "ok" })}
            />
          )}

          {tab === "bills" && (
            <DataList rows={d.bills} rowKey={(b) => b.bill.id} minWidth={900} caption="Vendor bills"
              empty={<Empty icon={Receipt} title="No bills on these dates" body={can.purchase ? "Record the vendor's bill when it comes with the goods." : "Bills recorded by the store keeper show here, ready to pay."} />}
              columns={[
                { key: "date", label: "Bill date", nowrap: true, render: (b) => <span className="tnum">{day(b.bill.billDate)}<span className="block text-[12px] text-ink3 font-mono">{b.bill.billNo}</span></span> },
                { key: "vendor", label: "Vendor", render: (b) => <b className="font-semibold">{d.vendorName.get(b.bill.vendorId) ?? ""}</b> },
                { key: "order", label: "Order", render: (b) => (b.bill.orderId ? <Link className="font-mono text-[13px] text-brand hover:underline" href={`${BASE}/purchases/orders/${b.bill.orderId}`}>Open order</Link> : <span className="text-ink3">Direct</span>) },
                { key: "amount", label: "Amount", align: "right", nowrap: true, render: (b) => formatRupees(b.bill.amountPaise) },
                { key: "left", label: "To pay", align: "right", nowrap: true, render: (b) => (b.expense && b.expense.status !== "CANCELLED" ? formatRupees(b.expense.amountPaise - b.expense.paidPaise) : "") },
                { key: "due", label: "Due", nowrap: true, render: (b) => (b.bill.dueDate ? <span className={b.bill.dueDate < today && b.expense && b.expense.paidPaise < b.expense.amountPaise ? "text-bad font-semibold" : ""}>{day(b.bill.dueDate)}</span> : "") },
                { key: "status", label: "Status", render: (b) => { const st = b.expense ? billState(b.expense) : "CANCELLED"; return <Pill tone={BILL_STATUS[st].tone}>{BILL_STATUS[st].label}</Pill>; } },
                { key: "act", label: "", render: (b) => {
                  const st = b.expense ? billState(b.expense) : "CANCELLED";
                  return (
                    <span className="flex gap-3 items-center whitespace-nowrap">
                      {b.bill.fileId && <a className="text-[13px] font-semibold text-brand hover:underline" href={fileLink(b.bill.fileId, ctx.schoolId)} target="_blank" rel="noreferrer">Bill</a>}
                      {can.pay && (st === "UNPAID" || st === "PART_PAID") && <Link className="text-[13px] font-semibold text-brand hover:underline" href={here({ pay: b.bill.id })} scroll={false}>Pay</Link>}
                      {(can.purchase || can.pay) && st !== "CANCELLED" && st !== "PAID" && <Link className="text-[13px] font-semibold text-ink3 hover:underline" href={here({ cancelbill: b.bill.id })} scroll={false}>Cancel</Link>}
                    </span>
                  );
                } },
              ]}
              phone={(b) => { const st = b.expense ? billState(b.expense) : "CANCELLED"; return { title: d.vendorName.get(b.bill.vendorId) ?? "", sub: `Bill ${b.bill.billNo} · ${day(b.bill.billDate)}${b.bill.dueDate ? ` · due ${day(b.bill.dueDate)}` : ""}`, right: formatRupees(b.bill.amountPaise), icon: Receipt, iconTone: "brand", pills: <><Pill tone={BILL_STATUS[st].tone}>{BILL_STATUS[st].label}</Pill>{can.pay && (st === "UNPAID" || st === "PART_PAID") && <Link className="text-[13px] font-semibold text-brand ml-2 relative z-[1]" href={here({ pay: b.bill.id })} scroll={false}>Pay</Link>}</> }; }}
            />
          )}

          {tab === "vendors" && (
            <DataList rows={d.vendorRows.filter((v) => !q || [v.name, v.phone ?? "", v.gstin ?? ""].some((x) => x.toLowerCase().includes(q.toLowerCase())))} rowKey={(v) => v.id} rowHref={(v) => here({ vendor: v.id })} minWidth={820} caption="Vendors"
              empty={<Empty icon={Store} title={q ? "No vendors match" : "No vendors yet"} body={can.purchase ? "Add the shops and suppliers the school buys from." : "Vendors are shared with Finance."} />}
              columns={[
                { key: "name", label: "Vendor", render: (v) => <span className="block min-w-[160px]"><b className="font-semibold">{v.name}</b>{v.detail?.contactName && <span className="block text-[12px] text-ink3">{v.detail.contactName}</span>}</span> },
                { key: "phone", label: "Phone", nowrap: true, render: (v) => v.phone ?? "" },
                { key: "email", label: "Email", render: (v) => v.detail?.email ?? "" },
                { key: "gstin", label: "GSTIN", render: (v) => <span className="font-mono text-[13px]">{v.gstin ?? ""}</span> },
                { key: "items", label: "Items supplied", render: (v) => <span className="text-[13px] text-ink2">{v.detail?.itemsSupplied ?? ""}</span> },
              ]}
              phone={(v) => ({ title: v.name, sub: [v.phone, v.gstin].filter(Boolean).join(" · "), icon: Store, iconTone: "brand" })}
            />
          )}
          {pager}
        </Card>
      </Stack>

      {/* Request detail */}
      {d.req && (
        <UrlSheet title={`Purchase request ${d.req.number}`} sub={`${day(d.req.date)} · ${REQUEST_STATUS[d.req.status].label}`} closeHref={here({ request: null })}>
          <div className="flex flex-col gap-4">
            {d.req.approvalId && d.mine.has(d.req.approvalId) && d.req.status === "WAITING" && <DecideBox action={decideAction} approvalId={d.req.approvalId} question={`Approve this request for about ${formatRupees(d.req.estimatePaise)}?`} />}
            <SimpleTable caption="Items requested" rows={d.req.lines} rowKey={(l) => l.id} minWidth={320} cols={[
              { label: "Item", render: (l) => { const it = d.reqItems.get(l.itemId); return it ? itemLabel(it) : "Item"; } },
              { label: "Qty", right: true, render: (l) => l.qty },
              { label: "Est. rate", right: true, render: (l) => (l.estUnitPaise > ZERO ? formatRupees(l.estUnitPaise) : "") },
            ]} foot={["Estimate", "", formatRupees(d.req.estimatePaise)]} />
            <DL cols={2} rows={[
              ["Reason", d.req.reason], ["Needed by", d.req.neededBy ? day(d.req.neededBy) : "Not given"], ["Department", d.req.departmentId ? deptName.get(d.req.departmentId) ?? "" : "None"],
              ["Status", REQUEST_STATUS[d.req.status].label], ...(d.req.decisionNote ? [["Decision note", d.req.decisionNote] as [string, React.ReactNode]] : []),
              ...(d.req.orders.length ? [["Order", d.req.orders.map((o) => o.number).join(", ")] as [string, React.ReactNode]] : []),
            ]} />
            {can.purchase && (
              <div className="flex gap-2 flex-wrap">
                {d.req.status === "APPROVED" && <ButtonLink href={here({ request: null, order: "new", from: d.req.id })} variant="primary" icon={ShoppingCart} scroll={false}>Make the purchase order</ButtonLink>}
                {d.req.orders[0] && <ButtonLink href={`${BASE}/purchases/orders/${d.req.orders[0].id}`} variant="secondary" icon={FileText}>Open the order</ButtonLink>}
                {["WAITING", "APPROVED"].includes(d.req.status) && <ButtonLink href={here({ request: null, cancelreq: d.req.id })} variant="ghost" scroll={false}>Cancel request</ButtonLink>}
              </div>
            )}
          </div>
        </UrlSheet>
      )}

      {/* Vendor detail */}
      {d.vendorOne && d.vendorStats && (
        <UrlSheet title={d.vendorOne.name} sub={d.vendorOne.archivedAt ? "Archived" : d.vendorOne.detail?.itemsSupplied ?? "Vendor"} closeHref={here({ vendor: null })}>
          <div className="flex flex-col gap-4">
            <DL cols={2} rows={[
              ["Contact", d.vendorOne.detail?.contactName ?? ""], ["Phone", d.vendorOne.phone ?? ""], ["Email", d.vendorOne.detail?.email ?? ""], ["GSTIN", d.vendorOne.gstin ?? ""],
              ["Address", d.vendorOne.address ?? ""], ["Orders", `${d.vendorStats[0]} · ${formatRupees(d.vendorStats[1]._sum.totalPaise ?? ZERO)}`],
              ["Unpaid bills", formatRupees(d.vendorStats[2].reduce((a, b) => a + (b.expense ? b.expense.amountPaise - b.expense.paidPaise : ZERO), ZERO))],
              ...(can.bank ? [["Bank", d.vendorOne.detail?.bankName ? `${d.vendorOne.detail.bankName}${d.vendorOne.detail.accountLast4 ? ` ··${d.vendorOne.detail.accountLast4}` : ""}${d.vendorOne.detail.ifsc ? ` · ${d.vendorOne.detail.ifsc}` : ""}` : "Not given"] as [string, React.ReactNode]] : []),
            ]} />
            <div className="flex gap-2 flex-wrap">
              {(can.purchase || can.pay) && !d.vendorOne.archivedAt && <ButtonLink href={here({ vendor: null, editvendor: d.vendorOne.id })} variant="secondary" scroll={false}>Change</ButtonLink>}
              <ButtonLink href={qs(`${BASE}/purchases`, { tab: "orders", vendor: d.vendorOne.id })} variant="ghost">Orders</ButtonLink>
              <ButtonLink href={qs(`${BASE}/purchases`, { tab: "bills", vendor: d.vendorOne.id })} variant="ghost">Bills</ButtonLink>
              {can.purchase && (d.vendorOne.archivedAt
                ? <ActButton action={restoreVendorAction} fields={{ vendorId: d.vendorOne.id }} label="Bring back" icon="restore" size="md" />
                : <ActButton action={archiveVendorAction} fields={{ vendorId: d.vendorOne.id }} label="Archive" icon="archive" variant="ghost" size="md" />)}
            </div>
          </div>
        </UrlSheet>
      )}

      {newRequest && (
        <RequestSheet closeHref={here({ new: null, low: null })} items={d.itemsOpt} departments={d.depts} myDepartment={d.myDept ?? ""} limit={rupees(s.approveUpToPaise)} today={todayStr}
          start={d.low.map((x) => ({ itemId: x.item.id, qty: String(Math.max(1, x.reorder * 2 - Math.max(0, x.total))), price: paiseToField(x.item.lastPricePaise ?? x.item.pricePaise) }))} />
      )}
      {cancelReqId && <CancelRequestSheet closeHref={here({ cancelreq: null })} requestId={cancelReqId} number={d.requests.find((r) => r.id === cancelReqId)?.number ?? "request"} />}
      {newOrder && (
        <OrderSheet closeHref={here({ order: null, from: null })} items={d.itemsOpt} vendors={d.vendors} stores={storesOpt} mainStore={main} today={todayStr} addVendorHref={qs(`${BASE}/purchases`, { tab: "vendors", editvendor: "new" })}
          requestId={d.fromReq?.status === "APPROVED" ? d.fromReq.id : null}
          requestWords={d.fromReq ? `From request ${d.fromReq.number} (about ${formatRupees(d.fromReq.estimatePaise)}).` : null}
          approvedUpTo={rupees(d.fromReq && d.fromReq.estimatePaise > s.approveUpToPaise ? d.fromReq.estimatePaise : s.approveUpToPaise)}
          start={d.fromReq ? d.fromReq.lines.map((l) => ({ itemId: l.itemId, qty: String(l.qty), price: paiseToField(l.estUnitPaise > ZERO ? l.estUnitPaise : null) })) : []} />
      )}
      {newBill && (
        <BillSheet closeHref={here({ bill: null, po: null })} vendors={d.vendors} today={todayStr} start={{ orderId: uuidOr(one(sp.po)) }}
          orders={d.billOrders.map((o) => {
            const done = o.invoices.reduce((a, i) => a + (d.billed.get(i.expenseId) ?? ZERO), ZERO);
            const left = o.totalPaise - done;
            return { value: o.id, label: `${o.number} · ${d.vendorName.get(o.vendorId) ?? ""} · ${formatRupees(o.totalPaise)}${done > ZERO ? ` (${formatRupees(done)} billed)` : ""}`, left: left > ZERO ? paiseToField(left) : "", vendorId: o.vendorId };
          })} />
      )}
      {d.pay && d.pay.expense && (
        <PayBillSheet closeHref={here({ pay: null })} invoiceId={d.pay.bill.id} today={todayStr}
          words={`Bill ${d.pay.bill.billNo} from ${d.vendorName.get(d.pay.bill.vendorId) ?? "the vendor"}: ${formatRupees(d.pay.expense.amountPaise - d.pay.expense.paidPaise)} to pay`}
          left={paiseToField(d.pay.expense.amountPaise - d.pay.expense.paidPaise)}
          banks={d.accounts.filter((a) => a.kind === "BANK").map((a) => ({ value: a.id, label: `${a.name}${a.accountLast4 ? ` ··${a.accountLast4}` : ""}` }))}
          cashId={d.accounts.find((a) => a.kind === "CASH")?.id ?? ""} mainBank={d.accounts.find((a) => a.kind === "BANK" && a.isMain)?.id ?? d.accounts.find((a) => a.kind === "BANK")?.id ?? ""} />
      )}
      {d.cancelBill && <CancelBillSheet closeHref={here({ cancelbill: null })} invoiceId={d.cancelBill.bill.id} paid={Boolean(d.cancelBill.expense && d.cancelBill.expense.paidPaise > ZERO)} words={`Bill ${d.cancelBill.bill.billNo}, ${formatRupees(d.cancelBill.bill.amountPaise)}`} />}
      {editVendor && (editVendor === "new" || d.vendorEdit) && (
        <VendorSheet closeHref={here({ editvendor: null })} bank={can.bank}
          start={d.vendorEdit ? ({ id: d.vendorEdit.id, name: d.vendorEdit.name, contactName: d.vendorEdit.detail?.contactName ?? "", phone: d.vendorEdit.phone ?? "", email: d.vendorEdit.detail?.email ?? "", gstin: d.vendorEdit.gstin ?? "", address: d.vendorEdit.address ?? "", itemsSupplied: d.vendorEdit.detail?.itemsSupplied ?? "", bankName: can.bank ? d.vendorEdit.detail?.bankName ?? "" : "", ifsc: can.bank ? d.vendorEdit.detail?.ifsc ?? "" : "", last4: can.bank ? d.vendorEdit.detail?.accountLast4 ?? "" : "" } satisfies VendorStart) : null} />
      )}
    </>
  );
}

async function billsWithStateOne(tx: Parameters<typeof billsList>[0], invoiceId: string) {
  const bill = await tx.purchaseInvoice.findFirst({ where: { id: invoiceId } });
  if (!bill) return null;
  const expense = await tx.expense.findFirst({ where: { id: bill.expenseId }, select: { id: true, number: true, status: true, amountPaise: true, paidPaise: true, approvalId: true, billFileId: true } });
  return { bill, expense };
}
