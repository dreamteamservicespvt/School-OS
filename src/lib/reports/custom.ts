// Custom & Scheduled Reports (19 §2, optional page: School Feature
// "reports-custom"). A person builds a report from one data area with the
// columns, filters, grouping and totals they choose (only fields they may
// see are offered), and any saved or catalogue report can be emailed every
// day, week or month to chosen staff, who must be allowed to see that data.
// Each email is made with the recipient's own permissions, so it has the same
// numbers they would see on screen.
import "server-only";

import { randomUUID } from "node:crypto";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { logExport, type ExportFormat } from "../exports";
import { yearsFor } from "../academic/years";
import { attendanceSummary } from "../attendance/summary";
import { defaulters } from "../fees/defaulters";
import { formatDateTime } from "../format";
import { dayStartUtc } from "../periods";
import { notify } from "../notifications";
import { sendMessage } from "../messaging";
import { fileStore } from "../storage";
import { todayIn } from "../staff/dates";
import { defineSchedule } from "../jobs";
import { reportAccess, BASE } from "./access";
import { entryAllowed, findEntry } from "./catalogue";
import { readFilters } from "./filters";
import { reportFile, runEntry, runWords, viewerOf } from "./run";
import type { Category, Column, ReportEntry, ReportViewer, Row, Table } from "./types";

export class CustomProblem extends Error {
  constructor(message: string, readonly field?: string) { super(message); this.name = "CustomProblem"; }
}

export type AreaKey = "students" | "fees" | "attendance" | "exams" | "staff";
type Field = { key: string; label: string; kind?: Column["kind"] };
export const AREAS: Record<AreaKey, { label: string; category: Category; fields: Field[]; show: { value: string; label: string }[] }> = {
  students: {
    label: "Students", category: "Students",
    fields: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "adm", label: "Admission no." }, { key: "father", label: "Father" }, { key: "phone", label: "Phone" }, { key: "status", label: "Status" }, { key: "gender", label: "Boy or girl" }, { key: "dob", label: "Date of birth", kind: "date" }, { key: "category", label: "Social category" }],
    show: [{ value: "all", label: "Any status" }, { value: "active", label: "Active only" }, { value: "new", label: "New this year" }],
  },
  fees: {
    label: "Fees", category: "Fees",
    fields: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "overdue", label: "Overdue amount", kind: "money" }, { key: "days", label: "Days late", kind: "number" }, { key: "heads", label: "For" }, { key: "parent", label: "Parent" }, { key: "phone", label: "Parent phone" }],
    show: [{ value: "all", label: "Everyone overdue" }, { value: "30", label: "Overdue over 30 days" }, { value: "60", label: "Overdue over 60 days" }],
  },
  attendance: {
    label: "Attendance", category: "Attendance",
    fields: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "att", label: "Attendance %", kind: "percent" }, { key: "absent", label: "Days absent", kind: "number" }, { key: "late", label: "Days late", kind: "number" }],
    show: [{ value: "all", label: "Any attendance" }, { value: "80", label: "Below 80%" }, { value: "90", label: "Below 90%" }],
  },
  exams: {
    label: "Exam marks", category: "Exams",
    fields: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "prev", label: "Exam before %", kind: "percent" }, { key: "last", label: "Latest exam %", kind: "percent" }, { key: "change", label: "Change", kind: "number" }],
    show: [{ value: "all", label: "All students" }, { value: "drop", label: "Marks fell 15% or more" }],
  },
  staff: {
    label: "Staff", category: "Staff and HR",
    fields: [{ key: "name", label: "Name" }, { key: "dept", label: "Department" }, { key: "role", label: "Designation" }, { key: "joined", label: "Joined", kind: "date" }, { key: "phone", label: "Phone" }, { key: "type", label: "Type" }],
    show: [{ value: "all", label: "All departments" }, { value: "Teaching", label: "Teaching only" }, { value: "Non-teaching", label: "Non-teaching only" }],
  },
};
export const AREA_KEYS = Object.keys(AREAS) as AreaKey[];
export const isArea = (v: string): v is AreaKey => (AREA_KEYS as string[]).includes(v);

/** The data areas this person may build from: the area's report category, as in All Reports. */
export function areasFor(who: ReportViewer) {
  const a = reportAccess(who);
  return AREA_KEYS.filter((k) => a.cats.includes(AREAS[k].category) && !a.own && (k !== "fees" || a.fees));
}

export type CustomSpec = { area: AreaKey; columns: string[]; classId: string | null; show: string; group: "none" | "class" | "gender"; totals: boolean };

export function cleanSpec(raw: { area: string; columns: string[]; classId?: string | null; show?: string; group?: string; totals?: boolean }, who: ReportViewer): CustomSpec {
  if (!isArea(raw.area) || !areasFor(who).includes(raw.area)) throw new CustomProblem("Pick a data area you may see.", "area");
  const fields = AREAS[raw.area].fields.map((f) => f.key);
  const columns = fields.filter((f) => raw.columns.includes(f));
  if (!columns.length) throw new CustomProblem("Pick at least one column.", "columns");
  const show = AREAS[raw.area].show.some((s) => s.value === raw.show) ? raw.show! : "all";
  const group = raw.area !== "staff" && (raw.group === "class" || raw.group === "gender") ? raw.group : "none";
  return { area: raw.area, columns, classId: raw.classId && /^[0-9a-f-]{36}$/i.test(raw.classId) ? raw.classId : null, show, group, totals: raw.totals !== false };
}

/** Runs a custom report with the person's permissions; the same rows on screen, in the file and in the email. */
export async function runCustom(tx: Tx, who: ReportViewer, spec: CustomSpec, today: Date): Promise<Table> {
  if (!areasFor(who).includes(spec.area)) throw new CustomProblem(`${who.user.displayName} cannot see ${AREAS[spec.area].label.toLowerCase()} data.`);
  // Each campus's current year (a school's campuses can start the year on different dates);
  // a person limited to one campus sees only that campus's students and staff.
  const campus = who.campusId ? { campusId: who.campusId } : {};
  const years = await yearsFor(tx, who.ctx, who.campusId);
  const year = years.length ? { ids: years.map((y) => y.id), startDate: new Date(Math.min(...years.map((y) => y.startDate.getTime()))) } : null;
  const fields = AREAS[spec.area].fields.filter((f) => spec.columns.includes(f.key));
  let rows: (Row & { _cls?: string; _gender?: string })[] = [];
  if (spec.area === "staff") {
    const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, ...campus, ...(spec.show === "Teaching" ? { staffType: "Teaching" } : spec.show === "Non-teaching" ? { staffType: { not: "Teaching" } } : {}) }, include: { department: { select: { name: true } } }, orderBy: { fullName: "asc" } });
    rows = staff.map((s) => ({ name: s.fullName, dept: s.department?.name ?? "", role: s.designation, joined: s.joiningDate, phone: s.phone, type: s.staffType }));
  } else if (year) {
    const enrol = await tx.enrolment.findMany({ where: { academicYearId: { in: year.ids }, archivedAt: null, status: "STUDYING", student: { archivedAt: null, ...campus }, ...(spec.classId ? { classId: spec.classId } : {}) }, include: { student: { include: { guardians: { where: { archivedAt: null }, orderBy: [{ isPrimary: "desc" }], include: { guardian: { select: { name: true, phone: true, relationship: true } } } } } } } });
    const sections = new Map((await tx.section.findMany({ where: { id: { in: [...new Set(enrol.map((e) => e.sectionId))] } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } })).map((s) => [s.id, s]));
    enrol.sort((a, b) => { const x = sections.get(a.sectionId), y = sections.get(b.sectionId); return ((x?.schoolClass.sortOrder ?? 0) - (y?.schoolClass.sortOrder ?? 0)) || (x?.name ?? "").localeCompare(y?.name ?? "") || (a.rollNo ?? 999) - (b.rollNo ?? 999) || a.student.fullName.localeCompare(b.student.fullName); });
    const label = (sid: string) => { const s = sections.get(sid); return s ? `${s.schoolClass.name.replace(/^Class\s+/i, "")} ${s.name}` : ""; };
    const className = (sid: string) => sections.get(sid)?.schoolClass.name ?? "";
    const gender = (g: string | null) => (g === "Female" ? "Girl" : g === "Male" ? "Boy" : g ?? "");
    if (spec.area === "students") {
      const ids = new Set(spec.show === "new" ? (await tx.student.findMany({ where: { joiningDate: { gte: year.startDate }, ...campus }, select: { id: true } })).map((s) => s.id) : []);
      rows = enrol.filter((e) => spec.show !== "active" || e.student.status === "ACTIVE").filter((e) => spec.show !== "new" || ids.has(e.studentId)).map((e) => {
        const father = e.student.guardians.find((g) => /father/i.test(g.relationship))?.guardian.name ?? "";
        return { name: e.student.fullName, cls: label(e.sectionId), adm: e.student.admissionNo, father, phone: e.student.guardians[0]?.guardian.phone ?? "", status: e.student.status.charAt(0) + e.student.status.slice(1).toLowerCase(), gender: gender(e.student.gender), dob: e.student.dateOfBirth, category: e.student.category ?? "", _cls: className(e.sectionId), _gender: gender(e.student.gender) };
      });
    } else if (spec.area === "fees") {
      const d = await defaulters(tx, who.ctx, { userId: who.user.id, see: "all", change: "none", roleKeys: [], sectionIds: null, yearId: year.ids[0], yearIds: year.ids, campusId: who.campusId ?? null }, today, { classId: spec.classId });
      const g = new Map(enrol.map((e) => [e.studentId, e]));
      rows = d.rows.filter((r) => spec.show === "all" || r.daysOverdue > Number(spec.show)).map((r) => ({ name: r.name, cls: r.classLabel, overdue: r.overduePaise, days: r.daysOverdue, heads: r.heads, parent: r.parentName ?? "", phone: r.phone ?? "", _cls: r.className, _gender: gender(g.get(r.studentId)?.student.gender ?? null) }));
    } else if (spec.area === "attendance") {
      // Each campus's students from their own year's first day.
      const sums = await Promise.all(years.map((y) => {
        const ids = enrol.filter((e) => e.academicYearId === y.id).map((e) => e.studentId);
        return ids.length ? attendanceSummary(tx, who.ctx, { studentIds: ids, from: y.startDate, to: today, today }) : null;
      }));
      const sum = { people: new Map(sums.flatMap((x) => (x ? [...x.people.entries()] : []))) };
      rows = enrol.map((e) => { const s = sum.people.get(e.studentId); return { name: e.student.fullName, cls: label(e.sectionId), att: s?.percent ?? null, absent: s?.absent ?? 0, late: s?.late ?? 0, _cls: className(e.sectionId), _gender: gender(e.student.gender) }; })
        .filter((r) => spec.show === "all" || (r.att !== null && Number(r.att) < Number(spec.show)));
    } else {
      const res = await tx.result.findMany({ where: { academicYearId: { in: year.ids }, examId: { not: null }, status: "PUBLISHED", studentId: { in: enrol.map((e) => e.studentId) } }, select: { studentId: true, examId: true, percent: true } });
      const exams = new Map((await tx.exam.findMany({ where: { id: { in: [...new Set(res.map((r) => r.examId!))] } }, select: { id: true, endDate: true } })).map((x) => [x.id, x.endDate.getTime()]));
      rows = enrol.map((e) => {
        const mine = res.filter((r) => r.studentId === e.studentId && r.percent !== null).sort((a, b) => (exams.get(a.examId!) ?? 0) - (exams.get(b.examId!) ?? 0));
        const last = mine[mine.length - 1]?.percent ?? null, prev = mine[mine.length - 2]?.percent ?? null;
        return { name: e.student.fullName, cls: label(e.sectionId), prev, last, change: last !== null && prev !== null ? Math.round((last - prev) * 10) / 10 : null, _cls: className(e.sectionId), _gender: gender(e.student.gender) };
      }).filter((r) => spec.show !== "drop" || (r.change !== null && Number(r.change) <= -15));
    }
  }

  if (spec.group !== "none") {
    const by = new Map<string, typeof rows>();
    for (const r of rows) { const k = (spec.group === "class" ? r._cls : r._gender) || "Not recorded"; by.set(k, [...(by.get(k) ?? []), r]); }
    const extra: Column[] = spec.area === "fees" ? [{ key: "overdue", label: "Overdue amount", kind: "money" }] : spec.area === "attendance" ? [{ key: "att", label: "Average attendance", kind: "percent" }] : spec.area === "exams" ? [{ key: "last", label: "Average, latest exam", kind: "percent" }] : [];
    const columns: Column[] = [{ key: "group", label: spec.group === "class" ? "Class" : "Boys or girls" }, { key: "count", label: spec.area === "fees" ? "Students overdue" : "Students", kind: "number" }, ...extra];
    const avg = (l: typeof rows, k: string) => { const v = l.map((r) => r[k]).filter((x): x is number => typeof x === "number"); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
    const out: Row[] = [...by.entries()].map(([k, l]) => ({ group: k, count: l.length, ...(spec.area === "fees" ? { overdue: l.reduce((s, r) => s + (r.overdue as bigint), BigInt(0)) } : {}), ...(spec.area === "attendance" ? { att: avg(l, "att") } : {}), ...(spec.area === "exams" ? { last: avg(l, "last") } : {}) }));
    const totals: Row | null = spec.totals && out.length ? { group: "Total", count: rows.length, ...(spec.area === "fees" ? { overdue: rows.reduce((s, r) => s + (r.overdue as bigint), BigInt(0)) } : {}), ...(spec.area === "attendance" ? { att: avg(rows, "att") } : {}), ...(spec.area === "exams" ? { last: avg(rows, "last") } : {}) } : null;
    return { columns, rows: out, totals };
  }
  const columns: Column[] = fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind }));
  const clean = rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? null])) as Row);
  let totals: Row | null = null;
  if (spec.totals && clean.length) {
    totals = Object.fromEntries(columns.map((c, i) => {
      if (i === 0) return [c.key, `Total, ${clean.length.toLocaleString("en-IN")}`];
      if (c.kind === "money") return [c.key, clean.reduce((s, r) => s + (typeof r[c.key] === "bigint" ? (r[c.key] as bigint) : BigInt(0)), BigInt(0))];
      if (c.kind === "percent") { const v = clean.map((r) => r[c.key]).filter((x): x is number => typeof x === "number"); return [c.key, v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null]; }
      if (c.kind === "number" && c.key !== "change") return [c.key, clean.reduce((s, r) => s + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0)];
      return [c.key, null];
    })) as Row;
  }
  return { columns, rows: clean, totals, note: spec.totals && columns.some((c) => c.kind === "percent") ? "The total line shows the average for % columns." : null };
}

/** Words for a custom report's filters: "Class 9 · Below 80% · by class". */
export async function specWords(tx: Tx, spec: CustomSpec) {
  const cls = spec.classId ? (await tx.schoolClass.findFirst({ where: { id: spec.classId }, select: { name: true } }))?.name ?? "One class" : spec.area === "staff" ? null : "All classes";
  const show = spec.show !== "all" ? AREAS[spec.area].show.find((s) => s.value === spec.show)?.label : null;
  return [cls, show, spec.group !== "none" ? `by ${spec.group === "class" ? "class" : "boys and girls"}` : null].filter(Boolean).join(" · ") || "All";
}

export const specOf = (r: { area: string; columns: string[]; filters: unknown }): CustomSpec => {
  const f = (r.filters ?? {}) as Partial<CustomSpec>;
  return { area: r.area as AreaKey, columns: r.columns, classId: f.classId ?? null, show: f.show ?? "all", group: f.group ?? "none", totals: f.totals !== false };
};

export async function saveCustom(tx: Tx, who: ReportViewer, name: string, spec: CustomSpec) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new CustomProblem("Give the report a name.", "name");
  if (clean.length > 80) throw new CustomProblem("Keep the name to 80 characters.", "name");
  const dup = await tx.customReport.findFirst({ where: { archivedAt: null, ownerId: who.user.id, name: { equals: clean, mode: "insensitive" } } });
  if (dup) throw new CustomProblem("You already have a report with this name.", "name");
  const r = await tx.customReport.create({ data: { schoolId: who.ctx.schoolId, name: clean, area: spec.area, columns: spec.columns, filters: { classId: spec.classId, show: spec.show, group: spec.group, totals: spec.totals }, ownerId: who.user.id } });
  await writeAudit(tx, who.ctx, { action: "created", recordType: "Custom Report", recordId: r.id, after: { name: clean, area: spec.area, columns: spec.columns } });
  return r;
}

/** Only the person who made a report or schedule changes it; the School Admin or Principal may too (someone may have left). */
const mayChange = (who: ReportViewer, ownerId: string | null) =>
  ownerId === who.user.id || who.roles.some((r) => r.key === "school-admin" || r.key === "principal");

export async function archiveCustom(tx: Tx, who: ReportViewer, id: string) {
  const r = await tx.customReport.findFirst({ where: { id, archivedAt: null } });
  if (!r) throw new CustomProblem("This report was not found.");
  if (!mayChange(who, r.ownerId)) throw new CustomProblem("Only the person who saved this report can archive it.");
  await tx.customReport.update({ where: { id }, data: { archivedAt: new Date() } });
  const scheds = await tx.reportSchedule.updateMany({ where: { reportKey: `c:${id}`, archivedAt: null }, data: { status: "PAUSED" } });
  await writeAudit(tx, who.ctx, { action: "archived", recordType: "Custom Report", recordId: id, after: { name: r.name, schedulesPaused: scheds.count } });
  return r;
}

/* ---------- Schedules ---------- */

export const PRESETS = [
  { value: "default", label: "The report's defaults" }, { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" },
  { value: "thisweek", label: "This week so far" }, { value: "lastweek", label: "Last week" }, { value: "thismonth", label: "This month so far" }, { value: "lastmonth", label: "Last month" },
] as const;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const TIMES = [420, 480, 540, 600, 780, 1020];
export const timeWords = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
export function frequencyWords(s: { frequency: string; day: number; timeMin: number }) {
  if (s.frequency === "DAILY") return `Daily, ${timeWords(s.timeMin)}`;
  if (s.frequency === "WEEKLY") return `Weekly, ${DAYS[s.day - 1] ?? "Monday"} ${timeWords(s.timeMin)}`;
  return `Monthly, 1st at ${timeWords(s.timeMin)}`;
}

/** The next send after `after`, in the school's time zone. Daily sends skip Sundays (every school day). */
export function nextSend(s: { frequency: string; day: number; timeMin: number }, after: Date, tz: string) {
  const today = todayIn(tz, after);
  for (let i = 0; i < 40; i++) {
    const day = new Date(today.getTime() + i * 86_400_000);
    const iso = day.toISOString().slice(0, 10);
    const at = new Date(dayStartUtc(iso, tz).getTime() + s.timeMin * 60_000);
    if (at <= after) continue;
    const wd = ((day.getUTCDay() + 6) % 7) + 1;
    if (s.frequency === "DAILY" && wd === 7) continue;
    if (s.frequency === "WEEKLY" && wd !== s.day) continue;
    if (s.frequency === "MONTHLY" && day.getUTCDate() !== 1) continue;
    return at;
  }
  return new Date(after.getTime() + 86_400_000);
}

/** What the schedule sends: a catalogue report or one of the school's custom reports. */
async function reportOf(tx: Tx, key: string) {
  if (key.startsWith("c:")) {
    const c = await tx.customReport.findFirst({ where: { id: key.slice(2), archivedAt: null } });
    return c ? { kind: "custom" as const, name: c.name, spec: specOf(c), custom: c } : null;
  }
  const e = findEntry(key);
  return e ? { kind: "catalogue" as const, name: e.name, entry: e } : null;
}

/** May this person receive this report? The same rule as opening it. */
export async function mayReceive(tx: Tx, userId: string, schoolId: string, key: string) {
  const who = await viewerOf(tx, userId, schoolId);
  if (!who) return { ok: false as const, who: null, why: "no longer has access to this school" };
  const rep = await reportOf(tx, key);
  if (!rep) return { ok: false as const, who, why: "the report is no longer there" };
  const a = reportAccess(who);
  if (rep.kind === "custom") {
    const ok = areasFor(who).includes(rep.spec.area);
    return ok ? { ok: true as const, who } : { ok: false as const, who, why: `cannot see ${AREAS[rep.spec.area].label.toLowerCase()} data` };
  }
  const ok = entryAllowed(rep.entry, a, who) && !a.own;
  return ok ? { ok: true as const, who } : { ok: false as const, who, why: `cannot see ${rep.entry.category === "Fees" || rep.entry.category === "Finance" || rep.entry.category === "Salary" ? `${rep.entry.category.toLowerCase()} data` : `“${rep.entry.name}”`}` };
}

export type ScheduleInput = { reportKey: string; datePreset: string; frequency: string; day: number; timeMin: number; format: string; recipientIds: string[] };

/** Checks a schedule: the report, the timing, and that every recipient may see the data. */
export async function checkSchedule(tx: Tx, who: ReportViewer, input: ScheduleInput) {
  const rep = input.reportKey ? await reportOf(tx, input.reportKey) : null;
  if (!rep) throw new CustomProblem("Pick a report to send.", "reportKey");
  if (rep.kind === "catalogue" && !entryAllowed(rep.entry, reportAccess(who), who)) throw new CustomProblem("Pick a report you may see.", "reportKey");
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(input.frequency)) throw new CustomProblem("Choose how often.", "frequency");
  if (input.frequency === "WEEKLY" && !(input.day >= 1 && input.day <= 7)) throw new CustomProblem("Choose the day.", "day");
  if (!TIMES.includes(input.timeMin)) throw new CustomProblem("Choose the time.", "timeMin");
  if (!["pdf", "xlsx"].includes(input.format)) throw new CustomProblem("Choose PDF or Excel.", "format");
  if (!PRESETS.some((p) => p.value === input.datePreset)) throw new CustomProblem("Choose the dates.", "datePreset");
  const ids = [...new Set(input.recipientIds)].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!ids.length) throw new CustomProblem("Pick at least one person.", "recipientIds");
  if (ids.length > 20) throw new CustomProblem("Send to at most 20 people.", "recipientIds");
  const blocked: string[] = [];
  for (const id of ids) {
    const r = await mayReceive(tx, id, who.ctx.schoolId, input.reportKey);
    if (!r.ok) {
      const name = r.who?.user.displayName ?? (await tx.userLogin.findUnique({ where: { id }, select: { displayName: true } }))?.displayName ?? "Someone";
      blocked.push(`${name.split(" ")[0]} ${r.why}`);
    }
  }
  if (blocked.length) throw new CustomProblem(`${blocked.join("; ")}. Choose another recipient.`, "recipientIds");
  return { rep, ids, day: input.frequency === "WEEKLY" ? input.day : 1 };
}

export async function saveSchedule(tx: Tx, who: ReportViewer, input: ScheduleInput, scheduleId: string | null, now = new Date()) {
  const { rep, ids, day } = await checkSchedule(tx, who, input);
  const data = { reportKey: input.reportKey, reportName: rep.name, datePreset: input.datePreset, frequency: input.frequency, day, timeMin: input.timeMin, format: input.format, recipientIds: ids };
  const nextAt = nextSend({ frequency: input.frequency, day, timeMin: input.timeMin }, now, who.school.timeZone);
  if (scheduleId) {
    const before = await tx.reportSchedule.findFirst({ where: { id: scheduleId, archivedAt: null } });
    if (!before) throw new CustomProblem("This schedule was not found.");
    if (!mayChange(who, before.createdById)) throw new CustomProblem("Only the person who made this schedule can change it.");
    const s = await tx.reportSchedule.update({ where: { id: scheduleId }, data: { ...data, nextAt } });
    await writeAudit(tx, who.ctx, { action: "changed", recordType: "Report Schedule", recordId: s.id, before: { frequency: before.frequency, recipientIds: before.recipientIds }, after: data });
    return s;
  }
  const s = await tx.reportSchedule.create({ data: { schoolId: who.ctx.schoolId, ...data, nextAt, createdById: who.user.id } });
  await writeAudit(tx, who.ctx, { action: "created", recordType: "Report Schedule", recordId: s.id, after: data });
  return s;
}

export async function setScheduleStatus(tx: Tx, who: ReportViewer, id: string, to: "ACTIVE" | "PAUSED" | "ARCHIVED", now = new Date()) {
  const s = await tx.reportSchedule.findFirst({ where: { id } });
  if (!s) throw new CustomProblem("This schedule was not found.");
  if (!mayChange(who, s.createdById)) throw new CustomProblem("Only the person who made this schedule can change it.");
  if (to === "ARCHIVED") {
    if (s.archivedAt) throw new CustomProblem("This schedule is already archived.");
    await tx.reportSchedule.update({ where: { id }, data: { archivedAt: now, status: "PAUSED" } });
  } else {
    if (to === "ACTIVE" && s.reportKey.startsWith("c:") && !(await reportOf(tx, s.reportKey))) throw new CustomProblem("Its custom report is archived.");
    await tx.reportSchedule.update({ where: { id }, data: { status: to, archivedAt: null, ...(to === "ACTIVE" ? { nextAt: nextSend(s, now, who.school.timeZone) } : {}) } });
  }
  await writeAudit(tx, who.ctx, { action: to === "ARCHIVED" ? "archived" : to === "ACTIVE" ? "started" : "paused", recordType: "Report Schedule", recordId: id, before: { status: s.status, archived: Boolean(s.archivedAt) } });
  return s;
}

/** Makes one recipient's file with their own permissions. */
async function fileFor(tx: Tx, recipient: ReportViewer, s: { reportKey: string; datePreset: string; format: string }, now: Date) {
  const rep = await reportOf(tx, s.reportKey);
  if (!rep) throw new CustomProblem("The report is no longer there.");
  const tz = recipient.school.timeZone;
  const today = todayIn(tz, now);
  const school = await tx.school.findUniqueOrThrow({ where: { id: recipient.ctx.schoolId }, select: { name: true } });
  const format = (s.format === "xlsx" ? "xlsx" : "pdf") as ExportFormat;
  const meta = { schoolName: school.name, exportedBy: `Scheduled report for ${recipient.user.displayName}`, timeZone: tz };
  if (rep.kind === "custom") {
    const t = await runCustom(tx, recipient, rep.spec, today);
    const entry = { key: s.reportKey, name: rep.name } as ReportEntry;
    return { t, file: await reportFile(t, entry, format, { ...meta, filters: await specWords(tx, rep.spec) }), name: rep.name };
  }
  const setup = { timeZone: tz, weekStart: recipient.school.weekStart, calendar: {} };
  const sp = s.datePreset !== "default" && rep.entry.dated ? { period: s.datePreset } : {};
  const f = await readFilters(tx, recipient.ctx, rep.entry, sp, setup, today, recipient.campusId ?? null);
  const t = await runEntry(tx, recipient, rep.entry, f);
  const words = await runWords(tx, rep.entry, f, false);
  return { t, file: await reportFile(t, rep.entry, format, { ...meta, filters: words }), name: rep.name };
}

/** Sends one schedule now to every recipient (made with each one's own permissions). One send per person per slot. */
/** "Send now" from the page: only the person who made the schedule (or the School Admin or Principal). */
export async function mayChangeSchedule(tx: Tx, who: ReportViewer, scheduleId: string) {
  const s = await tx.reportSchedule.findFirst({ where: { id: scheduleId, archivedAt: null }, select: { createdById: true } });
  if (!s) throw new CustomProblem("This schedule was not found.");
  if (!mayChange(who, s.createdById)) throw new CustomProblem("Only the person who made this schedule can send it.");
}

export async function sendSchedule(tx: Tx, ctx: SchoolContext, scheduleId: string, now = new Date(), slot = now.toISOString().slice(0, 16)) {
  const s = await tx.reportSchedule.findFirst({ where: { id: scheduleId, archivedAt: null } });
  if (!s) throw new CustomProblem("This schedule was not found.");
  let sent = 0;
  const problems: string[] = [];
  for (const userId of s.recipientIds) {
    const done = await tx.reportScheduleSend.findUnique({ where: { scheduleId_userId_slot: { scheduleId: s.id, userId, slot } } });
    if (done) continue;
    const r = await mayReceive(tx, userId, ctx.schoolId, s.reportKey);
    if (!r.ok || !r.who) {
      problems.push(`${r.who?.user.displayName ?? "A recipient"} ${r.why}`);
      await tx.reportScheduleSend.create({ data: { schoolId: ctx.schoolId, scheduleId: s.id, userId, slot, problem: `Not sent: ${r.why}` } });
      continue;
    }
    try {
      const { t, file, name } = await fileFor(tx, r.who, s, now);
      const id = randomUUID();
      const key = `${ctx.schoolId}/reports/scheduled/${id}`;
      await fileStore().put(key, file.body, file.type);
      await tx.storedFile.create({ data: { id, schoolId: ctx.schoolId, storageKey: key, fileName: file.name, contentType: file.type, sizeBytes: file.body.length, purpose: "scheduled-report", uploadedById: s.createdById } });
      const m = await sendMessage(tx, { schoolId: ctx.schoolId, userId: s.createdById }, {
        to: { loginIds: [userId] }, channels: ["email"], title: `${name}: ${frequencyWords(s).split(",")[0].toLowerCase()} report`,
        text: `Dear ${r.who.user.displayName}, the ${name} report (${t.rows.length.toLocaleString("en-IN")} rows) is attached, made on ${formatDateTime(now, r.who.school.timeZone)} with the numbers you see on screen. Change or stop this email in Reports & Analytics, Custom & Scheduled Reports.`,
        attachmentFileIds: [id], idempotencyKey: `report-schedule:${s.id}:${userId}:${slot}`, single: true, trigger: "Scheduled report", source: { type: "Report Schedule", id: s.id }, audienceLabel: r.who.user.displayName, onNoCredits: "fail",
      });
      await tx.reportScheduleSend.create({ data: { schoolId: ctx.schoolId, scheduleId: s.id, userId, slot, rows: t.rows.length, fileId: id, messageId: m.messageId ?? null } });
      await logExport(tx, { schoolId: ctx.schoolId, userId: s.createdById }, { title: `${name} (scheduled email)`, format: s.format === "xlsx" ? "xlsx" : "pdf", filters: `To ${r.who.user.displayName}`, rows: t.rows.length });
      sent++;
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      problems.push(`${r.who.user.displayName}: ${why}`);
      await tx.reportScheduleSend.create({ data: { schoolId: ctx.schoolId, scheduleId: s.id, userId, slot, problem: why.slice(0, 500) } });
    }
  }
  await tx.reportSchedule.update({ where: { id: s.id }, data: { lastSentAt: now, nextAt: nextSend(s, now, (await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } })).timeZone) } });
  return { sent, problems };
}

/** The timer: sends every active schedule that is due. */
export async function sendDueSchedules(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const due = await tx.reportSchedule.findMany({ where: { status: "ACTIVE", archivedAt: null, nextAt: { lte: now } } });
  for (const s of due) {
    const r = await sendSchedule(tx, ctx, s.id, now, s.nextAt.toISOString().slice(0, 16));
    if (r.problems.length) {
      await notify(tx, { schoolId: ctx.schoolId, userId: null }, { to: s.createdById, type: "report-schedule-problem", text: `${s.reportName}: not sent to everyone. ${r.problems.join("; ")}`.slice(0, 480), link: `${BASE}/custom` });
    }
  }
  return due.length;
}

defineSchedule("report-schedules", 15, (tx, ctx, now) => sendDueSchedules(tx, ctx, now));
