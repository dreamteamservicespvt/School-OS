import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { withSchool, type Tx } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { approvalsFor } from "@/lib/approvals";
import { staffPage, BASE } from "@/lib/staff/page";
import { balancesFor, calendarLabel, daysText, leaveYearFor } from "@/lib/staff/leave";
import { addDays, eachDay, isoDay, monthEnd, monthLabel, monthStart } from "@/lib/staff/dates";
import { offDayMap } from "@/lib/staff/leave";
import { allLeaveWhere, campusStaffWhere, offCampus } from "@/lib/staff/list";
import { personCampusId } from "@/lib/campus";
import { StaffHead } from "../_components/head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, Pill, type BadgeTone } from "@/components/ui/badge";
import { Avatar } from "../_components/bits";
import { Banner, Col, Empty, SegLinks, Split, Toolbar } from "@/components/ui/blocks";
import { ListToolbar } from "@/components/list/list-toolbar";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { CalendarDays, CalendarPlus, Inbox } from "lucide-react";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { AdjustBalanceForm, ApplyLeaveForm, CancelLeaveForm, CarryForwardForm, DecideButtons } from "./leave-forms";
import { adjustBalanceAction, applyLeaveAction, cancelLeaveAction, carryForwardAction, decideLeave, previewLeave } from "./actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Staff Leave") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_WORDS: Record<string, { label: string; tone: BadgeTone }> = {
  WAITING: { label: "Waiting", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Not approved", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Ids of the staff matching a filter (Leave Request rows link to staff by id only). */
async function staffIdsWhere(tx: Tx, where: Prisma.StaffWhereInput) {
  return (await tx.staff.findMany({ where, select: { id: true } })).map((s) => s.id);
}

export default async function StaffLeavePage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, viewer, tz, today } = await staffPage();
  const hr = viewer.see === "all";
  const canHr = viewer.change === "all";
  const calendarAllowed = hr || viewer.headOf.length > 0;

  const base = await withSchool(current.ctx, async (tx) => {
    const roleKeys = current.roles.map((r) => r.key);
    // One campus: only the leave of their campus's staff (and their own) is waiting for them here.
    const campusLeave = viewer.campusId
      ? { recordId: { in: (await tx.leaveRequest.findMany({ where: { status: "WAITING", archivedAt: null, staffId: { in: await staffIdsWhere(tx, campusStaffWhere(viewer)) } }, select: { id: true } })).map((r) => r.id) } }
      : {};
    const where = await approvalsFor(tx, current.ctx, roleKeys, { type: "staff-leave", ...campusLeave });
    const [waitingForMe, types, rules, me] = await Promise.all([
      tx.approval.count({ where }),
      tx.leaveType.findMany({ where: { forWhom: "staff", archivedAt: null }, orderBy: { name: "asc" } }),
      tx.leaveTypeRule.findMany(),
      viewer.staffId ? tx.staff.findUnique({ where: { id: viewer.staffId } }) : null,
    ]);
    return { approvalsWhere: where, waitingForMe, types, rules, me };
  });

  const views = [
    ...(viewer.staffId ? [{ key: "mine", label: "My leave", href: `${BASE}/leave?view=mine` }] : []),
    ...(base.waitingForMe > 0 || hr || viewer.headOf.length ? [{ key: "requests", label: "Requests", href: `${BASE}/leave?view=requests`, count: base.waitingForMe }] : []),
    ...(hr ? [{ key: "all", label: "All leave", href: `${BASE}/leave?view=all` }] : []),
    ...(calendarAllowed ? [{ key: "calendar", label: "Leave calendar", href: `${BASE}/leave?view=calendar` }] : []),
    ...(hr ? [{ key: "balances", label: "Balances", href: `${BASE}/leave?view=balances` }] : []),
  ];
  const wanted = one(sp.view);
  const view = views.find((v) => v.key === wanted)?.key ?? (base.waitingForMe > 0 && !viewer.staffId ? "requests" : views[0]?.key ?? "mine");

  // Apply form: HR may apply for anyone; ?apply=<staffId> opens it for that person.
  const applyFor = one(sp.apply);
  const staffOptions = canHr
    ? await withSchool(current.ctx, (tx) => tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [campusStaffWhere(viewer)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } }))
    : [];
  const fixed = applyFor && canHr && applyFor !== viewer.staffId ? staffOptions.find((s) => s.id === applyFor) : undefined;
  const typeOptions = base.types.map((t) => {
    const rule = base.rules.find((r) => r.leaveTypeId === t.id);
    const notes = [t.paid ? `${Number(t.daysPerYear)} days a year` : "Unpaid", rule?.documentRequired ? "needs a document" : t.needsDocAfter !== null ? `document after ${t.needsDocAfter} days` : null, rule?.lossOfPay ? "extra days are loss of pay" : null].filter(Boolean);
    return { value: t.id, label: t.name, halfDay: rule?.halfDayAllowed ?? true, note: notes.join(", ") };
  });
  const canApply = Boolean(viewer.staffId) || canHr;
  const apply = canApply && base.types.length > 0 ? (
    <ApplyLeaveForm action={applyLeaveAction} preview={previewLeave} types={typeOptions} today={isoDay(today)}
      staff={canHr ? staffOptions.filter((s) => s.id !== viewer.staffId).map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode})` })) : null}
      fixedStaff={fixed ? { value: fixed.id, label: fixed.fullName } : undefined} defaultOpen={Boolean(applyFor)} />
  ) : null;

  return (
    <>
      <StaffHead page="Staff Leave" href={`${BASE}/leave`} sub={canHr ? "Leave requests, balances and the leave calendar for every staff member" : "Your leave requests and balances"} actions={apply} />
      {base.types.length === 0 && <Banner tone="warn" className="mb-4" title="No staff leave types yet.">{canHr ? <Link href={`${BASE}/settings`} className="font-semibold underline"><Words k="Add them in HR Settings." /></Link> : "Ask HR to add them."}</Banner>}
      {views.length > 1 && (
        <div className="-mx-4 mb-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
          <SegLinks label="Staff Leave views" value={view} options={views.map((v) => ({ value: v.key, href: v.href, label: <>{v.label}{"count" in v && v.count ? <span className="tnum text-[11.5px] text-warn">{v.count}</span> : null}</> }))} />
        </div>
      )}
      {view === "mine" && <Mine />}
      {view === "requests" && <Requests />}
      {view === "all" && <All />}
      {view === "calendar" && <Calendar />}
      {view === "balances" && <Balances />}
    </>
  );

  async function Mine() {
    const me = base.me;
    if (!me) return <EmptyState title="Your login is not linked to a staff record"><Words k="Ask HR to link it, or to apply leave for you." /></EmptyState>;
    const data = await withSchool(current.ctx, async (tx) => {
      const year = await leaveYearFor(tx, current.ctx, today, me.campusId);
      const balances = year ? (await balancesFor(tx, current.ctx, [me.id], year.id)).get(me.id) ?? [] : [];
      const requests = await tx.leaveRequest.findMany({ where: { staffId: me.id, archivedAt: null }, orderBy: { fromDate: "desc" }, take: 50 });
      return { year, balances, requests };
    });
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader title="My leave balance" description={data.year ? data.year.name : "No academic year is open."} />
          <CardBody>
            {data.balances.length === 0 ? <p className="text-ink-2"><Words k="No balance yet." /></p> : (
              <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {data.balances.map((b) => (
                  <li key={b.type.id} className="rounded-2xl border border-line px-4 py-3">
                    <p className="text-[12px] font-semibold text-ink3">{b.type.name}</p>
                    {b.limited ? (
                      <>
                        <p className="mt-0.5 font-display text-[21px] font-semibold tracking-tight tnum">{b.left}<span className="text-[13px] font-normal text-ink3"> <Words k="of" /> {b.given + b.adjusted} <Words k="left" /></span></p>
                        <p className="text-[12px] text-ink3">{b.used} <Words k="used" />{b.waiting ? ` · ${b.waiting} waiting` : ""}</p>
                      </>
                    ) : <p className="mt-1 font-semibold"><Words k="Unpaid, no limit" /></p>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <RequestList title="My requests" rows={data.requests.map((r) => ({ ...r, staffName: null }))} cancellable />
      </div>
    );
  }

  async function RequestList({ title, rows, cancellable, empty }: {
    title: string; cancellable?: boolean; empty?: string;
    rows: { id: string; staffId: string | null; staffName: string | null; leaveTypeId: string; fromDate: Date; toDate: Date; days: Prisma.Decimal; halfDay: boolean; reason: string; status: string; decisionReason: string | null; documentFileId: string | null }[];
  }) {
    const details = await withSchool(current.ctx, (tx) => tx.staffLeaveDetail.findMany({ where: { leaveRequestId: { in: rows.map((r) => r.id) } } }));
    return (
      <Card>
        <CardHeader title={title} description={cancellable ? "Approved leave can be cancelled before it ends; the balance comes back" : undefined} />
        <CardBody className="!pt-0">
          {rows.length === 0 ? <p className="text-ink3">{empty ?? "No leave yet."}</p> : (
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const d = details.find((x) => x.leaveRequestId === r.id);
                const type = base.types.find((t) => t.id === r.leaveTypeId)?.name ?? "Leave";
                const s = STATUS_WORDS[r.status] ?? STATUS_WORDS.CANCELLED;
                const ended = r.toDate < today;
                const canCancel = cancellable && (r.status === "WAITING" || (r.status === "APPROVED" && !ended)) && (canHr || r.staffId === viewer.staffId);
                return (
                  <li key={r.id} className="flex items-start gap-3 py-3">
                    {r.staffName && <Avatar name={r.staffName} photoFileId={null} size={38} />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {r.staffName && r.staffId ? <><Link href={`${BASE}/${r.staffId}?tab=leave`} className="hover:underline">{r.staffName}</Link> · </> : null}
                        {type}
                      </p>
                      <p className="text-[13px] text-ink3">
                        {formatDate(r.fromDate, tz)}{isoDay(r.fromDate) !== isoDay(r.toDate) ? ` to ${formatDate(r.toDate, tz)}` : ""} · {daysText(Number(r.days))}
                        {r.halfDay && d?.halfDayPart ? ` (${d.halfDayPart} half)` : ""}
                        {d && Number(d.lopDays) > 0 ? ` · ${daysText(Number(d.lopDays))} loss of pay` : ""}
                        {d && d.periodsAffected > 0 ? ` · ${d.periodsAffected} periods` : ""}
                      </p>
                      <p className="text-[13.5px] text-ink2">“{r.reason}”</p>
                      {r.decisionReason && r.status !== "APPROVED" && <p className="text-[13px] text-ink3"><Words k="Note:" /> {r.decisionReason}</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {r.documentFileId && <a href={`${BASE}/files/${r.documentFileId}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-2 text-brand-text hover:underline"><Words k="Document" /></a>}
                      {canCancel && <CancelLeaveForm requestId={r.id} action={cancelLeaveAction} started={r.status === "APPROVED" && r.fromDate <= today} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    );
  }

  async function Requests() {
    const data = await withSchool(current.ctx, async (tx) => {
      const approvals = await tx.approval.findMany({ where: base.approvalsWhere, orderBy: { createdAt: "asc" }, take: 100 });
      const requests = (await tx.leaveRequest.findMany({ where: { approvalId: { in: approvals.map((a) => a.id) } } })).filter((r) => !offCampus(viewer, r.staffId));
      const staff = await tx.staff.findMany({ where: { id: { in: requests.map((r) => r.staffId!).filter(Boolean) } }, select: { id: true, fullName: true, designation: true, campusId: true } });
      const details = await tx.staffLeaveDetail.findMany({ where: { leaveRequestId: { in: requests.map((r) => r.id) } } });
      const balances = new Map<string, Awaited<ReturnType<typeof balancesFor>> extends Map<string, infer R> ? R : never>();
      for (const s of staff) {
        const year = await leaveYearFor(tx, current.ctx, today, s.campusId);
        if (year) balances.set(s.id, (await balancesFor(tx, current.ctx, [s.id], year.id)).get(s.id) ?? []);
      }
      return { approvals, requests, staff, details, balances };
    });
    const away = await withSchool(current.ctx, async (tx) => {
      // Leave rows link to staff by id only: the staff this person sees (their campus; heads, their departments).
      const whose = await staffIdsWhere(tx, { AND: [campusStaffWhere(viewer), hr ? {} : { departmentId: { in: viewer.headOf } }] });
      const leaves = await tx.leaveRequest.findMany({ where: { staffId: { in: whose }, status: "APPROVED", archivedAt: null, fromDate: { lte: today }, toDate: { gte: today } }, orderBy: { toDate: "asc" }, take: 20 });
      const people = await tx.staff.findMany({ where: { id: { in: leaves.map((l) => l.staffId!) } }, select: { id: true, fullName: true, photoFileId: true } });
      return leaves.map((l) => ({ ...l, person: people.find((p) => p.id === l.staffId) }));
    });
    const side = (
      <Col>
        <Card>
          <CardHeader title="Away today" icon={CalendarDays} description={`${formatDate(today, tz)} · ${away.length} staff`} />
          {away.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="Nobody is on leave today." /></p> : (
            <ul className="space-y-3 px-5 pb-5">
              {away.map((l) => (
                <li key={l.id} className="flex items-center gap-3">
                  <Avatar name={l.person?.fullName ?? "Staff"} photoFileId={l.person?.photoFileId ?? null} size={38} />
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{l.person ? <Link href={`${BASE}/${l.person.id}?tab=leave`} className="hover:underline">{l.person.fullName}</Link> : "Staff"}</p>
                    <p className="text-[12.5px] text-ink3">{base.types.find((t) => t.id === l.leaveTypeId)?.name ?? "Leave"} <Words k="· back after" /> {formatDate(l.toDate, tz)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canHr && base.types.length > 0 && (
          <Card className="px-5 py-4">
            <p className="font-semibold"><Words k="Someone called in sick?" /></p>
            <p className="mt-1 text-[13.5px] text-ink3"><Words k="Apply on their behalf. It still goes to their approver, and they are told." /></p>
            <ButtonLink href={`${BASE}/leave?view=requests&apply=new`} icon={CalendarPlus} className="mt-3"><Words k="Apply for someone" /></ButtonLink>
          </Card>
        )}
      </Col>
    );
    if (data.approvals.length === 0) return (
      <Split>
        <Card><Empty icon={Inbox} title="Nothing waiting for you" body="Leave requests that need your decision show here." /></Card>
        {side}
      </Split>
    );
    return (
      <Split>
      <Card>
        <CardHeader title="Waiting for a decision" description="With the balance before this leave" action={<Pill tone="warn">{data.approvals.length} <Words k="waiting" /></Pill>} divided />
      <ul className="divide-y divide-line">
        {data.approvals.map((a) => {
          const r = data.requests.find((x) => x.approvalId === a.id);
          const s = r ? data.staff.find((x) => x.id === r.staffId) : undefined;
          const d = r ? data.details.find((x) => x.leaveRequestId === r.id) : undefined;
          const bal = s && r ? data.balances.get(s.id)?.find((b) => b.type.id === r.leaveTypeId) : undefined;
          return (
            <li key={a.id} className="flex items-start gap-3 px-5 py-4">
              <Avatar name={s?.fullName ?? "Staff"} photoFileId={null} size={40} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-semibold">{s ? <Link href={`${BASE}/${s.id}?tab=leave`} className="hover:underline">{s.fullName}</Link> : "Staff"}{s ? <span className="text-[13px] font-normal text-ink3"> · {s.designation}</span> : null}</p>
                  <p className="text-[12.5px] text-ink3">{formatDate(a.createdAt, tz)}</p>
                </div>
                <p className="text-[14px]">{a.summary}</p>
                {r && <p className="text-[13.5px] text-ink2">“{r.reason}”{r.documentFileId && <> · <a href={`${BASE}/files/${r.documentFileId}`} target="_blank" rel="noopener" className="font-semibold text-brand hover:underline"><Words k="document" /></a></>}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {bal?.limited && <Pill>{bal.type.name}: {daysText(bal.left)} <Words k="left before this" /></Pill>}
                  {d && d.periodsAffected > 0 && <Pill tone="warn">{d.periodsAffected} <Words k="periods need cover" /></Pill>}
                  {d?.onBehalf && <Pill tone="info"><Words k="Applied by HR for them" /></Pill>}
                  {a.status === "ESCALATED" && <Pill tone="warn"><Words k="Moved up: nobody decided in time" /></Pill>}
                </div>
                <div className="pt-1"><DecideButtons approvalId={a.id} approve={decideLeave} label={s?.fullName ?? "leave"} /></div>
              </div>
            </li>
          );
        })}
      </ul>
      </Card>
      {side}
      </Split>
    );
  }

  async function All() {
    const status = ["WAITING", "APPROVED", "REJECTED", "CANCELLED"].find((x) => x === one(sp.status));
    const range = periodFromSearch(sp, { timeZone: tz });
    const q = (one(sp.q) ?? "").trim().slice(0, 80);
    const data = await withSchool(current.ctx, async (tx) => {
      const within = range ? dateWhere(range) : null;
      // The Dashboard's "Staff on leave today" counts the same requests (allLeaveWhere, gap list G36).
      const rows = await tx.leaveRequest.findMany({
        where: await allLeaveWhere(tx, viewer, { status: status ?? null, within, q }),
        orderBy: { fromDate: "desc" }, take: 100,
      });
      const staff = await tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId!) } }, select: { id: true, fullName: true } });
      return rows.map((r) => ({ ...r, staffName: staff.find((s) => s.id === r.staffId)?.fullName ?? "Staff" }));
    });
    return (
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <Toolbar className="border-b-0">
            <ListToolbar placeholder="Staff name or staff ID" showArchived={false} period={{ timeZone: tz, allLabel: "Dates: any" }}
              filters={[{ key: "status", label: "Status", allLabel: "Every status", options: Object.entries(STATUS_WORDS).map(([k, v]) => ({ value: k, label: v.label })) }]} />
          </Toolbar>
        </Card>
        <RequestList title={status ? `${STATUS_WORDS[status].label} leave` : "All staff leave"} rows={data} cancellable empty="No leave matches." />
      </div>
    );
  }

  async function Calendar() {
    const m = one(sp.month);
    const from = monthStart(m && /^\d{4}-\d{2}$/.test(m) ? new Date(`${m}-01T00:00:00Z`) : today);
    const to = monthEnd(from);
    const dept = one(sp.department);
    const data = await withSchool(current.ctx, async (tx) => {
      const departments = await tx.department.findMany({ where: { archivedAt: null, ...(hr ? {} : { id: { in: viewer.headOf } }) }, orderBy: { name: "asc" } });
      const deptIds = dept && departments.some((d) => d.id === dept) ? [dept] : hr ? null : viewer.headOf;
      const staff = await tx.staff.findMany({ where: { archivedAt: null, ...(deptIds ? { departmentId: { in: deptIds } } : {}), AND: [campusStaffWhere(viewer)] }, select: { id: true, fullName: true, departmentId: true, campusId: true } });
      const leaves = await tx.leaveRequest.findMany({ where: { staffId: { in: staff.map((s) => s.id) }, status: { in: ["APPROVED", "WAITING"] }, archivedAt: null, fromDate: { lte: to }, toDate: { gte: from } }, orderBy: { fromDate: "asc" } });
      const holidays = await offDayMap(tx, current.ctx, from, to, viewer.campusId ?? base.me?.campusId ?? null);
      return { departments, staff, leaves, holidays };
    });
    const prev = isoDay(addDays(from, -1)).slice(0, 7);
    const next = isoDay(addDays(to, 1)).slice(0, 7);
    const q = (month: string) => `${BASE}/leave?view=calendar&month=${month}${dept ? `&department=${dept}` : ""}`;
    const label = (l: (typeof data.leaves)[number]) => {
      const t = base.types.find((x) => x.id === l.leaveTypeId);
      const rule = base.rules.find((r) => r.leaveTypeId === l.leaveTypeId);
      const s = data.staff.find((x) => x.id === l.staffId);
      return calendarLabel({ typeName: t?.name ?? "Leave", sensitive: rule?.sensitive ?? false, viewerIsHr: viewer.restricted, viewerIsStaff: l.staffId === viewer.staffId, viewerIsApprover: Boolean(s?.departmentId && viewer.headOf.includes(s.departmentId)) });
    };
    const days = eachDay(from, to).filter((d) => data.holidays.get(isoDay(d))?.reason !== "sunday");
    const busy = days.map((d) => ({ d, people: data.leaves.filter((l) => l.fromDate <= d && l.toDate >= d) })).filter((x) => x.people.length || data.holidays.get(isoDay(x.d))?.reason === "holiday");
    return (
      <Card>
        <CardHeader title={`Who is on leave, ${monthLabel(from)}`} description="Approved leave, and leave waiting for a decision (marked)."
          action={<div className="flex gap-2"><ButtonLink size="sm" href={q(prev)}><Words k="‹ Previous" /></ButtonLink><ButtonLink size="sm" href={q(next)}><Words k="Next ›" /></ButtonLink></div>} />
        <CardBody className="space-y-4">
          {data.departments.length > 1 && (
            <form className="flex flex-wrap items-end gap-2" action={`${BASE}/leave`}>
              <input type="hidden" name="view" value="calendar" />
              <input type="hidden" name="month" value={isoDay(from).slice(0, 7)} />
              <div>
                <label htmlFor="cal-dept" className="mb-1 block text-sm font-medium"><Words k="Department" /></label>
                <select id="cal-dept" name="department" defaultValue={dept ?? ""} className="min-h-11 rounded-lg border border-line-strong bg-surface px-3">
                  <option value="">{hr ? "All departments" : "My departments"}</option>
                  {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button className={buttonClass("secondary")}><Words k="Show" /></button>
            </form>
          )}
          {busy.length === 0 ? <p className="text-ink-2"><Words k="Nobody is on leave this month." /></p> : (
            <ul className="divide-y divide-line">
              {busy.map(({ d, people }) => (
                <li key={isoDay(d)} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]">
                  <span className={`font-medium ${isoDay(d) === isoDay(today) ? "text-brand-text" : ""}`}>{formatDate(d, tz)} <span className="text-sm font-normal text-ink-2">{d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}</span></span>
                  <span className="flex flex-wrap gap-2">
                    {data.holidays.has(isoDay(d)) && <Badge>{data.holidays.get(isoDay(d))!.reason === "holiday" ? "Holiday" : data.holidays.get(isoDay(d))!.title ?? "Day off"}</Badge>}
                    {people.map((l) => {
                      const s = data.staff.find((x) => x.id === l.staffId);
                      return <Badge key={l.id} tone={l.status === "APPROVED" ? "brand" : "warning"}>{s?.fullName}: {label(l)}{l.halfDay ? " (half)" : ""}{l.status === "WAITING" ? " (waiting)" : ""}</Badge>;
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    );
  }

  async function Balances() {
    const yearId = one(sp.year);
    const data = await withSchool(current.ctx, async (tx) => {
      // One campus: only that campus's years. The year shown first is the person's own campus's year holding today.
      const years = await tx.academicYear.findMany({ where: { archivedAt: null, ...(viewer.campusId ? { campusId: viewer.campusId } : {}) }, orderBy: { startDate: "desc" } });
      const mine = await personCampusId(tx, current.ctx, viewer);
      const holdsToday = (y: (typeof years)[number]) => y.startDate <= today && y.endDate >= today;
      const current_ = years.find((y) => y.id === yearId) ?? years.find((y) => y.campusId === mine && holdsToday(y)) ?? years.find(holdsToday) ?? years[0];
      // Two campuses have two years of the same name: each is shown with its campus.
      const campusIds = [...new Set(years.map((y) => y.campusId))];
      const names = new Map<string, string>(campusIds.length > 1 ? (await tx.campus.findMany({ where: { id: { in: campusIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name] as const) : []);
      if (!current_) return { years, names, year: null, staff: [], balances: new Map() as Awaited<ReturnType<typeof balancesFor>> };
      const staff = await tx.staff.findMany({ where: { archivedAt: null, campusId: current_.campusId, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [campusStaffWhere(viewer)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } });
      const balances = await balancesFor(tx, current.ctx, staff.map((s) => s.id), current_.id);
      return { years, names, year: current_, staff, balances };
    });
    const yearLabel = (y: { name: string; campusId: string }) => (data.names.get(y.campusId) ? `${y.name} · ${data.names.get(y.campusId)}` : y.name);
    if (!data.year) return <EmptyState title="No academic year yet"><Words k="Balances are kept per academic year. Add one in Academic Management." /></EmptyState>;
    const paid = base.types.filter((t) => t.paid);
    return (
      <Card>
        <CardHeader title={`Leave balances, ${yearLabel(data.year)}`} description="Days left of each leave type. Adjust a balance with a reason; every change is kept."
          action={canHr ? <CarryForwardForm years={data.years.map((y) => ({ value: y.id, label: yearLabel(y) }))} action={carryForwardAction} /> : undefined} />
        <CardBody>
          {data.years.length > 1 && (
            <nav aria-label="Academic year" className="mb-3 flex flex-wrap gap-2">
              {data.years.map((y) => <Link key={y.id} href={`${BASE}/leave?view=balances&year=${y.id}`} aria-current={y.id === data.year!.id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 ${y.id === data.year!.id ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-2"}`}>{yearLabel(y)}</Link>)}
            </nav>
          )}
          <div className="relative overflow-x-auto [contain:inline-size]">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only"><Words k="Leave left for each staff member" /></caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="p-2"><Words k="Staff" /></th>
                  {paid.map((t) => <th key={t.id} scope="col" className="p-2">{t.name}</th>)}
                  {canHr && <th scope="col" className="p-2"><span className="sr-only"><Words k="Actions" /></span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.staff.map((s) => {
                  const rows = data.balances.get(s.id) ?? [];
                  return (
                    <tr key={s.id}>
                      <th scope="row" className="p-2 font-medium"><Link href={`${BASE}/${s.id}?tab=leave`} className="hover:underline">{s.fullName}</Link></th>
                      {paid.map((t) => {
                        const b = rows.find((r) => r.type.id === t.id);
                        return <td key={t.id} className="p-2" title={b?.adjustments.map((a) => `${a.days > 0 ? "+" : ""}${a.days}: ${a.reason}`).join("\n")}>{b ? <>{b.left}<span className="text-ink-2"> / {b.given + b.adjusted}</span>{b.adjusted ? <span className="text-xs text-ink-2"> ({b.adjusted > 0 ? "+" : ""}{b.adjusted})</span> : null}</> : "–"}</td>;
                      })}
                      {canHr && <td className="p-2 text-right"><AdjustBalanceForm staffId={s.id} staffName={s.fullName} academicYearId={data.year!.id} types={paid.map((t) => ({ value: t.id, label: t.name }))} action={adjustBalanceAction} /></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-ink-2"><Words k="Shown as days left / days allocated. Days beyond the balance are loss of pay where HR Settings allow it." /></p>
        </CardBody>
      </Card>
    );
  }
}
