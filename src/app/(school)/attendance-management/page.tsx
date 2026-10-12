import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { attendancePage } from "@/lib/attendance/page";
import { AttendanceProblem, BASE } from "@/lib/attendance/access";
import { loadSheet, takeChoices, dayText } from "@/lib/attendance/marks";
import { dayInfo, offDayMessage } from "@/lib/attendance/calendar";
import { clockHHMM } from "@/lib/attendance/time";
import { day, isoDay } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { PageHeader } from "@/components/shell/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { CalendarIcon } from "@/components/icons";
import { SheetPicker } from "./_components/picker";
import { TakeSheet } from "./_components/take-sheet";
import { OfflinePanel } from "./_components/offline-panel";

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
      return { choices, chosen: null, sheet: null, problem: section ? "You can only take attendance for your own classes. Choose one of them above." : null, info, year };
    }
    try {
      const sheet = await loadSheet(tx, current.ctx, access, { sectionId: chosen.sectionId, date, periodNo: chosen.periodNo, now, timeZone: tz });
      return { choices, chosen, sheet, problem: null, info: sheet.day, year };
    } catch (e) {
      if (e instanceof AttendanceProblem) return { choices, chosen, sheet: null, problem: e.message, info: null, year };
      throw e;
    }
  });

  const pickerChoices = data.choices.map((c) => ({
    value: `${c.sectionId}:${c.periodNo}`,
    label: `${c.name}${c.periodLabel ? ` · ${c.periodLabel}` : ""}${c.done ? " (taken)" : ""}`,
  }));
  const sheet = data.sheet;
  const correctionHref = data.chosen ? `${BASE}/register/correction?section=${data.chosen.sectionId}&date=${isoDay(date)}${data.chosen.periodNo ? `&period=${data.chosen.periodNo}` : ""}` : `${BASE}/register`;

  return (
    <>
      <PageHeader title="Take Attendance" href={BASE} userId={current.user.id}>
        <Link href={`${BASE}/register`} className={buttonClass("secondary", "md")}>
          <CalendarIcon className="size-5" /> Attendance Register
        </Link>
      </PageHeader>

      <OfflinePanel userId={current.user.id} offlineOn={offlineOn} />

      <SheetPicker choices={pickerChoices} value={data.chosen ? `${data.chosen.sectionId}:${data.chosen.periodNo}` : ""}
        date={isoDay(date)} maxDate={isoDay(today)} minDate={data.year ? isoDay(data.year.startDate) : undefined}
        classLabel={periodWise ? "Class and period" : "Class and section"} />

      {future ? (
        <Alert tone="warning">{dayText(date)} has not come yet. Attendance can be taken for today or earlier days. <Link href={BASE} className="font-medium underline">Go to today</Link></Alert>
      ) : data.info && !data.info.on ? (
        <Alert tone="warning" title={offDayMessage(data.info, date)}>
          If the school opens that day, turn on &quot;allow attendance&quot; for the date in the School Calendar.
        </Alert>
      ) : data.problem ? (
        <Alert tone="danger">{data.problem}</Alert>
      ) : !sheet ? (
        <EmptyState title={periodWise ? "No periods to take on this date" : "No class to take"}>
          {periodWise
            ? "Your Time Table has no periods for you on this date. If you are covering a class, ask for the substitution to be arranged."
            : "Daily attendance is taken by the class teacher. You are not class teacher of any section this year. Ask the principal if you need a class."}
        </EmptyState>
      ) : sheet.students.length === 0 ? (
        <EmptyState title={`No students in ${sheet.section.name}`}>
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
          students={sheet.students.map((s) => ({ id: s.studentId, roll: s.rollNo, name: s.name, admissionNo: s.admissionNo, photoUrl: s.photoUrl, statusKey: s.statusKey, note: s.note, leave: s.leave ? { typeName: s.leave.typeName, halfDay: s.leave.halfDay } : null }))}
          saved={sheet.saved}
          savedText={sheet.saved && sheet.savedAt ? `Saved ${formatDateTime(sheet.savedAt, tz)}${sheet.savedBy ? ` by ${sheet.savedBy}` : ""}` : null}
          locked={sheet.lock.locked} lockText={sheet.lock.atText} canChangeAfterLock={sheet.canChangeAfterLock}
          correctionHref={correctionHref} offlineOn={offlineOn} />
      )}
    </>
  );
}
