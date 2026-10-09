import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { day, eachDay, isoDay, monthEnd, monthLabel, monthStart } from "@/lib/staff/dates";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { readMonth } from "@/lib/attendance/register";
import { lockState, dayText } from "@/lib/attendance/marks";
import { dayInfo, offDayMessage, schoolDays } from "@/lib/attendance/calendar";
import { staffDay } from "@/lib/attendance/staff";
import { METHOD_WORDS, statusList, statusesFor } from "@/lib/attendance/settings";
import { attendanceSummary, percentText } from "@/lib/attendance/summary";
import { clockHHMM, minutesText, time12 } from "@/lib/attendance/time";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ExportLinks, Stat, SubNav } from "../../staff-hr-management/_components/bits";
import { Cell, Legend, type StatusView } from "../_components/status";
import { UrlFilters } from "../_components/url-filters";
import { StaffSheet } from "../_components/staff-sheet";
import { ArchiveOvertime, ArchiveShift, AssignShiftForm, OvertimeForm, ShiftForm } from "../_components/staff-forms";
import { archiveOvertimeAction, archiveShiftAction, assignShiftAction, recordOvertimeAction, saveShiftAction } from "./actions";

export const metadata: Metadata = { title: "Staff Attendance" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const ym = (d: Date) => isoDay(d).slice(0, 7);

export default async function StaffAttendancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, settings, features, tz, today, now } = await attendancePage();
  if (access.staff === "none") redirect(BASE);
  const all = access.staff === "all";
  const canEdit = all && access.change !== "none";
  const overtimeOn = features.has("attendance-overtime");
  const shiftsOn = features.has("attendance-shifts");
  const views = [
    { key: "day", label: all ? "Daily" : "Today", href: `${BASE}/staff` },
    { key: "month", label: all ? "Monthly" : "My month", href: `${BASE}/staff?view=month` },
    ...(all && overtimeOn ? [{ key: "overtime", label: "Overtime", href: `${BASE}/staff?view=overtime` }] : []),
    ...(all && shiftsOn ? [{ key: "shifts", label: "Shifts", href: `${BASE}/staff?view=shifts` }] : []),
  ];
  const view = views.find((v) => v.key === one(sp.view))?.key ?? "day";
  const wanted = one(sp.date);
  const date = wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) && day(wanted) <= today ? day(wanted) : today;
  const month = readMonth(one(sp.month)) ?? monthStart(today);

  const statuses: StatusView[] = await withSchool(current.ctx, async (tx) =>
    statusesFor(await statusList(tx, current.ctx), "staff").map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone })));

  return (
    <>
      <PageHeader title="Staff Attendance" href={`${BASE}/staff`} userId={current.user.id}>
        {all && view === "day" && <ExportLinks href={`${BASE}/staff/export?date=${isoDay(date)}`} />}
        {view === "month" && <ExportLinks href={`${BASE}/staff/export?month=${ym(month)}`} />}
      </PageHeader>
      <SubNav items={views} current={view} />
      {view === "day" && <DayView />}
      {view === "month" && <MonthView />}
      {view === "overtime" && <OvertimeView />}
      {view === "shifts" && <ShiftsView />}
    </>
  );

  async function DayView() {
    const dept = one(sp.department) ?? "";
    const status = one(sp.status) ?? "";
    const data = await withSchool(current.ctx, async (tx) => ({
      info: await dayInfo(tx, current.ctx, date, access.campusId),
      rows: await staffDay(tx, current.ctx, access, date, { departmentId: dept || undefined, status: status || undefined }),
      departments: all ? await tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    }));
    const lock = lockState(settings, date, now, tz);
    const late = data.rows.filter((r) => (r.mark?.lateMinutes ?? 0) > 0 && ["late", "half-day"].includes(r.mark?.statusKey ?? ""));
    return (
      <>
        <UrlFilters fields={[
          { name: "date", label: "Date", type: "date", value: isoDay(date), max: isoDay(today) },
          ...(all ? [
            { name: "department", label: "Department", type: "select" as const, value: dept, allLabel: "All departments", options: data.departments.map((d) => ({ value: d.id, label: d.name })) },
            { name: "status", label: "Status", type: "select" as const, value: status, allLabel: "Any status", options: [...statuses.map((s) => ({ value: s.key, label: s.name })), { value: "not-marked", label: "Not marked" }] },
          ] : []),
        ]} />
        {!data.info.on ? (
          <Alert tone="warning" title={offDayMessage(data.info, date)}>If the school opens that day, turn on &quot;allow attendance&quot; for the date in the School Calendar.</Alert>
        ) : data.rows.length === 0 ? (
          <EmptyState title={dept || status ? "No staff match" : all ? "No staff yet" : "Your login is not linked to a staff record"}>
            {dept || status ? "Choose another department or status." : all ? "Staff appear here once they are added in Staff & HR Management." : "Ask HR to link your login to your staff record."}
          </EmptyState>
        ) : (
          <>
            {all && late.length > 0 && (
              <p className="mb-3 text-sm text-warn-text">{late.length} late today: {late.slice(0, 5).map((r) => `${r.name} (${r.mark!.lateMinutes} min)`).join(", ")}{late.length > 5 ? ` and ${late.length - 5} more` : ""}.</p>
            )}
            <StaffSheet key={isoDay(date)} date={isoDay(date)} dateText={dayText(date)} statuses={statuses} canEdit={canEdit}
              locked={lock.locked} lockText={lock.atText} override={access.lockOverride}
              correctionHref={`${BASE}/register/correction?for=staff&date=${isoDay(date)}`}
              rows={data.rows.map((r) => ({
                id: r.staffId, name: r.name, code: r.staffCode, designation: r.designation, department: r.department,
                shift: r.shift.shiftName, start: time12(r.shift.startTime), onLeave: r.onLeave,
                statusKey: r.mark?.statusKey ?? null, inTime: r.mark?.inTime ? clockHHMM(r.mark.inTime, tz) : "", outTime: r.mark?.outTime ? clockHHMM(r.mark.outTime, tz) : "",
                method: r.mark?.method ?? null, methodText: r.mark ? `Source: ${METHOD_WORDS[r.mark.method] ?? r.mark.method}` : null,
                lateMinutes: r.mark?.lateMinutes ?? null, note: r.mark?.note ?? "", overtime: r.overtimeMinutes ? minutesText(r.overtimeMinutes) : null,
              }))} />
          </>
        )}
      </>
    );
  }

  async function MonthView() {
    const from = monthStart(month);
    const to = monthEnd(month);
    const data = await withSchool(current.ctx, async (tx) => {
      const staff = await tx.staff.findMany({
        where: { archivedAt: null, joiningDate: { lte: to }, ...(all ? { status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } } : { id: access.staffId ?? "00000000-0000-0000-0000-000000000000" }) },
        orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true },
      });
      const [sum, days] = await Promise.all([
        attendanceSummary(tx, current.ctx, { staffIds: staff.map((s) => s.id), from, to, today, campusId: access.campusId }),
        schoolDays(tx, current.ctx, from, to, access.campusId),
      ]);
      return { staff, sum, days };
    });
    const dates = eachDay(from, to).map((d) => ({ iso: isoDay(d), day: d.getUTCDate(), off: data.days.info(d).on ? null : data.days.info(d).title }));
    const byKey = new Map(statuses.map((s) => [s.key, s]));
    return (
      <div className="space-y-3">
        <UrlFilters fields={[{ name: "month", label: "Month", type: "month", value: ym(month), max: ym(today) }]} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Working days" value={data.sum.workingDays} />
          <Stat label={all ? "Staff attendance" : "My attendance"} value={percentText(data.sum.overall.percent)} />
          <Stat label="Late marks" value={data.sum.overall.late} tone={data.sum.overall.late ? "warning" : undefined} />
          <Stat label="Leave days" value={data.sum.overall.leave} />
        </div>
        <Legend statuses={statuses} />
        {data.staff.length === 0 ? (
          <EmptyState title="Nobody to show">{all ? "No staff for this month." : "Your login is not linked to a staff record. Ask HR."}</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface" tabIndex={0} role="region" aria-label={`Staff attendance, ${monthLabel(from)}`}>
            <table className="w-max min-w-full border-collapse text-sm">
              <caption className="sr-only">Staff attendance for {monthLabel(from)}</caption>
              <thead className="bg-surface-2 text-ink-2">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-44 border-b border-r border-line bg-surface-2 px-3 py-2 text-left font-medium">Staff</th>
                  {dates.map((d) => <th key={d.iso} scope="col" title={d.off ?? undefined} className={`w-8 border-b border-line px-0.5 py-2 text-center font-medium ${d.off ? "bg-surface-3" : ""}`}>{d.day}</th>)}
                  <th scope="col" className="border-b border-l border-line px-2 text-right font-medium">Present</th>
                  <th scope="col" className="border-b border-line px-2 text-right font-medium">Late</th>
                  <th scope="col" className="border-b border-line px-2 text-right font-medium">Leave</th>
                  <th scope="col" className="border-b border-line px-3 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => {
                  const p = data.sum.people.get(s.id)!;
                  const marks = data.sum.days.get(s.id) ?? new Map<string, string>();
                  return (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <th scope="row" className="sticky left-0 z-10 border-r border-line bg-surface px-3 py-1.5 text-left font-medium">{s.fullName} <span className="font-normal text-ink-2">{s.staffCode}</span></th>
                      {dates.map((d) => d.off
                        ? <td key={d.iso} className="bg-surface-3" title={d.off}><span className="sr-only">{d.off}</span></td>
                        : <td key={d.iso} className="px-0.5 py-0.5 text-center"><Cell status={marks.get(d.iso) ? byKey.get(marks.get(d.iso)!) : undefined} label={`${s.fullName}, ${d.day}`} /></td>)}
                      <td className="border-l border-line px-2 text-right tabular-nums">{p.present}</td>
                      <td className="px-2 text-right tabular-nums">{p.late}</td>
                      <td className="px-2 text-right tabular-nums">{p.leave}</td>
                      <td className="px-3 text-right font-medium tabular-nums">{percentText(p.percent)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="bg-surface-2"><td colSpan={dates.length + 5} className="px-3 py-2 text-ink-2">{data.sum.workingDays} working days. Holidays and Sundays are not counted. This month reaches Generate Salary with present days, leave and late marks.</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    );
  }

  async function OvertimeView() {
    const from = monthStart(month);
    const to = monthEnd(month);
    const data = await withSchool(current.ctx, async (tx) => {
      const [rows, staff] = await Promise.all([
        tx.overtimeEntry.findMany({ where: { archivedAt: null, date: { gte: from, lte: to } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 }),
        tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } }),
      ]);
      return { rows, staff };
    });
    const names = new Map(data.staff.map((s) => [s.id, s.fullName]));
    const total = data.rows.reduce((s, r) => s + r.minutes, 0);
    return (
      <Card>
        <CardHeader title={`Overtime, ${monthLabel(from)}`} description={data.rows.length ? `${data.rows.length} entries, ${minutesText(total)} in all.` : undefined}
          action={canEdit ? <OvertimeForm action={recordOvertimeAction} today={isoDay(today)} staff={data.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode})` }))} /> : undefined} />
        <CardBody>
          <UrlFilters fields={[{ name: "month", label: "Month", type: "month", value: ym(month), max: ym(today) }]}>
            <a href={`${BASE}/staff/export?view=overtime&month=${ym(month)}&format=xlsx`} className={buttonClass("secondary", "md")} download>Export</a>
          </UrlFilters>
          {data.rows.length === 0 ? (
            <EmptyState title="No overtime this month">Record overtime with a note when staff work extra hours.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium">{names.get(r.staffId) ?? "Staff member"} <span className="font-normal text-ink-2">· {formatDate(r.date, "UTC")}</span></p>
                    <p className="text-sm text-ink-2">{minutesText(r.minutes)}{r.note ? ` · ${r.note}` : ""}</p>
                  </div>
                  {canEdit && <ArchiveOvertime id={r.id} action={archiveOvertimeAction} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    );
  }

  async function ShiftsView() {
    const data = await withSchool(current.ctx, async (tx) => {
      const [shifts, staff, assignments] = await Promise.all([
        tx.staffShift.findMany({ orderBy: [{ archivedAt: "asc" }, { startTime: "asc" }] }),
        tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } }),
        tx.staffShiftAssignment.findMany({ where: { archivedAt: null, fromDate: { lte: today } }, orderBy: { fromDate: "desc" }, include: { shift: true } }),
      ]);
      return { shifts, staff, assignments };
    });
    const currentShift = new Map<string, string>();
    for (const a of data.assignments) if (!currentShift.has(a.staffId) && !a.shift.archivedAt) currentShift.set(a.staffId, a.shift.name);
    const count = (id: string) => [...currentShift.values()].filter((n) => n === data.shifts.find((s) => s.id === id)?.name).length;
    const active = data.shifts.filter((s) => !s.archivedAt);
    return (
      <Card>
        <CardHeader title="Staff shifts" description={`Staff without a shift start at ${time12(settings.staffStartTime)} (Attendance Settings). Late marks follow each shift's start time.`}
          action={canEdit ? <div className="flex flex-wrap gap-2"><ShiftForm action={saveShiftAction} />{active.length > 0 && <AssignShiftForm action={assignShiftAction} today={isoDay(today)} shifts={active.map((s) => ({ value: s.id, label: `${s.name} (${time12(s.startTime)} to ${time12(s.endTime)})` }))} staff={data.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode})`, current: currentShift.get(s.id) ?? "School hours" }))} />}</div> : undefined} />
        <CardBody>
          {data.shifts.length === 0 ? (
            <EmptyState title="No shifts yet">Add a shift, such as Morning 7:00 AM to 1:00 PM, then assign staff to it.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.shifts.map((s) => (
                <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${s.archivedAt ? "text-ink-2" : ""}`}>
                  <div>
                    <p className="font-medium">{s.name}{s.archivedAt ? " (archived)" : ""}</p>
                    <p className="text-sm text-ink-2">{time12(s.startTime)} to {time12(s.endTime)} · late after {s.lateAfterMin ?? settings.staffLateAfterMin} minutes · {count(s.id)} staff</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      {!s.archivedAt && <ShiftForm action={saveShiftAction} shift={s} />}
                      <ArchiveShift id={s.id} action={archiveShiftAction} restore={Boolean(s.archivedAt)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm"><Link href={`${BASE}/staff`} className="font-medium text-brand-text hover:underline">Back to the daily list</Link></p>
        </CardBody>
      </Card>
    );
  }
}
