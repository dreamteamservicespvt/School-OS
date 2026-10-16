// Outing & Visitors (15 §2): outing and leave passes (Gate Passes of kind
// Hostel Outing: the student goes with a named person and the warden
// approves through Approvals), students out now and late returns in red, and
// the hostel visitor log (every visitor names the resident they meet; only
// the authorised list visits without the warden's approval). A warden works
// in their own hostel; leaders approve, read and remind.
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, DoorOpen, FileText, Plus, Search, Ticket, UserCheck, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { momentWhere } from "@/lib/periods";
import { canDecide } from "@/lib/approvals";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSheet } from "@/components/ui/url-sheet";
import { UrlSearch } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Banner, DL, DataList, Empty, Stack, Stats, Toolbar } from "@/components/money/kit";
import { clockAt } from "@/lib/front-office/time";
import { maskPhone, showPhone } from "@/lib/front-office/words";
import { activeBedOf, studentsInfo } from "@/lib/hostel/allocation";
import { minutesLate, outingWhere, passWhen, shownStatus } from "@/lib/hostel/outings";
import { authorisedList, visitingWords } from "@/lib/hostel/visitors";
import { OUTING_TYPE, PASS_STATUS, genderFits, lateWords, minuteValue, minuteWords, plural, type OutingType, type PassStatus } from "@/lib/hostel/words";
import { HostelHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { CancelPassSheet, PassSheet, RejectPassSheet, VisitorSheet } from "../_components/sheets";
import { decidePassAction, markOutAction, markReturnedAction, remindWardenAction, visitorOutAction, type FoundStudent, type GuardianChoice } from "../actions";
import { BASE, hostelGuard, hostelPeriod, idParam, one, qs, type Raw, type SearchParams } from "../_lib/page";

export const metadata: Metadata = { title: "Outing & Visitors · Hostel Management" };

type P = Awaited<ReturnType<typeof hostelGuard>>;
const STATUSES: (PassStatus | "")[] = ["", "WAITING", "APPROVED", "OUT", "LATE", "RETURNED", "REJECTED", "CANCELLED"];

export default async function OutingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await hostelGuard("outings");
  return one(sp.view) === "visitors" ? <VisitorsView p={p} sp={sp} /> : <PassesView p={p} sp={sp} />;
}

function Views({ view }: { view: "passes" | "visitors" }) {
  return <SegLinks label="Passes or visitors" value={view} options={[{ value: "passes", label: "Outing passes", href: `${BASE}/outings` }, { value: "visitors", label: "Visitor log", href: `${BASE}/outings?view=visitors` }]} />;
}

async function startFor(tx: Parameters<Parameters<typeof withSchool>[1]>[0], p: P, sid: string | null): Promise<{ student: FoundStudent | null; guardians: GuardianChoice[] | null }> {
  if (!sid) return { student: null, guardians: null };
  const bed = await activeBedOf(tx, sid);
  if (!bed || (p.mine !== null && !p.mine.includes(bed.hostel.id))) return { student: null, guardians: null };
  const s = (await studentsInfo(tx, p.current.ctx, [sid])).get(sid);
  if (!s) return { student: null, guardians: null };
  const list = await authorisedList(tx, sid);
  return {
    student: { id: s.id, name: s.name, admissionNo: s.admissionNo, cls: s.classSection ?? "", gender: genderFits(s.gender), bed: bed.words, hostelId: bed.hostel.id },
    guardians: list.map((g) => ({ guardianId: g.guardianId, name: g.name, relation: g.relation, phone: g.phone, allowed: g.allowed, restriction: g.restriction })),
  };
}

async function PassesView({ p, sp }: { p: P; sp: Raw }) {
  const { current, can, mine, tz, now, settings: s } = p;
  const ctx = current.ctx;
  const params = readListParams(sp, ["status", "period", "from", "to"]);
  const status = (STATUSES.find((x) => x && x === one(sp.status)) ?? "") as PassStatus | "";
  const per = hostelPeriod(sp, p.dates, "last30");
  const scope = mine === null ? {} : { hostelId: { in: mine } };
  const pick = (k: string) => idParam(sp[k]);

  const d = await withSchool(ctx, async (tx) => {
    let nameIds: string[] | null = null;
    if (params.q) nameIds = (await tx.student.findMany({ where: { fullName: { contains: params.q, mode: "insensitive" } }, select: { id: true }, take: 300 })).map((x) => x.id);
    const dated: Prisma.GatePassWhereInput = per.range ? { fromAt: momentWhere(per.range, tz) } : {};
    const byStatus: Prisma.GatePassWhereInput =
      status === "LATE" ? { status: "OUT", toAt: { lt: now } }
      : status === "OUT" ? { status: "OUT", toAt: { gte: now } }
      : status ? { status } : {};
    // Waiting, out and late passes show whatever their dates; the period is for the rest.
    const live = status === "WAITING" || status === "OUT" || status === "LATE" || status === "APPROVED";
    const where = outingWhere({
      ...scope, ...byStatus, ...(live ? {} : dated),
      ...(params.q ? { OR: [{ passNo: { contains: params.q, mode: "insensitive" } }, { collectorName: { contains: params.q, mode: "insensitive" } }, ...(nameIds?.length ? [{ studentId: { in: nameIds } }] : [])] } : {}),
    });
    const [total, rows, waiting, out, late, returned] = await Promise.all([
      tx.gatePass.count({ where }),
      tx.gatePass.findMany({ where, orderBy: [{ fromAt: "desc" }, { id: "asc" }], ...skipTake(params) }),
      tx.gatePass.count({ where: outingWhere({ ...scope, status: "WAITING" }) }),
      tx.gatePass.count({ where: outingWhere({ ...scope, status: "OUT", toAt: { gte: now } }) }),
      tx.gatePass.findMany({ where: outingWhere({ ...scope, status: "OUT", toAt: { lt: now } }), orderBy: { toAt: "asc" } }),
      tx.gatePass.count({ where: outingWhere({ ...scope, status: "RETURNED", ...dated }) }),
    ]);
    const opened = pick("pass") ?? pick("reject") ?? pick("cancel");
    const extra = opened && !rows.some((r) => r.id === opened) ? await tx.gatePass.findFirst({ where: outingWhere({ id: opened, ...scope }) }) : null;
    const all = extra ? [extra, ...rows] : rows;
    const ids = [...all, ...late].map((r) => r.studentId);
    const [info, beds, approvals, people, hostels] = await Promise.all([
      studentsInfo(tx, ctx, ids),
      tx.bedAllocation.findMany({ where: { studentId: { in: ids }, status: "ACTIVE" }, select: { studentId: true, roomId: true, bedId: true } }),
      tx.approval.findMany({ where: { id: { in: all.map((r) => r.approvalId).filter((x): x is string => Boolean(x)) } } }),
      tx.userLogin.findMany({ where: { id: { in: all.flatMap((r) => [r.issuedById, r.decidedById, r.gateCheckedById, r.returnedById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
      tx.hostel.findMany({ select: { id: true, name: true } }),
    ]);
    const rooms = await tx.hostelRoom.findMany({ where: { id: { in: beds.map((b) => b.roomId) } }, select: { id: true, roomNo: true } });
    const deciders = new Set<string>();
    for (const a of approvals) if (await canDecide(tx, ctx, a)) deciders.add(a.id);
    const fresh = can.outings && one(sp.new) === "1" ? await startFor(tx, p, idParam(sp.student)) : null;
    return {
      total, rows: all, waiting, out, late, returned, info, deciders, approvals,
      room: new Map(beds.map((b) => [b.studentId, rooms.find((r) => r.id === b.roomId)?.roomNo ?? ""])),
      people: new Map(people.map((x) => [x.id, x.displayName])), hostels: new Map(hostels.map((h) => [h.id, h.name])), fresh,
    };
  });

  type Row = (typeof d.rows)[number];
  const base = `${BASE}/outings`;
  const href = (change: Record<string, string | number | null>) => listHref(base, params, { page: null, ...change });
  const name = (r: Row) => d.info.get(r.studentId)?.name ?? "Student";
  const st = (r: Row) => PASS_STATUS[shownStatus(r, now)];
  const phone = (x: string | null) => (x ? (can.outings ? showPhone(x) : maskPhone(x)) : "");
  const going = (r: Row) => `${r.collectorName ?? ""}${r.collectorRelation ? ` (${r.collectorRelation.toLowerCase()})` : ""}`;
  const words = (r: Row) => `${r.passNo} · ${name(r)} · ${passWhen(r, tz)}`;
  const exportHref = qs(`${base}/export`, { status: status || null, q: params.q || null, ...per.keep });
  const lateHostels = [...new Set(d.late.map((r) => r.hostelId).filter((x): x is string => Boolean(x)))];

  const acts = (r: Row) => {
    const bits: React.ReactNode[] = [];
    if (r.status === "WAITING" && r.approvalId && d.deciders.has(r.approvalId)) {
      bits.push(<ActButton key="ok" action={decidePassAction} fields={{ passId: r.id, decision: "approve" }} label="Approve" icon="check" variant="primary" />);
      bits.push(<Link key="no" href={href({ reject: r.id })} scroll={false} className="text-[13px] font-semibold text-bad hover:underline">Reject</Link>);
    }
    if (can.outings && r.status === "APPROVED") bits.push(<ActButton key="out" action={markOutAction} fields={{ passId: r.id }} label="Mark out" icon="out" variant="primary" />);
    if (can.outings && r.status === "OUT") bits.push(<ActButton key="back" action={markReturnedAction} fields={{ passId: r.id }} label="Mark returned" icon="in" variant={shownStatus(r, now) === "LATE" ? "primary" : "secondary"} />);
    if (can.outings && (r.status === "WAITING" || r.status === "APPROVED")) bits.push(<Link key="c" href={href({ cancel: r.id })} scroll={false} className="text-[13px] font-semibold text-ink2 hover:underline">Cancel</Link>);
    return bits.length ? <span className="flex items-center gap-3 justify-end flex-wrap">{bits}</span> : null;
  };

  const opened = pick("pass") ? d.rows.find((r) => r.id === pick("pass")) ?? null : null;
  const rejecting = pick("reject") ? d.rows.find((r) => r.id === pick("reject") && r.approvalId && d.deciders.has(r.approvalId) && r.status === "WAITING") ?? null : null;
  const cancelling = can.outings && pick("cancel") ? d.rows.find((r) => r.id === pick("cancel") && (r.status === "WAITING" || r.status === "APPROVED")) ?? null : null;
  const counts: Record<string, number> = { WAITING: d.waiting, OUT: d.out, LATE: d.late.length };

  return (
    <>
      <HostelHead pageName="Outing & Visitors" href={base} mode={p.mode}
        sub={can.outings ? "Outing and leave passes: the warden approves, you mark the student out and back." : "Outing and leave passes, students out now and late returns."}
        actions={can.outings ? <ButtonLink href={href({ new: "1" })} variant="primary" icon={Plus} scroll={false}>New pass</ButtonLink> : undefined} />
      <Stack>
        <Views view="passes" />
        {d.late.length > 0 && (
          <div className="flex flex-col gap-2">
          <Banner tone="bad" icon={AlertTriangle} title={`${plural(d.late.length, "student")} not back.`}
            action={can.remind ? <span className="flex gap-2 flex-wrap">{lateHostels.map((h) => <ActButton key={h} action={remindWardenAction} fields={{ hostelId: h, what: "late" }} label={lateHostels.length > 1 ? `Remind ${d.hostels.get(h)}` : "Remind the warden"} icon="bell" />)}</span> : undefined}>Call the person they are with; mark them returned when they are back.</Banner>
            <ul className="rounded-2xl border border-line bg-surface px-4 py-3 flex flex-col gap-2 text-[14px] text-ink2">
              {d.late.map((r) => (
                <li key={r.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-0"><b className="font-semibold">{d.info.get(r.studentId)?.name ?? "Student"}</b> not returned (due {r.toAt ? clockAt(r.toAt, tz) : ""}{r.toAt && formatDate(r.toAt, tz) !== formatDate(now, tz) ? `, ${formatDate(r.toAt, tz)}` : ""}) · {lateWords(minutesLate(r, now))} late · with {r.collectorName}{can.outings && r.collectorPhone ? `, ${showPhone(r.collectorPhone)}` : ""}</span>
                  {can.outings && <ActButton action={markReturnedAction} fields={{ passId: r.id }} label="Mark returned" icon="in" />}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Stats items={[
          { label: "Waiting approval", value: String(d.waiting), sub: "with the warden", tone: d.waiting ? "warn" : undefined, href: href({ status: "WAITING" }), active: status === "WAITING", icon: CalendarClock },
          { label: "Out now", value: String(d.out), sub: "back on time so far", tone: d.out ? "info" : undefined, href: href({ status: "OUT" }), active: status === "OUT", icon: DoorOpen },
          { label: "Late", value: String(d.late.length), sub: "past the back-by time", tone: d.late.length ? "bad" : undefined, href: href({ status: "LATE" }), active: status === "LATE", icon: AlertTriangle },
          { label: "Returned", value: String(d.returned), sub: per.label, tone: "ok", href: href({ status: "RETURNED" }), active: status === "RETURNED", icon: UserCheck },
        ]} />
        <Chips label="Pass status" value={status} options={STATUSES.map((x) => ({ value: x, label: x ? PASS_STATUS[x].label : "All passes", count: x && counts[x] !== undefined ? counts[x] : null, href: href({ status: x || null }) }))} />
        <Card>
          <Toolbar className="md:flex-wrap">
            <UrlSearch placeholder="Search student, pass number or person" label="Search passes" className="flex-1 md:min-w-[260px]" id="pass-search" />
            <div className="flex gap-2 flex-wrap">
              <PeriodFilter {...p.dates} fallback="last30" />
              {can.export && <ExportButton href={exportHref} />}
            </div>
          </Toolbar>
          <DataList rows={d.rows} rowKey={(r) => r.id} minWidth={1080} caption="Outing and leave passes" rowClass={(r) => shownStatus(r, now) === "LATE" ? "bg-bad/[.04]" : r.id === pick("pass") ? "bg-brand/5" : undefined}
            empty={<Empty icon={params.q ? Search : Ticket} title={params.q || status ? "No pass matches" : "No passes in these dates"} body={params.q || status ? "Try other dates, or clear the search." : can.outings ? "Make a pass when a parent calls to take their child out." : undefined} />}
            columns={[
              { key: "student", label: "Student", render: (r) => <span><Link href={href({ pass: r.id })} scroll={false} className="font-semibold hover:underline">{name(r)}</Link><span className="block text-[12.5px] text-ink3">{d.info.get(r.studentId)?.classSection ?? ""}{d.room.get(r.studentId) ? ` · Room ${d.room.get(r.studentId)}` : ""} · <span className="font-mono">{r.passNo}</span></span></span> },
              { key: "type", label: "Type", render: (r) => OUTING_TYPE[(r.outingType ?? "OUTING") as OutingType].label },
              { key: "with", label: "Going with", render: (r) => <span>{going(r)}<span className="block text-[12.5px] text-ink3 tnum">{phone(r.collectorPhone)}</span></span> },
              { key: "when", label: "From and to", render: (r) => <span className="text-[13.5px]">{passWhen(r, tz)}</span> },
              { key: "reason", label: "Reason", className: "max-w-[220px]", render: (r) => <span className="line-clamp-2">{r.reason}</span> },
              { key: "status", label: "Status", render: (r) => <span><Pill tone={st(r).tone}>{st(r).label}</Pill>{shownStatus(r, now) === "LATE" && <span className="block text-[12px] text-bad font-semibold mt-0.5">{lateWords(minutesLate(r, now))} late</span>}{r.status === "RETURNED" && r.returnedAt && <span className="block text-[12px] text-ink3 mt-0.5">back {clockAt(r.returnedAt, tz)}{minutesLate(r, now) > 0 ? `, ${lateWords(minutesLate(r, now))} late` : ""}</span>}</span> },
              { key: "act", label: "", render: acts },
            ]}
            phone={(r) => ({
              title: name(r), sub: `${OUTING_TYPE[(r.outingType ?? "OUTING") as OutingType].label} with ${going(r)} · ${passWhen(r, tz)}`, icon: Ticket, iconTone: st(r).tone,
              right: <Pill tone={st(r).tone}>{st(r).label}</Pill>, pills: <span className="flex items-center gap-3 flex-wrap">{acts(r)}<Link href={href({ pass: r.id })} scroll={false} className="text-[13px] font-semibold text-ink2 hover:underline">Details</Link></span>,
            })}
          />
          {d.total > 0 && <Pager page={params.page} pageSize={PAGE_SIZE} total={d.total} prevHref={listHref(base, params, { page: params.page > 2 ? params.page - 1 : null })} nextHref={listHref(base, params, { page: params.page + 1 })} />}
        </Card>
        <p className="text-[12.5px] text-ink3">Each pass is a Gate Pass of kind Hostel Outing, so the front gate sees it too. New outings are back by {minuteWords(s.outingBackMinute)} unless you change it. {s.messageOnOut || s.messageOnReturn ? `Parents are told when their child ${[s.messageOnOut && "goes out", s.messageOnReturn && "comes back"].filter(Boolean).join(" and ")}.` : "Messages to parents are off in Hostel Settings."}</p>
      </Stack>

      {opened && (() => {
        const a = d.approvals.find((x) => x.id === opened.approvalId);
        return (
          <UrlSheet title={`Pass ${opened.passNo}`} sub={`${name(opened)} · ${OUTING_TYPE[(opened.outingType ?? "OUTING") as OutingType].label}`} closeHref={href({ pass: null })}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap"><Pill tone={st(opened).tone}>{st(opened).label}</Pill>{opened.hostelId && <span className="text-[13px] text-ink3">{d.hostels.get(opened.hostelId)}</span>}</div>
              <DL rows={[
                ["Going with", `${going(opened)}${opened.collectorPhone ? ` · ${phone(opened.collectorPhone)}` : ""}`],
                ["From and to", passWhen(opened, tz)],
                ["Reason", opened.reason],
                ["Asked by", `${(opened.issuedById && d.people.get(opened.issuedById)) ?? "—"}, ${formatDate(opened.createdAt, tz)} ${clockAt(opened.createdAt, tz)}`],
                ["Decision", opened.decidedAt ? `${opened.status === "REJECTED" ? "Rejected" : "Approved"} by ${(opened.decidedById && d.people.get(opened.decidedById)) ?? "—"}, ${clockAt(opened.decidedAt, tz)}${opened.decisionNote ? `: “${opened.decisionNote}”` : ""}` : a ? "Waiting in Approvals" : "—"],
                ["Went out", opened.leftAt ? `${formatDate(opened.leftAt, tz)}, ${clockAt(opened.leftAt, tz)}` : "Not yet"],
                ["Came back", opened.returnedAt ? `${formatDate(opened.returnedAt, tz)}, ${clockAt(opened.returnedAt, tz)}${minutesLate(opened, now) ? ` (${lateWords(minutesLate(opened, now))} late)` : ""}` : opened.status === "OUT" ? "Not yet" : "—"],
              ]} />
              <div className="flex gap-2 flex-wrap justify-end">
                {(opened.status === "APPROVED" || opened.status === "OUT") && <a href={`${base}/pass/${opened.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-line bg-surface hover:bg-sunken text-[14px] font-semibold"><FileText size={16} aria-hidden="true" />Print pass</a>}
                {acts(opened)}
              </div>
            </div>
          </UrlSheet>
        );
      })()}
      {rejecting && <RejectPassSheet closeHref={href({ reject: null })} passId={rejecting.id} words={words(rejecting)} />}
      {cancelling && <CancelPassSheet closeHref={href({ cancel: null })} passId={cancelling.id} passNo={cancelling.passNo} />}
      {d.fresh && (
        <PassSheet closeHref={href({ new: null, student: null })} todayStr={p.todayStr} nowTime={minuteValue(p.minute)} backBy={minuteValue(s.outingBackMinute)} start={d.fresh.student} startGuardians={d.fresh.guardians} />
      )}
    </>
  );
}

async function VisitorsView({ p, sp }: { p: P; sp: Raw }) {
  const { current, can, mine, tz, settings: s } = p;
  const ctx = current.ctx;
  const params = readListParams(sp, ["view", "period", "from", "to", "inside"]);
  const per = hostelPeriod(sp, p.dates, "last7");
  const inside = one(sp.inside) === "1";
  const scope: Prisma.VisitorEntryWhereInput = { archivedAt: null, meetStudentId: { not: null }, ...(mine === null ? {} : { hostelId: { in: mine } }) };
  const weekday = new Date(`${p.todayStr}T00:00:00Z`).getUTCDay();
  const inHours = s.visitingDays.includes(weekday) && p.minute >= s.visitingFromMinute && p.minute < s.visitingToMinute;

  const d = await withSchool(ctx, async (tx) => {
    let nameIds: string[] | null = null;
    if (params.q) nameIds = (await tx.student.findMany({ where: { fullName: { contains: params.q, mode: "insensitive" } }, select: { id: true }, take: 300 })).map((x) => x.id);
    const dated: Prisma.VisitorEntryWhereInput = per.range ? { timeIn: momentWhere(per.range, tz) } : {};
    const where: Prisma.VisitorEntryWhereInput = {
      ...scope, ...(inside ? { timeOut: null } : dated),
      ...(params.q ? { OR: [{ name: { contains: params.q, mode: "insensitive" } }, { passNo: { contains: params.q, mode: "insensitive" } }, ...(nameIds?.length ? [{ meetStudentId: { in: nameIds } }] : [])] } : {}),
    };
    const [total, rows, insideNow, today, inRange] = await Promise.all([
      tx.visitorEntry.count({ where }),
      tx.visitorEntry.findMany({ where, orderBy: [{ timeIn: "desc" }, { id: "asc" }], ...skipTake(params) }),
      tx.visitorEntry.count({ where: { ...scope, timeOut: null } }),
      tx.visitorEntry.count({ where: { ...scope, visitDate: p.today } }),
      tx.visitorEntry.count({ where: { ...scope, ...dated } }),
    ]);
    const [info, people] = await Promise.all([
      studentsInfo(tx, ctx, rows.map((r) => r.meetStudentId!).filter(Boolean)),
      tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.approvedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    const fresh = can.outings && one(sp.new) === "1" ? await startFor(tx, p, idParam(sp.student)) : null;
    return { total, rows, insideNow, today, inRange, info, people: new Map(people.map((x) => [x.id, x.displayName])), fresh };
  });

  type Row = (typeof d.rows)[number];
  const base = `${BASE}/outings`;
  const href = (change: Record<string, string | number | null>) => listHref(base, params, { page: null, view: "visitors", ...change });
  const met = (r: Row) => (r.meetStudentId ? d.info.get(r.meetStudentId) : null);
  const allowed = (r: Row) => (r.allowedBy === "WARDEN" ? `Warden approved${r.approvedById && d.people.get(r.approvedById) ? ` (${d.people.get(r.approvedById)})` : ""}` : "On the authorised list");
  const exportHref = qs(`${base}/export`, { view: "visitors", inside: inside ? "1" : null, q: params.q || null, ...per.keep });

  return (
    <>
      <HostelHead pageName="Outing & Visitors" href={base} mode={p.mode}
        sub={`Hostel visitors, each meeting one resident. Visiting hours: ${visitingWords(s)}.`}
        actions={can.outings ? <ButtonLink href={href({ new: "1" })} variant="primary" icon={Plus} scroll={false}>Record visitor</ButtonLink> : undefined} />
      <Stack>
        <Views view="visitors" />
        {!inHours && can.outings && <Banner tone="info" title="Outside visiting hours now.">Visitors now need the warden&apos;s approval. Visiting hours: {visitingWords(s)}.</Banner>}
        <Stats items={[
          { label: "Inside now", value: String(d.insideNow), sub: "not signed out", tone: d.insideNow ? "info" : undefined, href: href({ inside: "1" }), active: inside, icon: Users },
          { label: "Today", value: String(d.today), sub: "visitors", icon: UserCheck },
          { label: "In these dates", value: String(d.inRange), sub: per.label, href: href({ inside: null }), active: !inside, icon: CalendarClock },
        ]} />
        <Card>
          <Toolbar className="md:flex-wrap">
            <UrlSearch placeholder="Search visitor, student or pass number" label="Search visitors" className="flex-1 md:min-w-[260px]" id="vis-search" />
            <div className="flex gap-2 flex-wrap">
              {!inside && <PeriodFilter {...p.dates} fallback="last7" />}
              {can.export && <ExportButton href={exportHref} />}
            </div>
          </Toolbar>
          <DataList rows={d.rows} rowKey={(r) => r.id} minWidth={980} caption="Hostel visitor log"
            empty={<Empty icon={params.q ? Search : Users} title={inside ? "No visitor inside now" : params.q ? "No visitor matches" : "No visitors in these dates"} body={params.q ? "Try other dates, or clear the search." : undefined} />}
            columns={[
              { key: "date", label: "Date", nowrap: true, render: (r) => <span>{formatDate(r.visitDate, "UTC")}<span className="block text-[12.5px] text-ink3 font-mono">{r.passNo}</span></span> },
              { key: "student", label: "Student met", render: (r) => <span><b className="font-semibold">{met(r)?.name ?? "Student"}</b><span className="block text-[12.5px] text-ink3">{met(r)?.classSection ?? ""}</span></span> },
              { key: "visitor", label: "Visitor", render: (r) => <span>{r.name}<span className="block text-[12.5px] text-ink3">{r.relation ?? ""}{r.phone ? ` · ${can.outings ? showPhone(r.phone) : maskPhone(r.phone)}` : ""}</span></span> },
              { key: "in", label: "In", nowrap: true, render: (r) => clockAt(r.timeIn, tz) },
              { key: "out", label: "Out", nowrap: true, render: (r) => (r.timeOut ? clockAt(r.timeOut, tz) : <Pill tone="info">Inside</Pill>) },
              { key: "allowed", label: "Allowed by", render: (r) => <span className={r.allowedBy === "WARDEN" ? "text-warn" : "text-ink2"}>{allowed(r)}</span> },
              { key: "act", label: "", render: (r) => (can.outings && !r.timeOut ? <ActButton action={visitorOutAction} fields={{ visitorId: r.id }} label="Sign out" icon="out" /> : null) },
            ]}
            phone={(r) => ({
              title: `${r.name} → ${met(r)?.name ?? "Student"}`, sub: `${formatDate(r.visitDate, "UTC")} · in ${clockAt(r.timeIn, tz)}${r.timeOut ? ` · out ${clockAt(r.timeOut, tz)}` : ""} · ${allowed(r)}`, icon: Users, iconTone: r.timeOut ? "neutral" : "info",
              right: r.timeOut ? undefined : <Pill tone="info">Inside</Pill>, pills: can.outings && !r.timeOut ? <ActButton action={visitorOutAction} fields={{ visitorId: r.id }} label="Sign out" icon="out" /> : undefined,
            })}
          />
          {d.total > 0 && <Pager page={params.page} pageSize={PAGE_SIZE} total={d.total} prevHref={listHref(base, params, { view: "visitors", page: params.page > 2 ? params.page - 1 : null })} nextHref={listHref(base, params, { view: "visitors", page: params.page + 1 })} />}
        </Card>
        <p className="text-[12.5px] text-ink3">Hostel visits are Visitor Entries, so they also show in the Front Office visitor log. Requests and complaints from residents go to Communication, Feedback &amp; Queries.</p>
      </Stack>
      {d.fresh && <VisitorSheet closeHref={href({ new: null, student: null })} hours={visitingWords(s)} inHours={inHours} start={d.fresh.student} startGuardians={d.fresh.guardians} />}
    </>
  );
}
