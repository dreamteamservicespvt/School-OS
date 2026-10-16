// Hostel Reports (15 §7): occupancy by hostel and room; roll call absences by
// date and student; roll call against school attendance; outings by student
// and month with late returns; incidents by type and month; the visitors log;
// and mess head counts and expenses by month. Each report is one function
// returning a Table, so the Hostel Reports page, its files and the Reports &
// Analytics catalogue show the same rows. A warden's reports hold their own
// hostel only (hostelIds).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Row, Table } from "../reports/types";
import { clockAt, localOf } from "../front-office/time";
import { dayStartUtc } from "../periods";
import { maskPhone } from "../front-office/words";
import { studentsInfo } from "./allocation";
import { occupancy, roomGrid } from "./rooms";
import { minutesLate, shownStatus } from "./outings";
import { BASE, INCIDENT_TYPE, OUTING_TYPE, PASS_STATUS, SESSION, isoOf, lateWords, type IncidentType, type OutingType } from "./words";

export type HostelFilter = {
  /** Inclusive dates (00:00 UTC) of the chosen period; null for all dates. */
  from: Date | null;
  to: Date | null;
  today: Date;
  /** The person's hostels; null for every hostel. */
  hostelIds: string[] | null;
  tz: string;
  now: Date;
  /** Show visitors' phone numbers in full (otherwise masked). */
  phones?: boolean;
};

const ZERO = BigInt(0);
const dateRange = (f: HostelFilter) => (f.from && f.to ? { gte: f.from, lte: f.to } : undefined);
/** Timestamps inside the chosen days, in the school's time zone. */
const momentRange = (f: HostelFilter) => (f.from && f.to ? { gte: dayStartUtc(isoOf(f.from), f.tz), lt: dayStartUtc(isoOf(new Date(f.to.getTime() + 86_400_000)), f.tz) } : undefined);
const hostelWhere = (f: HostelFilter) => (f.hostelIds ? { hostelId: { in: f.hostelIds } } : {});
const monthOf = (d: Date, tz?: string) => (tz ? localOf(d, tz).slice(0, 7) : d.toISOString().slice(0, 7));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthWords = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

async function hostelNames(tx: Tx) {
  return new Map((await tx.hostel.findMany({ select: { id: true, name: true } })).map((h) => [h.id, h.name]));
}

/* ---------- Occupancy ---------- */

export async function occupancyReport(tx: Tx, _ctx: SchoolContext, f: HostelFilter): Promise<Table> {
  const occ = await occupancy(tx, f.hostelIds ?? undefined);
  const grid = await roomGrid(tx, occ.rows.map((r) => r.hostel.id));
  const names = new Map(occ.rows.map((r) => [r.hostel.id, r.hostel.name]));
  const rows: Row[] = grid.map((r) => {
    const taken = r.beds.filter((b) => b.state === "taken").length;
    const blocked = r.beds.filter((b) => b.state === "blocked").length;
    return { hostel: names.get(r.hostelId) ?? "", floor: r.floor, room: r.roomNo, type: r.roomType ?? "", beds: r.beds.length, taken, free: r.beds.length - taken - blocked, blocked };
  });
  const t = occ.total;
  return {
    columns: [{ key: "hostel", label: "Hostel" }, { key: "floor", label: "Floor" }, { key: "room", label: "Room" }, { key: "type", label: "Type" }, { key: "beds", label: "Beds", kind: "number" }, { key: "taken", label: "Taken", kind: "number" }, { key: "free", label: "Free", kind: "number" }, { key: "blocked", label: "Blocked", kind: "number" }],
    rows, totals: { hostel: "Total", beds: t.beds, taken: t.taken, free: t.free, blocked: t.blocked },
    note: `${t.taken} of ${t.beds} beds taken (${t.beds ? Math.round((t.taken / t.beds) * 100) : 0}%). ${occ.rows.map((r) => `${r.hostel.name}: ${r.taken} of ${r.beds}`).join("; ")}.`,
    empty: "No rooms yet. Add rooms in Rooms & Beds.", links: [{ label: "Open Rooms & Beds", href: `${BASE}/rooms` }],
  };
}

/* ---------- Roll call absences ---------- */

export async function absencesReport(tx: Tx, ctx: SchoolContext, f: HostelFilter): Promise<Table> {
  const marks = await tx.rollCallMark.findMany({
    where: { mark: "ABSENT", rollCall: { date: dateRange(f), ...hostelWhere(f) } },
    include: { rollCall: { select: { date: true, session: true, hostelId: true, takenAt: true } } }, take: 5000,
  });
  marks.sort((a, b) => b.rollCall.date.getTime() - a.rollCall.date.getTime() || a.rollCall.session.localeCompare(b.rollCall.session));
  const [info, names] = await Promise.all([studentsInfo(tx, ctx, marks.map((m) => m.studentId)), hostelNames(tx)]);
  const per = new Map<string, number>();
  for (const m of marks) per.set(m.studentId, (per.get(m.studentId) ?? 0) + 1);
  const rows: Row[] = marks.map((m) => ({
    date: m.rollCall.date, session: SESSION[m.rollCall.session], hostel: names.get(m.rollCall.hostelId) ?? "", student: info.get(m.studentId)?.name ?? "",
    cls: info.get(m.studentId)?.classSection ?? "", times: per.get(m.studentId) ?? 1,
  }));
  return {
    columns: [{ key: "date", label: "Date", kind: "date" }, { key: "session", label: "Roll call" }, { key: "hostel", label: "Hostel" }, { key: "student", label: "Student" }, { key: "cls", label: "Class" }, { key: "times", label: "Absences in the period", kind: "number" }],
    rows, note: `${rows.length} absence${rows.length === 1 ? "" : "s"}, ${per.size} student${per.size === 1 ? "" : "s"}.`, empty: "Nobody was absent at roll call on these dates.",
    links: [{ label: "Open Roll Call", href: BASE }],
  };
}

/* ---------- Roll call against school attendance ---------- */

export async function attendanceReport(tx: Tx, ctx: SchoolContext, f: HostelFilter): Promise<Table> {
  const calls = await tx.rollCall.findMany({ where: { session: "MORNING", date: dateRange(f), ...hostelWhere(f) }, include: { marks: { where: { mark: "PRESENT" }, select: { studentId: true } } }, orderBy: { date: "desc" }, take: 400 });
  const ids = [...new Set(calls.flatMap((c) => c.marks.map((m) => m.studentId)))];
  const [schoolMarks, statuses, names, info] = await Promise.all([
    ids.length ? tx.attendanceMark.findMany({ where: { studentId: { in: ids }, periodNo: 0, archivedAt: null, date: { in: [...new Set(calls.map((c) => c.date.getTime()))].map((t) => new Date(t)) } }, select: { studentId: true, date: true, statusKey: true } }) : [],
    tx.attendanceStatus.findMany({ select: { key: true, counts: true } }),
    hostelNames(tx),
    studentsInfo(tx, ctx, ids),
  ]);
  const counts = new Map(statuses.map((s) => [s.key, s.counts]));
  const rows: Row[] = calls.map((c) => {
    const day = schoolMarks.filter((m) => m.date.getTime() === c.date.getTime());
    let inClass = 0;
    let notMarked = 0;
    const missing: string[] = [];
    for (const m of c.marks) {
      const s = day.find((x) => x.studentId === m.studentId);
      if (!s) { notMarked++; continue; }
      const k = counts.get(s.statusKey) ?? "present";
      if (k === "absent") missing.push(info.get(m.studentId)?.name ?? "");
      else inClass++;
    }
    return { date: c.date, hostel: names.get(c.hostelId) ?? "", rollcall: c.presentCount, inClass, absentInClass: missing.length, notMarked, who: missing.slice(0, 6).join(", ") + (missing.length > 6 ? ` and ${missing.length - 6} more` : "") };
  });
  return {
    columns: [{ key: "date", label: "Date", kind: "date" }, { key: "hostel", label: "Hostel" }, { key: "rollcall", label: "Present at morning roll call", kind: "number" }, { key: "inClass", label: "Present in class", kind: "number" }, { key: "absentInClass", label: "In the hostel, absent in class", kind: "number" }, { key: "notMarked", label: "Class register not taken", kind: "number" }, { key: "who", label: "Absent in class" }],
    rows, note: "Boarders present at morning roll call, against the class register of the same day (Attendance Management).", empty: "No morning roll call was taken on these dates.",
  };
}

/* ---------- Outings ---------- */

export async function outingsReport(tx: Tx, ctx: SchoolContext, f: HostelFilter): Promise<Table> {
  const passes = await tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", archivedAt: null, fromAt: momentRange(f), ...hostelWhere(f) }, orderBy: { fromAt: "desc" }, take: 5000 });
  const [info, names] = await Promise.all([studentsInfo(tx, ctx, passes.map((p) => p.studentId)), hostelNames(tx)]);
  let late = 0;
  const rows: Row[] = passes.map((p) => {
    const st = shownStatus(p, f.now);
    const lateMin = p.status === "RETURNED" || p.status === "OUT" ? minutesLate(p, f.now) : 0;
    if (lateMin > 0) late++;
    return {
      pass: p.passNo, student: info.get(p.studentId)?.name ?? "", cls: info.get(p.studentId)?.classSection ?? p.sectionLabel ?? "", hostel: p.hostelId ? names.get(p.hostelId) ?? "" : "",
      type: OUTING_TYPE[(p.outingType ?? "OUTING") as OutingType].label, with: `${p.collectorName ?? ""}${p.collectorRelation ? ` (${p.collectorRelation})` : ""}`,
      from: p.fromAt ? `${localOf(p.fromAt, f.tz).slice(0, 10)} ${clockAt(p.fromAt, f.tz)}` : "", back: p.toAt ? `${localOf(p.toAt, f.tz).slice(0, 10)} ${clockAt(p.toAt, f.tz)}` : "",
      returned: p.returnedAt ? `${localOf(p.returnedAt, f.tz).slice(0, 10)} ${clockAt(p.returnedAt, f.tz)}` : "", late: lateMin ? lateWords(lateMin) : "", status: PASS_STATUS[st].label, reason: p.reason,
    };
  });
  return {
    columns: [{ key: "pass", label: "Pass" }, { key: "student", label: "Student" }, { key: "cls", label: "Class" }, { key: "hostel", label: "Hostel" }, { key: "type", label: "Type" }, { key: "with", label: "Going with" }, { key: "from", label: "From" }, { key: "back", label: "Back by" }, { key: "returned", label: "Returned" }, { key: "late", label: "Late by" }, { key: "status", label: "Status" }, { key: "reason", label: "Reason" }],
    rows, note: `${rows.length} pass${rows.length === 1 ? "" : "es"}, ${late} late return${late === 1 ? "" : "s"}.`, empty: "No outing or leave passes on these dates.",
    links: [{ label: "Open Outing & Visitors", href: `${BASE}/outings` }],
  };
}

export async function outingsByMonthReport(tx: Tx, ctx: SchoolContext, f: HostelFilter): Promise<Table> {
  const passes = await tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", archivedAt: null, fromAt: momentRange(f), status: { in: ["OUT", "RETURNED"] }, ...hostelWhere(f) }, select: { studentId: true, fromAt: true, toAt: true, returnedAt: true, outingType: true, status: true } });
  const info = await studentsInfo(tx, ctx, passes.map((p) => p.studentId));
  const key = (p: (typeof passes)[number]) => `${monthOf(p.fromAt!, f.tz)}|${p.studentId}`;
  const map = new Map<string, { month: string; studentId: string; outings: number; leaves: number; late: number }>();
  for (const p of passes) {
    const k = key(p);
    const r = map.get(k) ?? { month: monthOf(p.fromAt!, f.tz), studentId: p.studentId, outings: 0, leaves: 0, late: 0 };
    if (p.outingType === "LEAVE") r.leaves++;
    else r.outings++;
    if (minutesLate(p, f.now) > 0) r.late++;
    map.set(k, r);
  }
  const rows: Row[] = [...map.values()].sort((a, b) => b.month.localeCompare(a.month) || (info.get(a.studentId)?.name ?? "").localeCompare(info.get(b.studentId)?.name ?? "")).map((r) => ({
    month: monthWords(r.month), student: info.get(r.studentId)?.name ?? "", cls: info.get(r.studentId)?.classSection ?? "", outings: r.outings, leaves: r.leaves, late: r.late,
  }));
  const sum = (k: "outings" | "leaves" | "late") => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  return {
    columns: [{ key: "month", label: "Month" }, { key: "student", label: "Student" }, { key: "cls", label: "Class" }, { key: "outings", label: "Outings", kind: "number" }, { key: "leaves", label: "Leaves", kind: "number" }, { key: "late", label: "Late returns", kind: "number" }],
    rows, totals: { month: "Total", outings: sum("outings"), leaves: sum("leaves"), late: sum("late") }, empty: "Nobody went out on these dates.",
  };
}

/* ---------- Incidents ---------- */

export async function incidentsReport(tx: Tx, _ctx: SchoolContext, f: HostelFilter): Promise<Table> {
  const rows0 = await tx.hostelIncident.findMany({ where: { archivedAt: null, at: momentRange(f), ...hostelWhere(f) }, select: { at: true, type: true } });
  const map = new Map<string, Record<IncidentType, number>>();
  for (const r of rows0) {
    const m = monthOf(r.at, f.tz);
    const x = map.get(m) ?? { DISCIPLINE: 0, MEDICAL: 0, MAINTENANCE: 0 };
    x[r.type]++;
    map.set(m, x);
  }
  const rows: Row[] = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([m, x]) => ({ month: monthWords(m), discipline: x.DISCIPLINE, medical: x.MEDICAL, maintenance: x.MAINTENANCE, total: x.DISCIPLINE + x.MEDICAL + x.MAINTENANCE }));
  const sum = (k: string) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  return {
    columns: [{ key: "month", label: "Month" }, { key: "discipline", label: INCIDENT_TYPE.DISCIPLINE.label, kind: "number" }, { key: "medical", label: INCIDENT_TYPE.MEDICAL.label, kind: "number" }, { key: "maintenance", label: INCIDENT_TYPE.MAINTENANCE.label, kind: "number" }, { key: "total", label: "Total", kind: "number" }],
    rows, totals: { month: "Total", discipline: sum("discipline"), medical: sum("medical"), maintenance: sum("maintenance"), total: sum("total") },
    empty: "No incidents on these dates.", links: [{ label: "Open the incident log", href: `${BASE}?view=incidents` }],
  };
}

/* ---------- Visitors ---------- */

export async function visitorsReport(tx: Tx, ctx: SchoolContext, f: HostelFilter): Promise<Table> {
  const rows0 = await tx.visitorEntry.findMany({ where: { archivedAt: null, meetStudentId: { not: null }, visitDate: dateRange(f), ...hostelWhere(f) }, orderBy: { timeIn: "desc" }, take: 5000 });
  const [info, names] = await Promise.all([studentsInfo(tx, ctx, rows0.map((r) => r.meetStudentId!)), hostelNames(tx)]);
  const rows: Row[] = rows0.map((v) => ({
    date: v.visitDate, visitor: v.name, relation: v.relation ?? "", phone: f.phones ? v.phone : maskPhone(v.phone), student: info.get(v.meetStudentId!)?.name ?? "", hostel: v.hostelId ? names.get(v.hostelId) ?? "" : "",
    timeIn: clockAt(v.timeIn, f.tz), timeOut: v.timeOut ? clockAt(v.timeOut, f.tz) : "", allowed: v.allowedBy === "LIST" ? "On the authorised list" : "Warden approved", pass: v.passNo,
  }));
  return {
    columns: [{ key: "date", label: "Date", kind: "date" }, { key: "visitor", label: "Visitor" }, { key: "relation", label: "Relation" }, { key: "phone", label: "Phone" }, { key: "student", label: "Student met" }, { key: "hostel", label: "Hostel" }, { key: "timeIn", label: "In" }, { key: "timeOut", label: "Out" }, { key: "allowed", label: "Allowed by" }, { key: "pass", label: "Visitor pass" }],
    rows, note: `${rows.length} visit${rows.length === 1 ? "" : "s"}.`, empty: "No hostel visitors on these dates.", links: [{ label: "Open Outing & Visitors", href: `${BASE}/outings?view=visitors` }],
  };
}

/* ---------- Mess ---------- */

export async function messReport(tx: Tx, _ctx: SchoolContext, f: HostelFilter): Promise<Table> {
  const [counts, expenses] = await Promise.all([
    tx.mealHeadCount.findMany({ where: { date: dateRange(f) }, select: { date: true, expected: true, actual: true } }),
    tx.messExpense.findMany({ where: { archivedAt: null, date: dateRange(f) }, select: { date: true, amountPaise: true } }),
  ]);
  const map = new Map<string, { meals: number; expected: number; actual: number; spent: bigint; bills: number }>();
  const get = (m: string) => map.get(m) ?? { meals: 0, expected: 0, actual: 0, spent: ZERO, bills: 0 };
  for (const c of counts) { const m = monthOf(c.date); const x = get(m); x.meals++; x.expected += c.expected; x.actual += c.actual; map.set(m, x); }
  for (const e of expenses) { const m = monthOf(e.date); const x = get(m); x.spent += e.amountPaise; x.bills++; map.set(m, x); }
  const rows: Row[] = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([m, x]) => ({
    month: monthWords(m), meals: x.meals, expected: x.expected, actual: x.actual, perPlate: x.actual ? x.spent / BigInt(x.actual) : null, spent: x.spent, bills: x.bills,
  }));
  const spent = rows.reduce((t, r) => t + (r.spent as bigint), ZERO);
  return {
    columns: [{ key: "month", label: "Month" }, { key: "meals", label: "Meals counted", kind: "number" }, { key: "expected", label: "Expected plates", kind: "number" }, { key: "actual", label: "Plates served", kind: "number" }, { key: "spent", label: "Mess expenses", kind: "money" }, { key: "perPlate", label: "Cost a plate", kind: "money" }, { key: "bills", label: "Bills", kind: "number" }],
    rows, totals: { month: "Total", meals: rows.reduce((t, r) => t + Number(r.meals), 0), expected: rows.reduce((t, r) => t + Number(r.expected), 0), actual: rows.reduce((t, r) => t + Number(r.actual), 0), spent, bills: rows.reduce((t, r) => t + Number(r.bills), 0) },
    note: "The mess is shared by every hostel. Expenses are also in Finance, Expenses.", empty: "No head counts or mess expenses on these dates.", links: [{ label: "Open Mess", href: `${BASE}/mess` }],
  };
}

export const HOSTEL_REPORT_LIST = [
  { key: "hostel-occupancy", name: "Occupancy", sub: "Beds, taken, free and blocked, by hostel and room", dated: false, run: occupancyReport },
  { key: "hostel-absences", name: "Roll call absences", sub: "Students absent at roll call, by date and student", dated: true, run: absencesReport },
  { key: "hostel-attendance", name: "Roll call and class attendance", sub: "Boarders present at morning roll call against the class register", dated: true, run: attendanceReport },
  { key: "hostel-outings", name: "Outings and late returns", sub: "Every outing and leave pass with the person, times and late returns", dated: true, run: outingsReport },
  { key: "hostel-outings-month", name: "Outings by student and month", sub: "Outings, leaves and late returns for each student, month by month", dated: true, run: outingsByMonthReport },
  { key: "hostel-incidents", name: "Incidents by type and month", sub: "Discipline, medical and maintenance incidents each month", dated: true, run: incidentsReport },
  { key: "hostel-visitors", name: "Visitors log", sub: "Every hostel visitor, the student met, and in and out times", dated: true, run: visitorsReport },
  { key: "hostel-mess", name: "Mess head counts and expenses", sub: "Plates expected and served, and mess expenses, by month", dated: true, run: messReport },
] as const;

export type HostelReportKey = (typeof HOSTEL_REPORT_LIST)[number]["key"];
