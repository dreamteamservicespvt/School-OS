// Assets (14 §2): the asset register (tag, name, type, where it is, purchase
// date, cost, value after depreciation, warranty and AMC, condition, status),
// warranty and AMC ending soon, the repair log, disposals (with approval) and
// asset checks (scan tags room by room). The store keeper adds, imports,
// assigns, repairs, disposes and prints tags; leaders read and approve.
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ClipboardCheck, FileUp, Monitor, Plus, Printer, ScanLine, Search, Trash2, Wrench } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/list";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { MoreMenu } from "@/components/ui/more-menu";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { UrlSheet } from "@/components/ui/url-sheet";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Stack, Toolbar, DataList, Empty, Banner, SimpleTable, DL, type StatItem } from "@/components/money/kit";
import { assetAuditResult, bookValue, nextTagPreview, rateOf } from "@/lib/inventory/assets";
import { departmentOptions, roomOptions, staffOptions, vendorOptions } from "@/lib/inventory/lookup";
import { itemLabel } from "@/lib/inventory/items";
import { APPROVAL_STATUS, ASSET_STATUS, DISPOSAL_METHOD, MAINT_STATUS, paiseToField, plural } from "@/lib/inventory/words";
import { InvHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { DecideBox } from "../_components/decide";
import { BASE, invGuard, invPeriod, one, qs, addQ, uuidOr, type SearchParams } from "../_lib/page";
import { assetsList, decidable, readAssetsFilter, whoNames } from "../_lib/lists";
import { decideAction, remindStoreAction } from "../actions";
import { closeAssetAuditAction } from "./actions";
import { AssetSheet, ScanTags, StartAssetAuditSheet } from "./sheets";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Assets · Inventory Management" };

const VIEWS = ["", "repairs", "disposals", "audit"] as const;
type View = (typeof VIEWS)[number];
const day = (d: Date | null) => (d ? formatDate(d, "UTC") : "");
const ZERO = BigInt(0);

export default async function AssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await invGuard("assets");
  const { current, can, today, todayStr, settings: s, tz } = p;
  const view = (VIEWS as readonly string[]).includes(one(sp.view)) ? (one(sp.view) as View) : "";
  const per = invPeriod(sp, p.dates, null);
  const page = Math.max(1, Math.min(500, Number(one(sp.page)) || 1));
  const open = can.assets ? one(sp.open) : "";
  const f = readAssetsFilter((k) => one(sp[k]), per.range);
  const auditId = view === "audit" ? uuidOr(one(sp.audit)) : "";
  const disposalId = uuidOr(one(sp.disposal));
  const receiptId = open === "add" ? uuidOr(one(sp.receipt)) : "";
  const days = s.warrantyReminderDays;
  const soon = new Date(today.getTime() + days * 86_400_000);

  const d = await withSchool(current.ctx, async (tx) => {
    const [all, rooms, waiting] = await Promise.all([
      tx.asset.findMany({ where: { archivedAt: null }, select: { id: true, type: true, status: true, costPaise: true, purchaseDate: true, depreciationRate: true, warrantyEnd: true, amcEnd: true } }),
      roomOptions(tx),
      tx.assetDisposal.count({ where: { status: "WAITING" } }),
    ]);
    const list = view === "" ? await assetsList(tx, f, today, days, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }) : null;
    const repairs = view === "repairs" ? await tx.assetMaintenanceLog.findMany({ where: { ...(per.range ? { date: { gte: new Date(`${per.range.from}T00:00:00Z`), lte: new Date(`${per.range.to}T00:00:00Z`) } } : {}) }, orderBy: [{ date: "desc" }], take: 300, include: { asset: true } }) : [];
    const disposals = view === "disposals" ? await tx.assetDisposal.findMany({ where: { ...(per.range ? { date: { gte: new Date(`${per.range.from}T00:00:00Z`), lte: new Date(`${per.range.to}T00:00:00Z`) } } : {}) }, orderBy: [{ createdAt: "desc" }], take: 300, include: { asset: true } }) : [];
    const audits = view === "audit" ? await tx.assetAudit.findMany({ orderBy: { startedAt: "desc" }, take: 30, include: { _count: { select: { scans: true } } } }) : [];
    const audit = auditId ? audits.find((a) => a.id === auditId) ?? null : view === "audit" ? audits.find((a) => a.status === "OPEN") ?? null : null;
    const result = audit ? await assetAuditResult(tx, audit.id) : null;
    const lastScans = audit ? await tx.assetAuditScan.findMany({ where: { auditId: audit.id }, orderBy: { scannedAt: "desc" }, take: 8 }) : [];
    const disposal = disposalId ? await tx.assetDisposal.findFirst({ where: { id: disposalId }, include: { asset: true } }) : null;
    const mine = await decidable(tx, current.ctx, [disposal?.approvalId, ...disposals.map((x) => x.approvalId)]);
    const vendors = await vendorOptions(tx);
    const sheet = open === "add" ? { departments: await departmentOptions(tx), staff: await staffOptions(tx), nextTag: await nextTagPreview(tx, current.ctx) } : null;
    let receipt = null as null | { id: string; words: string; name: string; cost: string; date: string; vendorId: string; count: string; itemId: string };
    if (receiptId) {
      const r = await tx.goodsReceipt.findFirst({ where: { id: receiptId }, include: { lines: true, order: { include: { lines: true } } } });
      const line = r ? r.lines.find((l) => l.id === one(sp.line)) ?? r.lines[0] : null;
      const item = line ? await tx.item.findFirst({ where: { id: line.itemId } }) : null;
      const ol = r && line ? r.order.lines.find((x) => x.id === line.orderLineId) : null;
      if (r && line) receipt = { id: r.id, words: `From ${r.number} (${r.order.number}): ${item ? itemLabel(item) : "item"} × ${line.qty}`, name: item ? itemLabel(item) : "", cost: ol ? paiseToField(ol.unitPricePaise) : "", date: r.date.toISOString().slice(0, 10), vendorId: r.order.vendorId, count: String(Math.min(100, line.qty)), itemId: line.itemId };
    }
    const who = await whoNames(tx, [disposal?.createdById, ...lastScans.map((x) => x.scannedById)]);
    const vendorName = new Map(vendors.map((v) => [v.value, v.label]));
    return { all, rooms, waiting, list, repairs, disposals, audits, audit, result, lastScans, disposal, mine, vendors, vendorName, sheet, receipt, who };
  }, { timeout: 30_000 });

  const live = d.all.filter((a) => a.status !== "DISPOSED");
  const value = live.reduce((acc, a) => acc + bookValue(a, s.depreciationMethod, rateOf(a, s), today), ZERO);
  const ending = live.filter((a) => (a.warrantyEnd && a.warrantyEnd >= today && a.warrantyEnd <= soon) || (a.amcEnd && a.amcEnd >= today && a.amcEnd <= soon));
  const inRepair = live.filter((a) => a.status === "IN_REPAIR").length;
  const roomName = new Map(d.rooms.map((r) => [r.value, r.label]));
  const keep = { view: view || null, q: f.q || null, type: f.type || null, status: f.status || null, room: f.room || null, cover: f.cover ? "ending" : null, ...per.keep };
  const here = (change: Record<string, string | null>) => addQ(qs(`${BASE}/assets`, keep), { page: null, ...change });
  const filtered = Boolean(f.q || f.type || f.status || f.room || f.cover || per.range);

  const stats: StatItem[] = [
    { label: "Assets in use", value: live.length.toLocaleString("en-IN"), href: here({ view: null, status: null, cover: null }) },
    { label: "Value today", value: formatRupees(value), sub: s.depreciationMethod === "WDV" ? "Written-down value" : "Straight line" },
    { label: "In repair", value: inRepair.toLocaleString("en-IN"), tone: inRepair ? "warn" : undefined, href: here({ view: null, status: "IN_REPAIR", cover: null }), active: f.status === "IN_REPAIR" },
    { label: `Warranty or AMC ending in ${days} days`, value: ending.length.toLocaleString("en-IN"), tone: ending.length ? "warn" : undefined, href: here({ view: null, cover: "ending", status: null }), active: f.cover },
  ];

  const actions = can.assets ? (
    <div className="flex gap-2">
      <MoreMenu items={[
        { label: "Import assets", href: `${BASE}/assets/import`, icon: <FileUp size={16} aria-hidden="true" /> },
        { label: "Start an asset check", href: here({ view: "audit", open: "audit" }), icon: <ScanLine size={16} aria-hidden="true" /> },
        ...(f.room ? [{ label: `Print tags for ${roomName.get(f.room) ?? "this room"}`, href: `${BASE}/assets/tags?room=${f.room}`, file: true, icon: <Printer size={16} aria-hidden="true" /> }] : []),
      ]} />
      <ButtonLink href={here({ open: "add" })} variant="primary" icon={Plus} scroll={false}><Words k="Add asset" /></ButtonLink>
    </div>
  ) : can.remind && ending.length ? <ActButton action={remindStoreAction} fields={{ what: "maintenance" }} label="Remind store keeper" icon="bell" size="md" /> : undefined;

  const rangeDate = (label: string) => <PeriodFilter {...p.dates} allLabel={`${label}: all dates`} />;

  return (
    <>
      <InvHead pageName="Assets" href={`${BASE}/assets`} mode={p.mode} actions={actions} />
      <Stack>
        <Stats items={stats} />
        {d.waiting > 0 && view !== "disposals" && (
          <Banner tone="info" icon={Trash2} title={`${plural(d.waiting, "disposal")} waiting for approval`} action={<ButtonLink href={here({ view: "disposals" })} size="sm" variant="secondary"><Words k="Show" /></ButtonLink>}>
            <Words k="Disposed assets stay in the register as Disposed." />
          </Banner>
        )}
        {ending.length > 0 && view === "" && !f.cover && (
          <Banner tone="warn" icon={CalendarClock} title={`Warranty or AMC ending soon on ${plural(ending.length, "asset")}`} action={<ButtonLink href={here({ cover: "ending", status: null })} size="sm" variant="secondary"><Words k="Show them" /></ButtonLink>}>
            <Words k="Ending in the next" /> {days} <Words k="days. Renew the AMC or get repairs done while covered." />
          </Banner>
        )}
        <SegLinks label="Assets views" value={view} options={[
          { value: "", label: "Register", href: here({ view: null }) },
          { value: "repairs", label: "Repairs", href: qs(`${BASE}/assets`, { view: "repairs" }) },
          { value: "disposals", label: "Disposals", href: qs(`${BASE}/assets`, { view: "disposals" }) },
          { value: "audit", label: "Asset checks", href: qs(`${BASE}/assets`, { view: "audit" }) },
        ]} />

        {view === "" && d.list && (
          <Card>
            <Toolbar className="md:flex-wrap">
              <UrlSearch placeholder="Search tag, name or serial number" label="Search assets" className="flex-1 md:min-w-[260px]" id="assets-search" />
              <div className="flex gap-2 flex-wrap">
                <UrlSelect param="type" label="Type" options={[{ value: "", label: "All types" }, ...s.assetTypes.map((t) => ({ value: t, label: t }))]} />
                <UrlSelect param="status" label="Status" options={[{ value: "", label: "Any status" }, ...Object.entries(ASSET_STATUS).map(([value, x]) => ({ value, label: x.label }))]} />
                <UrlSelect param="room" label="Room" options={[{ value: "", label: "All rooms" }, ...d.rooms]} />
                {rangeDate("Bought")}
                {can.export && <ExportButton href={qs(`${BASE}/assets/export`, keep)} />}
              </div>
            </Toolbar>
            {f.cover && <p className="px-5 pb-2 text-[13px] text-warn font-semibold"><Words k="Showing warranty or AMC ending in the next" /> {days} <Words k="days." /> <Link className="text-brand hover:underline" href={here({ cover: null })}><Words k="Show all" /></Link></p>}
            <DataList rows={d.list.rows} rowKey={(a) => a.id} rowHref={(a) => `${BASE}/assets/${a.id}`} minWidth={960} caption="Asset register"
              rowClass={(a) => a.status === "DISPOSED" && "opacity-70"}
              empty={<Empty icon={filtered ? Search : Monitor} title={filtered ? "No assets match" : "No assets yet"}
                body={filtered ? "Try another search or clear the filters." : can.assets ? "Add the first asset, or import them from a spreadsheet." : "The store keeper adds the assets."}
                action={can.assets && !filtered ? <ButtonLink href={`${BASE}/assets/import`} variant="secondary" icon={FileUp}><Words k="Import assets" /></ButtonLink> : undefined} />}
              columns={[
                { key: "tag", label: "Tag", nowrap: true, render: (a) => <span className="font-mono text-[13px] font-semibold">{a.tag}</span> },
                { key: "name", label: "Asset", render: (a) => <span className="block min-w-[170px]"><b className="font-semibold">{a.name}</b><span className="block text-[12px] text-ink3">{a.type}{a.serialNo ? ` · ${a.serialNo}` : ""}</span></span> },
                { key: "where", label: "Where", render: (a) => d.list!.places(a) },
                { key: "bought", label: "Bought", nowrap: true, render: (a) => day(a.purchaseDate) || <span className="text-ink3"><Words k="Not given" /></span> },
                { key: "cost", label: "Cost", align: "right", nowrap: true, render: (a) => (a.costPaise !== null ? formatRupees(a.costPaise) : "") },
                { key: "value", label: "Value today", align: "right", nowrap: true, render: (a) => (a.costPaise !== null ? formatRupees(bookValue(a, s.depreciationMethod, rateOf(a, s), today)) : "") },
                { key: "cover", label: "Warranty / AMC", nowrap: true, render: (a) => {
                  const end = [a.warrantyEnd, a.amcEnd].filter((x): x is Date => Boolean(x) && x! >= today).sort((x, y) => x.getTime() - y.getTime())[0];
                  return end ? <span className={end <= soon ? "text-warn font-semibold" : ""}>{day(end)}</span> : <span className="text-ink3"><Words k="None" /></span>;
                } },
                { key: "status", label: "Status", render: (a) => <Pill tone={ASSET_STATUS[a.status].tone}>{ASSET_STATUS[a.status].label}</Pill> },
              ]}
              phone={(a) => ({ title: a.name, sub: `${a.tag} · ${d.list!.places(a)}`, right: a.costPaise !== null ? formatRupees(bookValue(a, s.depreciationMethod, rateOf(a, s), today)) : undefined, icon: Monitor, iconTone: a.status === "IN_REPAIR" ? "warn" : a.status === "DISPOSED" ? "neutral" : "brand", pills: a.status !== "IN_USE" ? <Pill tone={ASSET_STATUS[a.status].tone}>{ASSET_STATUS[a.status].label}</Pill> : undefined })}
            />
            {d.list.total > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={d.list.total} prevHref={here({ page: page > 2 ? String(page - 1) : null })} nextHref={here({ page: String(page + 1) })} />}
          </Card>
        )}

        {view === "repairs" && (
          <Card>
            <CardHeader title="Repair log" description="Repairs and services of every asset. Open them from the asset." icon={Wrench} divided action={rangeDate("Date")} />
            <SimpleTable caption="Repairs" rows={d.repairs} rowKey={(r) => r.id} minWidth={720} cols={[
              { label: "Date", nowrap: true, render: (r) => day(r.date) },
              { label: "Asset", render: (r) => <Link className="font-semibold hover:underline" href={`${BASE}/assets/${r.assetId}`}>{r.asset.tag} {r.asset.name}</Link> },
              { label: "Problem", render: (r) => r.problem },
              { label: "Vendor", render: (r) => (r.vendorId ? d.vendorName.get(r.vendorId) ?? "" : "") },
              { label: "Cost", right: true, nowrap: true, render: (r) => (r.costPaise !== null ? formatRupees(r.costPaise) : "") },
              { label: "Status", render: (r) => <Pill tone={MAINT_STATUS[r.status].tone}>{MAINT_STATUS[r.status].label}</Pill> },
            ]} />
            {d.repairs.length === 0 && <Empty icon={Wrench} title={per.range ? "No repairs in these dates" : "No repairs logged"} body="Log a repair from the asset's page." />}
          </Card>
        )}

        {view === "disposals" && (
          <Card>
            <CardHeader title="Disposals" description="Sold, scrapped or donated, each with approval." icon={Trash2} divided action={rangeDate("Date")} />
            <SimpleTable caption="Disposals" rows={d.disposals} rowKey={(x) => x.id} minWidth={720} cols={[
              { label: "Date", nowrap: true, render: (x) => day(x.date) },
              { label: "Asset", render: (x) => <Link className="font-semibold hover:underline" href={here({ disposal: x.id })} scroll={false}>{x.asset.tag} {x.asset.name}</Link> },
              { label: "How", render: (x) => DISPOSAL_METHOD[x.method] ?? x.method },
              { label: "Reason", render: (x) => x.reason },
              { label: "Sale", right: true, nowrap: true, render: (x) => (x.salePaise !== null ? formatRupees(x.salePaise) : "") },
              { label: "Status", render: (x) => (x.status === "WAITING" && x.approvalId && d.mine.has(x.approvalId) ? <Link className="text-[13px] font-semibold text-brand hover:underline" href={here({ disposal: x.id })} scroll={false}><Words k="Decide" /></Link> : <Pill tone={APPROVAL_STATUS[x.status].tone}>{APPROVAL_STATUS[x.status].label}</Pill>) },
            ]} />
            {d.disposals.length === 0 && <Empty icon={Trash2} title={per.range ? "No disposals in these dates" : "No disposals"} body="Dispose of an asset from its page. It needs approval." />}
          </Card>
        )}

        {view === "audit" && (
          <>
            {d.audit && d.result ? (
              <Card>
                <CardHeader title={d.audit.name} description={`${d.audit.status === "OPEN" ? "Open" : `Closed ${d.audit.closedAt ? formatDateTime(d.audit.closedAt, tz) : ""}`} · started ${formatDateTime(d.audit.startedAt, tz)}${d.audit.roomId ? ` · ${roomName.get(d.audit.roomId) ?? "one room"}` : ""}`} icon={ClipboardCheck} divided
                  action={can.assets && d.audit.status === "OPEN" ? <ActButton action={closeAssetAuditAction} fields={{ auditId: d.audit.id }} label="Close check" icon="check" /> : undefined} />
                <div className="p-5 flex flex-col gap-5">
                  <Stats items={[
                    { label: "Expected in rooms checked", value: d.result.expected },
                    { label: "Found in place", value: d.result.found, tone: "ok" },
                    { label: "Missing", value: d.result.missing.length, tone: d.result.missing.length ? "bad" : undefined },
                    { label: "Misplaced", value: d.result.misplaced.length, tone: d.result.misplaced.length ? "warn" : undefined },
                  ]} />
                  {can.assets && d.audit.status === "OPEN" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <ScanTags auditId={d.audit.id} rooms={d.audit.roomId ? d.rooms.filter((r) => r.value === d.audit!.roomId) : d.rooms} startRoom={d.audit.roomId ?? ""} />
                      <div>
                        <p className="text-[13px] font-semibold text-ink2 mb-1.5"><Words k="Last scanned" /></p>
                        {d.lastScans.length === 0 ? <p className="text-[13.5px] text-ink3"><Words k="Nothing scanned yet." /></p> : (
                          <ul className="text-[13.5px] divide-y divide-line rounded-xl border border-line">
                            {d.lastScans.map((x) => <li key={x.id} className="px-3 py-2 flex justify-between gap-2"><span className="font-mono">{x.code}</span><span className="text-ink3">{roomName.get(x.roomId ?? "") ?? ""} · {formatDateTime(x.scannedAt, tz)}</span></li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                  {d.result.missing.length > 0 && (
                    <div>
                      <h3 className="text-[14px] font-bold mb-2 text-bad"><Words k="Missing (" />{d.result.missing.length})</h3>
                      <SimpleTable caption="Missing assets" rows={d.result.missing} rowKey={(x) => x.id} minWidth={420} cols={[
                        { label: "Tag", render: (x) => <Link className="font-mono font-semibold hover:underline" href={`${BASE}/assets/${x.id}`}>{x.tag}</Link> },
                        { label: "Asset", render: (x) => x.name },
                        { label: "Should be in", render: (x) => x.place },
                      ]} />
                    </div>
                  )}
                  {d.result.misplaced.length > 0 && (
                    <div>
                      <h3 className="text-[14px] font-bold mb-2 text-warn"><Words k="Misplaced (" />{d.result.misplaced.length})</h3>
                      <SimpleTable caption="Misplaced assets" rows={d.result.misplaced} rowKey={(x) => x.id} minWidth={480} cols={[
                        { label: "Tag", render: (x) => <Link className="font-mono font-semibold hover:underline" href={`${BASE}/assets/${x.id}`}>{x.tag}</Link> },
                        { label: "Asset", render: (x) => x.name },
                        { label: "Register says", render: (x) => x.registered },
                        { label: "Found in", render: (x) => x.foundIn },
                      ]} />
                    </div>
                  )}
                  {d.result.unknown.length > 0 && <Banner tone="warn" title="Tags not in the register">{d.result.unknown.join(", ")}</Banner>}
                </div>
              </Card>
            ) : (
              <Banner tone="info" icon={ScanLine} title="No asset check open" action={can.assets ? <ButtonLink href={here({ open: "audit" })} size="sm" variant="primary" scroll={false}><Words k="Start a check" /></ButtonLink> : undefined}>
                <Words k="A check lists what is missing and misplaced as tags are scanned room by room." />
              </Banner>
            )}
            {d.audits.length > 0 && (
              <Card>
                <CardHeader title="Asset checks" divided />
                <ul className="divide-y divide-line">
                  {d.audits.map((a) => {
                    const r = a.result as { missing?: unknown[]; misplaced?: unknown[] } | null;
                    return (
                      <li key={a.id}>
                        <Link href={here({ audit: a.id })} className="px-5 py-3 flex items-center gap-3 hover:bg-sunken/60 text-[14px]">
                          <span className="flex-1 min-w-0"><b className="font-semibold">{a.name}</b><span className="block text-[12.5px] text-ink3">{formatDateTime(a.startedAt, tz)} · {plural(a._count.scans, "tag")} <Words k="scanned" />{r ? ` · ${r.missing?.length ?? 0} missing, ${r.misplaced?.length ?? 0} misplaced` : ""}</span></span>
                          <Pill tone={a.status === "OPEN" ? "info" : "neutral"}>{a.status === "OPEN" ? "Open" : "Closed"}</Pill>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </>
        )}
      </Stack>

      {open === "add" && d.sheet && (
        <AssetSheet closeHref={here({ open: null, receipt: null, line: null })} types={s.assetTypes} vendors={d.vendors} places={{ rooms: d.rooms, departments: d.sheet.departments, staff: d.sheet.staff }}
          start={null} nextTag={d.sheet.nextTag} today={todayStr} receipt={d.receipt} />
      )}
      {open === "audit" && <StartAssetAuditSheet closeHref={here({ open: null })} rooms={d.rooms} suggested={`Asset check ${formatDate(today, "UTC")}`} />}
      {d.disposal && (
        <UrlSheet title={`Dispose of ${d.disposal.asset.name}`} sub={`${d.disposal.asset.tag} · ${APPROVAL_STATUS[d.disposal.status].label}`} closeHref={here({ disposal: null })}>
          <div className="flex flex-col gap-4">
            {d.disposal.status === "WAITING" && d.disposal.approvalId && d.mine.has(d.disposal.approvalId) && (
              <DecideBox action={decideAction} approvalId={d.disposal.approvalId} question={`Dispose of ${d.disposal.asset.name} ${d.disposal.asset.tag}? It stays in the register as Disposed.`} />
            )}
            <DL cols={2} rows={[
              ["How", DISPOSAL_METHOD[d.disposal.method] ?? d.disposal.method], ["Date", day(d.disposal.date)],
              ["Reason", d.disposal.reason], ["Asked by", d.who.get(d.disposal.createdById ?? "") ?? ""],
              ...(d.disposal.salePaise !== null ? [["Sale", `${formatRupees(d.disposal.salePaise)}${d.disposal.buyer ? ` to ${d.disposal.buyer}` : ""}`] as [string, React.ReactNode]] : []),
              ...(d.disposal.decisionNote ? [["Decision note", d.disposal.decisionNote] as [string, React.ReactNode]] : []),
            ]} />
            <Link className="text-[14px] font-semibold text-brand hover:underline" href={`${BASE}/assets/${d.disposal.assetId}`}><Words k="Open the asset" /></Link>
          </div>
        </UrlSheet>
      )}
    </>
  );
}
