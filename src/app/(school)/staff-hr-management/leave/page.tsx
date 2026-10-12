import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { approvalsFor } from "@/lib/approvals";
import { staffPage, BASE } from "@/lib/staff/page";
import { balancesFor, calendarLabel, daysText, leaveYearFor } from "@/lib/staff/leave";
import { addDays, eachDay, isoDay, isoWeekday, monthEnd, monthLabel, monthStart } from "@/lib/staff/dates";
import { holidaySet } from "@/lib/staff/leave";
import { StaffHead } from "../_components/head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SubNav } from "../_components/bits";
import { AdjustBalanceForm, ApplyLeaveForm, CancelLeaveForm, CarryForwardForm, DecideButtons } from "./leave-forms";
import { adjustBalanceAction, applyLeaveAction, cancelLeaveAction, carryForwardAction, decideLeave, previewLeave } from "./actions";

export const metadata: Metadata = { title: "Staff Leave" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_WORDS: Record<string, { label: string; tone: BadgeTone }> = {
  WAITING: { label: "Waiting", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Not approved", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function StaffLeavePage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, viewer, tz, today } = await staffPage();
  const hr = viewer.see === "all";
  const canHr = viewer.change === "all";
  const calendarAllowed = hr || viewer.headOf.length > 0;

  const base = await withSchool(current.ctx, async (tx) => {
    const roleKeys = current.roles.map((r) => r.key);
    const where = await approvalsFor(tx, current.ctx, roleKeys, { type: "staff-leave" });
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
    ...(base.waitingForMe > 0 || hr || viewer.headOf.length ? [{ key: "requests", label: "Requests to decide", href: `${BASE}/leave?view=requests`, count: base.waitingForMe }] : []),
    ...(hr ? [{ key: "all", label: "All leave", href: `${BASE}/leave?view=all` }] : []),
    ...(calendarAllowed ? [{ key: "calendar", label: "Calendar", href: `${BASE}/leave?view=calendar` }] : []),
    ...(hr ? [{ key: "balances", label: "Balances", href: `${BASE}/leave?view=balances` }] : []),
  ];
  const wanted = one(sp.view);
  const view = views.find((v) => v.key === wanted)?.key ?? (base.waitingForMe > 0 && !viewer.staffId ? "requests" : views[0]?.key ?? "mine");

  // Apply form: HR may apply for anyone; ?apply=<staffId> opens it for that person.
  const applyFor = one(sp.apply);
  const staffOptions = canHr
    ? await withSchool(current.ctx, (tx) => tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } }))
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
      {base.types.length === 0 && <Alert tone="warning" className="mb-4">No staff leave types yet. {canHr ? <Link href={`${BASE}/settings?view=leave`} className="underline">Add them in HR Settings.</Link> : "Ask HR to add them."}</Alert>}
      {views.length > 1 && <SubNav current={view} items={views} />}
      {view === "mine" && <Mine />}
      {view === "requests" && <Requests />}
      {view === "all" && <All />}
      {view === "calendar" && <Calendar />}
      {view === "balances" && <Balances />}
    </>
  );

  async function Mine() {
    const me = base.me;
    if (!me) return <EmptyState title="Your login is not linked to a staff record">Ask HR to link it, or to apply leave for you.</EmptyState>;
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
            {data.balances.length === 0 ? <p className="text-ink-2">No balance yet.</p> : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.balances.map((b) => (
                  <li key={b.type.id} className="rounded-xl border border-line p-3">
                    <p className="text-sm text-ink-2">{b.type.name}</p>
                    {b.limited ? (
                      <>
                        <p className="text-2xl font-semibold">{b.left}<span className="text-sm font-normal text-ink-2"> left</span></p>
                        <p className="text-xs text-ink-2">{b.given + b.adjusted} allocated · {b.used} used{b.waiting ? ` · ${b.waiting} waiting` : ""}</p>
                      </>
                    ) : <p className="font-medium">Unpaid, no limit</p>}
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
        <CardHeader title={title} />
        <CardBody>
          {rows.length === 0 ? <p className="text-ink-2">{empty ?? "No leave yet."}</p> : (
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const d = details.find((x) => x.leaveRequestId === r.id);
                const type = base.types.find((t) => t.id === r.leaveTypeId)?.name ?? "Leave";
                const s = STATUS_WORDS[r.status] ?? STATUS_WORDS.CANCELLED;
                const ended = r.toDate < today;
                const canCancel = cancellable && (r.status === "WAITING" || (r.status === "APPROVED" && !ended)) && (canHr || r.staffId === viewer.staffId);
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {r.staffName && r.staffId ? <><Link href={`${BASE}/${r.staffId}?tab=leave`} className="hover:underline">{r.staffName}</Link> · </> : null}
                        {type}
                      </p>
                      <p className="text-sm text-ink-2">
                        {formatDate(r.fromDate, tz)}{isoDay(r.fromDate) !== isoDay(r.toDate) ? ` to ${formatDate(r.toDate, tz)}` : ""} · {daysText(Number(r.days))}
                        {r.halfDay && d?.halfDayPart ? ` (${d.halfDayPart} half)` : ""}
                        {d && Number(d.lopDays) > 0 ? ` · ${daysText(Number(d.lopDays))} loss of pay` : ""}
                        {d && d.periodsAffected > 0 ? ` · ${d.periodsAffected} periods` : ""}
                      </p>
                      <p className="text-sm">{r.reason}</p>
                      {r.decisionReason && r.status !== "APPROVED" && <p className="text-sm text-ink-2">Note: {r.decisionReason}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {r.documentFileId && <a href={`${BASE}/files/${r.documentFileId}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-2 text-brand-text hover:underline">Document</a>}
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
      const requests = await tx.leaveRequest.findMany({ where: { approvalId: { in: approvals.map((a) => a.id) } } });
      const staff = await tx.staff.findMany({ where: { id: { in: requests.map((r) => r.staffId!).filter(Boolean) } }, select: { id: true, fullName: true, designation: true, campusId: true } });
      const details = await tx.staffLeaveDetail.findMany({ where: { leaveRequestId: { in: requests.map((r) => r.id) } } });
      const balances = new Map<string, Awaited<ReturnType<typeof balancesFor>> extends Map<string, infer R> ? R : never>();
      for (const s of staff) {
        const year = await leaveYearFor(tx, current.ctx, today, s.campusId);
        if (year) balances.set(s.id, (await balancesFor(tx, current.ctx, [s.id], year.id)).get(s.id) ?? []);
      }
      return { approvals, requests, staff, details, balances };
    });
    if (data.approvals.length === 0) return <EmptyState title="Nothing waiting for you">Leave requests that need your decision show here.</EmptyState>;
    return (
      <ul className="space-y-3">
        {data.approvals.map((a) => {
          const r = data.requests.find((x) => x.approvalId === a.id);
          const s = r ? data.staff.find((x) => x.id === r.staffId) : undefined;
          const d = r ? data.details.find((x) => x.leaveRequestId === r.id) : undefined;
          const bal = s && r ? data.balances.get(s.id)?.find((b) => b.type.id === r.leaveTypeId) : undefined;
          return (
            <li key={a.id}>
              <Card>
                <CardBody className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{s ? <Link href={`${BASE}/${s.id}?tab=leave`} className="hover:underline">{s.fullName}</Link> : "Staff"}{s ? <span className="font-normal text-ink-2"> · {s.designation}</span> : null}</p>
                    <p>{a.summary}</p>
                    {r && <p className="text-sm text-ink-2">Reason: {r.reason}</p>}
                    {bal?.limited && <p className="text-sm text-ink-2">{bal.type.name} left before this: {daysText(bal.left)}</p>}
                    {d?.onBehalf && <p className="text-sm text-ink-2">Applied by HR for them.</p>}
                    <p className="text-xs text-ink-2">Asked {formatDate(a.createdAt, tz)}{a.status === "ESCALATED" ? " · Moved up because nobody decided in time" : ""}</p>
                    {r?.documentFileId && <a href={`${BASE}/files/${r.documentFileId}`} target="_blank" rel="noopener" className="text-sm text-brand-text underline">Open document</a>}
                  </div>
                  <DecideButtons approvalId={a.id} approve={decideLeave} label={s?.fullName ?? "leave"} />
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
    );
  }

  async function All() {
    const status = ["WAITING", "APPROVED", "REJECTED", "CANCELLED"].find((x) => x === one(sp.status));
    const data = await withSchool(current.ctx, async (tx) => {
      const rows = await tx.leaveRequest.findMany({
        where: { staffId: { not: null }, archivedAt: null, ...(status ? { status: status as "WAITING" } : {}) },
        orderBy: { fromDate: "desc" }, take: 100,
      });
      const staff = await tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId!) } }, select: { id: true, fullName: true } });
      return rows.map((r) => ({ ...r, staffName: staff.find((s) => s.id === r.staffId)?.fullName ?? "Staff" }));
    });
    return (
      <div className="space-y-4">
        <nav aria-label="Status" className="flex flex-wrap gap-2">
          {[["", "All"], ["WAITING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Not approved"], ["CANCELLED", "Cancelled"]].map(([k, l]) => (
            <Link key={k} href={`${BASE}/leave?view=all${k ? `&status=${k}` : ""}`} aria-current={(status ?? "") === k ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 ${(status ?? "") === k ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-2"}`}>{l}</Link>
          ))}
        </nav>
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
      const staff = await tx.staff.findMany({ where: { archivedAt: null, ...(deptIds ? { departmentId: { in: deptIds } } : {}) }, select: { id: true, fullName: true, departmentId: true, campusId: true } });
      const leaves = await tx.leaveRequest.findMany({ where: { staffId: { in: staff.map((s) => s.id) }, status: { in: ["APPROVED", "WAITING"] }, archivedAt: null, fromDate: { lte: to }, toDate: { gte: from } }, orderBy: { fromDate: "asc" } });
      const holidays = await holidaySet(tx, current.ctx, from, to, base.me?.campusId ?? null);
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
    const days = eachDay(from, to).filter((d) => isoWeekday(d) !== 7);
    const busy = days.map((d) => ({ d, people: data.leaves.filter((l) => l.fromDate <= d && l.toDate >= d) })).filter((x) => x.people.length || data.holidays.has(isoDay(x.d)));
    return (
      <Card>
        <CardHeader title={`Who is on leave, ${monthLabel(from)}`} description="Approved leave, and leave waiting for a decision (marked)."
          action={<div className="flex gap-2"><ButtonLink size="sm" href={q(prev)}>‹ Previous</ButtonLink><ButtonLink size="sm" href={q(next)}>Next ›</ButtonLink></div>} />
        <CardBody className="space-y-4">
          {data.departments.length > 1 && (
            <form className="flex flex-wrap items-end gap-2" action={`${BASE}/leave`}>
              <input type="hidden" name="view" value="calendar" />
              <input type="hidden" name="month" value={isoDay(from).slice(0, 7)} />
              <div>
                <label htmlFor="cal-dept" className="mb-1 block text-sm font-medium">Department</label>
                <select id="cal-dept" name="department" defaultValue={dept ?? ""} className="min-h-11 rounded-lg border border-line-strong bg-surface px-3">
                  <option value="">{hr ? "All departments" : "My departments"}</option>
                  {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button className={buttonClass("secondary")}>Show</button>
            </form>
          )}
          {busy.length === 0 ? <p className="text-ink-2">Nobody is on leave this month.</p> : (
            <ul className="divide-y divide-line">
              {busy.map(({ d, people }) => (
                <li key={isoDay(d)} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]">
                  <span className={`font-medium ${isoDay(d) === isoDay(today) ? "text-brand-text" : ""}`}>{formatDate(d, tz)} <span className="text-sm font-normal text-ink-2">{d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}</span></span>
                  <span className="flex flex-wrap gap-2">
                    {data.holidays.has(isoDay(d)) && <Badge>Holiday</Badge>}
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
      const years = await tx.academicYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "desc" } });
      const current_ = years.find((y) => y.id === yearId) ?? years.find((y) => y.startDate <= today && y.endDate >= today) ?? years[0];
      if (!current_) return { years, year: null, staff: [], balances: new Map() as Awaited<ReturnType<typeof balancesFor>> };
      const staff = await tx.staff.findMany({ where: { archivedAt: null, campusId: current_.campusId, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } });
      const balances = await balancesFor(tx, current.ctx, staff.map((s) => s.id), current_.id);
      return { years, year: current_, staff, balances };
    });
    if (!data.year) return <EmptyState title="No academic year yet">Balances are kept per academic year. Add one in Academic Management.</EmptyState>;
    const paid = base.types.filter((t) => t.paid);
    return (
      <Card>
        <CardHeader title={`Leave balances, ${data.year.name}`} description="Days left of each leave type. Adjust a balance with a reason; every change is kept."
          action={canHr ? <CarryForwardForm years={data.years.map((y) => ({ value: y.id, label: y.name }))} action={carryForwardAction} /> : undefined} />
        <CardBody>
          {data.years.length > 1 && (
            <nav aria-label="Academic year" className="mb-3 flex flex-wrap gap-2">
              {data.years.map((y) => <Link key={y.id} href={`${BASE}/leave?view=balances&year=${y.id}`} aria-current={y.id === data.year!.id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 ${y.id === data.year!.id ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-2"}`}>{y.name}</Link>)}
            </nav>
          )}
          <div className="relative overflow-x-auto [contain:inline-size]">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">Leave left for each staff member</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="p-2">Staff</th>
                  {paid.map((t) => <th key={t.id} scope="col" className="p-2">{t.name}</th>)}
                  {canHr && <th scope="col" className="p-2"><span className="sr-only">Actions</span></th>}
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
          <p className="mt-3 text-sm text-ink-2">Shown as days left / days allocated. Days beyond the balance are loss of pay where HR Settings allow it.</p>
        </CardBody>
      </Card>
    );
  }
}
