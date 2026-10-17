// The Student Profile's Attendance tab (03 Student Management, 05 §4 Sends):
// the year's %, this month as a calendar, month by month, open flags and
// leave. Imported by src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { CalendarCheck2, CalendarDays, ChartColumn, TriangleAlert, UserCheck, UserX, Clock } from "lucide-react";
import { withSchool } from "../db";
import { formatDate } from "../format";
import { registerProfileTab } from "../students/profile-tabs";
import { todayIn } from "../staff/dates";
import { can } from "../permissions";
import { studentAttendanceTab } from "./integrations";
import { attendanceSettings } from "./settings";
import { attendanceAccess } from "./access";
import { parseMonth, studentCalendarFor } from "./calendar-months";
import { percentText } from "./summary";
import { attendanceFeatures } from "./settings";
import { REASONS_FEATURE, studentAbsences } from "./absence-reasons";
import { FLAG_STATUS_LABEL } from "./flags";
import { Card, CardHeader } from "@/components/ui/card";
import { Stats } from "@/components/ui/stats";
import { Banner } from "@/components/ui/banner";
import { Pill } from "@/components/ui/badge";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { HBars } from "@/components/ui/charts";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

const LEAVE_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = { APPROVED: "ok", WAITING: "warn", REJECTED: "bad", CANCELLED: "neutral", WITHDRAWN: "neutral" };
/** "9 absent days: 5 not known yet, 2 sick, 2 travel" */
function reasonSummary(list: { reason: { label: string } | null }[]) {
  const by = new Map<string, number>();
  for (const a of list) by.set(a.reason?.label ?? "Not recorded", (by.get(a.reason?.label ?? "Not recorded") ?? 0) + 1);
  return `${list.length} absent ${list.length === 1 ? "day" : "days"} this year: ${[...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(", ")}`;
}
const LEAVE_WORD: Record<string, string> = { APPROVED: "Approved", WAITING: "Waiting", REJECTED: "Rejected", CANCELLED: "Cancelled", WITHDRAWN: "Cancelled" };

registerProfileTab({
  key: "attendance",
  label: "Attendance",
  module: "attendance-management",
  order: 30,
  summary: async ({ current, studentId }) => withSchool(current.ctx, async (tx) => {
    const today = todayIn(current.school.timeZone);
    const tab = await studentAttendanceTab(tx, current.ctx, studentId, today);
    const settings = await attendanceSettings(tx, current.ctx);
    const p = tab.yearSummary?.percent ?? null;
    return [{ label: "Attendance", value: percentText(p), href: tab.registerHref, tone: p === null ? "neutral" : p < settings.thresholdPercent ? "danger" : p < 90 ? "warning" : "success" }];
  }),
  today: async ({ current, studentId }) => withSchool(current.ctx, async (tx) => {
    const today = todayIn(current.school.timeZone);
    const mark = await tx.attendanceMark.findFirst({ where: { studentId, date: today, archivedAt: null }, orderBy: { periodNo: "asc" } });
    if (!mark) return [{ label: "Attendance today", value: "Not marked yet", tone: "neutral" }];
    const st = await tx.attendanceStatus.findFirst({ where: { key: mark.statusKey } });
    const tone = mark.statusKey === "absent" ? "danger" : mark.statusKey === "late" ? "warning" : "success";
    return [{ label: "Attendance today", value: st?.name ?? mark.statusKey, tone }];
  }),
  load: async ({ current, studentId, searchParams }) => {
    const today = todayIn(current.school.timeZone);
    const { tab, threshold, cal, absences } = await withSchool(current.ctx, async (tx) => {
      const settings = await attendanceSettings(tx, current.ctx);
      const access = await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles);
      const tab = await studentAttendanceTab(tx, current.ctx, studentId, today);
      const cal = await studentCalendarFor(tx, current.ctx, access, studentId, parseMonth(searchParams?.month), today).catch(() => null);
      // Absence reasons (when the school records them), for people who may see this student's attendance.
      const yearRow = tab.year ? await tx.academicYear.findUnique({ where: { id: tab.year.id }, select: { startDate: true, endDate: true } }) : null;
      const reasonsOn = (await attendanceFeatures(tx, current.ctx)).has(REASONS_FEATURE);
      const absences = reasonsOn && cal && yearRow ? await studentAbsences(tx, current.ctx, studentId, yearRow.startDate, yearRow.endDate < today ? yearRow.endDate : today, access.seesFees) : null;
      return { tab, threshold: settings.thresholdPercent, cal, absences };
    });
    const y = tab.yearSummary;
    if (!y || y.workingDays === 0) {
      return <EmptyState title="No attendance yet" Icon={CalendarCheck2}>Attendance shows here once the class teacher takes it in Attendance.</EmptyState>;
    }
    const canOpenRegister = can(current.permissions, "attendance-management", "view");
    return (
      <div className="flex flex-col gap-5">
        {tab.openFlags.map((f) => (
          <Banner key={f.kind} tone="warn" icon={TriangleAlert} title={f.kind === "below-threshold" ? `Below ${threshold}% attendance.` : `Absent ${f.value} school days in a row.`}>
            Flagged on {formatDate(f.raisedOn, "UTC")}. The class teacher and the principal were told once. Early Warnings: {FLAG_STATUS_LABEL[f.status].toLowerCase()}{f.action ? ` (${f.action})` : ""}.
          </Banner>
        ))}
        <Stats items={[
          { label: `This year${tab.year ? `, ${tab.year.name}` : ""}`, value: percentText(y.percent), sub: `${y.countedDays} of ${y.workingDays} school days counted`, tone: y.percent === null ? undefined : y.percent < threshold ? "bad" : y.percent < 90 ? "warn" : "ok", icon: CalendarCheck2 },
          { label: "Present", value: y.present, sub: `${y.late} of them late`, icon: UserCheck },
          { label: "Absent", value: y.absent, sub: "School days", icon: UserX, tone: y.absent ? "bad" : undefined },
          { label: "On leave", value: y.leave, sub: "Not counted in the %", icon: CalendarDays },
        ]} />
        <div className="grid xl:grid-cols-2 gap-5 items-start">
          <Card>
            <CardHeader icon={CalendarDays} title="Month by month calendar" description="Go back to earlier months to see their marks, holidays and leave"
              action={canOpenRegister ? <Link href={tab.registerHref} className={buttonClass("ghost", "sm")}>Register</Link> : undefined} />
            <div className="px-5 pb-5">
              {cal ? (
                <MonthCalendar view={cal.view} statuses={cal.statuses} min={cal.bounds.min} max={cal.bounds.max} threshold={threshold}
                  todayIso={today.toISOString().slice(0, 10)} />
              ) : <p className="text-[14px] text-ink3">This student is not in one of your classes.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader icon={ChartColumn} title="Month by month" description="Holidays and Sundays are left out" />
            <div className="px-5 pb-5">
              <HBars rows={tab.months.map((m) => ({ k: m.label.split(" ")[0].slice(0, 3), v: m.summary.percent ?? 0, label: percentText(m.summary.percent) }))} goal={threshold} lowBelow={threshold} labelWidth={44} />
            </div>
          </Card>
        </div>
        {absences && absences.length > 0 && (
          <Card>
            <CardHeader icon={UserX} title="Absences and reasons" description={reasonSummary(absences)} />
            <ul className="px-2 pb-2">
              {absences.slice(0, 15).map((a) => (
                <li key={a.date.toISOString()} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-24 shrink-0 text-[14px] tnum text-ink2">{formatDate(a.date, "UTC")}</span>
                  <span className="min-w-0 flex-1 text-[14px]">{a.reason?.note ?? ""}</span>
                  <Pill tone={!a.reason || a.reason.key === "not-known" ? "warn" : "neutral"}>{a.reason?.label ?? "Not recorded"}</Pill>
                </li>
              ))}
            </ul>
            {absences.length > 15 && <p className="px-5 pb-4 text-[13px] text-ink3">The 15 latest of {absences.length} absent days this year.</p>}
          </Card>
        )}
        <Card>
          <CardHeader icon={Clock} title="Student leave" description="Recorded by the school when a parent asks" />
          {tab.leave.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3">No leave recorded.</p> : (
            <ul className="px-2 pb-2">
              {tab.leave.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px]">{l.type} · {l.days === 0.5 ? "half day" : `${l.days} ${l.days === 1 ? "day" : "days"}`}</p>
                    <p className="text-[12.5px] text-ink3">{formatDate(l.from, "UTC")}{l.to.getTime() !== l.from.getTime() ? ` to ${formatDate(l.to, "UTC")}` : ""}</p>
                  </div>
                  <Pill tone={LEAVE_TONE[l.status] ?? "neutral"}>{LEAVE_WORD[l.status] ?? l.status}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  },
});
