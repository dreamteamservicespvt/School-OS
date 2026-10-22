import { ArrowDownToLine, ArrowUpFromLine, CircleCheck, HandHelping, Inbox, PackageCheck, PackagePlus, SearchX, Send } from "lucide-react";
import { withSchool } from "@/lib/db";
import { momentWhere } from "@/lib/periods";
import { staffWithLogins } from "@/lib/front-office/people";
import { POSTAL_STATUS_KEYS as STATUS_KEYS, postalWhere } from "@/lib/front-office/postal";
import { addDaysIso, clockAt, dayMonth, localOf } from "@/lib/front-office/time";
import { POSTAL_STATUS } from "@/lib/front-office/words";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSheet } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { Chips } from "@/components/ui/blocks";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSearch } from "@/components/money/url-filters";
import { DataList, Empty, Stack, Stats, TONE_SOFT, Toolbar } from "@/components/money/kit";
import { FoHead } from "../_components/head";
import { CommonSheets } from "../_components/common-sheets";
import { HandSheet, PostalSheet } from "../_components/postal-sheets";
import { BASE, UUID, addQ, foGuard, foPeriod, one, qs, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Postal & Deliveries") };
}

const HREF = `${BASE}/postal`;
const TYPE_WORDS: Record<string, string> = { LETTER: "Letter", COURIER: "Courier", PARCEL: "Parcel" };

/** Postal & Deliveries (16 §2, optional; mod-frontoffice.jsx PostalPage). */
export default async function PostalPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await foGuard("postal");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const status = STATUS_KEYS.includes(one(sp.status)) ? one(sp.status) : "all";
  const q = one(sp.q).trim().slice(0, 60);
  const period = foPeriod(sp, p.dates, "last30");
  const range = period.range!;
  const span = momentWhere(range, p.tz);
  const today = momentWhere({ period: "today", from: p.todayStr, to: p.todayStr, label: "Today" }, p.tz);
  const week = momentWhere({ period: "last7", from: addDaysIso(p.todayStr, -6), to: p.todayStr, label: "Last 7 days" }, p.tz);
  // The School Admin reads the register; only the desk records and hands over (owner's rule, 13 Oct 2026).
  const desk = p.can.desk;
  const handId = desk && UUID.test(one(sp.hand)) ? one(sp.hand) : null;
  const adding = desk && (one(sp.do) === "received" || one(sp.do) === "sent") ? one(sp.do) : null;

  const data = await withSchool(ctx, async (tx) => {
    const where = (st: string) => postalWhere({ from: span.gte, to: span.lt, status: st, q, atDeskAlways: true });
    const [rows, counts, atDesk, oldest, receivedToday, sentWeek, handedWeek, hand, staff] = await Promise.all([
      tx.postalEntry.findMany({ where: where(status), orderBy: { at: "desc" }, take: 300 }),
      Promise.all(["all", ...STATUS_KEYS].map((st) => tx.postalEntry.count({ where: where(st) }))),
      tx.postalEntry.count({ where: { archivedAt: null, status: "AT_DESK" } }),
      tx.postalEntry.findFirst({ where: { archivedAt: null, status: "AT_DESK" }, orderBy: { at: "asc" }, select: { at: true } }),
      tx.postalEntry.findMany({ where: { archivedAt: null, direction: "RECEIVED", at: today }, select: { party: true, itemType: true }, take: 5 }),
      tx.postalEntry.findMany({ where: { archivedAt: null, direction: "SENT", at: week }, select: { courier: true } }),
      tx.postalEntry.count({ where: { archivedAt: null, status: "HANDED_OVER", handedAt: week } }),
      handId ? tx.postalEntry.findFirst({ where: { id: handId, archivedAt: null, status: "AT_DESK" } }) : Promise.resolve(null),
      adding || handId ? staffWithLogins(tx) : Promise.resolve([]),
    ]);
    return { rows, counts, atDesk, oldest, receivedToday, sentWeek, handedWeek, hand, staff };
  });

  const keep = { status: status === "all" ? null : status, q: q || null, ...period.keep };
  const here = qs(HREF, keep);
  const dayOf = (d: Date) => localOf(d, p.tz).slice(0, 10);
  const when = (d: Date) => `${dayOf(d) === p.todayStr ? "Today" : dayMonth(new Date(`${dayOf(d)}T00:00:00Z`))}, ${clockAt(d, p.tz)}`;
  const couriers = [...new Set(data.sentWeek.map((s) => s.courier).filter(Boolean))];
  const forOptions = [
    ...data.staff.map((s) => ({ value: s.id, label: /principal/i.test(s.role) ? `${s.name} (${s.role})` : `${s.name} · ${s.role}` })),
    ...p.settings.requestDepartments.map((d) => ({ value: d, label: `${d} (department)` })),
  ];
  const chips = [{ value: "all", label: "All" }, { value: "AT_DESK", label: "At desk" }, { value: "HANDED_OVER", label: "Handed over" }, { value: "SENT", label: "Sent" }]
    .map((c, i) => ({ ...c, count: data.counts[i], href: qs(HREF, { ...keep, status: c.value === "all" ? null : c.value }) }));
  const exportHref = qs(`${HREF}/export`, keep);

  return (
    <div>
      <FoHead pageName="Postal & Deliveries" href={HREF} sub="Letters, couriers and parcels received and sent. The person it is for is told on the app."
        actions={desk ? <>
          <ButtonLink href={addQ(here, { do: "sent" })} scroll={false} variant="secondary" icon={Send}><Words k="Record sent item" /></ButtonLink>
          <ButtonLink href={addQ(here, { do: "received" })} scroll={false} variant="primary" icon={PackagePlus}><Words k="Record received item" /></ButtonLink>
        </> : null} />
      <Stack>
        <Stats items={[
          { label: "At the desk", value: String(data.atDesk), sub: data.oldest ? `Oldest since ${dayOf(data.oldest.at) === p.todayStr ? "today" : dayMonth(new Date(`${dayOf(data.oldest.at)}T00:00:00Z`))}` : "Nothing waiting", tone: data.atDesk ? "warn" : undefined, icon: Inbox, href: qs(HREF, { status: "AT_DESK" }), active: status === "AT_DESK" },
          { label: "Received today", value: String(data.receivedToday.length), sub: data.receivedToday.length ? data.receivedToday.slice(0, 2).map((r) => `${r.party.split(",")[0]} ${TYPE_WORDS[r.itemType]?.toLowerCase() ?? ""}`.trim()).join(", ") : "None yet", icon: PackageCheck, href: qs(HREF, { period: "today" }) },
          { label: "Sent this week", value: String(data.sentWeek.length), sub: couriers.length ? couriers.slice(0, 2).join(" and ") : "Nothing sent", icon: Send, href: qs(HREF, { status: "SENT", period: "last7" }), active: status === "SENT" },
          { label: "Handed over this week", value: String(data.handedWeek), sub: "With who collected", tone: "ok", icon: CircleCheck, href: qs(HREF, { status: "HANDED_OVER", period: "last7" }), active: status === "HANDED_OVER" },
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <UrlSearch id="pd-search" placeholder="From, to, person or tracking number" />
            <PeriodFilter {...p.dates} fallback="last30" />
            <ExportButton href={exportHref} />
          </Toolbar>
          <div className="px-3 pt-3 pb-1"><Chips value={status} options={chips} label="Postal status" /></div>
          <DataList rows={data.rows} rowKey={(r) => r.id} minWidth={900} caption="Postal register"
            rowHref={(r) => (desk && r.status === "AT_DESK" ? addQ(here, { hand: r.id }) : null)}
            footer={`Showing ${data.rows.length} entr${data.rows.length === 1 ? "y" : "ies"} · ${period.label.toLowerCase()}${data.atDesk ? ", with every item still at the desk" : ""}`}
            columns={[
              { key: "d", label: "Date", nowrap: true, render: (r) => <div><p className="text-[13px] tnum">{when(r.at)}</p><p className="text-[11.5px] text-ink3 font-mono">{r.entryNo}</p></div> },
              { key: "dir", label: "Received or sent", render: (r) => <span className="flex items-center gap-2"><span className={cx("w-8 h-8 rounded-lg grid place-items-center", r.direction === "RECEIVED" ? TONE_SOFT.brand : TONE_SOFT.info)} aria-hidden="true">{r.direction === "RECEIVED" ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}</span><span className="text-[13.5px]">{r.direction === "RECEIVED" ? "Received" : "Sent"}<span className="block text-[12px] text-ink3">{TYPE_WORDS[r.itemType] ?? r.itemType}</span></span></span> },
              { key: "party", label: "From or to", render: (r) => <span className="text-[13.5px] font-medium">{r.party}</span> },
              { key: "for", label: "For", render: (r) => <span className="text-[13.5px]">{r.forText}</span> },
              { key: "track", label: "Courier and tracking", render: (r) => <div><p className="text-[13px]">{r.courier ?? "—"}</p>{r.trackingNo && <p className="text-[12px] text-ink3 font-mono">{r.trackingNo}</p>}</div> },
              { key: "st", label: "Status", render: (r) => { const s = POSTAL_STATUS[r.status] ?? POSTAL_STATUS.SENT; return <div><Pill tone={s.tone}>{s.label}</Pill>{r.handedToName && <p className="text-[11.5px] text-ink3 mt-1">{r.handedToName}{r.handedAt ? `, ${clockAt(r.handedAt, p.tz)}` : ""}</p>}</div>; } },
              { key: "act", label: "", render: (r) => (desk && r.status === "AT_DESK" ? <ButtonLink href={addQ(here, { hand: r.id })} scroll={false} size="sm" variant="secondary" icon={HandHelping} className="relative z-[1]"><Words k="Hand over" /></ButtonLink> : null) },
            ]}
            phone={(r) => { const s = POSTAL_STATUS[r.status] ?? POSTAL_STATUS.SENT; return { title: r.party, sub: `${r.direction === "RECEIVED" ? "Received" : "Sent"} · ${TYPE_WORDS[r.itemType] ?? r.itemType} · for ${r.forText}`, icon: r.direction === "RECEIVED" ? ArrowDownToLine : ArrowUpFromLine, iconTone: r.status === "AT_DESK" ? "warn" : "neutral", pills: <Pill tone={s.tone} className="!h-[22px] !text-[11.5px]">{s.label}</Pill> }; }}
            empty={q || status !== "all" ? <Empty icon={SearchX} title="No entry matches" body="Try the tracking number, the sender or a wider date range." action={<ButtonLink href={HREF} variant="secondary"><Words k="Clear filters" /></ButtonLink>} />
              : <Empty icon={Inbox} title="No letters or parcels on these dates" body="Record each letter, courier and parcel so nothing is lost at the desk." action={desk ? <ButtonLink href={addQ(here, { do: "received" })} scroll={false} variant="secondary" icon={PackagePlus}><Words k="Record received item" /></ButtonLink> : undefined} />} />
        </Card>
      </Stack>
      {adding && <PostalSheet closeHref={here} received={adding === "received"} forOptions={forOptions} />}
      {data.hand && (
        <HandSheet closeHref={here} people={data.staff.map((s) => s.name)}
          entry={{ id: data.hand.id, type: TYPE_WORDS[data.hand.itemType] ?? "Item", party: data.hand.party, forText: data.hand.forText, start: data.staff.find((s) => s.id === data.hand!.forStaffId)?.name ?? "" }} />
      )}
      {handId && !data.hand && <UrlSheet title="Not at the desk" closeHref={here}><p className="text-[14px] text-ink2 pb-4"><Words k="This item was not found, or it was already handed over." /></p></UrlSheet>}
      <CommonSheets sp={sp} href={HREF} keepKeys={["status", "q", "period", "from", "to"]} />
    </div>
  );
}
