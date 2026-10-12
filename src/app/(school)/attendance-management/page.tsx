import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarOff, CalendarX2, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatTime } from "@/lib/format";
import { attendancePage } from "@/lib/attendance/page";
import { AttendanceProblem, BASE } from "@/lib/attendance/access";
import { loadSheet, takeChoices, dayText } from "@/lib/attendance/marks";
import { dayInfo, offDayMessage } from "@/lib/attendance/calendar";
import { clockHHMM } from "@/lib/attendance/time";
import { day, isoDay } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { Banner } from "@/components/ui/banner";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { AttHead } from "./_components/att-head";
import { SheetPicker } from "./_components/picker";
import { TakeSheet } from "./_components/take-sheet";
import { OfflinePanel } from "./_components/offline-panel";
import { longDay } from "./_components/dates";

export const metadata: Metadata = { title: "Take Attendance" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function TakeAttendancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, settings, features, tz, today, now } = await attendancePage();
  if (access.students === "none" || access.change === "none") {
    redirect(access.students !== "none" ? `${BASE}/register` : access.studentLeave !== "none" ? `${BASE}/student-leave` : access.staff !== "none" ? `${BASE}/staff` : `${BASE}/reports`);
  }
  const offlineOn = features.has("attendance-offline");
  const periodWise = features.has("attendance-period-wise");

  const wantedDate = one(sp.date);
  const date = wantedDate && /^\d{4}-\d{2}-\d{2}$/.test(wantedDate) && !Number.isNaN(day(wantedDate).getTime()) ? day(wantedDate) : today;
  const future = date > today;

  const data = await withSchool(current.ctx, async (tx) => {
    const choices = future ? [] : await takeChoices(tx, current.ctx, access, date);
    const year = access.yearId ? await tx.academicYear.findUnique({ where: { id: access.yearId }, select: { startDate: true, name: true } }) : null;
    const section = one(sp.section);
    const period = Number(one(sp.period) ?? 0) || 0;
    let chosen = section && UUID_RE.test(section) ? choices.find((c) => c.sectionId === section && (period ? c.periodNo === period : true)) : undefined;
    if (!chosen && !section) {
      // The class happening now: the latest period that has started today, else the first not yet taken.
      const clock = clockHHMM(now, tz);
      const started = isoDay(date) === isoDay(today) ? choices.filter((c) => c.startTime && c.startTime <= clock) : [];
      chosen = started[started.length - 1] ?? choices.find((c) => !c.done) ?? choices[0];
    }
    if (!chosen) {
      const info = await dayInfo(tx, current.ctx, date, access.campusId);
      return { choices, chosen: null, sheet: null, problem: section ? "You can only take attendance for your own classes. Choose one of them above." : null, info, year, teacher: null };
    }
    try {
      const sheet = await loadSheet(tx, current.ctx, access, { sectionId: chosen.sectionId, date, periodNo: chosen.periodNo, now, timeZone: tz });
      const teacher = sheet.section.classTeacherId ? await tx.staff.findFirst({ where: { id: sheet.section.classTeacherId }, select: { fullName: true } }) : null;
      return { choices, chosen, sheet, problem: null, info: sheet.day, year, teacher: teacher?.fullName ?? null };
    } catch (e) {
      if (e instanceof AttendanceProblem) return { choices, chosen, sheet: null, problem: e.message, info: null, year, teacher: null };
      throw e;
    }
  });

  const pickerChoices = data.choices.map((c) => ({
    value: `${c.sectionId}:${c.periodNo}`,
    label: `${c.name}${c.periodLabel ? ` · ${c.periodLabel}` : ""}${c.done ? " ✓" : ""}`,
  }));
  const sheet = data.sheet;
  const correctionHref = data.chosen ? `${BASE}/register/correction?section=${data.chosen.sectionId}&date=${isoDay(date)}${data.chosen.periodNo ? `&period=${data.chosen.periodNo}` : ""}` : `${BASE}/register`;
  const sub = data.chosen
    ? [data.chosen.name, data.chosen.periodLabel, longDay(date), data.teacher ? `Class teacher ${data.teacher}` : null].filter(Boolean).join(" · ")
    : longDay(date);

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={BASE} sub={sub}
        actions={<SheetPicker choices={pickerChoices} value={data.chosen ? `${data.chosen.sectionId}:${data.chosen.periodNo}` : ""}
          date={isoDay(date)} maxDate={isoDay(today)} minDate={data.year ? isoDay(data.year.startDate) : undefined}
          classLabel={periodWise ? "Class and period" : "Class and section"} />} />

      <OfflinePanel userId={current.user.id} offlineOn={offlineOn} />

      {future ? (
        <EmptyState title={`${dayText(date)} has not come yet`} Icon={CalendarX2} action={<Link href={BASE} className={buttonClass("secondary", "md")}>Go to today</Link>}>
          Attendance can be taken for today or earlier days.
        </EmptyState>
      ) : data.info && !data.info.on ? (
        <>
          <Banner tone="warn" icon={CalendarOff} className="mb-4" title={offDayMessage(data.info, date)}>
            If the school opens that day, turn on &quot;allow attendance&quot; for the date in the School Calendar.
          </Banner>
          <EmptyState title="No attendance on this day" Icon={CalendarOff} action={<Link href={BASE} className={buttonClass("secondary", "md")}>Go to today</Link>}>
            Holidays and Sundays are left out of every %, report and register total.
          </EmptyState>
        </>
      ) : data.problem ? (
        <Banner tone="bad" role="alert">{data.problem}</Banner>
      ) : !sheet ? (
        <EmptyState title={periodWise ? "No periods to take on this date" : "No class to take"} Icon={Users}
          action={<Link href={`${BASE}/register`} className={buttonClass("secondary", "md")}>Open the register</Link>}>
          {periodWise
            ? "Your Time Table has no periods for you on this date. If you are covering a class, ask for the substitution to be arranged."
            : "Daily attendance is taken by the class teacher. You are not class teacher of any section this year. Ask the principal if you need a class."}
        </EmptyState>
      ) : sheet.students.length === 0 ? (
        <EmptyState title={`No students in ${sheet.section.name}`} Icon={Users}
          action={<Link href="/student-management" className={buttonClass("secondary", "md")}>Open Student Management</Link>}>
          Students appear here once they are placed in this section in Student Management.
        </EmptyState>
      ) : (
        <TakeSheet key={`${sheet.section.id}:${isoDay(date)}:${data.chosen!.periodNo}`}
          userId={current.user.id}
          sectionId={sheet.section.id} sectionName={sheet.section.name}
          date={isoDay(date)} dateText={dayText(date)}
          periodNo={data.chosen!.periodNo} periodLabel={data.chosen!.periodLabel}
          statuses={sheet.statuses.map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone, counts: s.counts }))}
          defaultStatus={settings.defaultStatus === "none" ? "not-marked" : "present"}
          students={sheet.students.map((s) => ({ id: s.studentId, roll: s.rollNo, name: s.name, admissionNo: s.admissionNo, photoUrl: s.photoUrl, statusKey: s.statusKey, note: s.note, leave: s.leave ? { typeName: s.leave.typeName, halfDay: s.leave.halfDay, reason: s.leave.reason } : null }))}
          saved={sheet.saved}
          savedAtText={sheet.savedAt ? formatTime(sheet.savedAt, tz) : null} savedBy={sheet.savedBy}
          locked={sheet.lock.locked} lockText={sheet.lock.atText} canChangeAfterLock={sheet.canChangeAfterLock}
          correctionHref={correctionHref} offlineOn={offlineOn} />
      )}
    </>
  );
}
