// Items & Stock (14 §2): every item with stock in hand by store, reorder
// level and status (OK, Low, Out of stock), low-stock items first in red.
// Views: lab stock (equipment and chemicals, with expiry), book sets (items
// and how many full sets the stock makes), stock audits, and every stock
// movement by date. The store keeper adds and imports items, records stock
// in and out, transfers, write-offs and audits; leaders read and remind.
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, BookCopy, ClipboardCheck, FileUp, FlaskConical, Minus, PackagePlus, Plus, Search, ShoppingCart, TriangleAlert, Boxes } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/list";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { MoreMenu } from "@/components/ui/more-menu";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Stack, Toolbar, DataList, Empty, Banner, SimpleTable, type StatItem } from "@/components/money/kit";
import { itemLabel, nextCodePreview } from "@/lib/inventory/items";
import { itemOptions, stockByStore, locationOptions, classOptions } from "@/lib/inventory/lookup";
import { expiringBatches } from "@/lib/inventory/stock";
import { fullSets } from "@/lib/inventory/issues";
import { AUDIT_STATUS, MOVE_KIND, STOCK_STATE, paiseToField, plural, qtyWords } from "@/lib/inventory/words";
import { InvHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { ItemSheet, SetSheet, StartAuditSheet, StockInSheet, StockOutSheet, TransferSheet, type BatchOpt, type SetStart } from "../_components/sheets";
import { BASE, invGuard, invPeriod, one, qs, addQ, uuidOr, type SearchParams } from "../_lib/page";
import { itemsList, movesList, readItemsFilter, readMovesFilter } from "../_lib/lists";
import { archiveSetAction, remindStoreAction } from "../actions";

export const metadata: Metadata = { title: "Items & Stock · Inventory Management" };

const VIEWS = ["", "lab", "sets", "audits", "moves"] as const;
type View = (typeof VIEWS)[number];
const day = (d: Date) => formatDate(d, "UTC");
const ZERO = BigInt(0);

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await invGuard("items");
  const { current, can, today, todayStr, settings: s, tz } = p;
  const view = (VIEWS as readonly string[]).includes(one(sp.view)) ? (one(sp.view) as View) : "";
  const per = invPeriod(sp, p.dates, view === "moves" ? "thismonth" : null);
  const page = Math.max(1, Math.min(500, Number(one(sp.page)) || 1));
  const open = can.stock ? one(sp.open) : "";
  const f = readItemsFilter((k) => one(sp[k]), view === "moves" ? null : per.range);
  const mf = readMovesFilter((k) => one(sp[k]), per.range);

  const d = await withSchool(current.ctx, async (tx) => {
    const [stores, cats, counts] = await Promise.all([
      locationOptions(tx),
      tx.itemCategory.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      itemsList(tx, { q: "", cat: "", state: "", store: "", lab: false, archived: false, range: null }, tz),
    ]);
    const rows = view === "" || view === "lab" ? await itemsList(tx, f, tz) : [];
    const moves = view === "moves" ? await movesList(tx, mf, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }) : null;
    const expiring = view === "lab" ? await expiringBatches(tx, today, 60) : [];
    // Items holding an expired batch are flagged in the list too (14 §5: expired stock is flagged).
    const expiredItems = new Set(rows.length ? (await tx.stockBatch.findMany({ where: { qty: { gt: 0 }, expiresOn: { lt: today }, itemId: { in: rows.map((r) => r.item.id) } }, select: { itemId: true } })).map((b) => b.itemId) : []);
    const sets = view === "sets" ? await tx.bookSet.findMany({ where: { archivedAt: null }, include: { items: true }, orderBy: { name: "asc" } }) : [];
    const audits = view === "audits" ? await tx.stockAudit.findMany({ orderBy: [{ startedOn: "desc" }, { createdAt: "desc" }], take: 50, include: { lines: { select: { countedQty: true, systemQty: true } } } }) : [];
    const needItems = ["in", "out", "transfer", "set"].includes(open) || view === "sets";
    const items = needItems ? await itemOptions(tx) : [];
    const stockBy = needItems ? await stockByStore(tx) : {};
    const batches = open === "out" ? await tx.stockBatch.findMany({ where: { qty: { gt: 0 } }, orderBy: { expiresOn: "asc" } }) : [];
    const classes = open === "set" ? await classOptions(tx, current.ctx) : [];
    const nextCode = open === "add" ? await nextCodePreview(tx, current.ctx) : "";
    const editSet = open === "set" && uuidOr(one(sp.set)) ? sets.find((x) => x.id === one(sp.set)) ?? (await tx.bookSet.findFirst({ where: { id: one(sp.set) }, include: { items: true } })) : null;
    const itemNames = new Map((await tx.item.findMany({ where: { id: { in: [...new Set([...sets.flatMap((x) => x.items.map((i) => i.itemId)), ...expiring.map((b) => b.itemId)])] } } })).map((i) => [i.id, i]));
    return { stores, cats, counts, rows, moves, expiring, expiredItems, sets, audits, items, stockBy, batches, classes, nextCode, editSet, itemNames };
  });

  const storeName = new Map(d.stores.map((x) => [x.value, x.label]));
  const catName = new Map(d.cats.map((c) => [c.id, c.name]));
  const low = d.counts.filter((r) => r.state !== "OK");
  const out = d.counts.filter((r) => r.state === "OUT");
  const value = d.counts.reduce((a, r) => a + r.value, ZERO);
  const labCats = d.cats.filter((c) => c.isLab);
  const keep = { view: view || null, q: f.q || null, cat: f.cat || null, state: f.state || null, store: f.store || null, item: mf.item || null, kind: mf.kind || null, ...per.keep };
  const here = (change: Record<string, string | null>) => addQ(qs(`${BASE}/items`, keep), { page: null, ...change });
  const main = d.stores.find((x) => x.isMain)?.value ?? d.stores[0]?.value ?? "";
  const storesOpt = d.stores.map(({ value, label }) => ({ value, label }));

  const stats: StatItem[] = [
    { label: "Items", value: d.counts.length.toLocaleString("en-IN"), href: here({ view: null, state: null }) },
    { label: "Stock value", value: formatRupees(value), sub: "At item prices" },
    { label: "Low stock", value: low.length.toLocaleString("en-IN"), tone: low.length ? "warn" : undefined, href: here({ view: null, state: "low" }), active: f.state === "low" },
    { label: "Out of stock", value: out.length.toLocaleString("en-IN"), tone: out.length ? "bad" : undefined, href: here({ view: null, state: "out" }), active: f.state === "out" },
  ];

  const actions = can.stock ? (
    <div className="flex gap-2">
      <MoreMenu items={[
        { label: "Stock in", href: here({ open: "in" }), icon: <PackagePlus size={16} aria-hidden="true" /> },
        { label: "Stock out or write off", href: here({ open: "out" }), icon: <Minus size={16} aria-hidden="true" /> },
        { label: "Transfer between stores", href: here({ open: "transfer" }), icon: <ArrowLeftRight size={16} aria-hidden="true" /> },
        { label: "Start a stock audit", href: here({ open: "audit" }), icon: <ClipboardCheck size={16} aria-hidden="true" /> },
        ...(s.bookSetsOn ? [{ label: "Make a book set", href: here({ open: "set", set: null }), icon: <BookCopy size={16} aria-hidden="true" /> }] : []),
        { label: "Import items", href: `${BASE}/items/import`, icon: <FileUp size={16} aria-hidden="true" /> },
      ]} />
      <ButtonLink href={here({ open: "add" })} variant="primary" icon={Plus} scroll={false}>Add item</ButtonLink>
    </div>
  ) : can.remind && low.length ? <ActButton action={remindStoreAction} fields={{ what: "low" }} label="Remind store keeper" icon="bell" size="md" /> : undefined;

  return (
    <>
      <InvHead pageName="Items & Stock" href={`${BASE}/items`} mode={p.mode} actions={actions} />
      <Stack>
        <Stats items={stats} />
        {low.length > 0 && view === "" && f.state !== "low" && (
          <Banner tone={out.length ? "bad" : "warn"} icon={TriangleAlert} title={`${plural(low.length, "item")} at or below the reorder level`}
            action={can.purchase ? <ButtonLink href={`${BASE}/purchases?tab=requests&new=1&low=1`} size="sm" variant="primary" icon={ShoppingCart}>Raise purchase request</ButtonLink> : <ButtonLink href={here({ state: "low" })} size="sm" variant="secondary">Show them</ButtonLink>}>
            {low.slice(0, 4).map((r) => `${itemLabel(r.item)} (${r.total <= 0 ? "out" : `${r.total} left`})`).join(", ")}{low.length > 4 ? ` and ${low.length - 4} more` : ""}.
          </Banner>
        )}
        <SegLinks label="Items views" value={view} options={[
          { value: "", label: "Items", href: here({ view: null }) },
          ...(labCats.length ? [{ value: "lab", label: "Lab stock", href: here({ view: "lab", cat: null }) }] : []),
          ...(s.bookSetsOn ? [{ value: "sets", label: "Book sets", href: here({ view: "sets" }) }] : []),
          { value: "audits", label: "Stock audits", href: here({ view: "audits" }) },
          { value: "moves", label: "Movements", href: qs(`${BASE}/items`, { view: "moves" }) },
        ]} className="flex w-full max-w-full overflow-x-auto [scrollbar-width:none]" />

        {(view === "" || view === "lab") && (
          <>
            {view === "" && (
              <Chips label="Categories" value={f.cat} options={[
                { value: "", label: "All", count: d.counts.length, href: here({ cat: null }) },
                ...d.cats.map((c) => ({ value: c.id, label: c.name, count: d.counts.filter((r) => r.item.categoryId === c.id).length, href: here({ cat: c.id }) })),
              ]} />
            )}
            {view === "lab" && d.expiring.length > 0 && (
              <Card>
                <CardHeader title="Expired or expiring in 60 days" description="Expired batches cannot be issued. Record them as expired." icon={FlaskConical} divided />
                <SimpleTable caption="Expiring batches" rows={d.expiring} rowKey={(b) => b.id} minWidth={560} cols={[
                  { label: "Item", render: (b) => { const it = d.itemNames.get(b.itemId); return it ? <Link className="font-semibold hover:underline" href={`${BASE}/items/${it.id}`}>{itemLabel(it)}</Link> : ""; } },
                  { label: "Batch", render: (b) => <span className="font-mono">{b.batchNo}</span> },
                  { label: "Store", render: (b) => storeName.get(b.locationId) ?? "" },
                  { label: "Quantity", right: true, render: (b) => b.qty },
                  { label: "Expires", nowrap: true, render: (b) => <span className={b.expiresOn < today ? "text-bad font-semibold" : "text-warn"}>{b.expiresOn < today ? `Expired ${day(b.expiresOn)}` : day(b.expiresOn)}</span> },
                  ...(can.stock ? [{ label: "", render: (b: (typeof d.expiring)[number]) => (b.expiresOn < today ? <Link className="text-[13px] font-semibold text-brand hover:underline" href={here({ open: "out", kind: "EXPIRED", item: b.itemId, store: b.locationId })} scroll={false}>Record as expired</Link> : null) }] : []),
                ]} />
              </Card>
            )}
            <Card>
              <Toolbar className="md:flex-wrap">
                <UrlSearch placeholder="Search name, code or size" label="Search items" className="flex-1 md:min-w-[260px]" id="items-search" />
                <div className="flex gap-2 flex-wrap">
                  <UrlSelect param="state" label="Status" options={[{ value: "", label: "Any status" }, { value: "low", label: "Low and out" }, { value: "out", label: "Out of stock" }, { value: "ok", label: "OK" }]} />
                  {d.stores.length > 1 && <UrlSelect param="store" label="Store" options={[{ value: "", label: "All stores" }, ...storesOpt]} />}
                  <PeriodFilter {...p.dates} allLabel="Added: all dates" />
                  {can.export && <ExportButton href={qs(`${BASE}/items/export`, keep)} />}
                </div>
              </Toolbar>
              <DataList rows={d.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} rowKey={(r) => r.item.id} rowHref={(r) => `${BASE}/items/${r.item.id}`} minWidth={900} caption="Items"
                rowClass={(r) => r.state === "OUT" && "bg-bad/5"}
                empty={<Empty icon={f.q || f.cat || f.state || f.store || per.range ? Search : Boxes} title={f.q || f.cat || f.state || f.store || per.range ? "No items match" : view === "lab" ? "No lab stock yet" : "No items yet"}
                  body={f.q || f.cat || f.state || f.store || per.range ? "Try another search or clear the filters." : can.stock ? "Add the first item, or import them from a spreadsheet." : "The store keeper adds the items."}
                  action={can.stock && !f.q ? <ButtonLink href={`${BASE}/items/import`} variant="secondary" icon={FileUp}>Import items</ButtonLink> : undefined} />}
                columns={[
                  { key: "code", label: "Code", nowrap: true, render: (r) => <span className="font-mono text-[13px]">{r.item.code}</span> },
                  { key: "name", label: "Item", render: (r) => <span className="block min-w-[180px]"><b className={r.state === "OUT" ? "font-semibold text-bad" : "font-semibold"}>{itemLabel(r.item)}</b><span className="block text-[12px] text-ink3">{catName.get(r.item.categoryId) ?? ""}{r.item.tracksExpiry && !d.expiredItems.has(r.item.id) ? " · expiry tracked" : ""}{d.expiredItems.has(r.item.id) && <b className="font-semibold text-bad"> · expired batch</b>}</span></span> },
                  { key: "unit", label: "Unit", render: (r) => r.item.unit },
                  { key: "stock", label: f.store ? `In ${storeName.get(f.store) ?? "store"}` : "In stock", align: "right", render: (r) => <b className={r.state === "OUT" ? "text-bad" : r.state === "LOW" ? "text-warn" : ""}>{r.shown.toLocaleString("en-IN")}</b> },
                  ...(d.stores.length > 1 && !f.store ? [{ key: "by", label: "By store", render: (r: (typeof d.rows)[number]) => <span className="text-[12.5px] text-ink2">{[...r.stores.entries()].filter(([, q]) => q).map(([l, q]) => `${storeName.get(l) ?? "Store"}: ${q.toLocaleString("en-IN")}`).join(" · ")}</span> }] : []),
                  { key: "reorder", label: "Reorder at", align: "right", render: (r) => (r.reorder ? r.reorder : <span className="text-ink3">None</span>) },
                  { key: "value", label: "Value", align: "right", nowrap: true, render: (r) => (r.item.pricePaise !== null ? formatRupees(r.value) : <span className="text-ink3">No price</span>) },
                  { key: "state", label: "Status", render: (r) => <Pill tone={STOCK_STATE[r.state].tone}>{STOCK_STATE[r.state].label}</Pill> },
                ]}
                phone={(r) => ({ title: itemLabel(r.item), sub: `${r.item.code} · ${catName.get(r.item.categoryId) ?? ""}${r.reorder ? ` · reorder at ${r.reorder}` : ""}`, right: qtyWords(r.shown, r.item.unit), icon: Boxes, iconTone: r.state === "OUT" ? "bad" : r.state === "LOW" ? "warn" : "brand", pills: r.state !== "OK" ? <Pill tone={STOCK_STATE[r.state].tone}>{STOCK_STATE[r.state].label}</Pill> : undefined })}
              />
              {d.rows.length > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={d.rows.length} prevHref={here({ page: page > 2 ? String(page - 1) : null })} nextHref={here({ page: String(page + 1) })} />}
            </Card>
          </>
        )}

        {view === "sets" && (
          <Card>
            <CardHeader title="Book sets" description="Items issued together; the set price goes to the student's fees." divided action={can.stock ? <ButtonLink href={here({ open: "set", set: null })} size="sm" variant="secondary" icon={Plus} scroll={false}>Make a set</ButtonLink> : undefined} />
            {d.sets.length === 0 ? <Empty icon={BookCopy} title="No book sets yet" body={can.stock ? "Make a set: pick the items, the price and the classes." : "The store keeper makes the sets."} /> : (
              <ul className="divide-y divide-line">
                {d.sets.map((st) => {
                  const lines = st.items.map((x) => ({ qty: x.qty, have: Object.values(d.stockBy[x.itemId] ?? {}).reduce((a, q) => a + q, 0), item: d.itemNames.get(x.itemId) }));
                  const full = fullSets(lines);
                  return (
                    <li key={st.id} className="px-5 py-4 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <b className="font-semibold text-[15px]">{st.name}</b>
                          <span className="block text-[13px] text-ink3">{plural(st.items.length, "item")} · {formatRupees(st.pricePaise)}{st.classIds.length ? ` · for ${plural(st.classIds.length, "class", "classes")}` : ""}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill tone={full ? "ok" : "bad"}>{full ? `${full} full set${full === 1 ? "" : "s"} in stock` : "No full set in stock"}</Pill>
                          {can.stock && <ButtonLink href={here({ open: "set", set: st.id })} size="sm" variant="ghost" scroll={false}>Change</ButtonLink>}
                          {can.stock && <ActButton action={archiveSetAction} fields={{ setId: st.id }} label="Archive" icon="archive" variant="ghost" />}
                        </div>
                      </div>
                      <ul className="flex flex-wrap gap-1.5 text-[12.5px]">
                        {lines.map((l, i) => <li key={i} className={l.have < l.qty ? "rounded-lg bg-bad/10 text-bad px-2 py-0.5" : "rounded-lg bg-sunken px-2 py-0.5"}>{l.item ? itemLabel(l.item) : "Item"} × {l.qty} <span className="opacity-70">({l.have})</span></li>)}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {view === "audits" && (
          <Card>
            <CardHeader title="Stock audits" description="Count each item; differences change stock only after approval." divided action={can.stock ? <ButtonLink href={here({ open: "audit" })} size="sm" variant="secondary" icon={ClipboardCheck} scroll={false}>Start an audit</ButtonLink> : undefined} />
            <DataList rows={d.audits} rowKey={(a) => a.id} rowHref={(a) => `${BASE}/items/audits/${a.id}`} minWidth={700} caption="Stock audits"
              empty={<Empty icon={ClipboardCheck} title="No stock audits yet" body={can.stock ? "Start one to count a store." : "The store keeper counts the stores."} />}
              columns={[
                { key: "date", label: "Started", nowrap: true, render: (a) => <span className="tnum">{day(a.startedOn)}<span className="block text-[12px] text-ink3 font-mono">{a.number}</span></span> },
                { key: "name", label: "Audit", render: (a) => <b className="font-semibold">{a.name}</b> },
                { key: "store", label: "Store", render: (a) => storeName.get(a.locationId) ?? "" },
                { key: "counted", label: "Counted", align: "right", render: (a) => `${a.lines.filter((l) => l.countedQty !== null).length} of ${a.lines.length}` },
                { key: "diff", label: "Differences", align: "right", render: (a) => a.lines.filter((l) => l.countedQty !== null && l.countedQty !== l.systemQty).length },
                { key: "status", label: "Status", render: (a) => <Pill tone={AUDIT_STATUS[a.status].tone}>{AUDIT_STATUS[a.status].label}</Pill> },
              ]}
              phone={(a) => ({ title: a.name, sub: `${day(a.startedOn)} · ${storeName.get(a.locationId) ?? ""}`, icon: ClipboardCheck, iconTone: "brand", pills: <Pill tone={AUDIT_STATUS[a.status].tone}>{AUDIT_STATUS[a.status].label}</Pill> })}
            />
          </Card>
        )}

        {view === "moves" && d.moves && (
          <Card>
            <Toolbar className="md:flex-wrap">
              <UrlSearch placeholder="Search item, reference or reason" label="Search movements" className="flex-1 md:min-w-[260px]" id="moves-search" />
              <div className="flex gap-2 flex-wrap">
                <UrlSelect param="kind" label="Kind" options={[{ value: "", label: "All kinds" }, { value: "in", label: "Stock in" }, { value: "out", label: "Out and issued" }, { value: "transfer", label: "Transfers" }, { value: "loss", label: "Damaged, lost, expired" }, { value: "audit", label: "Audit adjustments" }]} />
                {d.stores.length > 1 && <UrlSelect param="store" label="Store" options={[{ value: "", label: "All stores" }, ...storesOpt]} />}
                <PeriodFilter {...p.dates} fallback="thismonth" />
                {can.export && <ExportButton href={qs(`${BASE}/items/movements/export`, { item: mf.item || null, kind: mf.kind || null, store: mf.store || null, q: mf.q || null, ...per.keep })} />}
              </div>
            </Toolbar>
            <DataList rows={d.moves.rows} rowKey={(m) => m.id} rowHref={(m) => `${BASE}/items/${m.itemId}`} minWidth={900} caption="Stock movements"
              empty={<Empty icon={Search} title="No movements on these dates" body="Choose other dates or clear the filters." />}
              columns={[
                { key: "date", label: "Date", nowrap: true, render: (m) => <span className="tnum">{day(m.date)}</span> },
                { key: "item", label: "Item", render: (m) => <span className="block min-w-[160px]"><b className="font-semibold">{itemLabel(m.item)}</b><span className="block text-[12px] text-ink3 font-mono">{m.item.code}</span></span> },
                { key: "kind", label: "Movement", render: (m) => <Pill tone={MOVE_KIND[m.kind].tone}>{MOVE_KIND[m.kind].label}</Pill> },
                { key: "qty", label: "Quantity", align: "right", render: (m) => <b className={m.qty < 0 ? "text-bad" : "text-ok"}>{m.qty > 0 ? `+${m.qty}` : m.qty}</b> },
                { key: "after", label: "Balance", align: "right", render: (m) => m.balanceAfter },
                { key: "store", label: "Store", render: (m) => storeName.get(m.locationId) ?? "" },
                { key: "ref", label: "Reference", render: (m) => <span className="text-[13px]">{[m.reference, m.reason].filter(Boolean).join(" · ")}</span> },
                { key: "by", label: "By", render: (m) => d.moves!.who.get(m.createdById ?? "") ?? "" },
              ]}
              phone={(m) => ({ title: itemLabel(m.item), sub: `${day(m.date)} · ${MOVE_KIND[m.kind].label}${m.reference ? ` · ${m.reference}` : ""}`, right: m.qty > 0 ? `+${m.qty}` : String(m.qty), icon: Boxes, iconTone: m.qty < 0 ? "bad" : "ok" })}
            />
            {d.moves.total > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={d.moves.total} prevHref={here({ page: page > 2 ? String(page - 1) : null })} nextHref={here({ page: String(page + 1) })} />}
          </Card>
        )}
      </Stack>

      {open === "add" && (
        <ItemSheet closeHref={here({ open: null })} categories={d.cats.map((c) => ({ value: c.id, label: c.name, reorder: c.defaultReorderLevel }))} units={s.units} stores={storesOpt} start={null} nextCode={d.nextCode} labCategories={labCats.map((c) => c.id)} />
      )}
      {open === "in" && <StockInSheet closeHref={here({ open: null, item: mf.item || null })} items={d.items} stores={storesOpt} start={{ itemId: uuidOr(one(sp.item)), locationId: uuidOr(one(sp.store)) || main }} today={todayStr} />}
      {open === "out" && (
        <StockOutSheet closeHref={here({ open: null, kind: null })} items={d.items} stores={storesOpt} today={todayStr}
          batches={d.batches.map((b): BatchOpt => ({ id: b.id, itemId: b.itemId, locationId: b.locationId, label: `${b.batchNo} · ${b.qty} · ${b.expiresOn < today ? "expired" : "expires"} ${day(b.expiresOn)}` }))}
          start={{ itemId: uuidOr(one(sp.item)), locationId: uuidOr(one(sp.store)) || main, kind: ["DAMAGED", "LOST", "EXPIRED"].includes(one(sp.kind)) ? one(sp.kind) : "OUT" }} />
      )}
      {open === "transfer" && <TransferSheet closeHref={here({ open: null })} items={d.items} stores={storesOpt} stockBy={d.stockBy} today={todayStr} needsApproval={s.transfersNeedApproval} start={{ from: uuidOr(one(sp.store)) || main, lines: uuidOr(one(sp.item)) ? [{ itemId: one(sp.item), qty: "" }] : [] }} />}
      {open === "audit" && <StartAuditSheet closeHref={here({ open: null })} stores={storesOpt} categories={d.cats.map((c) => ({ value: c.id, label: c.name }))} suggested={`Stock count ${day(today)}`} />}
      {open === "set" && s.bookSetsOn && (
        <SetSheet closeHref={here({ open: null, set: null })} items={d.items} classes={d.classes}
          start={d.editSet ? ({ id: d.editSet.id, name: d.editSet.name, classIds: d.editSet.classIds, lines: d.editSet.items.map((x) => ({ itemId: x.itemId, qty: String(x.qty) })), price: paiseToField(d.editSet.pricePaise) } satisfies SetStart) : null} />
      )}
    </>
  );
}
