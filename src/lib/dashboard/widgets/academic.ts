// Academic Management on the Dashboard: a teacher's periods today with
// substitutions, periods with no teacher, syllabus progress, and the
// School Calendar's days off (04 §2, 01 §2 "Academic panel").
import "server-only";

import type { SyllabusItem, SyllabusProgressEntry } from "@prisma/client";
import { periodsForStaffOnDate, effectiveVersion } from "../../academic/timetable";
import { needsOn } from "../../academic/substitutions";
import { allocationActiveOn } from "../../academic/allocation";
import { mainCampusId } from "../../academic/settings";
import { personCampusId } from "../../campus";
import { CLOSED_TYPES } from "../../academic/calendar";
import { weekday } from "../../academic/common";
import { evPageAllowed, evViewer } from "../../events/access";
import { BUILT_MODULES } from "../../modules";
import { addDays, clock, dayWord, hasRole, minutesOf, moduleOpen, myStaff, plural, reach, shortDate, someNames } from "../common";
import type { AgendaItem, AttentionItem, BarRow, ClassToday, DashContext, Widget } from "../types";
import { attendanceTakeHref, choices as attendanceChoices } from "./attendance";

const TT = "/academic-management/time-table/mine";
const SUBS = "/academic-management/substitutions";
const SYLLABUS = "/academic-management/syllabus";

/** Today's periods for the signed-in teacher, read once for the band, the card, the attention list and the agenda. */
function myDay(c: DashContext) {
  return c.memo("my-day", async () => {
    const staff = await myStaff(c);
    if (!staff) return null;
    const day = await periodsForStaffOnDate(c.tx, c.viewer.ctx, staff.id, c.today);
    return { staffId: staff.id, ...day, periods: day.periods.filter((p) => !p.isBreak) };
  });
}

/** Can arrange substitutions: full Academic Management, or Office Staff (04 §1). */
const arranges = (v: DashContext["viewer"]) => reach(v, "academic-management", "edit") === "all" || (reach(v, "academic-management", "edit") === "own" && hasRole(v, "office-staff"));

async function classesToday(c: DashContext): Promise<ClassToday[]> {
  const day = await myDay(c);
  if (!day) return [];
  // Take Attendance for the periods this person may take (Attendance Management, when open to them).
  const take = moduleOpen(c.viewer, "attendance-management", "edit") ? await attendanceChoices(c) : [];
  const firstOf = (sectionId: string) => Math.min(...day.periods.filter((x) => x.sectionId === sectionId).map((x) => x.periodNo));
  const takeFor = (sectionId: string, periodNo: number) =>
    take.find((t) => t.sectionId === sectionId && t.periodNo === periodNo)
    // Once-a-day attendance shows on the section's first period of the day.
    ?? (periodNo === firstOf(sectionId) ? take.find((t) => t.sectionId === sectionId && t.periodNo === 0) : undefined);
  return day.periods.map((p) => {
    const t = takeFor(p.sectionId, p.periodNo);
    const start = minutesOf(p.startTime), end = minutesOf(p.endTime);
    const covered = p.substitution && !p.isSubstitute;
    const note = p.isSubstitute
      ? `Substitution for ${p.substitution?.forStaffName ?? "a teacher on leave"}`
      : covered ? (p.substitution?.substituteName ? `${p.substitution.substituteName} takes it` : "A substitute is being arranged") : null;
    return {
      id: p.id + (p.isSubstitute ? ":sub" : ""),
      periodNo: p.periodNo,
      time: clock(p.startTime),
      className: p.sectionLabel,
      subject: p.subjectName ?? p.label ?? "Period",
      room: p.room ? (/^\d/.test(p.room) ? `Room ${p.room}` : p.room) : "",
      now: c.minuteNow >= start && c.minuteNow < end,
      past: c.minuteNow >= end,
      note,
      noteTone: p.isSubstitute ? "warn" : "neutral",
      sectionId: p.sectionId,
      takeHref: covered || !t ? null : attendanceTakeHref({ sectionId: p.sectionId, periodNo: t.periodNo, date: c.today }),
      taken: Boolean(t?.done),
    };
  });
}

const classesCard: Widget<"panel"> = {
  id: "academic.classes-today",
  module: "academic-management",
  kind: "panel",
  homes: ["teacher", "class-teacher"],
  allowed: (v) => reach(v, "academic-management") !== "none",
  async load(c) {
    const day = await myDay(c);
    if (!day) return null;
    const rows = await classesToday(c);
    if (rows.length === 0 && !day.off) return null;
    const weekdayName = c.today.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    return {
      slot: "first",
      panel: {
        kind: "classes-today", title: "My classes today", timetableHref: TT,
        sub: day.off ? `${weekdayName} · ${day.off.title}` : `${weekdayName} · ${plural(rows.length, "period")} from your Time Table`,
        rows, off: day.off ? (day.off.kind === "holiday" ? `Holiday: ${day.off.title}. No periods today.` : `${day.off.title}. No periods today.`) : null,
      },
    };
  },
};

const classesBand: Widget<"band"> = {
  id: "academic.classes-today-count",
  module: "academic-management",
  kind: "band",
  homes: ["teacher", "class-teacher"],
  async load(c) {
    const day = await myDay(c);
    if (!day || day.off) return null;
    const rows = await classesToday(c);
    const next = rows.find((r) => !r.past && !r.now) ?? rows.find((r) => r.now);
    return { id: "academic.classes-today-count", label: "Classes today", big: String(rows.length), foot: next ? `Next: ${next.className} at ${next.time}` : rows.length ? "All done for today" : "Nothing in your Time Table", href: TT };
  },
};

/** Substitutions the teacher must take today. */
const mySubstitutions: Widget<"attention"> = {
  id: "academic.my-substitutions",
  module: "academic-management",
  kind: "attention",
  homes: ["teacher", "class-teacher"],
  async load(c) {
    const day = await myDay(c);
    if (!day) return [];
    const subs = day.periods.filter((p) => p.isSubstitute && !(minutesOf(p.endTime) <= c.minuteNow));
    return subs.map((p): AttentionItem => ({
      id: `academic.sub:${p.id}`,
      tone: "warn", icon: "ArrowRightLeft",
      title: `Substitution today: ${p.sectionLabel}, period ${p.periodNo}${p.subjectName ? ` (${p.subjectName})` : ""}`,
      detail: `${p.substitution?.forStaffName ?? "A teacher"} is away · ${clock(p.startTime)}${p.room ? ` · ${/^\d/.test(p.room) ? `Room ${p.room}` : p.room}` : ""}`,
      action: "See it", href: `${SUBS}?view=by-teacher`, value: p.id,
    }));
  },
};

const myAgenda: Widget<"agenda"> = {
  id: "academic.my-periods",
  module: "academic-management",
  kind: "agenda",
  homes: ["teacher", "class-teacher"],
  async load(c) {
    const day = await myDay(c);
    if (!day) return [];
    // The next class, and every substitution still to come (the full day is in "My classes today").
    const ahead = day.periods.filter((p) => minutesOf(p.endTime) > c.minuteNow);
    return ahead.filter((p, i) => i === 0 || p.isSubstitute).map((p): AgendaItem => ({
      id: `period:${p.id}`, time: clock(p.startTime),
      title: p.isSubstitute ? `Substitution: ${p.sectionLabel} ${p.subjectName ?? ""}`.trim() : `${p.sectionLabel} · ${p.subjectName ?? p.label ?? "Period"}`,
      where: [p.room ? (/^\d/.test(p.room) ? `Room ${p.room}` : p.room) : null, p.isSubstitute && p.substitution?.forStaffName ? `for ${p.substitution.forStaffName}` : null].filter(Boolean).join(" · ") || "From your Time Table",
      tone: p.isSubstitute ? "warn" : "brand", href: p.isSubstitute ? `${SUBS}?view=by-teacher` : TT, sort: minutesOf(p.startTime),
    }));
  },
};

/** Periods today whose teacher is away and no substitute is arranged (Done when 6 of 04). */
function needsToday(c: DashContext) {
  return c.memo("needs-today", async () => {
    // The person's own campus: the one they are limited to, else their Staff record's, else the main campus.
    const campusId = (await personCampusId(c.tx, c.viewer.ctx, c.viewer)) ?? (await mainCampusId(c.tx, c.viewer.ctx));
    const needs = await needsOn(c.tx, c.viewer.ctx, campusId, c.today);
    return { campusId, off: needs.off, open: needs.rows.filter((r) => r.substitution?.status !== "ARRANGED"), all: needs.rows };
  });
}

const openSubstitutions: Widget<"attention"> = {
  id: "academic.periods-without-teacher",
  module: "academic-management",
  kind: "attention",
  homes: ["leader", "academic-head", "office"],
  allowed: (v) => arranges(v),
  async load(c) {
    const needs = await needsToday(c);
    const left = needs.open.filter((r) => minutesOf(r.endTime) > c.minuteNow);
    if (!left.length) return null;
    return {
      id: "academic.periods-without-teacher", tone: "bad", icon: "ArrowRightLeft",
      title: `${plural(left.length, "period")} today ${left.length === 1 ? "has" : "have"} no teacher`,
      detail: someNames(left.map((r) => `${r.sectionLabel} period ${r.periodNo}${r.subjectName ? ` (${r.subjectName})` : ""}`), 2),
      action: "Arrange", href: SUBS, value: String(left.length),
    };
  },
};

const periodsCovered: Widget<"band"> = {
  id: "academic.periods-covered",
  module: "academic-management",
  kind: "band",
  homes: ["academic-head", "office"],
  allowed: (v) => arranges(v),
  async load(c) {
    const needs = await needsToday(c);
    if (needs.off) return null;
    const version = await effectiveVersion(c.tx, c.viewer.ctx, needs.campusId, c.today);
    if (!version) return null;
    const total = await c.tx.timetablePeriod.count({ where: { versionId: version.id, dayOfWeek: weekday(c.today), archivedAt: null, isBreak: false, staffId: { not: null } } });
    if (!total) return null;
    return { id: "academic.periods-covered", label: "Periods covered today", big: String(total - needs.open.length), of: `/ ${total}`, foot: needs.open.length ? `${plural(needs.open.length, "substitution")} still open` : "Every period has a teacher", href: SUBS };
  },
};

// ---------------------------------------------------------------- syllabus progress

/** % of a (section, subject) syllabus taught, the same count as Syllabus & Lesson Plans, Progress (syllabusTree). */
export function pairProgress(items: Pick<SyllabusItem, "id" | "parentId">[], entries: Pick<SyllabusProgressEntry, "itemId" | "status">[]) {
  const byParent = new Map<string | null, string[]>();
  for (const i of items) byParent.set(i.parentId, [...(byParent.get(i.parentId) ?? []), i.id]);
  const mine = new Map<string, { any: boolean; completed: boolean }>();
  for (const e of entries) {
    const m = mine.get(e.itemId) ?? { any: false, completed: false };
    m.any = true;
    if (e.status === "completed") m.completed = true;
    mine.set(e.itemId, m);
  }
  const walk = (id: string): { leaves: number; done: number } => {
    const kids = byParent.get(id) ?? [];
    const m = mine.get(id);
    if (kids.length === 0) return { leaves: 1, done: m?.any ? 1 : 0 };
    const parts = kids.map(walk);
    const leaves = parts.reduce((s, p) => s + p.leaves, 0);
    return { leaves, done: m?.completed ? leaves : parts.reduce((s, p) => s + p.done, 0) };
  };
  const roots = (byParent.get(null) ?? []).map(walk);
  const total = roots.reduce((s, p) => s + p.leaves, 0);
  const done = roots.reduce((s, p) => s + p.done, 0);
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Progress of each (section, subject) the person may see, from Teacher Allocation. */
async function progressPairs(c: DashContext, onlyStaffId: string | null) {
  if (!c.year) return [];
  const allocations = await c.tx.teacherAllocation.findMany({
    where: { academicYearId: c.year.id, archivedAt: null, isMain: true, ...allocationActiveOn(c.today), ...(onlyStaffId ? { staffId: onlyStaffId } : {}), section: { archivedAt: null } },
    include: { section: { include: { schoolClass: true } }, subject: true },
  });
  const seen = new Set<string>();
  const pairs = allocations.filter((a) => !seen.has(`${a.sectionId}:${a.subjectId}`) && seen.add(`${a.sectionId}:${a.subjectId}`));
  if (!pairs.length) return [];
  const [items, entries] = await Promise.all([
    c.tx.syllabusItem.findMany({ where: { academicYearId: c.year.id, archivedAt: null, classId: { in: [...new Set(pairs.map((p) => p.section.classId))] } }, select: { id: true, parentId: true, classId: true, subjectId: true } }),
    c.tx.syllabusProgressEntry.findMany({ where: { academicYearId: c.year.id, archivedAt: null, sectionId: { in: pairs.map((p) => p.sectionId) } }, select: { itemId: true, status: true, sectionId: true } }),
  ]);
  return pairs.map((p) => {
    const its = items.filter((i) => i.classId === p.section.classId && i.subjectId === p.subjectId);
    const ids = new Set(its.map((i) => i.id));
    const prog = pairProgress(its, entries.filter((e) => e.sectionId === p.sectionId && ids.has(e.itemId)));
    return { classId: p.section.classId, className: p.section.schoolClass.name, sortOrder: p.section.schoolClass.sortOrder, label: `${p.section.schoolClass.name} ${p.section.name}`, subject: p.subject.name, ...prog };
  }).filter((p) => p.total > 0);
}

const mySyllabus: Widget<"panel"> = {
  id: "academic.my-syllabus",
  module: "academic-management",
  kind: "panel",
  homes: ["teacher", "class-teacher"],
  async load(c) {
    const staff = await myStaff(c);
    if (!staff) return null;
    const pairs = (await progressPairs(c, staff.id)).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    if (!pairs.length) return null;
    const subjects = [...new Set(pairs.map((p) => p.subject))];
    const rows: BarRow[] = pairs.slice(0, 8).map((p) => ({ key: `${p.label}:${p.subject}`, label: subjects.length > 1 ? `${p.label} ${p.subject.slice(0, 3)}` : p.label, value: p.pct }));
    return { slot: "side", panel: { kind: "bars", title: "Syllabus progress", sub: `${subjects.join(", ")} · share taught so far`, icon: "BookOpenCheck", rows, lowBelow: 25, href: `${SYLLABUS}?view=progress`, linkLabel: "Open", empty: "" } };
  },
};

const schoolSyllabus: Widget<"panel"> = {
  id: "academic.school-syllabus",
  module: "academic-management",
  kind: "panel",
  homes: ["leader", "academic-head"],
  allowed: (v) => reach(v, "academic-management") === "all",
  async load(c) {
    const pairs = await progressPairs(c, null);
    if (!pairs.length) return null;
    const byClass = new Map<string, { name: string; sort: number; total: number; done: number }>();
    for (const p of pairs) {
      const r = byClass.get(p.classId) ?? { name: p.className, sort: p.sortOrder, total: 0, done: 0 };
      r.total += p.total; r.done += p.done;
      byClass.set(p.classId, r);
    }
    const rows: BarRow[] = [...byClass.entries()].sort((a, b) => a[1].sort - b[1].sort).map(([id, r]) => ({ key: id, label: r.name, value: Math.round((r.done / r.total) * 100), href: `${SYLLABUS}?view=progress&class=${id}` }));
    return { slot: "side", panel: { kind: "bars", title: "Syllabus progress", sub: "All subjects · share taught, by class", icon: "BookOpenCheck", rows, lowBelow: 25, href: `${SYLLABUS}?view=progress`, linkLabel: "Open", empty: "" } };
  },
};

// ---------------------------------------------------------------- the School Calendar

const calendarAgenda: Widget<"agenda"> = {
  id: "academic.calendar",
  // The School Calendar is for every staff member (05-roles.md), so it is not tied to Academic Management access.
  module: "dashboard",
  kind: "agenda",
  homes: "any",
  async load(c) {
    const until = addDays(c.today, 7);
    const rows = await c.tx.calendarEntry.findMany({
      where: { archivedAt: null, startDate: { lte: until }, endDate: { gte: c.today }, ...(c.viewer.campusId ? { OR: [{ campusId: null }, { campusId: c.viewer.campusId }] } : {}) },
      orderBy: { startDate: "asc" }, take: 8,
    });
    // Links only to pages this person may open (the School Calendar, and Events or PTM for those who have them).
    const v = evViewer(c.viewer as unknown as Parameters<typeof evViewer>[0]);
    const calOpen = BUILT_MODULES.has("events-calendar") && c.viewer.modulesOn.has("events-calendar") && v.level !== null;
    const evOpen = (page: "events" | "ptm") => calOpen && evPageAllowed(v, page);
    return rows.map((e): AgendaItem => {
      const from = e.startDate < c.today ? c.today : e.startDate;
      const closed = CLOSED_TYPES.includes(e.type);
      const span = e.startDate.getTime() === e.endDate.getTime() ? shortDate(e.startDate) : `${shortDate(e.startDate)} to ${shortDate(e.endDate)}`;
      return {
        id: `cal:${e.id}`, time: dayWord(from, c.today), title: e.title,
        where: closed ? `${span} · school closed` : e.type === "exam_day" ? `${span} · exam day` : span,
        tone: closed ? "info" : e.type === "exam_day" ? "bad" : "brand",
        // Events and PTMs open their own page; everything else opens the School Calendar on that day.
        href: e.source?.startsWith("event:") && evOpen("events") ? `/events-calendar/events/${e.source.slice(6)}` : e.source?.startsWith("ptm:") && evOpen("ptm") ? `/events-calendar/ptm?day=${e.source.slice(4)}` : calOpen ? `/events-calendar?m=${from.toISOString().slice(0, 7)}&d=${from.toISOString().slice(0, 10)}` : undefined,
        sort: Math.round((from.getTime() - c.today.getTime()) / 60_000) + 1,
      };
    });
  },
};

const nextHoliday: Widget<"band"> = {
  id: "academic.next-holiday",
  module: "dashboard",
  kind: "band",
  homes: ["staff"],
  // Every staff member sees the School Calendar (05-roles.md), whatever their Academic Management access.
  async load(c) {
    const h = await c.tx.calendarEntry.findFirst({
      where: { archivedAt: null, type: { in: CLOSED_TYPES }, endDate: { gte: c.today }, ...(c.viewer.campusId ? { OR: [{ campusId: null }, { campusId: c.viewer.campusId }] } : {}) },
      orderBy: { startDate: "asc" },
    });
    if (!h) return null;
    const one = h.startDate.getTime() === h.endDate.getTime();
    const back = addDays(h.endDate, 1);
    return { id: "academic.next-holiday", label: "Next holiday", big: h.title, foot: `${one ? shortDate(h.startDate) : `${shortDate(h.startDate)} to ${shortDate(h.endDate)}`} · back ${dayWord(back, c.today) === "Tomorrow" ? "tomorrow" : shortDate(back)}` };
  },
};

export const ACADEMIC_WIDGETS: Widget[] = [classesBand, periodsCovered, classesCard, mySubstitutions, openSubstitutions, myAgenda, mySyllabus, schoolSyllabus, calendarAgenda, nextHoliday] as Widget[];

