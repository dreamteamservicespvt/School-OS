// One item (14 Items & Stock): its details, stock by store (and by batch
// with expiry), and every stock movement (in, out, transfer, damaged, lost,
// expired, audit adjustment) with date, quantity, by whom and reference, for
// the dates chosen. The store keeper changes the item, records stock in and
// out, transfers, archives and brings it back.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Boxes, Minus, PackagePlus, PencilLine } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { dateWhere } from "@/lib/periods";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { PeriodFilter } from "@/components/list/period-filter";
import { ExportButton } from "@/components/ui/export-button";
import { Stats, Split, Col, Stack, DataList, Empty, DL, SimpleTable, Banner } from "@/components/money/kit";
import { itemLabel } from "@/lib/inventory/items";
import { itemOptions, locationOptions, stockByStore } from "@/lib/inventory/lookup";
import { reorderOf } from "@/lib/inventory/stock";
import { MOVE_KIND, STOCK_STATE, paiseToField, qtyWords, stockState } from "@/lib/inventory/words";
import { InvHead } from "../../_components/head";
import { ActButton } from "../../_components/client";
import { ArchiveItemSheet, ItemSheet, StockInSheet, StockOutSheet, TransferSheet } from "../../_components/sheets";
import { BASE, invGuard, invPeriod, one, qs, UUID, type SearchParams } from "../../_lib/page";
import { whoNames } from "../../_lib/lists";
import { restoreItemAction } from "../../actions";

export const metadata: Metadata = { title: "Item · Inventory Management" };
const day = (d: Date) => formatDate(d, "UTC");

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const p = await invGuard("items");
  const { current, can, today, todayStr, settings: s } = p;
  const per = invPeriod(sp, p.dates, null);
  const open = can.stock ? one(sp.open) : "";

  const d = await withSchool(current.ctx, async (tx) => {
    const item = await tx.item.findFirst({ where: { id }, include: { category: true } });
    if (!item) return null;
    const [stores, balances, batches, moves, cats, sets, links, lastOrder] = await Promise.all([
      locationOptions(tx),
      tx.stockBalance.findMany({ where: { itemId: id } }),
      tx.stockBatch.findMany({ where: { itemId: id, qty: { gt: 0 } }, orderBy: { expiresOn: "asc" } }),
      tx.stockMovement.findMany({ where: { itemId: id, ...(per.range ? { date: dateWhere(per.range) } : {}) }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 }),
      tx.itemCategory.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.bookSetItem.findMany({ where: { itemId: id, set: { archivedAt: null } }, include: { set: true } }),
      tx.assetItemLink.findMany({ where: { itemId: id, archivedAt: null } }),
      tx.purchaseOrderLine.findFirst({ where: { itemId: id }, orderBy: { order: { date: "desc" } }, include: { order: true } }),
    ]);
    const assets = links.length ? await tx.asset.findMany({ where: { id: { in: links.map((l) => l.assetId) } }, select: { id: true, tag: true, name: true } }) : [];
    const who = await whoNames(tx, moves.map((m) => m.createdById));
    const sheet = ["in", "out", "transfer"].includes(open);
    return { item, stores, balances, batches, moves, cats, sets, assets, lastOrder, who, items: sheet ? await itemOptions(tx) : [], stockBy: open === "transfer" ? await stockByStore(tx) : {} };
  });
  if (!d) notFound();
  const { item } = d;
  const self = `${BASE}/items/${item.id}`;
  const href = (change: Record<string, string | null>) => qs(self, { ...per.keep, ...change });
  const total = d.balances.reduce((a, b) => a + b.qty, 0);
  const reorder = reorderOf(item, item.category);
  const state = stockState(total, reorder);
  const storeName = new Map(d.stores.map((x) => [x.value, x.label]));
  const storesOpt = d.stores.map(({ value, label }) => ({ value, label }));
  const main = d.stores.find((x) => x.isMain)?.value ?? d.stores[0]?.value ?? "";
  const archived = Boolean(item.archivedAt);

  const actions = can.stock ? (
    archived ? <ActButton action={restoreItemAction} fields={{ itemId: item.id }} label="Bring back" icon="restore" size="md" /> : (
      <div className="flex gap-2">
        <MoreMenu items={[
          { label: "Change details", href: href({ open: "edit" }), icon: <PencilLine size={16} aria-hidden="true" /> },
          { label: "Stock out or write off", href: href({ open: "out" }), icon: <Minus size={16} aria-hidden="true" /> },
          { label: "Transfer between stores", href: href({ open: "transfer" }), icon: <ArrowLeftRight size={16} aria-hidden="true" /> },
          { label: "Archive item", href: href({ open: "archive" }), tone: "bad" },
        ]} />
        <ButtonLink href={href({ open: "in" })} variant="primary" icon={PackagePlus} scroll={false}>Stock in</ButtonLink>
      </div>
    )
  ) : undefined;

  return (
    <>
      <InvHead pageName={itemLabel(item)} href={self} mode={p.mode} actions={actions} sub={<><Link href={`${BASE}/items`} className="hover:underline">Items & Stock</Link> · <span className="font-mono">{item.code}</span></>} />
      <Stack>
        {archived && <Banner tone="info" title="Archived">This item is archived. Its history stays; its code is never given again.</Banner>}
        <Stats items={[
          { label: "In stock", value: qtyWords(total, item.unit), tone: state === "OUT" ? "bad" : state === "LOW" ? "warn" : undefined },
          { label: "Reorder level", value: reorder ? reorder.toLocaleString("en-IN") : "None", sub: item.reorderLevel === null ? "From the category" : "This item's own" },
          { label: "Value", value: item.pricePaise !== null ? formatRupees(item.pricePaise * BigInt(Math.max(0, total))) : "No price", sub: item.pricePaise !== null ? `${formatRupees(item.pricePaise)} each` : undefined },
          { label: "Status", value: STOCK_STATE[state].label, tone: STOCK_STATE[state].tone === "neutral" ? undefined : STOCK_STATE[state].tone },
        ]} />
        <Split>
          <Col>
            <Card>
              <CardHeader title="Movements" description={per.label} divided action={<div className="flex gap-2"><PeriodFilter {...p.dates} size="sm" />{can.export && <ExportButton size="sm" href={qs(`${BASE}/items/movements/export`, { item: item.id, ...per.keep })} />}</div>} />
              <DataList rows={d.moves} rowKey={(m) => m.id} minWidth={720} caption="Stock movements"
                empty={<Empty icon={Boxes} title="No movements on these dates" body="Choose other dates to see more." />}
                columns={[
                  { key: "date", label: "Date", nowrap: true, render: (m) => <span className="tnum">{day(m.date)}</span> },
                  { key: "kind", label: "Movement", render: (m) => <Pill tone={MOVE_KIND[m.kind].tone}>{MOVE_KIND[m.kind].label}</Pill> },
                  { key: "qty", label: "Quantity", align: "right", render: (m) => <b className={m.qty < 0 ? "text-bad" : "text-ok"}>{m.qty > 0 ? `+${m.qty}` : m.qty}</b> },
                  { key: "after", label: "Balance", align: "right", render: (m) => m.balanceAfter },
                  { key: "store", label: "Store", render: (m) => storeName.get(m.locationId) ?? "" },
                  { key: "ref", label: "Reference", render: (m) => <span className="text-[13px]">{[m.reference, m.reason].filter(Boolean).join(" · ")}</span> },
                  { key: "by", label: "By", render: (m) => d.who.get(m.createdById ?? "") ?? "" },
                ]}
                phone={(m) => ({ title: MOVE_KIND[m.kind].label, sub: `${day(m.date)} · ${storeName.get(m.locationId) ?? ""}${m.reference ? ` · ${m.reference}` : ""}`, right: m.qty > 0 ? `+${m.qty}` : String(m.qty), icon: Boxes, iconTone: m.qty < 0 ? "bad" : "ok" })}
              />
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader title="Stock by store" divided />
              <SimpleTable caption="Stock by store" rows={d.stores.map((st) => ({ st, qty: d.balances.find((b) => b.locationId === st.value)?.qty ?? 0 }))} rowKey={(r) => r.st.value} minWidth={240}
                cols={[{ label: "Store", render: (r) => r.st.label }, { label: "In stock", right: true, render: (r) => <b>{r.qty}</b> }]} foot={["Total", <b key="t">{total}</b>]} />
            </Card>
            {item.tracksExpiry && (
              <Card>
                <CardHeader title="Batches" description="Oldest expiry is issued first. Expired stock cannot be issued." divided />
                {d.batches.length === 0 ? <p className="px-5 py-4 text-[13.5px] text-ink3">No stock in any batch.</p> : (
                  <SimpleTable caption="Batches" rows={d.batches} rowKey={(b) => b.id} minWidth={300} cols={[
                    { label: "Batch", render: (b) => <span className="font-mono">{b.batchNo}</span> },
                    { label: "Store", render: (b) => storeName.get(b.locationId) ?? "" },
                    { label: "Qty", right: true, render: (b) => b.qty },
                    { label: "Expires", nowrap: true, render: (b) => <span className={b.expiresOn < today ? "text-bad font-semibold" : ""}>{b.expiresOn < today ? `Expired ${day(b.expiresOn)}` : day(b.expiresOn)}</span> },
                  ]} />
                )}
              </Card>
            )}
            <Card>
              <CardHeader title="Details" divided />
              <div className="p-5">
                <DL cols={2} rows={[
                  ["Code", <span key="c" className="font-mono">{item.code}</span>],
                  ["Category", item.category.name],
                  ["Unit", item.unit],
                  ["Size", item.size ?? "None"],
                  ["Price per unit", item.pricePaise !== null ? formatRupees(item.pricePaise) : "Not set"],
                  ["Last purchase", d.lastOrder ? `${formatRupees(d.lastOrder.unitPricePaise)} on ${d.lastOrder.order.number}` : "None yet"],
                  ["Expiry tracking", item.tracksExpiry ? "On" : "Off"],
                  ["In book sets", d.sets.length ? d.sets.map((x) => x.set.name).join(", ") : "None"],
                  ...(d.assets.length ? [["Linked assets", d.assets.map((a) => `${a.tag} ${a.name}`).join(", ")] as [string, React.ReactNode]] : []),
                  ...(item.note ? [["Note", item.note] as [string, React.ReactNode]] : []),
                ]} />
              </div>
            </Card>
          </Col>
        </Split>
      </Stack>
      {open === "edit" && !archived && (
        <ItemSheet closeHref={href({ open: null })} categories={d.cats.map((c) => ({ value: c.id, label: c.name, reorder: c.defaultReorderLevel }))} units={s.units} stores={storesOpt} nextCode="" labCategories={[]}
          start={{ id: item.id, code: item.code, name: item.name, categoryId: item.categoryId, unit: item.unit, size: item.size ?? "", reorderLevel: item.reorderLevel === null ? "" : String(item.reorderLevel), price: paiseToField(item.pricePaise), tracksExpiry: item.tracksExpiry, note: item.note ?? "" }} />
      )}
      {open === "in" && !archived && <StockInSheet closeHref={href({ open: null })} items={d.items} stores={storesOpt} start={{ itemId: item.id, locationId: main }} today={todayStr} />}
      {open === "out" && !archived && (
        <StockOutSheet closeHref={href({ open: null })} items={d.items} stores={storesOpt} today={todayStr} start={{ itemId: item.id, locationId: d.balances.sort((a, b) => b.qty - a.qty)[0]?.locationId ?? main, kind: "OUT" }}
          batches={d.batches.map((b) => ({ id: b.id, itemId: b.itemId, locationId: b.locationId, label: `${b.batchNo} · ${b.qty} · ${b.expiresOn < today ? "expired" : "expires"} ${day(b.expiresOn)}` }))} />
      )}
      {open === "transfer" && !archived && <TransferSheet closeHref={href({ open: null })} items={d.items} stores={storesOpt} stockBy={d.stockBy} today={todayStr} needsApproval={s.transfersNeedApproval} start={{ from: d.balances.sort((a, b) => b.qty - a.qty)[0]?.locationId ?? main, lines: [{ itemId: item.id, qty: "" }] }} />}
      {open === "archive" && !archived && <ArchiveItemSheet closeHref={href({ open: null })} itemId={item.id} name={itemLabel(item)} />}
    </>
  );
}
