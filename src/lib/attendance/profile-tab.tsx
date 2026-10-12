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
import { attendanceSettings, statusMap } from "./settings";
import { percentText } from "./summary";
import { Card, CardHeader } from "@/components/ui/card";
import { Stats } from "@/components/ui/stats";
import { Banner } from "@/components/ui/banner";
import { Pill } from "@/components/ui/badge";
import { MonthGrid, type MonthCellTone } from "@/components/ui/month-grid";
import { HBars } from "@/components/ui/charts";
import { Legend } from "@/components/ui/rows";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

const CELL_TONE: Record<string, MonthCellTone> = { present: "ok", late: "warn", absent: "bad", "half-day": "warn", leave: "info", medical: "info", excused: "muted" };
const LEAVE_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = { APPROVED: "ok", WAITING: "warn", REJECTED: "bad", CANCELLED: "neutral", WITHDRAWN: "neutral" };
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
  load: async ({ current, studentId }) => {
    const today = todayIn(current.school.timeZone);
    const { tab, threshold } = await withSchool(current.ctx, async (tx) => ({
      tab: await studentAttendanceTab(tx, current.ctx, studentId, today),
      threshold: (await attendanceSettings(tx, current.ctx)).thresholdPercent,
    }));
    const y = tab.yearSummary;
    if (!y || y.workingDays === 0) {
      return <EmptyState title="No attendance yet" Icon={CalendarCheck2}>Attendance shows here once the class teacher takes it in Attendance.</EmptyState>;
    }
    const statuses = statusMap(tab.statuses);
    const cells = new Map(tab.thisMonth.cells.map((c) => [c.day, c]));
    const [yy, mm] = tab.thisMonth.month.split("-").map(Number);
    const canOpenRegister = can(current.permissions, "attendance-management", "view");
    return (
      <div className="flex flex-col gap-5">
        {tab.openFlags.map((f) => (
          <Banner key={f.kind} tone="warn" icon={TriangleAlert} title={f.kind === "below-threshold" ? `Below ${threshold}% attendance.` : `Absent ${f.value} school days in a row.`}>
            Flagged on {formatDate(f.raisedOn, "UTC")}. The class teacher and the principal were told once.
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
            <CardHeader icon={CalendarDays} title={tab.thisMonth.label} description={`${percentText(tab.thisMonth.summary.percent)} · ${tab.thisMonth.summary.workingDays} school days so far`}
              action={canOpenRegister ? <Link href={tab.registerHref} className={buttonClass("ghost", "sm")}>Register</Link> : undefined} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <MonthGrid year={yy} month0={mm - 1} compact today={today.getUTCMonth() === mm - 1 ? today.getUTCDate() : null}
                cell={(d) => {
                  const c = cells.get(d);
                  if (!c) return {};
                  if (c.off) return { tone: "muted", title: c.off };
                  if (c.future) return { tone: "none" };
                  if (!c.statusKey) return { tone: "none", title: "Not marked" };
                  return { tone: CELL_TONE[c.statusKey] ?? "brand", title: statuses.get(c.statusKey)?.name ?? c.statusKey };
                }} />
              <Legend items={[["bg-ok/15", "Present"], ["bg-warn/15", "Late or half-day"], ["bg-bad/15", "Absent"], ["bg-info/10", "Leave"]]} />
            </div>
          </Card>
          <Card>
            <CardHeader icon={ChartColumn} title="Month by month" description="Holidays and Sundays are left out" />
            <div className="px-5 pb-5">
              <HBars rows={tab.months.map((m) => ({ k: m.label.split(" ")[0].slice(0, 3), v: m.summary.percent ?? 0, label: percentText(m.summary.percent) }))} goal={threshold} lowBelow={threshold} labelWidth={44} />
            </div>
          </Card>
        </div>
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
