// Parent Link, attendance (05 §4 Sends; 11 Communication owns the page).
// Read-only: the chosen child's month as a calendar with the same colours and
// % as the register, paging back to earlier months of this school year. Today's mark is
// not final until the lock time. Imported by src/lib/parent-link/section-list.ts.
import "server-only";

import { registerSection, type GuardianView } from "../parent-link/sections";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { schoolDateOf } from "./time";
import { lockState } from "./marks";
import { ensureAttendanceDefaults } from "./settings";
import { parseMonth, studentCalendar, type CalendarData } from "./calendar-months";
import { makeT } from "../i18n/server";

type Data = CalendarData & { todayFinal: boolean; lockText: string; todayIso: string; threshold: number };

function AttendanceSection({ data, view }: { data: Data; view: GuardianView }) {
  const t = makeT(view.lang);
  const s = data.view.summary;
  // A % over 1 marked day of 11 read as "100% present" (layman test loop 3): with most school days
  // not marked, no % is shown, and the dashed boxes are explained.
  const few = s.workingDays > 0 && s.markedDays * 2 < s.workingDays;
  const month = few ? { ...data.view, summary: { ...s, percent: null } } : data.view;
  const unmarked = data.view.cells.some((c) => !c.off && !c.future && !c.statusKey);
  return (
    <MonthCalendar t={t} view={month} statuses={data.statuses} min={data.bounds.min} max={data.bounds.max} threshold={data.threshold} todayIso={data.todayIso}
      note={<>
        {unmarked && <p className="text-[13px] text-ink2 flex items-center gap-2"><span aria-hidden="true" className="w-4 h-4 shrink-0 rounded border border-dashed border-line" />{t("Dashed box: not marked yet")}</p>}
        {!data.todayFinal && <p className="text-[13px] text-ink2">{t("Today’s attendance can still change until {time}.", { time: data.lockText })}</p>}
      </>} />
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
    // Parent Link pages back only to the start of the current school year (owner's rules, 12 Oct 2026).
    const data = await studentCalendar(tx, ctx, view.child.id, parseMonth(view.month), today, "current-year");
    const anyMarks = await tx.attendanceMark.findFirst({ where: { studentId: view.child.id, archivedAt: null }, select: { id: true } });
    if (!anyMarks) return null;
    return { ...data, todayFinal: lock.locked, lockText: lock.atText, todayIso: today.toISOString().slice(0, 10), threshold: settings.thresholdPercent };
  },
  Render: AttendanceSection,
});
