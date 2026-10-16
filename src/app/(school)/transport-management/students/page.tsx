import Link from "next/link";
import { BadgeIndianRupee, Bus, CalendarClock, Clock, Plus, Printer, SearchX, TriangleAlert, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { placesView, type PlaceFilter } from "@/lib/transport/views";
import { feeCoverage, needsApproval, holdsSeat } from "@/lib/transport/places";
import { studentCards } from "@/lib/transport/people";
import { assignType, clockOf, plural, rupeesShort } from "@/lib/transport/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { Chips } from "@/components/ui/blocks";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSearch } from "@/components/money/url-filters";
import { Banner, DataList, Empty, Progress, Stack, Stats, Toolbar } from "@/components/money/kit";
import { TrHead } from "../_components/head";
import { RouteBadge } from "../_components/bits";
import { ActButton } from "../_components/fields";
import { AllTick, AssignSheet, BulkBar, CarrySheet, ChangeSheet, RowTick, StopTransportSheet, type CarryItem } from "../_components/student-sheets";
import { carryOverRows } from "@/lib/transport/carry";
import { addFeeAction } from "../actions";
import { BASE, UUID, addQ, one, qs, trGuard, trPeriod, type SearchParams } from "../_lib/page";
import { assignCandidates, placeOptions } from "../_lib/options";

export const metadata = { title: "Student Transport" };

const HREF = `${BASE}/students`;
const SHOWS = ["all", "one-way", "no-fee", "future"] as const;

/** Student Transport (12 §2): who uses which route and stop, seats, fee coverage, changes waiting for approval and bus passes. */
export default async function StudentTransportPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await trGuard("students");
  const sp = await searchParams;
  const routeId = UUID.test(one(sp.route)) ? one(sp.route) : null;
  const show = (SHOWS as readonly string[]).includes(one(sp.show)) ? (one(sp.show) as PlaceFilter["show"]) : "all";
  const q = one(sp.q).trim().slice(0, 60);
  const period = trPeriod(sp, p.dates, null);
  const doing = one(sp.do);
  const pickIds = one(sp.ids).split(",").filter((x) => UUID.test(x)).slice(0, 200);
  const can = p.can;

  const data = await withSchool(p.current.ctx, async (tx) => {
    const filter: PlaceFilter = { routeId, show, q, range: period.range };
    const [rows, all, coverage, options, waiting] = await Promise.all([
      placesView(tx, p.today, filter),
      placesView(tx, p.today, { routeId: null, show: "all", q: "", range: null }),
      feeCoverage(tx, p.today),
      placeOptions(tx, p.today),
      tx.transportAssignment.findMany({ where: { status: "WAITING" }, orderBy: { createdAt: "asc" }, take: 50 }),
    ]);
    const cardIds = [...coverage.noFee.map((x) => x.studentId), ...coverage.noStop.map((x) => x.studentId), ...waiting.map((w) => w.studentId)];
    const cards = await studentCards(tx, cardIds);
    const assign = can.students && doing === "assign" ? await assignCandidates(tx, p.current.ctx, p.today, { sectionId: UUID.test(one(sp.sec)) ? one(sp.sec) : null, q: one(sp.find), studentId: UUID.test(one(sp.student)) ? one(sp.student) : null }) : null;
    const picked = (doing === "change" || doing === "stop") && pickIds.length ? await tx.transportAssignment.findMany({ where: { id: { in: pickIds }, ...holdsSeat(p.today) } }) : [];
    const pickedCards = picked.length ? await studentCards(tx, picked.map((x) => x.studentId)) : new Map();
    // A new academic year is open: last year's bus places wait to be carried over.
    const carry = await carryOverRows(tx);
    const carryCards = can.students && doing === "carry" && carry.length ? await studentCards(tx, carry.map((r) => r.place.studentId)) : new Map<string, never>();
    return { rows, all, coverage, options, waiting, cards, assign, picked, pickedCards, carry, carryCards };
  });
  const carryYear = data.carry[0]?.toYear ?? null;
  const carryFrom = data.carry[0]?.fromYear ?? null;
  const carryItems: CarryItem[] = data.carry.map((r) => {
    const c = data.carryCards.get(r.place.studentId);
    return {
      id: r.place.id, name: c?.name ?? "Student", cls: c && !r.newClass ? c.cls : "", newClass: r.newClass,
      route: r.routeNumber != null ? `Route ${r.routeNumber}` : "Route", stop: r.stopName ?? "Stop", type: assignType(r.place.type),
      oldFee: rupeesShort(r.place.monthlyFeePaise), newFee: r.newFeePaise ? rupeesShort(r.newFeePaise) : null, blocked: r.blocked, note: r.note,
    };
  }).sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)) || a.route.localeCompare(b.route, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  const here = (extra: Record<string, string | null>) => qs(HREF, { route: routeId, show: show === "all" ? null : show, q: q || null, ...period.keep, ...extra });
  const close = here({});
  const routeOf = (id: string) => data.options.find((r) => r.id === id);
  const stopOf = (routeId: string, stopId: string) => routeOf(routeId)?.stops.find((s) => s.id === stopId);
  const totalSeats = data.options.reduce((s, r) => s + (r.capacity ?? 0), 0);
  const used = data.options.reduce((s, r) => s + r.used, 0);
  const full = data.options.filter((r) => r.capacity != null && r.free === 0).length;
  const noFee = data.coverage.noFee;
  const approvalWords = (what: "change-stop" | "change-route" | "stop") => (needsApproval(p.settings, what) ? "Transport Settings ask for approval: this goes to Approvals first, and nothing changes until it is approved." : null);
  const who = (n: number) => (n === 1 ? data.pickedCards.get(data.picked[0].studentId)?.name ?? "1 student" : `${n} students`);

  return (
    <div>
      <TrHead page="students" sub={`${plural(data.all.length, "student")} on the buses · ${used} of ${totalSeats} seats used`}
        actions={can.students ? <ButtonLink href={addQ(close, { do: "assign" })} scroll={false} variant="primary" icon={Plus}>Give transport</ButtonLink> : undefined} />
      <Stack>
        {carryYear && carryFrom && (
          <Banner tone="info" icon={CalendarClock} title={`${carryYear.name} is open: ${plural(data.carry.length, "bus place")} from ${carryFrom.name} to carry over`}
            action={can.students ? <ButtonLink href={addQ(close, { do: "carry" })} scroll={false} variant="primary" size="sm">Review and carry over</ButtonLink> : undefined}>
            {can.students ? `Students keep their route and stop from ${formatDate(carryYear.startDate)} with a new bus pass, and the ${carryYear.name} transport fee is added. Review them first.` : "The Transport In-charge reviews and carries them over."}
          </Banner>
        )}
        {noFee.length > 0 && (
          <Banner tone="warn" icon={TriangleAlert} title={`${plural(noFee.length, "student")} on a bus with no transport fee`}
            action={can.students ? <ActButton action={addFeeAction} fields={{ assignmentIds: noFee.map((x) => x.assignmentId).join(",") }} label={`Add the fee for all ${noFee.length}`} icon="IndianRupee" pendingText="Adding…" /> : undefined}>
            Their fee is missing from Fee Management, so it is not being collected. See the fee check below.
          </Banner>
        )}
        <Stats items={[
          { label: "Students on the buses", value: data.all.length, icon: Users, sub: `${data.all.filter((r) => r.p.type !== "TWO_WAY").length} one-way` },
          { label: "Seats used", value: `${used} of ${totalSeats}`, icon: Bus, sub: full ? `${plural(full, "route")} full` : `${Math.max(0, totalSeats - used)} free`, tone: full ? "warn" : undefined },
          { label: "No transport fee", value: noFee.length, icon: BadgeIndianRupee, tone: noFee.length ? "bad" : "ok", sub: noFee.length ? "fee missing" : "Every student has it", href: here({ show: "no-fee" }) },
          { label: "Waiting for approval", value: data.waiting.length, icon: Clock, sub: data.waiting.length ? "changes" : "None waiting", tone: data.waiting.length ? "warn" : undefined },
        ]} />

        <Card className="overflow-hidden">
          <Toolbar className="flex-wrap">
            <UrlSearch id="st-q" placeholder="Student, admission number, class or stop" />
            <PeriodFilter {...p.dates} allLabel="Any start date" size="sm" />
            {can.export && <ExportButton href={qs(`${BASE}/export`, { list: "students", route: routeId, show: show === "all" ? null : show, q: q || null, ...period.keep })} />}
          </Toolbar>
          <div className="px-3 pt-3 pb-1 flex flex-col gap-2">
            <Chips value={routeId ?? "all"} label="Route" options={[{ value: "all", label: "All routes", count: data.all.length, href: here({ route: null }) }, ...data.options.map((r) => ({ value: r.id, label: `Route ${r.number}`, count: r.used, href: here({ route: r.id }) }))]} />
            <Chips value={show} label="Show" options={[
              { value: "all", label: "Everyone", href: here({ show: null }) },
              { value: "one-way", label: "One-way", href: here({ show: "one-way" }) },
              { value: "no-fee", label: "No fee added", href: here({ show: "no-fee" }) },
              { value: "future", label: "Starting later", href: here({ show: "future" }) },
            ]} />
          </div>
          {(can.students || can.export) && <BulkBar href={close} canChange={can.students} canPrint />}
          <DataList rows={data.rows} rowKey={(r) => r.p.id} minWidth={980} caption="Students using transport"
            footer={`Showing ${data.rows.length} of ${plural(data.all.length, "student")}${period.range ? ` · started ${period.label.toLowerCase()}` : ""}`}
            columns={[
              { key: "tick", label: "", className: "w-8", render: (r) => <RowTick id={r.p.id} label={r.card.name} /> },
              { key: "s", label: "Student", render: (r) => <div><Link href={`/student-management/students/${r.p.studentId}?tab=transport`} className="font-semibold hover:underline relative z-[1]">{r.card.name}</Link><p className="text-[12.5px] text-ink3">{r.card.cls} · {r.card.admissionNo}</p></div> },
              { key: "r", label: "Route", render: (r) => <span className="flex items-center gap-2"><RouteBadge n={r.route.number} size={28} />{r.route.name}</span> },
              { key: "stop", label: "Stop", render: (r) => <span>{r.stop?.name}<span className="block text-[12.5px] text-ink3 tnum">{r.p.type === "DROP_ONLY" ? "Drop only" : clockOf(r.stop?.pickupMin)}</span></span> },
              { key: "t", label: "Type", render: (r) => <Pill tone={r.p.type === "TWO_WAY" ? "neutral" : "info"}>{assignType(r.p.type)}</Pill> },
              { key: "f", label: "From", nowrap: true, render: (r) => <span>{formatDate(r.p.fromDate)}{r.future && <span className="block text-[12px] text-info">Starts later</span>}{r.p.toDate && <span className="block text-[12px] text-ink3">till {formatDate(r.p.toDate)}</span>}</span> },
              { key: "fee", label: "Fee added", render: (r) => (r.feeAdded ? <Pill tone="ok" dot>Yes · {rupeesShort(r.p.monthlyFeePaise)}</Pill> : <Pill tone="bad" dot>No</Pill>) },
            ]}
            phone={(r) => ({
              title: r.card.name, avatar: r.card.name, sub: `${r.card.cls} · Route ${r.route.number}, ${r.stop?.name ?? ""}`,
              right: <RowTick id={r.p.id} label={r.card.name} />,
              pills: <><Pill className="!h-[22px] !text-[11.5px]">{assignType(r.p.type)}</Pill>{!r.feeAdded && <Pill tone="bad" className="!h-[22px] !text-[11.5px]">No fee</Pill>}{r.future && <Pill tone="info" className="!h-[22px] !text-[11.5px]">From {formatDate(r.p.fromDate)}</Pill>}</>,
            })}
            empty={q || show !== "all" || routeId || period.range
              ? <Empty icon={SearchX} title="Nobody matches" body="Try another route, or clear the filters." action={<ButtonLink href={HREF} variant="secondary">Clear filters</ButtonLink>} />
              : <Empty icon={Users} title="No student uses transport yet" body="Give students a route and stop. The stop's fee is added to their fees from the start date." action={can.students ? <ButtonLink href={addQ(close, { do: "assign" })} scroll={false} variant="secondary" icon={Plus}>Give transport</ButtonLink> : undefined} />} />
          {data.rows.length > 0 && <div className="hidden lg:flex items-center gap-2 px-5 py-2 border-t border-line text-[12.5px] text-ink3"><AllTick /><span>Pick every student shown, then change, stop, add fees or print bus passes</span></div>}
        </Card>

        <div className="grid xl:grid-cols-3 gap-5 lg:gap-6 [&>*]:min-w-0 items-start">
          <Card>
            <CardHeader title="Seats on each route" description="A full bus takes no more students" icon={Bus} />
            <ul className="px-5 pb-5 flex flex-col gap-3">
              {data.options.length === 0 && <li className="text-[13.5px] text-ink3">No routes yet.</li>}
              {data.options.map((r) => (
                <li key={r.id}>
                  <div className="flex justify-between text-[13.5px] mb-1 gap-2"><Link href={here({ route: r.id })} className="font-semibold hover:underline truncate">Route {r.number} · {r.name}</Link><span className="tnum shrink-0">{r.capacity == null ? `${r.used} · no vehicle` : `${r.used} of ${r.capacity}`}</span></div>
                  {r.capacity != null && <Progress value={Math.min(100, (r.used / Math.max(1, r.capacity)) * 100)} tone={r.free === 0 ? "bad" : (r.free ?? 99) <= 3 ? "warn" : "brand"} />}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Fee check" description="Every student on a bus should have the transport fee" icon={BadgeIndianRupee} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-1.5">On a bus, no transport fee ({noFee.length})</p>
                {noFee.length === 0 ? <p className="text-[13.5px] text-ink3">None. Every student on a bus has the fee.</p> : (
                  <ul className="flex flex-col gap-1.5">
                    {noFee.slice(0, 8).map((x) => {
                      const c = data.cards.get(x.studentId);
                      return (
                        <li key={x.assignmentId} className="flex items-center gap-2 text-[13.5px]">
                          <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{c?.name}</b><span className="text-ink3"> · Route {routeOf(x.routeId)?.number} · {rupeesShort(x.monthlyPaise)}</span></span>
                          {can.students && <ActButton action={addFeeAction} fields={{ assignmentIds: x.assignmentId }} label="Add fee" variant="ghost" pendingText="Adding…" />}
                        </li>
                      );
                    })}
                    {noFee.length > 8 && <li><Link href={here({ show: "no-fee" })} className="text-[13px] text-brand font-semibold hover:underline">See all {noFee.length}</Link></li>}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-1.5">Transport fee, but no stop ({data.coverage.noStop.length})</p>
                {data.coverage.noStop.length === 0 ? <p className="text-[13.5px] text-ink3">None.</p> : (
                  <ul className="flex flex-col gap-1.5">
                    {data.coverage.noStop.slice(0, 8).map((x) => (
                      <li key={x.studentId} className="text-[13.5px] flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{data.cards.get(x.studentId)?.name}</b><span className="text-ink3"> · {formatRupees(x.openPaise)} still to come</span></span>
                        {can.students && <ButtonLink size="sm" variant="ghost" href={addQ(close, { do: "assign", student: x.studentId })} scroll={false}>Give a stop</ButtonLink>}
                      </li>
                    ))}
                    <li className="text-[12.5px] text-ink3">Or remove the fee rows in Fee Management.</li>
                  </ul>
                )}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Waiting for approval" description="Changes asked for, decided in Approvals" icon={Clock} />
            <div className="px-5 pb-5">
              {data.waiting.length === 0 ? <p className="text-[13.5px] text-ink3">Nothing waiting.</p> : (
                <ul className="flex flex-col gap-2">
                  {data.waiting.map((w) => (
                    <li key={w.id} className="text-[13.5px]">
                      <b className="font-semibold">{data.cards.get(w.studentId)?.name}</b>
                      <span className="block text-ink3">{w.change === "STOP" ? `Stop after ${formatDate(w.toDate ?? w.fromDate)}` : `Route ${routeOf(w.routeId)?.number ?? ""}, ${stopOf(w.routeId, w.stopId)?.name ?? ""} from ${formatDate(w.fromDate)}`}</span>
                      {w.approvalId && <Link href={`/approvals/${w.approvalId}`} className="text-brand font-semibold hover:underline text-[13px]">Open in Approvals</Link>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
        <p className="text-[12.5px] text-ink3 flex items-center gap-1.5"><Printer size={14} aria-hidden="true" />Bus passes print in the Bus pass design from Settings, Document Designs.</p>
      </Stack>

      {can.students && doing === "assign" && data.assign && (
        <AssignSheet closeHref={close} sections={data.assign.sections} sectionId={UUID.test(one(sp.sec)) ? one(sp.sec) : ""} find={one(sp.find)} students={data.assign.students}
          preselect={UUID.test(one(sp.student)) ? one(sp.student) : null} places={data.options} today={p.todayStr} routeId={routeId ?? ""} />
      )}
      {can.students && doing === "change" && data.picked.length > 0 && (
        <ChangeSheet closeHref={close} ids={data.picked.map((x) => x.id)} who={who(data.picked.length)} places={data.options} today={p.todayStr}
          start={data.picked.length === 1 ? { routeId: data.picked[0].routeId, stopId: data.picked[0].stopId, type: data.picked[0].type } : { routeId: "", stopId: "", type: "TWO_WAY" }}
          approval={approvalWords("change-route")} />
      )}
      {can.students && doing === "carry" && carryYear && carryFrom && (
        <CarrySheet closeHref={close} items={carryItems} fromYear={carryFrom.name} toYear={carryYear.name} toStart={formatDate(carryYear.startDate)} />
      )}
      {can.students && doing === "stop" && data.picked.length > 0 && (
        <StopTransportSheet closeHref={close} ids={data.picked.map((x) => x.id)} who={who(data.picked.length)} today={p.todayStr} approval={approvalWords("stop")} />
      )}
    </div>
  );
}
