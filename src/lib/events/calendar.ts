// The School Calendar (18 §2): one calendar for the year with holidays,
// vacations, exam days (from published datesheets, A10), events, PTMs and
// admission tests. Holidays switch attendance off for their days (A11): the
// attendance screens and every % read the same Calendar Entry rows through
// src/lib/attendance/calendar.ts, so nothing else has to change.
import "server-only";

import type { CalendarEntry, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { EventsProblem, EventsWarning } from "./problem";
import { CLOSING, ENTRY_TYPES, addDaysIso, clock, dayOf, dmy, isEntryType, isoOf, timeSpan, type EntryType } from "./words";
import { isSchoolDay, offDayWords } from "../calendar/school-days";

export type CalItem = {
  id: string;
  type: EntryType;
  title: string;
  from: string;
  to: string;
  attendanceOn: boolean;
  campusId: string | null;
  classIds: string[];
  details: string | null;
  /** "From the datesheet", "From Events", "From PTM", "From Admission". */
  source: "datesheet" | "event" | "ptm" | "admission" | null;
  /** Where the entry is managed (an event's page, a PTM day). */
  href: string | null;
  time: string | null;
  where: string | null;
  /** Typed entries of an open year can be removed here. */
  removable: boolean;
};

const sourceOf = (s: string | null): CalItem["source"] => (!s ? null : s.startsWith("exam:") ? "datesheet" : s.startsWith("event:") ? "event" : s.startsWith("ptm:") ? "ptm" : s.startsWith("admission") ? "admission" : null);

/** Calendar entries that touch the dates, with the time and place of events and PTMs. */
export async function calendarItems(tx: Tx, ctx: SchoolContext, from: string, to: string, opts: { campusId?: string | null; classId?: string | null } = {}): Promise<CalItem[]> {
  const where: Prisma.CalendarEntryWhereInput = {
    schoolId: ctx.schoolId, archivedAt: null, startDate: { lte: dayOf(to) }, endDate: { gte: dayOf(from) },
    ...(opts.campusId ? { OR: [{ campusId: null }, { campusId: opts.campusId }] } : {}),
  };
  const rows = await tx.calendarEntry.findMany({ where, orderBy: [{ startDate: "asc" }, { createdAt: "asc" }] });
  const eventIds = rows.map((r) => r.source?.startsWith("event:") ? r.source.slice(6) : null).filter((x): x is string => Boolean(x));
  const ptmIds = rows.map((r) => r.source?.startsWith("ptm:") ? r.source.slice(4) : null).filter((x): x is string => Boolean(x));
  const [events, ptms, closedYears] = await Promise.all([
    eventIds.length ? tx.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, startMin: true, endMin: true, venue: true } }) : [],
    ptmIds.length ? tx.ptm.findMany({ where: { id: { in: ptmIds } }, select: { id: true, startMin: true, endMin: true, venue: true } }) : [],
    tx.academicYear.findMany({ where: { status: "CLOSED" }, select: { id: true } }),
  ]);
  const closed = new Set(closedYears.map((y) => y.id));
  const out: CalItem[] = [];
  for (const r of rows) {
    if (opts.classId && r.classIds.length && !r.classIds.includes(opts.classId)) continue;
    const src = sourceOf(r.source);
    const ev = src === "event" ? events.find((e) => e.id === r.source!.slice(6)) : null;
    const ptm = src === "ptm" ? ptms.find((p) => p.id === r.source!.slice(4)) : null;
    const timed = ev ?? ptm;
    out.push({
      id: r.id, type: isEntryType(r.type) ? r.type : "event", title: r.title, from: isoOf(r.startDate), to: isoOf(r.endDate),
      attendanceOn: r.attendanceOn, campusId: r.campusId, classIds: r.classIds, details: r.details, source: src,
      href: ev ? `/events-calendar/events/${ev.id}` : ptm ? `/events-calendar/ptm?day=${ptm.id}` : null,
      time: timed ? (ev ? clock(timed.startMin) : timeSpan(timed.startMin, timed.endMin)) : null,
      where: timed?.venue ?? null,
      removable: !r.source && !closed.has(r.academicYearId),
    });
  }
  return out;
}

/** Does attendance stop on this entry's days? */
export const closesSchool = (i: Pick<CalItem, "type" | "attendanceOn">) => CLOSING.includes(i.type) && !i.attendanceOn;

/** The academic year a date falls in (not closed), for a new entry. */
async function yearFor(tx: Tx, ctx: SchoolContext, iso: string) {
  const d = dayOf(iso);
  const years = await tx.academicYear.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, orderBy: { startDate: "desc" } });
  const y = years.find((x) => x.startDate <= d && x.endDate >= d);
  if (!y) {
    const open = years.filter((x) => x.status !== "CLOSED").sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const span = open.length ? `${formatDate(open[0].startDate, "UTC")} to ${formatDate(open[open.length - 1].endDate, "UTC")}` : "";
    throw new EventsProblem(open.length ? `Pick a date inside the school year (${span}).` : "Set up the academic year in Academic Management first.", "date");
  }
  if (y.status === "CLOSED") throw new EventsProblem(`${y.name} is closed. Its calendar can only be read.`, "date");
  return y;
}

/** Sections whose attendance was taken on the days (for the A11 warning). */
export async function sectionsMarked(tx: Tx, from: string, to: string, campusId?: string | null) {
  const marks = await tx.attendanceMark.findMany({
    where: { archivedAt: null, studentId: { not: null }, date: { gte: dayOf(from), lte: dayOf(to) } },
    select: { sectionId: true, date: true }, distinct: ["sectionId", "date"],
  });
  let rows = marks;
  if (campusId) {
    const secs = await tx.section.findMany({ where: { id: { in: marks.map((m) => m.sectionId).filter((x): x is string => Boolean(x)) } }, select: { id: true, schoolClass: { select: { campusId: true } } } });
    const inCampus = new Set(secs.filter((s) => s.schoolClass.campusId === campusId).map((s) => s.id));
    rows = marks.filter((m) => m.sectionId && inCampus.has(m.sectionId));
  }
  return { sections: new Set(rows.map((m) => m.sectionId)).size, days: [...new Set(rows.map((m) => isoOf(m.date)))].sort() };
}

export type EntryInput = {
  title: string;
  type: string;
  from: string;
  to?: string | null;
  attendanceOn: boolean;
  campusId?: string | null;
  classIds?: string[];
  details?: string | null;
};

/**
 * Adds one School Calendar entry. A holiday or vacation switches attendance
 * off for its days (A11); when attendance was already taken on one of them the
 * person is warned first, and saving anyway means those marks do not count.
 */
export async function addEntry(tx: Tx, ctx: SchoolContext, input: EntryInput, opts: { confirm?: boolean; today: string }) {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 2) throw new EventsProblem("Give it a name, like “Republic Day”.", "title");
  if (title.length > 80) throw new EventsProblem("The name can be at most 80 characters.", "title");
  if (!isEntryType(input.type)) throw new EventsProblem("Choose the type.", "type");
  const type = input.type;
  const to = type === "vacation" ? input.to ?? null : input.to && input.to >= input.from ? input.to : input.from;
  if (type === "vacation" && !to) throw new EventsProblem("Enter the last day of the vacation.", "to");
  if (to! < input.from) throw new EventsProblem("The last day is before the first day.", "to");
  if (to! > addDaysIso(input.from, 120)) throw new EventsProblem("An entry can be at most 120 days long.", "to");
  const year = await yearFor(tx, ctx, input.from);
  if (dayOf(to!) > year.endDate) throw new EventsProblem(`The last day is after the end of ${year.name}. Add the rest in the next year.`, "to");
  const closes = CLOSING.includes(type) && !input.attendanceOn;
  const classIds = closes ? [] : [...new Set(input.classIds ?? [])];
  if (CLOSING.includes(type) && input.classIds?.length) throw new EventsProblem("Holidays and vacations are for the whole school or one campus.", "applies");
  if (closes && !opts.confirm && input.from <= opts.today) {
    const m = await sectionsMarked(tx, input.from, to! < opts.today ? to! : opts.today, input.campusId);
    if (m.sections > 0) {
      const when = m.days.length === 1 ? dmy(m.days[0]) : `${dmy(m.days[0])} to ${dmy(m.days[m.days.length - 1])}`;
      throw new EventsWarning(`Attendance was taken for ${m.sections} ${m.sections === 1 ? "class" : "classes"} on ${when}. Make it a holiday anyway? Those marks will not count.`, "attendance-taken", "from");
    }
  }
  const entry = await tx.calendarEntry.create({
    data: {
      schoolId: ctx.schoolId, campusId: input.campusId ?? null, academicYearId: year.id, type, title,
      startDate: dayOf(input.from), endDate: dayOf(to!), attendanceOn: input.attendanceOn, classIds,
      details: input.details?.trim() || null, createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, {
    action: "added", recordType: "Calendar Entry", recordId: entry.id,
    after: { type: ENTRY_TYPES[type].label, title, from: dmy(input.from), to: dmy(to!), attendance: input.attendanceOn ? "on" : "off" },
  });
  return entry;
}

/** Removes (archives) a typed entry. Removing a holiday switches attendance back on for its days. */
export async function removeEntry(tx: Tx, ctx: SchoolContext, entryId: string) {
  const e = await tx.calendarEntry.findFirst({ where: { id: entryId, archivedAt: null } });
  if (!e) throw new EventsProblem("This calendar entry was not found. It may have been removed already.");
  if (e.source) throw new EventsProblem(e.source.startsWith("exam:") ? "Exam days come from the published datesheet. Change the datesheet in Examination & Results." : "This entry comes from its own page. Change it there.");
  const year = await tx.academicYear.findUnique({ where: { id: e.academicYearId }, select: { status: true, name: true } });
  if (year?.status === "CLOSED") throw new EventsProblem(`${year.name} is closed. Its calendar can only be read.`);
  await tx.calendarEntry.update({ where: { id: e.id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "removed", recordType: "Calendar Entry", recordId: e.id, before: { type: e.type, title: e.title, from: formatDate(e.startDate, "UTC"), to: formatDate(e.endDate, "UTC") } });
  return e;
}

/** Undo of a removal (P5): the entry comes back as it was. */
export async function restoreEntry(tx: Tx, ctx: SchoolContext, entryId: string) {
  const e = await tx.calendarEntry.findFirst({ where: { id: entryId, archivedAt: { not: null }, source: null } });
  if (!e) return;
  await tx.calendarEntry.update({ where: { id: e.id }, data: { archivedAt: null, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Calendar Entry", recordId: e.id, after: { title: e.title } });
}

/** Undo of an add: the entry is archived again. */
export async function undoAdd(tx: Tx, ctx: SchoolContext, entryId: string) {
  const e = await tx.calendarEntry.findFirst({ where: { id: entryId, archivedAt: null, source: null } });
  if (!e) return;
  await tx.calendarEntry.update({ where: { id: e.id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "undone", recordType: "Calendar Entry", recordId: e.id, before: { title: e.title } });
}

/** Last year's holidays and vacations moved one year on, for the person to check before saving. */
export async function lastYearHolidays(tx: Tx, ctx: SchoolContext, yearId: string) {
  const year = await tx.academicYear.findFirst({ where: { id: yearId } });
  if (!year) return [];
  const prev = await tx.academicYear.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, endDate: { lt: year.startDate } }, orderBy: { startDate: "desc" } });
  if (!prev) return [];
  const [old, now] = await Promise.all([
    tx.calendarEntry.findMany({ where: { academicYearId: prev.id, archivedAt: null, type: { in: [...CLOSING] }, source: null }, orderBy: { startDate: "asc" } }),
    tx.calendarEntry.findMany({ where: { academicYearId: year.id, archivedAt: null, type: { in: [...CLOSING] } }, select: { title: true } }),
  ]);
  const have = new Set(now.map((n) => n.title.toLowerCase()));
  const shift = (d: Date) => {
    const n = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
    return isoOf(n);
  };
  return old.filter((o) => !have.has(o.title.toLowerCase())).map((o) => ({ id: o.id, type: o.type as EntryType, title: o.title, from: shift(o.startDate), to: shift(o.endDate), lastFrom: isoOf(o.startDate) }));
}

/** Holidays and vacations of a year, for the holiday list. */
export async function holidayList(tx: Tx, ctx: SchoolContext, yearId: string, campusId?: string | null) {
  return tx.calendarEntry.findMany({
    where: { academicYearId: yearId, archivedAt: null, type: { in: [...CLOSING] }, ...(campusId ? { OR: [{ campusId: null }, { campusId }] } : {}) },
    orderBy: { startDate: "asc" },
  });
}

/** A school day for a PTM or a daily activity (the school's one rule, src/lib/calendar/school-days.ts). Returns why not, or null. */
export async function notWorkingDay(tx: Tx, ctx: SchoolContext, iso: string, campusId?: string | null, opts: { classId?: string | null } = {}): Promise<string | null> {
  const info = await isSchoolDay(tx, ctx, dayOf(iso), { campusId, classId: opts.classId ?? null });
  if (info.on) return null;
  if (info.reason === "holiday") return `${dmy(iso)} is a holiday (${info.title}).`;
  return `${dmy(iso)} is ${offDayWords(info)}, not a working day.`;
}

/** The entry for an event or PTM: made, moved or archived with it. */
export async function syncSourceEntry(tx: Tx, ctx: SchoolContext, source: string, data: { academicYearId: string; campusId?: string | null; type: EntryType; title: string; date: string; classIds: string[]; details?: string | null } | null): Promise<CalendarEntry | null> {
  const existing = await tx.calendarEntry.findFirst({ where: { source, archivedAt: null } });
  if (!data) {
    if (existing) await tx.calendarEntry.update({ where: { id: existing.id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
    return null;
  }
  const values = { academicYearId: data.academicYearId, campusId: data.campusId ?? null, type: data.type, title: data.title, startDate: dayOf(data.date), endDate: dayOf(data.date), attendanceOn: true, classIds: data.classIds, details: data.details ?? null };
  if (existing) return tx.calendarEntry.update({ where: { id: existing.id }, data: { ...values, updatedById: ctx.userId } });
  return tx.calendarEntry.create({ data: { schoolId: ctx.schoolId, ...values, source, createdById: ctx.userId } });
}
