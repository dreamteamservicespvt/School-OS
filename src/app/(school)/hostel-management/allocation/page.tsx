// Allocation (15 §2): the residents list (student, class, hostel, room, bed,
// check-in date and status: Checked in, On outing, On leave, Checked out),
// students waiting for a bed (hostel needed at admission), and the desk
// actions: give a bed (hostel fees added in Fee Management), check in, move
// to another bed (history kept) and check out with a reason. A warden sees
// their own hostel's residents only. Fee amounts show only to people with
// Fee Management.
import Link from "next/link";
import type { Metadata } from "next";
import { BedDouble, CalendarClock, FileText, History, Search, UserPlus, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { dateWhere } from "@/lib/periods";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSheet } from "@/components/ui/url-sheet";
import { UrlSearch } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Banner, Stats, Stack, Toolbar, DataList, Empty, ListRow } from "@/components/money/kit";
import { carryOverRows } from "@/lib/hostel/carry";
import { clockAt } from "@/lib/front-office/time";
import { roomGrid } from "@/lib/hostel/rooms";
import { bedHistory, bedYears, hostelFeesDue, outNow, residents, studentsInfo, waitingForBed, type Resident } from "@/lib/hostel/allocation";
import { openFeePlans, planTotal } from "@/lib/hostel/settings";
import { BASE, RESIDENT_STATUS, bedWords, genderFits, isoOf, plural } from "@/lib/hostel/words";
import { inScope } from "@/lib/hostel/scope";
import { HostelHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { AllocateSheet, CarrySheet, CheckoutSheet, MoveSheet, type CarryItem, type FreeBed } from "../_components/sheets";
import { checkInAction, type FoundStudent } from "../actions";
import { hostelGuard, hostelPeriod, idParam, one, qs, type SearchParams } from "../_lib/page";
import { studentIdsForFilter } from "@/lib/students/find";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Allocation · Hostel Management" };

const VIEWS = [
  { value: "", label: "Everyone with a bed" },
  { value: "arriving", label: "Not arrived" },
  { value: "away", label: "Away now" },
  { value: "out", label: "Checked out" },
] as const;

export default async function AllocationPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await hostelGuard("allocation");
  const { current, can, mine, v, tz } = p;
  const ctx = current.ctx;
  const params = readListParams(sp, ["show", "hostel", "period", "from", "to"]);
  const show = VIEWS.some((x) => x.value === one(sp.show)) ? one(sp.show) : "";
  const per = hostelPeriod(sp, p.dates, show === "out" ? "acyear" : null);
  const hostelId = p.myHostels.length > 1 && p.myHostels.some((h) => h.id === one(sp.hostel)) ? one(sp.hostel) : null;
  const scopeIds = hostelId ? [hostelId] : p.myHostels.map((h) => h.id);
  const seesStudents = (current.permissions["student-management"]?.see ?? "none") !== "none";

  const d = await withSchool(ctx, async (tx) => {
    const base: Prisma.BedAllocationWhereInput = { hostelId: { in: scopeIds } };
    const away = await outNow(tx);
    const awayIds = [...away.keys()];
    let nameIds: string[] | null = null;
    if (params.q) {
      nameIds = await studentIdsForFilter(tx, params.q);
    }
    const byView: Record<string, Prisma.BedAllocationWhereInput> = {
      "": { status: "ACTIVE" },
      arriving: { status: "ACTIVE", checkedInAt: null },
      away: { status: "ACTIVE", studentId: { in: awayIds } },
      out: { status: "CHECKED_OUT", ...(per.range ? { endDate: dateWhere(per.range) } : {}) },
    };
    const where: Prisma.BedAllocationWhereInput = { ...base, ...byView[show], ...(nameIds ? { AND: [{ studentId: { in: nameIds } }] } : {}) };
    const [total, rows, active, arriving, awayCount, outCount] = await Promise.all([
      tx.bedAllocation.count({ where }),
      residents(tx, ctx, where, p.now, skipTake(params)),
      tx.bedAllocation.count({ where: { ...base, status: "ACTIVE" } }),
      tx.bedAllocation.count({ where: { ...base, status: "ACTIVE", checkedInAt: null } }),
      tx.bedAllocation.count({ where: { ...base, status: "ACTIVE", studentId: { in: awayIds } } }),
      tx.bedAllocation.count({ where: { ...base, ...byView.out } }),
    ]);
    const dues = new Map<string, bigint>();
    if (v.seesFees) for (const r of rows) if (r.allocation.status === "ACTIVE") dues.set(r.student.id, await hostelFeesDue(tx, r.student.id, p.today));
    const waitingAll = await waitingForBed(tx, ctx);
    const genders = new Set(p.myHostels.map((h) => h.gender));
    // A warden sees those who fit their hostel; a student whose gender is not on record shows to every warden.
    const waiting = waitingAll.filter((w) => mine === null || !genderFits(w.gender) || genders.has(genderFits(w.gender)!));

    // Sheets
    const wantsAllocate = can.allocate && one(sp.allocate) === "1";
    const moveId = can.allocate ? idParam(sp.move) : null;
    const checkoutId = can.allocate ? idParam(sp.checkout) : null;
    const historyId = idParam(sp.history);
    const grid = wantsAllocate || moveId ? await roomGrid(tx, p.myHostels.map((h) => h.id)) : [];
    const beds: FreeBed[] = grid.flatMap((r) => r.beds.filter((b) => b.state === "free").map((b) => ({ id: b.id, hostelId: r.hostelId, roomNo: r.roomNo, bedNo: b.bedNo, floor: r.floor, roomType: r.roomType })));
    // The plans of every year still open (this year and next); the sheet offers those of the year the bed belongs to.
    const plans = wantsAllocate ? await openFeePlans(tx, ctx) : [];
    let startStudent: FoundStudent | null = null;
    const sid = idParam(sp.student);
    if (wantsAllocate && sid) {
      const s = (await studentsInfo(tx, ctx, [sid])).get(sid);
      const [years, st] = await Promise.all([bedYears(tx, [sid]), tx.student.findUnique({ where: { id: sid }, select: { joiningDate: true } })]);
      if (s) startStudent = { id: s.id, name: s.name, admissionNo: s.admissionNo, cls: s.classSection ?? "", gender: genderFits(s.gender), bed: null, hostelId: null, campusId: s.campusId, years: years.get(sid) ?? [], joins: st?.joiningDate ? isoOf(st.joiningDate) : null };
    }
    const one_ = async (id: string | null) => {
      if (!id) return null;
      const a = await tx.bedAllocation.findFirst({ where: { id, status: "ACTIVE" } });
      if (!a || !inScope(mine, a.hostelId)) return null;
      const [r] = await residents(tx, ctx, { id: a.id }, p.now);
      return r ?? null;
    };
    const move = await one_(moveId);
    const checkout = await one_(checkoutId);
    const checkoutDue = checkout && v.seesFees ? await hostelFeesDue(tx, checkout.student.id, p.today) : BigInt(0);
    let history: null | { student: { id: string; name: string; cls: string | null }; rows: Awaited<ReturnType<typeof bedHistory>> } = null;
    if (historyId) {
      const rowsH = await bedHistory(tx, historyId);
      const own = rowsH.filter((r) => inScope(mine, r.hostelId));
      if (own.length) {
        const s = (await studentsInfo(tx, ctx, [historyId])).get(historyId);
        if (s) history = { student: { id: s.id, name: s.name, cls: s.classSection }, rows: own };
      }
    }
    // A new year is open: boarders whose bed is still on last year wait to be carried over.
    const carry = await carryOverRows(tx, mine);
    const carryInfo = can.allocate && one(sp.carry) === "1" && carry.length ? await studentsInfo(tx, ctx, carry.map((r) => r.allocation.studentId)) : new Map<string, never>();
    return { total, rows, active, arriving, awayCount, outCount, dues, waiting, beds, plans, startStudent, move, checkout, checkoutDue, history, wantsAllocate, carry, carryInfo };
  });

  const base = `${BASE}/allocation`;
  const href = (change: Record<string, string | number | null>) => listHref(base, params, { page: null, ...change });
  const exportHref = qs(`${base}/export`, { show: show || null, hostel: hostelId, q: params.q || null, ...(show === "out" ? per.keep : {}) });
  const statusOf = (r: Resident) => RESIDENT_STATUS[r.status];
  const away = (r: Resident) => (r.backBy ? `back by ${formatDate(r.backBy, tz)}, ${clockAt(r.backBy, tz)}` : "");

  const acts = (r: Resident) => {
    if (r.allocation.status !== "ACTIVE") return null;
    const bits: React.ReactNode[] = [];
    if (can.allocate && !r.allocation.checkedInAt) bits.push(<ActButton key="in" action={checkInAction} fields={{ allocationId: r.allocation.id }} label="Check in" icon="in" variant="primary" />);
    if (can.allocate) bits.push(<Link key="mv" href={href({ move: r.allocation.id })} scroll={false} className="text-[13px] font-semibold text-brand hover:underline"><Words k="Move" /></Link>);
    if (can.allocate) bits.push(<Link key="co" href={href({ checkout: r.allocation.id })} scroll={false} className="text-[13px] font-semibold text-bad hover:underline"><Words k="Check out" /></Link>);
    return bits.length ? <span className="flex items-center gap-3 justify-end flex-wrap">{bits}</span> : null;
  };

  const counts: Record<string, number> = { "": d.active, arriving: d.arriving, away: d.awayCount, out: d.outCount };
  const carryTo = d.carry[0]?.toYear ?? null;
  const carryFrom = d.carry[0]?.fromYear ?? null;
  const carryItems: CarryItem[] = d.carry.map((r) => ({
    id: r.allocation.id, name: r.name, cls: d.carryInfo.get(r.allocation.studentId)?.classSection ?? "", newClass: r.newClass, where: r.where, hostel: r.hostelName,
    fees: r.plan ? `${r.plan.name}${v.seesFees ? ` · ${formatRupees(planTotal(r.plan))} a year` : ""}` : "No hostel fees, as before", blocked: r.blocked, note: r.note,
  }));

  return (
    <>
      <HostelHead pageName="Allocation" href={base} mode={p.mode}
        sub={can.allocate ? "Who has which bed. Give a bed, check in, move a student or check them out." : "Who has which bed, who has not arrived and who is away."}
        actions={can.allocate ? <ButtonLink href={href({ allocate: "1" })} variant="primary" icon={UserPlus} scroll={false}><Words k="Give a bed" /></ButtonLink> : undefined} />
      <Stack>
        {carryTo && carryFrom && (
          <Banner tone="info" icon={CalendarClock} title={`${carryTo.name} is open: ${plural(d.carry.length, "boarder")} from ${carryFrom.name} to carry over`}
            action={can.allocate ? <ButtonLink href={href({ carry: "1" })} scroll={false} variant="primary" size="sm"><Words k="Review and carry over" /></ButtonLink> : undefined}>
            {can.allocate ? `Boarders keep their bed from ${formatDate(carryTo.startDate, "UTC")}, and the ${carryTo.name} hostel fees are added. Boarders not staying are checked out at year end. Review them first.` : "The warden reviews and carries them over."}
          </Banner>
        )}
        <Stats items={[
          { label: "Residents", value: String(d.active), sub: p.myHostels.length === 1 ? p.myHostels[0].name : `${p.myHostels.length} hostels`, icon: Users, href: href({ show: null }), active: show === "" },
          { label: "Not arrived", value: String(d.arriving), sub: "bed given, not checked in", tone: d.arriving ? "warn" : undefined, href: href({ show: "arriving" }), active: show === "arriving" },
          { label: "Away now", value: String(d.awayCount), sub: "on outing or leave", tone: d.awayCount ? "info" : undefined, href: href({ show: "away" }), active: show === "away" },
          { label: "Waiting for a bed", value: String(d.waiting.length), sub: "hostel needed at admission", tone: d.waiting.length ? "warn" : undefined, href: "#waiting" },
        ]} />
        <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <Chips label="Residents shown" value={show} options={VIEWS.map((x) => ({ value: x.value, label: x.label, count: counts[x.value], href: href({ show: x.value || null, period: null, from: null, to: null }) }))} />
          {p.myHostels.length > 1 && <SegLinks label="Hostel" value={hostelId ?? "all"} options={[{ value: "all", label: "All", href: href({ hostel: null }) }, ...p.myHostels.map((h) => ({ value: h.id, label: h.name, href: href({ hostel: h.id }) }))]} />}
        </div>
        <Card>
          <Toolbar className="md:flex-wrap">
            <UrlSearch placeholder="Search name or admission number" label="Search residents" className="flex-1 md:min-w-[260px]" id="res-search" />
            <div className="flex gap-2 flex-wrap">
              {show === "out" && <PeriodFilter {...p.dates} fallback="acyear" />}
              {can.export && <ExportButton href={exportHref} />}
            </div>
          </Toolbar>
          <DataList rows={d.rows} rowKey={(r) => r.allocation.id} minWidth={v.seesFees ? 1040 : 920} caption="Hostel residents"
            empty={<Empty icon={params.q ? Search : BedDouble} title={params.q ? "No resident matches" : show === "out" ? "Nobody checked out in these dates" : show === "away" ? "Everyone is in the hostel" : show === "arriving" ? "Everyone has arrived" : "No residents yet"}
              body={params.q ? "Try another name, or clear the search." : show === "" && can.allocate ? "Give the first bed to a student waiting for one." : undefined}
              action={show === "" && !params.q && can.allocate ? <ButtonLink href={href({ allocate: "1" })} variant="primary" icon={UserPlus} scroll={false}><Words k="Give a bed" /></ButtonLink> : undefined} />}
            columns={[
              { key: "student", label: "Student", render: (r) => <span><b className="font-semibold">{seesStudents ? <Link href={`/student-management/students/${r.student.id}?tab=hostel`} className="hover:underline">{r.student.name}</Link> : r.student.name}</b><span className="block text-[12.5px] text-ink3">{r.student.classSection ?? "No class"} · <span className="font-mono">{r.student.admissionNo}</span></span></span> },
              { key: "where", label: "Hostel, room, bed", render: (r) => <span>{bedWords(r.roomNo, r.bedNo)}<span className="block text-[12.5px] text-ink3">{r.hostelName} · {r.floor} <Words k="floor" /></span></span> },
              { key: "in", label: show === "out" ? "Stayed" : "Check-in", nowrap: true, render: (r) => show === "out" ? `${formatDate(r.allocation.startDate, "UTC")} to ${r.allocation.endDate ? formatDate(r.allocation.endDate, "UTC") : ""}` : r.allocation.checkedInAt ? <span>{formatDate(r.allocation.checkedInAt, tz)}<span className="block text-[12.5px] text-ink3">{clockAt(r.allocation.checkedInAt, tz)}</span></span> : <span className="text-ink3"><Words k="From" /> {formatDate(r.allocation.startDate, "UTC")}</span> },
              { key: "status", label: "Status", render: (r) => <span><Pill tone={statusOf(r).tone}>{statusOf(r).label}</Pill>{r.backBy && <span className={`block text-[12px] mt-0.5 ${r.status === "LATE" ? "text-bad font-semibold" : "text-ink3"}`}>{away(r)}</span>}{r.allocation.status !== "ACTIVE" && r.allocation.endReason && <span className="block text-[12px] text-ink3 mt-0.5">{r.allocation.endReason}</span>}</span> },
              ...(v.seesFees ? [{ key: "fees", label: "Hostel fees due", align: "right" as const, nowrap: true, render: (r: Resident) => { const due = d.dues.get(r.student.id); return due && due > BigInt(0) ? <b className="font-semibold text-warn">{formatRupees(due)}</b> : <span className="text-ink3">{r.allocation.status === "ACTIVE" ? "Nothing due" : ""}</span>; } }] : []),
              { key: "hist", label: "", render: (r) => <Link href={href({ history: r.student.id })} scroll={false} className="text-[13px] font-semibold text-ink2 hover:underline whitespace-nowrap"><Words k="Bed history" /></Link> },
              { key: "act", label: "", render: acts },
            ]}
            phone={(r) => ({
              title: r.student.name, sub: `${bedWords(r.roomNo, r.bedNo)} · ${r.student.classSection ?? ""}${r.backBy ? ` · ${away(r)}` : ""}`, icon: BedDouble, iconTone: statusOf(r).tone,
              right: <span className="flex flex-col items-end gap-1"><Pill tone={statusOf(r).tone}>{statusOf(r).label}</Pill>{v.seesFees && (d.dues.get(r.student.id) ?? BigInt(0)) > BigInt(0) && <span className="text-[12px] font-semibold text-warn tnum">{formatRupees(d.dues.get(r.student.id)!)} <Words k="due" /></span>}</span>,
              pills: <span className="flex items-center gap-3 flex-wrap">{acts(r)}<Link href={href({ history: r.student.id })} scroll={false} className="text-[13px] font-semibold text-ink2 hover:underline"><Words k="Bed history" /></Link></span>,
            })}
          />
          {d.total > 0 && <Pager page={params.page} pageSize={PAGE_SIZE} total={d.total} prevHref={listHref(base, params, { page: params.page > 2 ? params.page - 1 : null })} nextHref={listHref(base, params, { page: params.page + 1 })} />}
        </Card>

        <Card id="waiting">
          <CardHeader title="Waiting for a bed" icon={UserPlus} description="Students whose admission application asked for the hostel and who have never had a bed, including those admitted for next year." divided />
          {d.waiting.length === 0 ? (
            <Empty icon={Users} title="Nobody is waiting" body="Students marked “hostel needed” at admission show here until they get a bed." />
          ) : (
            <ul className="divide-y divide-line/70">
              {d.waiting.map((w) => (
                <li key={w.id}>
                  <ListRow title={w.name} sub={`${w.classSection ?? "No class"} · ${w.admissionNo} · hostel needed on application ${w.applicationNo ?? ""}${w.askedAt ? `, ${formatDate(w.askedAt, tz)}` : ""}${w.joins && w.joins.getTime() > p.today.getTime() ? ` · joins ${formatDate(w.joins, "UTC")}` : ""}`} icon={UserPlus} iconTone="warn"
                    right={can.allocate ? <ButtonLink href={href({ allocate: "1", student: w.id })} size="sm" variant="secondary" scroll={false}><Words k="Give a bed" /></ButtonLink> : <Pill tone="warn"><Words k="Waiting" /></Pill>} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Stack>

      {d.wantsAllocate && (
        <AllocateSheet closeHref={href({ allocate: null, student: null, bed: null })} hostels={p.myHostels} beds={d.beds}
          plans={d.plans.map((x) => ({ id: x.id, name: x.name, hostelId: x.hostelId, roomType: x.roomType, campusId: x.campusId, yearId: x.academicYearId, yearName: x.yearName, words: `${x.name}, ${x.yearName}${x.campusName ? ` (${x.campusName})` : ""}${v.seesFees ? ` · ${formatRupees(planTotal(x))} a year` : ""}` }))}
          start={{ bedId: idParam(sp.bed), hostelId: null, student: d.startStudent }}
          waiting={d.waiting.map((w) => ({ id: w.id, name: w.name, admissionNo: w.admissionNo, cls: w.classSection ?? "", gender: genderFits(w.gender), bed: null, hostelId: null, campusId: w.campusId, years: w.years, joins: w.joins ? isoOf(w.joins) : null }))}
          todayStr={p.todayStr} showFees={v.seesFees} />
      )}
      {can.allocate && one(sp.carry) === "1" && carryTo && carryFrom && (
        <CarrySheet closeHref={href({ carry: null })} items={carryItems} fromYear={carryFrom.name} toYear={carryTo.name} toStart={formatDate(carryTo.startDate, "UTC")} />
      )}
      {d.move && <MoveSheet closeHref={href({ move: null })} allocationId={d.move.allocation.id} name={d.move.student.name} from={bedWords(d.move.roomNo, d.move.bedNo)} beds={d.beds} hostels={p.myHostels} todayStr={p.todayStr} />}
      {d.checkout && (
        <CheckoutSheet closeHref={href({ checkout: null })} allocationId={d.checkout.allocation.id} name={d.checkout.student.name} where={bedWords(d.checkout.roomNo, d.checkout.bedNo)} todayStr={p.todayStr}
          due={v.seesFees && d.checkoutDue > BigInt(0) ? `${formatRupees(d.checkoutDue)} hostel fees due` : null} outOn={d.checkout.passNo} />
      )}
      {d.history && (
        <UrlSheet title={`Bed history: ${d.history.student.name}`} sub={d.history.student.cls ?? undefined} closeHref={href({ history: null })}>
          <ol className="flex flex-col gap-3">
            {d.history.rows.map((h) => (
              <li key={h.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <b className="font-semibold text-[14.5px]">{h.where}</b>
                  <Pill tone={h.status === "ACTIVE" ? "ok" : h.status === "MOVED" ? "info" : "neutral"}>{h.status === "ACTIVE" ? "Now" : h.status === "MOVED" ? "Moved" : "Checked out"}</Pill>
                </div>
                <p className="text-[13px] text-ink3 mt-0.5">{h.hostelName} · {formatDate(h.startDate, "UTC")}{h.endDate ? ` to ${formatDate(h.endDate, "UTC")}` : " onwards"}</p>
                {h.endReason && <p className="text-[13px] text-ink2 mt-1">{h.endReason}</p>}
                {h.status === "ACTIVE" && <a href={`${base}/letter/${h.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline mt-2"><FileText size={14} aria-hidden="true" /><Words k="Allocation letter with the hostel rules" /></a>}
              </li>
            ))}
          </ol>
          <p className="text-[12.5px] text-ink3 mt-4 flex items-center gap-1.5"><History size={14} aria-hidden="true" />{plural(d.history.rows.length, "bed")} <Words k="on record. Moves and check-outs are never deleted." /></p>
        </UrlSheet>
      )}
    </>
  );
}
