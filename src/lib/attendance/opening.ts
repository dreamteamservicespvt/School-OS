// Attendance so far (workflow 15, gap list G19). A school that starts on
// School OS part way through the year brings in, for each student, the days
// the school met and the days present from the start of the year up to the
// day before it started here: an Opening Attendance, one total per student per
// year, never made-up daily marks. Every attendance total (./summary.ts) adds
// it for a period that holds the whole of it, so the year's %, the Early
// Warnings and the attendance forecasts are right from the first day.
//
// Brought in on the one import engine from Attendance Management, Import, or
// Switching to School OS, by people with full Attendance Management (the
// Principal, the School Admin, the Vice Principal). A person limited to one
// campus brings in that campus's students only. Undo archives the totals.
// Imported by src/lib/import-registry.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, type ImportKind } from "../importer";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { campusLimitOf } from "../staff/campus-logins";
import { parseDateText } from "../staff/import";
import { todayIn } from "../staff/dates";
import { moveInGoLive } from "../move-in/live";
import { currentYear } from "../academic/years";

export const ATTENDANCE_SO_FAR = "attendance-so-far";
const NONE_YET = "No attendance so far";

type Row = { studentId: string; name: string; academicYearId: string; fromDate: Date; upTo: Date; met: number; present: number };

const DAY = 86_400_000;
const shown = (d: Date) => formatDate(d, "UTC");

/** A number of days like 92 or 91.5; null when it is not one. */
export function daysOf(raw: string): number | null {
  const v = raw.trim().replace(/,/g, "");
  if (!/^\d{1,4}(\.\d)?$/.test(v)) return null;
  const n = Number(v);
  return Math.round(n * 2) === n * 2 ? n : null;
}

/** A sheet of every student with empty totals for some (new this term, say): those rows are left out, not problems. */
function leaveOut(row: Record<string, string>): string | null {
  return !(row.daysMet ?? "").trim() && !(row.daysPresent ?? "").trim() ? NONE_YET : null;
}

function makeKind(): ImportKind<Row> {
  // Looked up once for each check of a file: the go-live date, today and each campus's year.
  const memo = new WeakMap<Set<string>, { goLive: Promise<Date | null>; today: Promise<Date>; limit: Promise<string | null>; years: Map<string, ReturnType<typeof currentYear>> }>();
  const lookups = (tx: Tx, ctx: SchoolContext, seen: Set<string>) => {
    let m = memo.get(seen);
    if (!m) {
      m = {
        goLive: moveInGoLive(tx, ctx),
        today: tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } }).then((s) => todayIn(s?.timeZone)),
        limit: campusLimitOf(tx, ctx),
        years: new Map(),
      };
      memo.set(seen, m);
    }
    return m;
  };
  return {
    key: ATTENDANCE_SO_FAR,
    label: "Attendance so far",
    columns: [
      { key: "admissionNo", label: "Admission number", required: true, example: "SPS/2021/0451", aliases: ["admission no", "adm no", "admn no", "sr no", "student id"] },
      { key: "daysMet", label: "Days the school met", required: true, example: "92", help: "School days from the start of the year up to the date below, as in the register. A half day is 0.5.", aliases: ["working days", "total working days", "total days", "school days", "days held", "days met", "total"] },
      { key: "daysPresent", label: "Days present", required: true, example: "87.5", help: "Days the student was present in that time. A half day is 0.5.", aliases: ["present", "present days", "days attended", "attended", "attendance"] },
      { key: "upToDate", label: "Up to", example: "30-09-2026", help: "The last day these totals cover, DD-MM-YYYY. Leave empty for the day before your go-live date.", aliases: ["up to date", "upto", "as on", "as on date", "till", "till date", "to date"] },
    ],
    leaveOut,
    withOptions: () => makeKind(),
    async check(tx, ctx, row, seen) {
      const problems: string[] = [];
      const l = lookups(tx, ctx, seen);
      const [goLive, today, limit] = await Promise.all([l.goLive, l.today, l.limit]);
      const no = (row.admissionNo ?? "").trim();
      // One campus: a student of another campus reads as "no student", as on the other student imports.
      const student = no ? await tx.student.findFirst({ where: { admissionNo: { equals: no, mode: "insensitive" }, archivedAt: null, ...(limit ? { campusId: limit } : {}) }, select: { id: true, fullName: true, campusId: true } }) : null;
      if (no && !student) problems.push(`No student with admission number "${no}".`);
      if (student) {
        if (seen.has(`s:${student.id}`)) problems.push(`${student.fullName} is twice in the file. Keep one row for each student.`);
        seen.add(`s:${student.id}`);
      }
      const met = daysOf(row.daysMet ?? "");
      const present = daysOf(row.daysPresent ?? "");
      if (met === null) problems.push("Days the school met must be a number of days, like 92 or 91.5.");
      else if (met <= 0) problems.push("Days the school met must be more than 0.");
      if (present === null) problems.push("Days present must be a number of days, like 87 or 87.5.");
      if (met !== null && present !== null && present > met) problems.push(`Days present (${present}) cannot be more than the days the school met (${met}).`);

      let upTo: Date | null = null;
      const typed = (row.upToDate ?? "").trim();
      if (typed) {
        upTo = parseDateText(typed);
        if (!upTo) problems.push("Up to must be a date like 30-09-2026.");
      } else if (goLive) upTo = new Date(goLive.getTime() - DAY);
      else problems.push("Up to is empty and no go-live date is set. Write the last day these totals cover, or set the go-live date on the go-live check.");
      if (upTo && upTo >= today) problems.push(`Up to must be before today. Attendance from ${shown(today)} on is taken in School OS.`);

      if (!student || problems.length || !upTo || met === null || present === null) return { ok: false, problems };
      if (!l.years.has(student.campusId)) l.years.set(student.campusId, currentYear(tx, ctx, student.campusId));
      const year = await l.years.get(student.campusId)!;
      if (!year) return { ok: false, problems: ["There is no academic year for this student's campus yet. Add it in Academic Management first."] };
      if (upTo < year.startDate || upTo > year.endDate) return { ok: false, problems: [`Up to must be in ${year.name} (${shown(year.startDate)} to ${shown(year.endDate)}).`] };
      const span = Math.round((upTo.getTime() - year.startDate.getTime()) / DAY) + 1;
      if (met > span) return { ok: false, problems: [`${met} days cannot fit between ${shown(year.startDate)} and ${shown(upTo)} (${span} days).`] };
      const have = await tx.openingAttendance.findFirst({ where: { studentId: student.id, academicYearId: year.id, archivedAt: null }, select: { daysMet: true, daysPresent: true, upTo: true } });
      if (have) problems.push(`Attendance so far for ${student.fullName} is already brought in (${Number(have.daysPresent)} of ${Number(have.daysMet)} days up to ${shown(have.upTo)}). Undo that import first to bring it in again.`);
      // Days already taken in School OS would be counted twice.
      const taken = await tx.attendanceMark.findFirst({ where: { studentId: student.id, archivedAt: null, date: { gte: year.startDate, lte: upTo } }, orderBy: { date: "asc" }, select: { date: true } });
      if (taken) problems.push(`${student.fullName} already has attendance taken in School OS on ${shown(taken.date)}. Bring in the totals only up to ${shown(new Date(taken.date.getTime() - DAY))}.`);
      if (problems.length) return { ok: false, problems };
      return { ok: true, value: { studentId: student.id, name: student.fullName, academicYearId: year.id, fromDate: year.startDate, upTo, met, present } };
    },
    async save(tx, ctx, v) {
      const row = await tx.openingAttendance.create({
        data: { schoolId: ctx.schoolId, academicYearId: v.academicYearId, studentId: v.studentId, fromDate: v.fromDate, upTo: v.upTo, daysMet: v.met, daysPresent: v.present, createdById: ctx.userId },
      });
      await writeAudit(tx, ctx, { action: "brought-in", recordType: "Opening Attendance", recordId: row.id, after: { student: v.name, from: shown(v.fromDate), upTo: shown(v.upTo), daysMet: v.met, daysPresent: v.present } });
      return { id: row.id, created: true };
    },
    async undo(tx, ctx, ids) {
      const { count } = await tx.openingAttendance.updateMany({ where: { id: { in: ids }, archivedAt: null }, data: { archivedAt: new Date() } });
      await writeAudit(tx, ctx, { action: "archived", recordType: "Opening Attendance", recordId: null, after: { reason: "Import undone", students: count } });
    },
  };
}

defineImport(makeKind());
