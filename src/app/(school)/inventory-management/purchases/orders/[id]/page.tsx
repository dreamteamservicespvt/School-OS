// One purchase order (14 Purchases & Vendors): the items with ordered and
// received quantities, the goods receipts, the vendor's bills and payments.
// The store keeper prints or emails it, receives goods (part deliveries
// allowed), records the bill and closes it; the approver decides an order
// above the approved amount here.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Mail, PackageCheck, Receipt, Truck } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { Split, Col, Stack, DL, SimpleTable, Banner, Empty } from "@/components/money/kit";
import { itemLabel } from "@/lib/inventory/items";
import { billsWithState } from "@/lib/inventory/purchases";
import { locationOptions } from "@/lib/inventory/lookup";
import { BILL_STATUS, ORDER_STATUS, billState } from "@/lib/inventory/words";
import { InvHead } from "../../../_components/head";
import { DecideBox } from "../../../_components/decide";
import { BASE, invGuard, one, qs, UUID, type SearchParams } from "../../../_lib/page";
import { decidable, whoNames } from "../../../_lib/lists";
import { decideAction } from "../../../actions";
import { CloseOrderSheet, EmailOrderSheet, ReceiveSheet } from "../../sheets";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Purchase order · Inventory Management") };
}
const day = (d: Date) => formatDate(d, "UTC");
const ZERO = BigInt(0);

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const p = await invGuard("purchases");
  const { current, can, todayStr, tz } = p;
  const open = can.purchase ? one(sp.open) : "";

  const d = await withSchool(current.ctx, async (tx) => {
    const o = await tx.purchaseOrder.findFirst({ where: { id }, include: { lines: true, request: true, receipts: { include: { lines: true }, orderBy: { date: "desc" } } } });
    if (!o) return null;
    const [vendor, detail, items, stores, bills, mine, who] = await Promise.all([
      tx.vendor.findFirst({ where: { id: o.vendorId } }),
      tx.vendorDetail.findUnique({ where: { vendorId: o.vendorId } }),
      tx.item.findMany({ where: { id: { in: o.lines.map((l) => l.itemId) } } }),
      locationOptions(tx),
      billsWithState(tx, { orderId: o.id }),
      decidable(tx, current.ctx, [o.approvalId]),
      whoNames(tx, [o.createdById, o.approvedById, ...o.receipts.map((r) => r.receivedById)]),
    ]);
    return { o, vendor, detail, items: new Map(items.map((i) => [i.id, i])), stores, bills, mine: o.approvalId ? mine.has(o.approvalId) : false, who };
  });
  if (!d) notFound();
  const { o } = d;
  const self = `${BASE}/purchases/orders/${o.id}`;
  const href = (change: Record<string, string | null>) => qs(self, change);
  const st = ORDER_STATUS[o.status];
  const live = ["SENT", "PART_RECEIVED"].includes(o.status);
  const received = o.lines.some((l) => l.receivedQty > 0);
  const billed = d.bills.filter((b) => b.expense && b.expense.status !== "CANCELLED").reduce((a, b) => a + b.bill.amountPaise, ZERO);
  const storeName = new Map(d.stores.map((x) => [x.value, x.label]));
  const pdfHref = `${self}/pdf`;

  const actions = (
    <div className="flex gap-2">
      {o.status !== "WAITING" && o.status !== "CANCELLED" && (
        <MoreMenu items={[
          { label: "Download PDF", href: pdfHref, file: true, icon: <Download size={16} aria-hidden="true" /> },
          ...(can.purchase ? [{ label: "Send by email", href: href({ open: "email" }), icon: <Mail size={16} aria-hidden="true" /> }] : []),
          ...(can.purchase ? [{ label: "Record the bill", href: qs(`${BASE}/purchases`, { tab: "bills", bill: "new", po: o.id }), icon: <Receipt size={16} aria-hidden="true" /> }] : []),
          ...(can.purchase && live ? [{ label: received ? "Close order" : "Cancel order", href: href({ open: "close" }), tone: "bad" as const }] : []),
        ]} />
      )}
      {can.purchase && live && <ButtonLink href={href({ open: "receive" })} variant="primary" icon={Truck} scroll={false}><Words k="Goods received" /></ButtonLink>}
    </div>
  );

  return (
    <>
      <InvHead pageName={`Purchase order ${o.number}`} href={self} mode={p.mode} actions={actions} sub={<><Link href={`${BASE}/purchases?tab=orders`} className="hover:underline"><Words k="Purchase orders" /></Link> · {d.vendor?.name}</>} />
      <Stack>
        {o.status === "WAITING" && (d.mine
          ? <DecideBox action={decideAction} approvalId={o.approvalId!} question={`Approve ${o.number} to ${d.vendor?.name ?? "the vendor"} for ${formatRupees(o.totalPaise)}?`} />
          : <Banner tone="info" title="Waiting for approval"><Words k="The order is above the approved amount. It can be sent and received once approved." /></Banner>)}
        {o.status === "CANCELLED" && <Banner tone="warn" title="Cancelled">{o.closedReason ?? o.decisionNote ?? "This order was cancelled."}</Banner>}
        {o.status === "CLOSED" && <Banner tone="info" title="Closed">{o.closedReason ?? "Nothing more is expected."}</Banner>}
        <Split>
          <Col>
            <Card>
              <CardHeader title="Items" description={`${st.label}${o.expectedOn ? ` · expected ${day(o.expectedOn)}` : ""}`} divided action={<Pill tone={st.tone}>{st.label}</Pill>} />
              <SimpleTable caption="Order lines" rows={o.lines} rowKey={(l) => l.id} minWidth={560} cols={[
                { label: "Item", render: (l) => { const it = d.items.get(l.itemId); return it ? <Link className="font-semibold hover:underline" href={`${BASE}/items/${it.id}`}>{itemLabel(it)}</Link> : "Item"; } },
                { label: "Ordered", right: true, render: (l) => l.qty },
                { label: "Received", right: true, render: (l) => <span className={l.receivedQty >= l.qty ? "text-ok font-semibold" : l.receivedQty ? "text-warn font-semibold" : "text-ink3"}>{l.receivedQty}</span> },
                { label: "Rate", right: true, nowrap: true, render: (l) => formatRupees(l.unitPricePaise) },
                { label: "Amount", right: true, nowrap: true, render: (l) => formatRupees(l.unitPricePaise * BigInt(l.qty)) },
              ]} foot={["Total", "", "", "", formatRupees(o.totalPaise)]} />
            </Card>
            <Card>
              <CardHeader title="Goods received" divided />
              {o.receipts.length === 0 ? <Empty icon={PackageCheck} title="Nothing received yet" body={can.purchase && live ? "Record what arrives; part deliveries are fine." : undefined} /> : (
                <ul className="divide-y divide-line">
                  {o.receipts.map((r) => (
                    <li key={r.id} className="px-5 py-3 text-[14px]">
                      <b className="font-semibold">{r.number}</b> <span className="text-ink3">· {day(r.date)} · {storeName.get(r.locationId) ?? ""} · {d.who.get(r.receivedById ?? "") ?? ""}</span>
                      <span className="block text-[13px] text-ink2">{r.lines.map((l) => `${d.items.get(l.itemId)?.name ?? "Item"} × ${l.qty}${l.batchNo ? ` (batch ${l.batchNo})` : ""}`).join(", ")}</span>
                      {can.assets && <span className="block text-[12.5px] mt-1">{r.lines.map((l) => <Link key={l.id} className="mr-3 font-semibold text-brand hover:underline" href={qs(`${BASE}/assets`, { open: "add", receipt: r.id, line: l.id })}><Words k="Add" /> {d.items.get(l.itemId)?.name ?? "item"} <Words k="as assets" /></Link>)}</span>}
                      {r.extraReason && <span className="block text-[12.5px] text-warn"><Words k="More than ordered:" /> {r.extraReason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader title="Order" divided />
              <div className="p-5">
                <DL cols={2} rows={[
                  ["Date", day(o.date)], ["Vendor", d.vendor?.name ?? ""], ["Deliver to", storeName.get(o.locationId) ?? ""], ["Expected by", o.expectedOn ? day(o.expectedOn) : "Not given"],
                  ["Request", o.request ? <Link key="r" className="text-brand hover:underline" href={qs(`${BASE}/purchases`, { tab: "requests", request: o.request.id })}>{o.request.number}</Link> : "None"],
                  ["Made by", d.who.get(o.createdById ?? "") ?? ""], ["Approved by", o.approvedById ? d.who.get(o.approvedById) ?? "" : o.request?.approvalId ? "" : "Within the limit"],
                  ["Sent by email", o.emailedAt ? `${o.emailedTo} · ${formatDateTime(o.emailedAt, tz)}` : "Not yet"],
                  ...(o.note ? [["Note", o.note] as [string, React.ReactNode]] : []),
                ]} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Bills" description={`${formatRupees(billed)} billed of ${formatRupees(o.totalPaise)}`} divided />
              {d.bills.length === 0 ? <p className="px-5 py-4 text-[13.5px] text-ink3"><Words k="No bill recorded yet." /></p> : (
                <ul className="divide-y divide-line">
                  {d.bills.map((b) => {
                    const bs = b.expense ? billState(b.expense) : "CANCELLED";
                    return (
                      <li key={b.bill.id} className="px-5 py-3 flex items-center gap-3 text-[14px]">
                        <span className="flex-1 min-w-0"><b className="font-semibold"><Words k="Bill" /> {b.bill.billNo}</b><span className="block text-[12.5px] text-ink3">{day(b.bill.billDate)} · {formatRupees(b.bill.amountPaise)}{b.expense ? ` · ${b.expense.number}` : ""}</span></span>
                        {b.bill.fileId && <a className="text-[13px] font-semibold text-brand hover:underline" href={fileLink(b.bill.fileId, current.ctx.schoolId)} target="_blank" rel="noreferrer"><Words k="View" /></a>}
                        {can.pay && (bs === "UNPAID" || bs === "PART_PAID") && <Link className="text-[13px] font-semibold text-brand hover:underline" href={qs(`${BASE}/purchases`, { tab: "bills", pay: b.bill.id })}><Words k="Pay" /></Link>}
                        <Pill tone={BILL_STATUS[bs].tone}>{BILL_STATUS[bs].label}</Pill>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </Col>
        </Split>
      </Stack>
      {open === "receive" && live && (
        <ReceiveSheet closeHref={href({})} orderId={o.id} number={o.number} stores={d.stores.map(({ value, label }) => ({ value, label }))} store={o.locationId} today={todayStr}
          lines={o.lines.map((l) => { const it = d.items.get(l.itemId); return { id: l.id, name: it ? itemLabel(it) : "Item", unit: it?.unit ?? "piece", ordered: l.qty, received: l.receivedQty, tracksExpiry: Boolean(it?.tracksExpiry) }; })} />
      )}
      {open === "close" && live && <CloseOrderSheet closeHref={href({})} orderId={o.id} number={o.number} received={received} />}
      {open === "email" && o.status !== "WAITING" && o.status !== "CANCELLED" && <EmailOrderSheet closeHref={href({})} orderId={o.id} number={o.number} email={d.detail?.email ?? ""} />}
    </>
  );
}
