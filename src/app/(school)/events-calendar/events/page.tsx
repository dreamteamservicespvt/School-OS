import { CalendarDays, CalendarX2, ClipboardList, Hourglass, IndianRupee, Plus, Undo2, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { dateWhere } from "@/lib/periods";
import { formatRupees } from "@/lib/format";
import { eventMoney, eventStatus } from "@/lib/events/events";
import { AUDIENCE_KINDS, EVENT_STATUS, REMINDERS, eventIcon, hhmm, isoOf, longDay, spanWords, timeSpan } from "@/lib/events/words";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { SegLinks } from "@/components/ui/blocks";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSearch } from "@/components/money/url-filters";
import { DataList, Empty, Stack, Stats, Toolbar } from "@/components/money/kit";
import { EvHead } from "../_components/head";
import { EvIcon } from "../_components/icons";
import { EventSheet } from "../_components/event-sheets";
import { BASE, evGuard, evPeriod, one, qs, type SearchParams } from "../_lib/page";

export const metadata = { title: "Events" };

const HREF = `${BASE}/events`;
const ZERO = BigInt(0);

/** Events (18 §2, mod-events.jsx Events): the events list; for the Accountant, "Event Payments" (events with a fee, read only). */
export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await evGuard("events");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const acc = p.accountant;
  const full = p.can.events;
  const f = ["up", "done", "cancel"].includes(one(sp.f)) ? one(sp.f) : "all";
  const q = one(sp.q).trim().slice(0, 60);
  const vp = evPeriod(sp, p.dates, "acyear");
  const range = vp.range!;
  const keep = { f: f === "all" ? null : f, q: q || null, ...vp.keep };
  const here = (over: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...over });
  const doing = full ? one(sp.do) : "";

  const data = await withSchool(ctx, async (tx) => {
    const base: Prisma.EventWhereInput = { archivedAt: null, date: dateWhere(range), ...(acc ? { feePaise: { gt: ZERO } } : {}) };
    const all = await tx.event.findMany({ where: base, orderBy: [{ date: "asc" }, { startMin: "asc" }], take: 500 });
    const regs = all.length ? await tx.eventRegistration.groupBy({ by: ["eventId"], where: { eventId: { in: all.map((e) => e.id) }, withdrawnAt: null }, _count: { _all: true } }) : [];
    const money = await eventMoney(tx, all.filter((e) => e.feePaise));
    const classes = doing === "create" ? await tx.schoolClass.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }) : [];
    return { all, regs: new Map(regs.map((r) => [r.eventId, r._count._all])), money, classes };
  });
  const st = (e: (typeof data.all)[number]) => eventStatus(e, p.today);
  const matches = (e: (typeof data.all)[number]) => !q || `${e.name} ${e.type} ${e.venue ?? ""} ${e.audienceLabel}`.toLowerCase().includes(q.toLowerCase());
  const rows = data.all.filter((e) => matches(e) && (f === "up" ? ["PLANNED", "OPEN"].includes(st(e)) : f === "done" ? st(e) === "DONE" : f === "cancel" ? st(e) === "CANCELLED" : true))
    .sort((a, b) => (f === "done" ? b.date.getTime() - a.date.getTime() : 0));
  const live = data.all.filter((e) => st(e) !== "CANCELLED");
  const sum = (pick: (m: { collected: bigint; due: bigint; refunded: bigint }) => bigint, list = data.all) => list.reduce((a, e) => a + (data.money.get(e.id) ? pick(data.money.get(e.id)!) : ZERO), ZERO);
  const collected = sum((m) => m.collected, live);
  const due = sum((m) => m.due, live);
  const dueStudents = live.reduce((a, e) => a + (data.money.get(e.id)?.dueStudents ?? 0), 0);
  const refunded = sum((m) => m.refunded);
  const upcoming = live.filter((e) => ["PLANNED", "OPEN"].includes(st(e)));
  const next = upcoming[0];
  const paidStudents = live.reduce((a, e) => a + (data.money.get(e.id)?.paidStudents ?? 0), 0);
  const when = (e: (typeof data.all)[number]) => (isoOf(e.date) === p.today ? "Today" : longDay(isoOf(e.date)).replace(/ \d{4}$/, ""));

  return (
    <div>
      <EvHead pageName={acc ? "Event Payments" : "Events"} href={HREF}
        sub={acc ? "Events with a fee: what is collected, what is due and what was refunded. Read only." : "Plan events with date, venue and audience; registrations, payments and reminders where needed."}
        actions={full && <ButtonLink href={here({ do: "create" })} scroll={false} variant="primary" icon={Plus}>Create event</ButtonLink>} />
      <Stack>
        <Stats items={acc ? [
          { label: "Events with a fee", value: String(data.all.length), icon: CalendarDays, sub: spanWords(range.from, range.to) },
          { label: "Event fees collected", value: formatRupees(collected), icon: IndianRupee, tone: "ok", sub: "Through Fee Management" },
          { label: "Event fees due", value: formatRupees(due), icon: Hourglass, tone: due > ZERO ? "warn" : undefined, sub: dueStudents ? `${dueStudents} students` : "Nothing due" },
          { label: "Refunded", value: formatRupees(refunded), icon: Undo2, sub: refunded > ZERO ? "Cancelled events and withdrawals" : "None in these dates" },
        ] : [
          { label: "Coming up", value: String(upcoming.length), icon: CalendarDays, sub: next ? `Next: ${next.name}, ${when(next).toLowerCase() === "today" ? "today" : when(next)} ${timeSpan(next.startMin, null)}` : "Nothing planned" },
          { label: "Open for registration", value: String(live.filter((e) => st(e) === "OPEN").length), icon: ClipboardList, tone: "ok" },
          { label: "Event fees collected", value: formatRupees(collected), icon: IndianRupee, sub: paidStudents ? `${paidStudents} paid` : "No event fees yet" },
          { label: "Event fees due", value: formatRupees(due), icon: Hourglass, tone: due > ZERO ? "warn" : undefined, sub: dueStudents ? `${dueStudents} students` : "Nothing due" },
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <UrlSearch placeholder="Event, venue or class" id="ev-search" />
            <PeriodFilter {...p.dates} fallback="acyear" ahead />
            <SegLinks label="Event status" value={f} options={[
              { value: "all", label: "All", href: here({ f: null }) }, { value: "up", label: "Coming up", href: here({ f: "up" }) },
              { value: "done", label: "Done", href: here({ f: "done" }) }, { value: "cancel", label: "Cancelled", href: here({ f: "cancel" }) },
            ]} />
            {p.can.export && <ExportButton href={qs(`${HREF}/export`, keep)} />}
          </Toolbar>
          <DataList rows={rows} rowKey={(e) => e.id} rowHref={(e) => `${HREF}/${e.id}`} minWidth={820} caption={acc ? "Event payments" : "Events"}
            footer={`Showing: ${vp.label} · ${spanWords(range.from, range.to)} · ${rows.length} events`}
            empty={<Empty icon={CalendarX2} title={acc ? "No events with a fee here" : "No events here"} body="Try other dates or another filter." action={<ButtonLink variant="secondary" href={HREF}>Show all events</ButtonLink>} />}
            columns={[
              { key: "name", label: "Event", render: (e) => <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><EvIcon name={eventIcon(e.type, e.name)} size={17} /></span><div><p className="font-semibold leading-tight">{e.name}</p><p className="text-[12.5px] text-ink3">{e.type}</p></div></div> },
              { key: "date", label: "Date and time", nowrap: true, render: (e) => <span className="text-[13px] tnum">{when(e) === "Today" ? <b className="font-semibold text-brand">Today</b> : when(e)}<span className="block text-ink3 text-[12px]">{timeSpan(e.startMin, e.endMin)}</span></span> },
              ...(acc ? [] : [{ key: "venue", label: "Venue", render: (e: (typeof rows)[number]) => <span className="text-[13px]">{e.venue ?? "—"}</span> }]),
              { key: "aud", label: "Audience", render: (e) => <span className="text-[13px] text-ink2">{e.audienceLabel}</span> },
              { key: "reg", label: acc ? "Fee" : "Registered", align: "right", render: (e) => (e.registrationOn ? <span className="text-[13px]"><b className="font-semibold">{data.regs.get(e.id) ?? 0}</b>{e.seats ? <span className="text-ink3"> of {e.seats}</span> : ""}{e.feePaise ? <span className="block text-[12px] text-ink3">{formatRupees(e.feePaise)} each</span> : ""}</span> : <span className="text-ink3">—</span>) },
              { key: "status", label: "Status", render: (e) => <Pill tone={EVENT_STATUS[st(e)].tone} dot>{EVENT_STATUS[st(e)].label}</Pill> },
            ]}
            phone={(e) => ({
              title: e.name, sub: `${when(e)} · ${timeSpan(e.startMin, e.endMin)}${acc || !e.venue ? "" : ` · ${e.venue}`}`, icon: Users, iconTone: "brand",
              pills: <><Pill tone={EVENT_STATUS[st(e)].tone} className="!h-[22px] !text-[11.5px]">{EVENT_STATUS[st(e)].label}</Pill>{e.registrationOn && <Pill tone="neutral" className="!h-[22px] !text-[11.5px]">{data.regs.get(e.id) ?? 0}{e.seats ? ` of ${e.seats}` : ""} registered</Pill>}</>,
            })} />
        </Card>
      </Stack>
      {doing === "create" && (
        <EventSheet closeHref={here({ do: null })} start={{ date: p.today < range.from ? range.from : p.today, startTime: hhmm(600) }} types={p.settings.eventTypes} venues={p.settings.venues}
          classes={data.classes.map((c) => ({ value: c.id, label: c.name }))} reminders={REMINDERS.map((r) => ({ value: r.value, label: r.label }))} audiences={AUDIENCE_KINDS.map((a) => ({ value: a.value, label: a.label }))} />
      )}
    </div>
  );
}

