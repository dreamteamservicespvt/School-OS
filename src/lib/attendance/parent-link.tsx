// Parent Link, attendance (05 §4 Sends; 11 Communication owns the page).
// Read-only: the chosen child's month as a calendar with the same colours and
// % as the register, paging back to earlier months and years. Today's mark is
// not final until the lock time. Imported by src/lib/parent-link/section-list.ts.
import "server-only";

import { registerSection, type GuardianView } from "../parent-link/sections";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { schoolDateOf } from "./time";
import { lockState } from "./marks";
import { ensureAttendanceDefaults } from "./settings";
import { studentCalendar, type CalendarData } from "./calendar-months";
import { parentMonthAction } from "./parent-calendar-action";

type Data = CalendarData & { todayFinal: boolean; lockText: string; todayIso: string; threshold: number };

function AttendanceSection({ data, view }: { data: Data; view: GuardianView }) {
  return (
    <MonthCalendar initial={data.view} statuses={data.statuses} min={data.bounds.min} max={data.bounds.max} threshold={data.threshold} todayIso={data.todayIso}
      load={view.preview || !view.token ? undefined : parentMonthAction.bind(null, view.token, view.child.id)}
      note={!data.todayFinal ? <p className="text-[13px] text-ink2">Today&apos;s attendance can still change until {data.lockText}.</p> : undefined} />
  );
}

registerSection<Data>({
  key: "attendance",
  label: "Attendance",
  description: "Each month's attendance as a calendar, with the %",
  order: 30,
  load: async (tx, ctx, view) => {
    const settings = await ensureAttendanceDefaults(tx, ctx);
    const now = new Date();
    const today = schoolDateOf(now, view.timeZone);
    const lock = lockState(settings, today, now, view.timeZone);
    const data = await studentCalendar(tx, ctx, view.child.id, null, today, { allYears: true });
    const anyMarks = await tx.attendanceMark.findFirst({ where: { studentId: view.child.id, archivedAt: null }, select: { id: true } });
    if (!anyMarks) return null;
    return { ...data, todayFinal: lock.locked, lockText: lock.atText, todayIso: today.toISOString().slice(0, 10), threshold: settings.thresholdPercent };
  },
  Render: AttendanceSection,
});
