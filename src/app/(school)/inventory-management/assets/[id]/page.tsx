// One asset (14 Assets): its details, where it is and every move (history
// kept), the repair log, the yearly value after depreciation, linked stock
// items and maintenance requests. The store keeper changes, moves, repairs,
// links, prints the tag and asks to dispose of it (approval).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Link2, Pencil, Printer, QrCode, Trash2, Wrench } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { Split, Col, Stack, DL, SimpleTable, Banner } from "@/components/money/kit";
import { depreciation, placeNames, rateOf, bookValue } from "@/lib/inventory/assets";
import { itemLabel } from "@/lib/inventory/items";
import { roomOptions, departmentOptions, staffOptions, vendorOptions } from "@/lib/inventory/lookup";
import { APPROVAL_STATUS, ASSET_STATUS, DISPOSAL_METHOD, MAINT_STATUS, PRIORITY, paiseToField } from "@/lib/inventory/words";
import { InvHead } from "../../_components/head";
import { ActButton } from "../../_components/client";
import { DecideBox } from "../../_components/decide";
import { BASE, invGuard, one, qs, UUID, uuidOr, type SearchParams } from "../../_lib/page";
import { decidable, whoNames } from "../../_lib/lists";
import { decideAction } from "../../actions";
import { unlinkItemAction } from "../actions";
import { AssetSheet, AssignSheet, DisposeSheet, LinkItemSheet, RepairSheet, RepairUpdateSheet } from "../sheets";

export const metadata: Metadata = { title: "Asset · Inventory Management" };
const day = (d: Date | null) => (d ? formatDate(d, "UTC") : "");
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function AssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const p = await invGuard("assets");
  const { current, can, today, todayStr, settings: s } = p;
  const open = can.assets ? one(sp.open) : "";
  const repairId = can.assets ? uuidOr(one(sp.repair)) : "";

  const d = await withSchool(current.ctx, async (tx) => {
    const a = await tx.asset.findFirst({ where: { id }, include: { assignments: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] }, repairs: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] }, disposals: { orderBy: { createdAt: "desc" } }, links: { where: { archivedAt: null } } } });
    if (!a) return null;
    const [place, vendors, linked, requests, rooms] = await Promise.all([
      placeNames(tx, [a, ...a.assignments]),
      vendorOptions(tx),
      tx.item.findMany({ where: { id: { in: a.links.map((l) => l.itemId) } } }),
      tx.maintenanceRequest.findMany({ where: { assetId: a.id }, orderBy: { raisedAt: "desc" }, take: 20 }),
      roomOptions(tx),
    ]);
    const waiting = a.disposals.find((x) => x.status === "WAITING") ?? null;
    const mine = await decidable(tx, current.ctx, [waiting?.approvalId]);
    const who = await whoNames(tx, [...a.assignments.map((x) => x.createdById), ...a.disposals.map((x) => x.createdById)]);
    const places = open === "assign" ? { rooms, departments: await departmentOptions(tx), staff: await staffOptions(tx) } : { rooms: [], departments: [], staff: [] };
    const linkable = open === "link" ? (await tx.item.findMany({ where: { archivedAt: null, id: { notIn: a.links.map((l) => l.itemId) } }, orderBy: { name: "asc" }, take: 2000 })).map((i) => ({ value: i.id, label: `${itemLabel(i)} (${i.code})` })) : [];
    const source = a.receiptId ? await tx.goodsReceipt.findFirst({ where: { id: a.receiptId }, include: { order: { select: { id: true, number: true } } } }) : null;
    return { a, place, vendors, vendorName: new Map(vendors.map((v) => [v.value, v.label])), linked: new Map(linked.map((i) => [i.id, i])), requests, waiting, mine, who, places, linkable, source };
  });
  if (!d) notFound();
  const { a } = d;
  const self = `${BASE}/assets/${a.id}`;
  const href = (change: Record<string, string | null>) => qs(self, change);
  const disposed = a.status === "DISPOSED";
  const rate = rateOf(a, s);
  const rows = depreciation(a, s.depreciationMethod, rate, today);
  const words = `${a.tag} · ${a.name}`;
  const repair = repairId ? a.repairs.find((r) => r.id === repairId && (r.status === "OPEN" || r.status === "IN_PROGRESS")) : null;
  const st = ASSET_STATUS[a.status];

  const actions = can.assets && !a.archivedAt ? (
    <div className="flex gap-2">
      <MoreMenu items={[
        { label: "Print tag (barcode)", href: `${BASE}/assets/tags?asset=${a.id}`, file: true, icon: <Printer size={16} aria-hidden="true" /> },
        { label: "Print tag (QR)", href: `${BASE}/assets/tags?asset=${a.id}&kind=qr`, file: true, icon: <QrCode size={16} aria-hidden="true" /> },
        ...(!disposed ? [
          { label: "Change details", href: href({ open: "edit" }), icon: <Pencil size={16} aria-hidden="true" /> },
          { label: "Link a stock item", href: href({ open: "link" }), icon: <Link2 size={16} aria-hidden="true" /> },
          ...(!d.waiting ? [{ label: "Dispose", href: href({ open: "dispose" }), tone: "bad" as const, icon: <Trash2 size={16} aria-hidden="true" /> }] : []),
        ] : []),
      ]} />
      {!disposed && <ButtonLink href={href({ open: "repair" })} variant="secondary" icon={Wrench} scroll={false}>Log repair</ButtonLink>}
      {!disposed && <ButtonLink href={href({ open: "assign" })} variant="primary" icon={ArrowLeftRight} scroll={false}>Move or assign</ButtonLink>}
    </div>
  ) : undefined;

  return (
    <>
      <InvHead pageName={a.name} href={self} mode={p.mode} actions={actions} sub={<><Link href={`${BASE}/assets`} className="hover:underline">Assets</Link> · <span className="font-mono">{a.tag}</span></>} />
      <Stack>
        {d.waiting && (d.waiting.approvalId && d.mine.has(d.waiting.approvalId)
          ? <DecideBox action={decideAction} approvalId={d.waiting.approvalId} question={`Dispose of ${a.name} ${a.tag} (${DISPOSAL_METHOD[d.waiting.method] ?? d.waiting.method}${d.waiting.salePaise !== null ? `, ${formatRupees(d.waiting.salePaise)}` : ""})? Reason: ${d.waiting.reason}`} />
          : <Banner tone="info" icon={Trash2} title="Disposal waiting for approval">{DISPOSAL_METHOD[d.waiting.method] ?? d.waiting.method}: {d.waiting.reason}</Banner>)}
        {disposed && <Banner tone="warn" title={`Disposed${a.disposedOn ? ` on ${day(a.disposedOn)}` : ""}`}>The asset stays in the register as Disposed.</Banner>}
        <Split>
          <Col>
            <Card>
              <CardHeader title="Details" divided action={<Pill tone={st.tone}>{st.label}</Pill>} />
              <div className="p-5">
                <DL cols={2} rows={[
                  ["Tag", <span key="t" className="font-mono font-semibold">{a.tag}</span>], ["Type", a.type],
                  ["Where", d.place(a)], ["Condition", a.condition],
                  ["Serial number", a.serialNo ?? "Not given"], ["Vendor", a.vendorId ? d.vendorName.get(a.vendorId) ?? "" : "Not given"],
                  ["Purchase date", day(a.purchaseDate) || "Not given"], ["Cost", a.costPaise !== null ? formatRupees(a.costPaise) : "Not given"],
                  ["Warranty ends", <span key="w" className={a.warrantyEnd && a.warrantyEnd < today ? "text-ink3" : ""}>{day(a.warrantyEnd) || "Not given"}</span>], ["AMC ends", day(a.amcEnd) || "Not given"],
                  ...(d.source ? [["Received", <Link key="r" className="text-brand hover:underline" href={`${BASE}/purchases/orders/${d.source.order.id}`}>{d.source.number} · {d.source.order.number}</Link>] as [string, React.ReactNode]] : []),
                  ...(a.note ? [["Note", a.note] as [string, React.ReactNode]] : []),
                ]} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Repairs" divided icon={Wrench} />
              {a.repairs.length === 0 ? <p className="px-5 py-4 text-[13.5px] text-ink3">No repairs logged.</p> : (
                <ul className="divide-y divide-line">
                  {a.repairs.map((r) => (
                    <li key={r.id} className="px-5 py-3 flex items-start gap-3 text-[14px]">
                      <span className="flex-1 min-w-0">
                        <b className="font-semibold">{r.problem}</b>
                        <span className="block text-[12.5px] text-ink3">{day(r.date)}{r.vendorId ? ` · ${d.vendorName.get(r.vendorId) ?? ""}` : ""}{r.costPaise !== null ? ` · ${formatRupees(r.costPaise)}` : ""}{r.doneOn ? ` · done ${day(r.doneOn)}` : ""}{r.expenseId ? " · in Finance" : ""}</span>
                        {r.note && <span className="block text-[12.5px] text-ink2">{r.note}</span>}
                      </span>
                      {can.assets && (r.status === "OPEN" || r.status === "IN_PROGRESS") && <Link className="text-[13px] font-semibold text-brand hover:underline" href={href({ repair: r.id })} scroll={false}>Update</Link>}
                      <Pill tone={MAINT_STATUS[r.status].tone}>{MAINT_STATUS[r.status].label}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Where it has been" description="Every assignment and move, newest first." divided />
              <ul className="divide-y divide-line">
                {a.assignments.map((x) => (
                  <li key={x.id} className="px-5 py-3 text-[14px]">
                    <b className="font-semibold">{d.place(x)}</b>
                    <span className="block text-[12.5px] text-ink3">{day(x.date)}{x.reason ? ` · ${x.reason}` : ""}{x.createdById ? ` · ${d.who.get(x.createdById) ?? ""}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader title="Value after depreciation" description={`${s.depreciationMethod === "WDV" ? "Written-down value" : "Straight line"} at ${rate}% a year${a.depreciationRate !== null ? " (this asset's own rate)" : ` (${a.type} rate)`}`} divided />
              {a.costPaise === null || !a.purchaseDate ? <p className="px-5 py-4 text-[13.5px] text-ink3">Give the purchase date and cost to see its value each year.</p> : (
                <>
                  <p className="px-5 pt-4 text-[14px]">Value today: <b className="font-semibold">{formatRupees(bookValue(a, s.depreciationMethod, rate, today))}</b></p>
                  {rows.length === 0 ? <p className="px-5 py-3 text-[13.5px] text-ink3">Less than a year old: valued at cost.</p> : (
                    <SimpleTable caption="Depreciation by year" rows={rows} rowKey={(r) => String(r.year)} minWidth={420} cols={[
                      { label: "Year", render: (r) => `Year ${r.year} (from ${day(r.from)})` },
                      { label: "Opening", right: true, nowrap: true, render: (r) => formatRupees(r.opening) },
                      { label: "Depreciation", right: true, nowrap: true, render: (r) => formatRupees(r.depreciation) },
                      { label: "Closing", right: true, nowrap: true, render: (r) => formatRupees(r.closing) },
                    ]} />
                  )}
                </>
              )}
            </Card>
            <Card>
              <CardHeader title="Linked stock items" description="Spare parts and consumables for this asset." icon={Link2} divided />
              {a.links.length === 0 ? <p className="px-5 py-4 text-[13.5px] text-ink3">None linked.</p> : (
                <ul className="divide-y divide-line">
                  {a.links.map((l) => {
                    const it = d.linked.get(l.itemId);
                    return (
                      <li key={l.id} className="px-5 py-3 flex items-center gap-3 text-[14px]">
                        <span className="flex-1 min-w-0">{it ? <Link className="font-semibold hover:underline" href={`${BASE}/items/${it.id}`}>{itemLabel(it)}</Link> : "Item"}{l.note && <span className="block text-[12.5px] text-ink3">{l.note}</span>}</span>
                        {can.assets && !disposed && <ActButton action={unlinkItemAction} fields={{ linkId: l.id }} label="Unlink" icon="x" variant="ghost" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            {a.disposals.length > 0 && (
              <Card>
                <CardHeader title="Disposal" divided />
                <ul className="divide-y divide-line">
                  {a.disposals.map((x) => (
                    <li key={x.id} className="px-5 py-3 flex items-start gap-3 text-[14px]">
                      <span className="flex-1 min-w-0"><b className="font-semibold">{DISPOSAL_METHOD[x.method] ?? x.method}</b> <span className="text-ink3">· {day(x.date)}</span><span className="block text-[12.5px] text-ink2">{x.reason}{x.salePaise !== null ? ` · ${formatRupees(x.salePaise)}` : ""}{x.decisionNote ? ` · ${x.decisionNote}` : ""}</span></span>
                      <Pill tone={APPROVAL_STATUS[x.status].tone}>{APPROVAL_STATUS[x.status].label}</Pill>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {d.requests.length > 0 && (
              <Card>
                <CardHeader title="Maintenance requests" divided />
                <ul className="divide-y divide-line">
                  {d.requests.map((r) => (
                    <li key={r.id}>
                      <Link href={qs(`${BASE}/rooms`, { tab: "maintenance", request: r.id })} className="px-5 py-3 flex items-center gap-3 text-[14px] hover:bg-sunken/60">
                        <span className="flex-1 min-w-0"><b className="font-semibold">{r.number}</b> {r.problem}<span className="block text-[12.5px] text-ink3">{PRIORITY[r.priority].label} priority</span></span>
                        <Pill tone={MAINT_STATUS[r.status].tone}>{MAINT_STATUS[r.status].label}</Pill>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Col>
        </Split>
      </Stack>

      {open === "edit" && !disposed && (
        <AssetSheet closeHref={href({})} types={s.assetTypes} vendors={d.vendors} places={d.places} nextTag={a.tag} today={todayStr}
          start={{ id: a.id, name: a.name, type: a.type, tag: a.tag, serialNo: a.serialNo ?? "", purchaseDate: iso(a.purchaseDate), cost: paiseToField(a.costPaise), vendorId: a.vendorId ?? "", warrantyEnd: iso(a.warrantyEnd), amcEnd: iso(a.amcEnd), condition: a.condition, note: a.note ?? "", rate: a.depreciationRate !== null ? String(a.depreciationRate) : "" }} />
      )}
      {open === "assign" && !disposed && (
        <AssignSheet closeHref={href({})} assetId={a.id} words={`${words}. Now: ${d.place(a)}`} places={d.places} today={todayStr}
          start={{ kind: a.staffId ? "STAFF" : a.departmentId ? "DEPARTMENT" : "ROOM", roomId: a.roomId ?? "", departmentId: a.departmentId ?? "", staffId: a.staffId ?? "" }} />
      )}
      {open === "repair" && !disposed && <RepairSheet closeHref={href({})} assetId={a.id} words={words} vendors={d.vendors} today={todayStr} />}
      {repair && <RepairUpdateSheet closeHref={href({})} logId={repair.id} words={`${words}: ${repair.problem}`} vendors={d.vendors} today={todayStr} start={{ status: repair.status, vendorId: repair.vendorId ?? "" }} />}
      {open === "dispose" && !disposed && !d.waiting && <DisposeSheet closeHref={href({})} assetId={a.id} words={words} today={todayStr} />}
      {open === "link" && !disposed && <LinkItemSheet closeHref={href({})} assetId={a.id} words={words} items={d.linkable} />}
    </>
  );
}
