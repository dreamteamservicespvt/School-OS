// Attendance Reports (05 §7). Each report is one table: the screen and the
// export (P8) come from the same rows, so they always agree. Every % leaves
// out holidays, Sundays and other non-working days (rule 18).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate } from "../format";
import { isoDay, monthEnd, monthLabel, monthStart } from "../staff/dates";
import { inCampus } from "../campus";
import { staffAllowed, staffIdLimit, staffLimit, type AttendanceAccess } from "./access";
import { offDayMessage, schoolDays } from "./calendar";
import { loadSchoolCalendar } from "../calendar/school-days";
import { registerChoices } from "./register";
import { attendanceSettings, statusList, statusMap } from "./settings";
import { addDay, attendanceSummary, finish, percentText, type PersonSummary } from "./summary";
import { deviceHealth, REJECT_WORDS } from "./devices";
import { minutesText } from "./time";
import { classWise } from "./classwise";
import { ABSENCE_REASONS, absentKeys, absentReason, DEFAULT_REASON, FEE_REASON, isReason, reasonChoices, shownReason, SOURCE_WORDS } from "./absence-reasons";
import { FLAG_STATUS_LABEL, flagStatusOf, OPEN_ATTENDANCE_FLAG } from "./flags";

export const REPORTS = [
  { key: "daily", label: "Daily attendance", about: "Each class and section on one date, and staff.", students: true, staff: true },
  { key: "monthly", label: "Monthly attendance", about: "Each class and section for a month, or each student of one section.", students: true, staff: false },
  { key: "staff-monthly", label: "Staff monthly", about: "Each staff member for a month: present, late, leave and %.", students: false, staff: true },
  { key: "range", label: "Date range", about: "Any student or staff member between two dates.", students: true, staff: true },
  { key: "trends", label: "% and trends", about: "Attendance % by class and month for the year.", students: true, staff: false },
  { key: "chronic", label: "Chronic absence", about: "Students below the threshold or absent several days in a row.", students: true, staff: false },
  { key: "late", label: "Late arrivals", about: "Students and staff late, by month.", students: true, staff: true },
  { key: "leave", label: "Student leave", about: "Student leave by type and class.", students: true, staff: false },
  { key: "reasons", label: "Absence reasons", about: "Absent days by reason for each class, or every absence with one reason.", students: true, staff: false, feature: "attendance-absence-reasons" },
  { key: "overtime", label: "Overtime and shifts", about: "Staff overtime and attendance by shift.", students: false, staff: true, feature: "attendance-overtime" },
  { key: "devices", label: "Device health", about: "Punches received and rejected by device.", students: false, staff: true, feature: "attendance-devices" },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];
export type ReportColumn = { key: string; label: string; numeric?: boolean; phone?: "title" | "meta" | "badge" };
export type ReportRow = Record<string, string | number | null> & { _tone?: string | null };
export type ReportTable = { title: string; filters: string; columns: ReportColumn[]; rows: ReportRow[]; footer?: string; empty: string };

export type ReportInput = {
  report: ReportKey;
  date: Date;
  month: Date;
  from: Date;
  to: Date;
  sectionId: string | null;
  person: string | null;
  /** Student leave report: this month or the whole year. */
  period: "month" | "year";
  /** Absence reasons report: one reason (or "none", not recorded); null groups every reason by class. */
  reason?: string | null;
  today: Date;
  /** The shared date filter (Late arrivals, Student leave, Overtime, Date range, Device health); null keeps the month. */
  dates?: { from: Date; to: Date; label: string } | null;
};

/** The reports that use the shared date filter rather than one month or one date. */
export const DATED_REPORTS: ReportKey[] = ["late", "leave", "overtime", "range", "devices", "reasons"];

/** Applies the shared date filter (lib/periods) to a report's input. */
export function withDates(input: ReportInput, range: { from: string; to: string; label: string } | null): ReportInput {
  if (!range || !DATED_REPORTS.includes(input.report)) return input;
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const cap = to > input.today ? input.today : to;
  return { ...input, from, to: cap < from ? from : cap, dates: { from, to: cap < from ? from : cap, label: range.label } };
}

const pct = (n: number | null) => percentText(n);
const dayText = (d: Date) => formatDate(d, "UTC");

/** Reports this person may open. */
export function reportsFor(access: AttendanceAccess, features: Set<string>) {
  return REPORTS.filter((r) => {
    if ("feature" in r && r.feature && !features.has(r.feature)) return false;
    const students = access.students !== "none";
    const staff = access.staff === "all";
    return (r.students && students) || (r.staff && staff);
  });
}

async function sectionsInReach(tx: Tx, access: AttendanceAccess) {
  return registerChoices(tx, access);
}

export async function runReport(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: ReportInput): Promise<ReportTable> {
  const statuses = await statusList(tx, ctx, { includeArchived: true });
  const statusName = new Map(statuses.map((s) => [s.key, s.name]));
  const students = access.students !== "none";
  const staffAll = access.staff === "all";
  const settings = await attendanceSettings(tx, ctx);

  switch (input.report) {
    case "daily": {
      const sections = students ? await sectionsInReach(tx, access) : [];
      const rows: ReportRow[] = [];
      const days = await schoolDays(tx, ctx, input.date, input.date, access.campusId);
      const info = days.info(input.date);
      if (!info.on) return { title: `Daily attendance ${dayText(input.date)}`, filters: `Date ${dayText(input.date)}`, columns: [], rows: [], empty: offDayMessage(info, input.date) };
      // The same per-section rows as the class-wise view and the Dashboard (./classwise.ts), so the numbers agree.
      if (sections.length) {
        const years = await tx.academicYear.findMany({ where: { archivedAt: null, startDate: { lte: input.date }, endDate: { gte: input.date }, ...(access.campusLimit ? { campusId: access.campusLimit } : {}) }, select: { id: true, campusId: true } });
        const wanted = access.students === "all" ? access.limitSections : sections.map((s) => s.id);
        for (const y of years) {
          const cw = await classWise(tx, ctx, { yearId: y.id, from: input.date, to: input.date, today: input.today, sectionIds: wanted, campusId: y.campusId });
          for (const s of cw.sections.filter((x) => x.students > 0 || x.marked > 0)) {
            rows.push({ who: s.name, total: s.students, present: s.present, absent: s.absent, late: s.late, leave: s.leave, notMarked: Math.max(0, s.students - s.marked), percent: pct(s.percent), _tone: s.marked === 0 ? "warning" : null });
          }
        }
      }
      if (staffAll) {
        const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, joiningDate: { lte: input.date }, AND: [staffLimit(access)] }, select: { id: true } });
        const sum = await attendanceSummary(tx, ctx, { staffIds: staff.map((s) => s.id), from: input.date, to: input.date, today: input.today });
        const o = sum.overall;
        rows.push({ who: "All staff", total: staff.length, present: o.present, absent: o.absent, late: o.late, leave: o.leave, notMarked: staff.length - o.markedDays, percent: pct(o.percent), _tone: null });
      }
      return {
        title: `Daily attendance ${dayText(input.date)}`, filters: `Date ${dayText(input.date)}`,
        columns: [
          { key: "who", label: "Class and section", phone: "title" }, { key: "total", label: "Total", numeric: true }, { key: "present", label: "Present", numeric: true, phone: "meta" },
          { key: "absent", label: "Absent", numeric: true, phone: "meta" }, { key: "late", label: "Late", numeric: true }, { key: "leave", label: "Leave", numeric: true },
          { key: "notMarked", label: "Not marked", numeric: true }, { key: "percent", label: "%", numeric: true, phone: "badge" },
        ],
        rows, empty: "No classes to show.",
      };
    }
    case "monthly": {
      const from = monthStart(input.month);
      const to = monthEnd(input.month);
      const sections = await sectionsInReach(tx, access);
      const section = input.sectionId ? sections.find((s) => s.id === input.sectionId) : null;
      if (section) {
        const sum = await attendanceSummary(tx, ctx, { sectionId: section.id, from, to, today: input.today });
        const people = await tx.student.findMany({ where: { id: { in: [...sum.people.keys()] } }, select: { id: true, fullName: true, admissionNo: true } });
        people.sort((a, b) => a.fullName.localeCompare(b.fullName));
        return {
          title: `Monthly attendance ${section.name} ${monthLabel(from)}`, filters: `Class ${section.name}, month ${monthLabel(from)}`,
          columns: [
            { key: "who", label: "Student", phone: "title" }, { key: "adm", label: "Admission no." }, { key: "counted", label: "Days counted", numeric: true },
            { key: "present", label: "Present", numeric: true, phone: "meta" }, { key: "absent", label: "Absent", numeric: true, phone: "meta" }, { key: "late", label: "Late", numeric: true },
            { key: "leave", label: "Leave", numeric: true }, { key: "percent", label: "%", numeric: true, phone: "badge" },
          ],
          rows: people.map((p) => {
            const s = sum.people.get(p.id)!;
            return { who: p.fullName, adm: p.admissionNo, counted: s.countedDays, present: s.present, absent: s.absent, late: s.late, leave: s.leave, percent: pct(s.percent), _tone: s.percent !== null && s.percent < settings.thresholdPercent ? "danger" : null };
          }),
          footer: `${sum.workingDays} working days.`, empty: "No students in this section.",
        };
      }
      const rows: ReportRow[] = [];
      let working = 0;
      for (const s of sections) {
        const sum = await attendanceSummary(tx, ctx, { sectionId: s.id, from, to, today: input.today });
        working = sum.workingDays;
        const below = [...sum.people.values()].filter((p) => p.percent !== null && p.percent < settings.thresholdPercent).length;
        rows.push({ who: s.name, students: sum.people.size, absent: sum.overall.absent, late: sum.overall.late, below, percent: pct(sum.overall.percent), _tone: sum.overall.percent !== null && sum.overall.percent < settings.thresholdPercent ? "danger" : null });
      }
      return {
        title: `Monthly attendance ${monthLabel(from)}`, filters: `Month ${monthLabel(from)}`,
        columns: [
          { key: "who", label: "Class and section", phone: "title" }, { key: "students", label: "Students", numeric: true }, { key: "absent", label: "Absent days", numeric: true, phone: "meta" },
          { key: "late", label: "Late marks", numeric: true }, { key: "below", label: `Below ${settings.thresholdPercent}%`, numeric: true, phone: "meta" }, { key: "percent", label: "%", numeric: true, phone: "badge" },
        ],
        rows, footer: `${working} working days.`, empty: "No classes to show.",
      };
    }
    case "staff-monthly": {
      if (!staffAll) return { title: "Staff monthly", filters: "", columns: [], rows: [], empty: "Only HR, the School Admin or the Principal can see this report." };
      const from = monthStart(input.month);
      const to = monthEnd(input.month);
      const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, joiningDate: { lte: to }, AND: [staffLimit(access)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } });
      const sum = await attendanceSummary(tx, ctx, { staffIds: staff.map((s) => s.id), from, to, today: input.today, campusId: access.campusId });
      return {
        title: `Staff monthly attendance ${monthLabel(from)}`, filters: `Month ${monthLabel(from)}`,
        columns: [
          { key: "who", label: "Staff member", phone: "title" }, { key: "code", label: "Staff ID" }, { key: "present", label: "Present", numeric: true, phone: "meta" },
          { key: "absent", label: "Absent", numeric: true }, { key: "late", label: "Late", numeric: true, phone: "meta" }, { key: "leave", label: "Leave", numeric: true }, { key: "percent", label: "%", numeric: true, phone: "badge" },
        ],
        rows: staff.map((s) => { const p = sum.people.get(s.id)!; return { who: s.fullName, code: s.staffCode, present: p.present, absent: p.absent, late: p.late, leave: p.leave, percent: pct(p.percent) }; }),
        footer: `${sum.workingDays} working days.`, empty: "No staff for this month.",
      };
    }
    case "range": {
      const [kind, id] = (input.person ?? "").split(":");
      if (!id) return { title: "Date range", filters: "", columns: [], rows: [], empty: "Choose a student or staff member and the dates." };
      if (kind === "staff" && !staffAll && id !== access.staffId) return { title: "Date range", filters: "", columns: [], rows: [], empty: "You can only see your own attendance." };
      if (kind === "staff" && !staffAllowed(access, id)) return { title: "Date range", filters: "", columns: [], rows: [], empty: "This staff member was not found." };
      if (kind === "student") {
        const sections = await sectionsInReach(tx, access);
        const enrolled = await tx.enrolment.findFirst({ where: { studentId: id, sectionId: { in: sections.map((s) => s.id) }, archivedAt: null } });
        if (!enrolled) return { title: "Date range", filters: "", columns: [], rows: [], empty: "This student is not in one of your classes." };
      }
      const who = kind === "staff" ? await tx.staff.findFirst({ where: { id }, select: { fullName: true } }) : await tx.student.findFirst({ where: { id }, select: { fullName: true } });
      const sum = await attendanceSummary(tx, ctx, { ...(kind === "staff" ? { staffId: id } : { studentId: id }), from: input.from, to: input.to, today: input.today });
      const days = sum.days.get(id) ?? new Map<string, string>();
      const marks = await tx.attendanceMark.findMany({ where: { ...(kind === "staff" ? { staffId: id } : { studentId: id }), date: { gte: input.from, lte: input.to }, archivedAt: null, periodNo: 0 }, select: { date: true, note: true, lateMinutes: true, absenceReason: true, absenceNote: true } });
      const notes = new Map(marks.map((m) => [isoDay(m.date), m]));
      // Absence reasons, when any are recorded ("Fees dispute" shows as Other without the school's fees).
      const withReasons = marks.some((m) => m.absenceReason);
      const absentStatus = await absentKeys(tx, ctx);
      const why = (k: string) => {
        const s = notes.get(k);
        const st = days.get(k);
        // An absent day with no reason saved is "Not known yet", as on every other screen.
        const r = s && st && absentStatus.has(st) ? absentReason(s, access.seesFees) : s ? shownReason(s, access.seesFees) : null;
        return r ? `${r.label}${r.note ? `: ${r.note}` : ""}` : "";
      };
      const p = sum.people.get(id)!;
      return {
        title: `Attendance of ${who?.fullName ?? "person"}, ${dayText(input.from)} to ${dayText(input.to)}`, filters: `${who?.fullName ?? ""}, ${dayText(input.from)} to ${dayText(input.to)}`,
        columns: [{ key: "date", label: "Date", phone: "title" }, { key: "status", label: "Status", phone: "badge" }, ...(withReasons ? [{ key: "reason", label: "Reason" }] : []), { key: "late", label: "Minutes late", numeric: true }, { key: "note", label: "Note", phone: "meta" }],
        rows: sum.workingOf(id).map((d) => {
          const k = isoDay(d);
          const st = days.get(k);
          return { date: dayText(d), status: st ? statusName.get(st) ?? st : "Not marked", ...(withReasons ? { reason: why(k) } : {}), late: notes.get(k)?.lateMinutes ?? null, note: notes.get(k)?.note ?? "", _tone: st === "absent" ? "danger" : st === "late" ? "warning" : null };
        }),
        footer: `${p.workingDays} working days · ${p.countedDays} counted · present ${p.present} · absent ${p.absent} · late ${p.late} · leave ${p.leave} · ${pct(p.percent)}.`,
        empty: "No working days in these dates.",
      };
    }
    case "trends": {
      const sections = await sectionsInReach(tx, access);
      const year = access.yearId ? await tx.academicYear.findUnique({ where: { id: access.yearId } }) : null;
      if (!year) return { title: "% and trends", filters: "", columns: [], rows: [], empty: "There is no current academic year." };
      const months: Date[] = [];
      for (let m = monthStart(year.startDate); m <= input.today && m <= year.endDate; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push(m);
      const withClass = await tx.section.findMany({ where: { id: { in: sections.map((s) => s.id) } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } });
      withClass.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder);
      const classes = new Map<string, string[]>();
      for (const s of withClass) classes.set(s.schoolClass.name, [...(classes.get(s.schoolClass.name) ?? []), s.id]);
      const rows: ReportRow[] = [];
      const statusBy = statusMap(statuses);
      // Every class's students in one read, and one summary of all of them for all the months (G37: it was one per class and month).
      // A person's day status does not depend on the range or on who else is in it, so a class's month is its students' days of that month.
      const enrolled = await tx.enrolment.findMany({ where: { sectionId: { in: withClass.map((s) => s.id) }, archivedAt: null }, select: { studentId: true, sectionId: true } });
      const whole = months.length ? await attendanceSummary(tx, ctx, { studentIds: [...new Set(enrolled.map((e) => e.studentId))], from: months[0], to: monthEnd(months[months.length - 1]), today: input.today }) : null;
      for (const [cls, ids] of classes) {
        const inClass = new Set(ids);
        const studentIds = enrolled.filter((e) => inClass.has(e.sectionId)).map((e) => e.studentId);
        const row: ReportRow = { who: cls };
        let yearPresent = 0;
        let yearCounted = 0;
        for (const m of months) {
          const key = isoDay(m).slice(0, 7);
          const month: PersonSummary = { workingDays: 0, markedDays: 0, countedDays: 0, present: 0, absent: 0, late: 0, leave: 0, byStatus: {}, percent: null };
          for (const id of studentIds) for (const [day, st] of whole?.days.get(id) ?? []) if (day.startsWith(key)) addDay(month, st, statusBy);
          finish(month);
          row[key] = month.countedDays ? pct(month.percent) : "";
          yearPresent += month.present;
          yearCounted += month.countedDays;
        }
        row.year = yearCounted ? pct(Math.round((yearPresent / yearCounted) * 1000) / 10) : "";
        rows.push(row);
      }
      return {
        title: `Attendance % and trends ${year.name}`, filters: `Academic year ${year.name}`,
        columns: [{ key: "who", label: "Class", phone: "title" }, ...months.map((m) => ({ key: isoDay(m).slice(0, 7), label: monthLabel(m).split(" ")[0].slice(0, 3), numeric: true })), { key: "year", label: "Year", numeric: true, phone: "badge" as const }],
        rows, empty: "No classes to show.",
      };
    }
    case "chronic": {
      const sections = await sectionsInReach(tx, access);
      const enrol = await tx.enrolment.findMany({ where: { sectionId: { in: sections.map((s) => s.id) }, archivedAt: null, status: "STUDYING" }, select: { studentId: true, sectionId: true } });
      const flags = await tx.attendanceFlag.findMany({ where: { studentId: { in: enrol.map((e) => e.studentId) }, ...OPEN_ATTENDANCE_FLAG }, orderBy: { raisedOn: "desc" } });
      const people = new Map((await tx.student.findMany({ where: { id: { in: flags.map((f) => f.studentId) } }, select: { id: true, fullName: true, admissionNo: true } })).map((s) => [s.id, s]));
      const sectionOf = new Map(enrol.map((e) => [e.studentId, sections.find((s) => s.id === e.sectionId)?.name ?? ""]));
      return {
        title: "Chronic absence", filters: `Below ${settings.thresholdPercent}% or absent ${settings.chronicDays} days in a row; open flags`,
        columns: [{ key: "who", label: "Student", phone: "title" }, { key: "class", label: "Class", phone: "meta" }, { key: "kind", label: "Flag", phone: "badge" }, { key: "value", label: "Value", numeric: true }, { key: "since", label: "Flagged on", phone: "meta" }, { key: "review", label: "Review" }],
        rows: flags.map((f) => ({
          who: people.get(f.studentId)?.fullName ?? "Student", class: sectionOf.get(f.studentId) ?? "",
          kind: f.kind === "below-threshold" ? `Below ${settings.thresholdPercent}%` : "Absent days in a row",
          value: f.kind === "below-threshold" ? `${Number(f.value)}%` : `${Number(f.value)} days`, since: dayText(f.raisedOn),
          review: `${FLAG_STATUS_LABEL[flagStatusOf(f)]}${f.action ? `: ${f.action}` : ""}`, _tone: "danger",
        })),
        empty: "No student is flagged now. Flags clear on their own when attendance recovers, or when a person closes them in Early Warnings.",
      };
    }
    case "late": {
      const from = input.dates?.from ?? monthStart(input.month);
      const to = input.dates?.to ?? monthEnd(input.month);
      const words = input.dates ? `${dayText(from)} to ${dayText(to)}` : monthLabel(from);
      const rows: ReportRow[] = [];
      if (students) {
        const sections = await sectionsInReach(tx, access);
        const marks = await tx.attendanceMark.groupBy({ by: ["studentId", "sectionId"], where: { statusKey: "late", date: { gte: from, lte: to }, archivedAt: null, studentId: { not: null }, sectionId: { in: sections.map((s) => s.id) } }, _count: true });
        const people = new Map((await tx.student.findMany({ where: { id: { in: marks.map((m) => m.studentId!) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
        for (const m of marks.sort((a, b) => b._count - a._count)) rows.push({ who: people.get(m.studentId!) ?? "Student", kind: "Student", group: sections.find((s) => s.id === m.sectionId)?.name ?? "", count: m._count, minutes: "" });
      }
      if (staffAll) {
        const marks = await tx.attendanceMark.groupBy({ by: ["staffId"], where: { statusKey: { in: ["late", "half-day"] }, lateMinutes: { gt: 0 }, date: { gte: from, lte: to }, archivedAt: null, staffId: { not: null }, ...staffIdLimit(access) }, _count: true, _sum: { lateMinutes: true } });
        const people = new Map((await tx.staff.findMany({ where: { id: { in: marks.map((m) => m.staffId!) } }, select: { id: true, fullName: true, designation: true } })).map((s) => [s.id, s]));
        for (const m of marks.sort((a, b) => b._count - a._count)) rows.push({ who: people.get(m.staffId!)?.fullName ?? "Staff", kind: "Staff", group: people.get(m.staffId!)?.designation ?? "", count: m._count, minutes: minutesText(m._sum.lateMinutes ?? 0) });
      }
      return {
        title: `Late arrivals ${words}`, filters: input.dates ? `Dates ${words}` : `Month ${words}`,
        columns: [{ key: "who", label: "Name", phone: "title" }, { key: "kind", label: "Student or staff" }, { key: "group", label: "Class or designation", phone: "meta" }, { key: "count", label: "Late days", numeric: true, phone: "badge" }, { key: "minutes", label: "Minutes late in all" }],
        rows, empty: input.dates ? "Nobody was late in these dates." : "Nobody was late this month.",
      };
    }
    case "leave": {
      const sections = await sectionsInReach(tx, access);
      const year = access.yearId ? await tx.academicYear.findUnique({ where: { id: access.yearId } }) : null;
      const from = input.dates?.from ?? (input.period === "year" && year ? year.startDate : monthStart(input.month));
      const to = input.dates?.to ?? (input.period === "year" && year ? year.endDate : monthEnd(input.month));
      const enrol = await tx.enrolment.findMany({ where: { sectionId: { in: sections.map((s) => s.id) }, archivedAt: null }, select: { studentId: true, sectionId: true } });
      const sectionOf = new Map(enrol.map((e) => [e.studentId, e.sectionId]));
      const leave = await tx.leaveRequest.findMany({ where: { studentId: { in: enrol.map((e) => e.studentId) }, archivedAt: null, status: "APPROVED", fromDate: { lte: to }, toDate: { gte: from } }, select: { studentId: true, leaveTypeId: true, days: true } });
      const types = new Map((await tx.leaveType.findMany({ where: { forWhom: "student" }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
      const agg = new Map<string, { cls: string; type: string; requests: number; days: number }>();
      for (const l of leave) {
        const cls = sections.find((s) => s.id === sectionOf.get(l.studentId!))?.name ?? "";
        const type = types.get(l.leaveTypeId) ?? "Leave";
        const k = `${cls}|${type}`;
        const a = agg.get(k) ?? { cls, type, requests: 0, days: 0 };
        a.requests++;
        a.days += Number(l.days);
        agg.set(k, a);
      }
      const label = input.dates ? `Dates ${dayText(from)} to ${dayText(to)}` : input.period === "year" && year ? `Academic year ${year.name}` : `Month ${monthLabel(from)}`;
      return {
        title: `Student leave ${label.replace(/^(Month|Dates) /, "")}`, filters: `${label}; approved leave`,
        columns: [{ key: "cls", label: "Class and section", phone: "title" }, { key: "type", label: "Leave type", phone: "meta" }, { key: "requests", label: "Requests", numeric: true }, { key: "days", label: "Days", numeric: true, phone: "badge" }],
        rows: [...agg.values()].sort((a, b) => a.cls.localeCompare(b.cls) || a.type.localeCompare(b.type)), empty: "No approved student leave in this period.",
      };
    }
    case "reasons": return reasonsReport(tx, ctx, access, input);
    case "overtime": {
      if (!staffAll) return { title: "Overtime and shifts", filters: "", columns: [], rows: [], empty: "Only HR, the School Admin or the Principal can see this report." };
      const from = input.dates?.from ?? monthStart(input.month);
      const to = input.dates?.to ?? monthEnd(input.month);
      const words = input.dates ? `${dayText(from)} to ${dayText(to)}` : monthLabel(from);
      const ot = await tx.overtimeEntry.groupBy({ by: ["staffId"], where: { archivedAt: null, date: { gte: from, lte: to }, ...staffIdLimit(access) }, _sum: { minutes: true }, _count: true });
      const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [staffLimit(access)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } });
      const assignments = await tx.staffShiftAssignment.findMany({ where: { archivedAt: null, fromDate: { lte: to } }, orderBy: { fromDate: "desc" }, include: { shift: true } });
      const shiftOf = new Map<string, string>();
      for (const a of assignments) if (!shiftOf.has(a.staffId) && !a.shift.archivedAt) shiftOf.set(a.staffId, a.shift.name);
      const sum = await attendanceSummary(tx, ctx, { staffIds: staff.map((s) => s.id), from, to, today: input.today, campusId: access.campusId });
      return {
        title: `Overtime and shifts ${words}`, filters: input.dates ? `Dates ${words}` : `Month ${words}`,
        columns: [{ key: "who", label: "Staff member", phone: "title" }, { key: "shift", label: "Shift", phone: "meta" }, { key: "late", label: "Late days", numeric: true }, { key: "percent", label: "Attendance %", numeric: true }, { key: "entries", label: "Overtime entries", numeric: true }, { key: "hours", label: "Overtime hours", numeric: true, phone: "badge" }],
        rows: staff.map((s) => {
          const o = ot.find((x) => x.staffId === s.id);
          const p = sum.people.get(s.id)!;
          return { who: s.fullName, shift: shiftOf.get(s.id) ?? "School hours", late: p.late, percent: pct(p.percent), entries: o?._count ?? 0, hours: o ? Math.round(((o._sum.minutes ?? 0) / 60) * 100) / 100 : 0 };
        }),
        empty: "No staff.",
      };
    }
    case "devices": {
      if (!staffAll && !access.admin) return { title: "Device health", filters: "", columns: [], rows: [], empty: "Only the School Admin or the Principal can see this report." };
      const from = new Date(input.from);
      const to = new Date(input.to.getTime() + 24 * 3600 * 1000);
      const devices = await tx.attendanceDevice.findMany({ where: { archivedAt: null, ...inCampus({ campusId: access.campusLimit }) }, orderBy: { name: "asc" } });
      const health = await deviceHealth(tx, ctx, from, to);
      return {
        title: `Device health ${dayText(input.from)} to ${dayText(input.to)}`, filters: `${dayText(input.from)} to ${dayText(input.to)}`,
        columns: [{ key: "who", label: "Device", phone: "title" }, { key: "received", label: "Punches received", numeric: true, phone: "meta" }, { key: "rejected", label: "Rejected", numeric: true, phone: "badge" }, { key: "reasons", label: "Why rejected", phone: "meta" }],
        rows: devices.map((d) => {
          const h = health.get(d.id) ?? { received: 0, rejected: 0, reasons: {} };
          return { who: `${d.name} (${d.serialNo})`, received: h.received, rejected: h.rejected, reasons: Object.entries(h.reasons).map(([k, n]) => `${n} ${REJECT_WORDS[k]?.toLowerCase() ?? k}`).join(", "), _tone: h.rejected ? "warning" : null };
        }),
        empty: "No devices are added yet.",
      };
    }
  }
  // Every key is handled above.
  return { title: "Report", filters: "", columns: [], rows: [], empty: "Choose a report." };
}

/**
 * Absence reasons (gap list P1.8): absent days by reason for each class in
 * reach, or, with one reason chosen, every absent day with it. "Fees dispute"
 * is counted as Other for people without the school's fees.
 */
async function reasonsReport(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: ReportInput): Promise<ReportTable> {
  const from = input.dates?.from ?? monthStart(input.month);
  const to = input.dates?.to ?? monthEnd(input.month);
  const words = input.dates ? `${dayText(from)} to ${dayText(to)}` : monthLabel(from);
  const all = await sectionsInReach(tx, access);
  const sections = input.sectionId ? all.filter((s) => s.id === input.sectionId) : all;
  const keys = await absentKeys(tx, ctx);
  // Each section's own school days (its campus and class).
  const calendar = await loadSchoolCalendar(tx, ctx, from, to);
  const placed = await tx.section.findMany({ where: { id: { in: sections.map((s) => s.id) } }, select: { id: true, classId: true, schoolClass: { select: { campusId: true } } } });
  const workingOf = new Map(placed.map((p) => [p.id, new Set(calendar.campus(p.schoolClass.campusId).working({ classId: p.classId }).map(isoDay))]));
  const schoolDayCount = calendar.campus(access.campusId).working().length;
  const marks = sections.length ? await tx.attendanceMark.findMany({
    where: { sectionId: { in: sections.map((s) => s.id) }, studentId: { not: null }, date: { gte: from, lte: to }, archivedAt: null, statusKey: { in: [...keys] } },
    orderBy: [{ date: "asc" }, { periodNo: "asc" }],
    select: { studentId: true, sectionId: true, date: true, absenceReason: true, absenceNote: true, reasonSource: true },
  }) : [];
  // One absent day per student and date: the first reason recorded that day.
  const byDay = new Map<string, (typeof marks)[number]>();
  for (const m of marks) {
    if (!m.sectionId || !workingOf.get(m.sectionId)?.has(isoDay(m.date))) continue;
    const k = `${m.studentId}:${isoDay(m.date)}`;
    const cur = byDay.get(k);
    if (!cur || (!cur.absenceReason && m.absenceReason)) byDay.set(k, m);
  }
  const daysList = [...byDay.values()].map((m) => ({ ...m, shown: absentReason(m, access.seesFees) }));
  const sectionName = new Map(all.map((s) => [s.id, s.name]));
  const label = `${input.sectionId ? `${sectionName.get(input.sectionId) ?? "Class"}, ` : ""}${input.dates ? `dates ${words}` : `month ${words}`}`;
  // "none" (an old link for "Not recorded") is "Not known yet" now: one word for an absence with no reason.
  const asked = input.reason === "none" ? DEFAULT_REASON : input.reason;
  const wanted = asked && reasonChoices(access.seesFees).some((r) => r.key === asked) ? asked : null;
  if (wanted) {
    const list = daysList.filter((d) => d.shown.key === wanted);
    const people = new Map((await tx.student.findMany({ where: { id: { in: [...new Set(list.map((d) => d.studentId!))] } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
    const reasonWord = ABSENCE_REASONS.find((r) => r.key === wanted)?.label ?? wanted;
    return {
      title: `Absences: ${reasonWord}, ${words}`, filters: `${label}; reason ${reasonWord}`,
      columns: [{ key: "date", label: "Date", phone: "meta" }, { key: "who", label: "Student", phone: "title" }, { key: "class", label: "Class", phone: "meta" }, { key: "reason", label: "Reason", phone: "badge" }, { key: "note", label: "Note" }, { key: "source", label: "Recorded from" }],
      rows: list.map((d) => ({ date: dayText(d.date), who: people.get(d.studentId!) ?? "Student", class: sectionName.get(d.sectionId ?? "") ?? "", reason: d.shown.label, note: d.shown.note ?? "", source: d.shown.source ? SOURCE_WORDS[d.shown.source] ?? d.shown.source : "", _tone: d.shown.key === DEFAULT_REASON ? "warning" : null })),
      footer: `${list.length} absent ${list.length === 1 ? "day" : "days"}.`, empty: "No absences with this reason in these dates.",
    };
  }
  const shownKeys = ABSENCE_REASONS.map((r) => r.key as string).filter((k) => access.seesFees || k !== FEE_REASON);
  const count = (list: typeof daysList) => {
    const row: ReportRow = { absent: list.length };
    for (const k of shownKeys) row[k] = 0;
    for (const d of list) { const k = d.shown.key; row[k] = Number(row[k] ?? 0) + 1; }
    return row;
  };
  const rows: ReportRow[] = sections.map((s): ReportRow => ({ who: s.name, ...count(daysList.filter((d) => d.sectionId === s.id)) })).filter((r) => Number(r.absent) > 0);
  if (rows.length > 1) rows.push({ who: "All classes", ...count(daysList), _tone: null });
  return {
    title: `Absence reasons ${words}`, filters: `${label}; absent days by reason`,
    columns: [
      { key: "who", label: "Class and section", phone: "title" }, { key: "absent", label: "Absent days", numeric: true, phone: "badge" },
      ...shownKeys.map((k) => ({ key: k, label: ABSENCE_REASONS.find((r) => r.key === k)!.label, numeric: true, ...(k === "not-known" ? { phone: "meta" as const } : {}) })),
    ],
    rows, footer: `${schoolDayCount} working days. A day absent in several periods counts once.`, empty: "Nobody was absent in these dates.",
  };
}

/** People for the date-range report: students in reach, and staff when allowed. */
export async function rangePeople(tx: Tx, access: AttendanceAccess, sectionId: string | null) {
  const out: { value: string; label: string }[] = [];
  if (access.students !== "none" && sectionId) {
    const sections = await registerChoices(tx, access);
    if (sections.some((s) => s.id === sectionId)) {
      const rows = await tx.enrolment.findMany({ where: { sectionId, archivedAt: null, status: "STUDYING" }, include: { student: { select: { id: true, fullName: true } } }, orderBy: { rollNo: "asc" } });
      for (const r of rows) out.push({ value: `student:${r.student.id}`, label: `${r.rollNo ? `${r.rollNo}. ` : ""}${r.student.fullName}` });
    }
  }
  if (access.staff === "all") {
    const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [staffLimit(access)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } });
    for (const s of staff) out.push({ value: `staff:${s.id}`, label: `Staff: ${s.fullName} (${s.staffCode})` });
  } else if (access.staff === "self" && access.staffId) {
    out.push({ value: `staff:${access.staffId}`, label: "Me (staff attendance)" });
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a report's choices from the page address, with safe defaults. */
export function readReportInput(get: (k: string) => string | null | undefined, today: Date, allowed: ReportKey[]): ReportInput {
  const pick = get("report") as ReportKey | null;
  const report = pick && allowed.includes(pick) ? pick : allowed[0] ?? "daily";
  const d = (k: string, fallback: Date) => {
    const v = get(k);
    if (!v || !ISO.test(v)) return fallback;
    const x = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(x.getTime()) ? fallback : x > today ? today : x;
  };
  const m = get("month");
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? new Date(`${m}-01T00:00:00Z`) : monthStart(today);
  let from = d("from", monthStart(today));
  let to = d("to", today);
  if (to < from) [from, to] = [to, from];
  const section = get("section");
  const person = get("person");
  return {
    report, date: d("date", today), month, from, to,
    sectionId: section && UUID.test(section) ? section : null,
    person: person && /^(student|staff):[0-9a-f-]{36}$/i.test(person) ? person : null,
    period: get("period") === "year" ? "year" : "month",
    reason: (() => { const v = get("reason"); return v && (v === "none" || isReason(v)) ? v : null; })(),
    today,
  };
}
