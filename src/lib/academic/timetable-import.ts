// The Time Table from Excel (04 §2 "Import a complete Time Table", gap list
// G44): one row per class and section, day and period, with the subject and
// the teacher (empty: the teacher assigned to that subject in Teacher
// Allocation). The rows go into the year's draft Time Table, never into the
// published one: the school checks the draft and publishes it the normal way,
// with its effective date (04 §5 "Automatic Time Table replaces good work").
//
// Clashes are row problems before anything is saved: a teacher or a room in
// two places at the same time, the same period twice, a period that is not in
// the school's period plan for that day, a day that is not a working day, a
// subject not taught in the class. The import replaces the draft periods of
// the classes the file names (breaks stay), all at once; a further import of
// the same file, after fixing rows, adds to them. A teacher or room booked at
// that time in a class the file does not name is that row's problem when it is
// saved, and publishing still runs the full clash check.
//
// Brought in from Academic Management, Import, or Switching to School OS, by
// people who keep the Time Table (full Academic Management, or the Office Staff
// template). Undo puts the draft back as it was; once the draft is published,
// Undo stops and says so. Imported by src/lib/import-registry.ts.
import "server-only";

import type { PeriodSlot } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { defineImport, RowProblem, type ImportKind, type RowChoice, type UpdatedRow } from "../importer";
import { writeAudit } from "../audit";
import { plain } from "../move-in/tidy";
import { AcademicRuleError, DAY_NAMES, todayIn } from "./common";
import { academicSettings, periodSlots } from "./settings";
import { allocationActiveOn } from "./allocation";
import { mapActiveOn } from "./subjects";
import { clashFor, makeDraft } from "./timetable";
import { dayIn, importRun, sectionIn, sectionWords, subjectIn, teacherIn } from "./import-common";

export const TIMETABLE_IMPORT = "academic-timetable";

type Row = {
  sectionId: string; section: string; yearId: string; campusId: string;
  day: number; periodNo: number; startTime: string; endTime: string;
  subjectId: string; subject: string; staffId: string; staffName: string; room: string | null;
  /** The check this row came from: the first row of a class in it clears that class's draft. */
  run: string;
};

type Cell = { subjectId: string | null; staffId: string | null; room: string | null; isBreak: boolean; label: string | null; startTime: string; endTime: string; archived: boolean };
type Before = { versionId: string; versionCreated: boolean; cleared: string[]; cell: Cell | null };

/**
 * For each run (one check of a file, then its import): the classes of its
 * ready rows, and the drafts it has already cleared them in. Every row is
 * checked before the first is saved, so the first save knows every class the
 * file names. Kept for a short while only.
 */
const runs = new Map<string, { sections: Set<string>; cleared: Set<string> }>();
function runOf(run: string) {
  let r = runs.get(run);
  if (!r) {
    if (runs.size > 200) runs.delete(runs.keys().next().value!);
    r = { sections: new Set(), cleared: new Set() };
    runs.set(run, r);
  }
  return r;
}

/** "3", "Period 3", "P3", "III" or the period's own name in the period plan ("Assembly"), to its number. */
function periodIn(raw: string, slots: PeriodSlot[]): number | null {
  const v = raw.trim();
  if (/^\d{1,2}$/.test(v)) return Number(v);
  const byLabel = slots.find((s) => plain(s.label) === plain(v));
  if (byLabel) return byLabel.number;
  const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
  if (roman[v.toLowerCase()]) return roman[v.toLowerCase()];
  const m = /^(?:period|prd|per|p)\s*[-.:#]?\s*(\d{1,2})(?:st|nd|rd|th)?$/i.exec(v) ?? /^(\d{1,2})(?:st|nd|rd|th)\s*(?:period)?$/i.exec(v);
  return m ? Number(m[1]) : null;
}

function makeKind(): ImportKind<Row> {
  // The period plan and working days of each campus, and who is where, for one check of a file.
  const plans = new WeakMap<Set<string>, Map<string, Promise<{ slots: PeriodSlot[]; days: number[] }>>>();
  const busy = new WeakMap<Set<string>, Map<string, string>>();
  const planOf = (tx: Tx, ctx: SchoolContext, seen: Set<string>, campusId: string) => {
    let m = plans.get(seen);
    if (!m) { m = new Map(); plans.set(seen, m); }
    let p = m.get(campusId);
    if (!p) {
      p = Promise.all([periodSlots(tx, ctx, campusId), academicSettings(tx, ctx, campusId)]).then(([slots, s]) => ({ slots, days: s.workingDays }));
      m.set(campusId, p);
    }
    return p;
  };
  return {
    key: TIMETABLE_IMPORT,
    label: "Time Table",
    columns: [
      { key: "className", label: "Class", required: true, example: "Class 7", help: "The class, as in Classes & Sections. A column with class and section together, like 7-A, fills both.", aliases: ["class", "standard", "std", "grade"] },
      { key: "sectionName", label: "Section", example: "A", aliases: ["section", "sec", "division", "div"] },
      { key: "day", label: "Day", required: true, example: "Monday", help: "The weekday: Monday or Mon.", aliases: ["weekday", "day of week", "days"] },
      { key: "period", label: "Period", required: true, example: "3", help: "The period's number or name in Academic Settings, Period master.", aliases: ["period no", "period number", "periods", "slot", "period name", "prd", "pd"] },
      { key: "subject", label: "Subject", required: true, example: "Mathematics", help: "The subject's name or code in Subjects.", aliases: ["subject name", "subject code", "sub"] },
      { key: "teacher", label: "Teacher", example: "Asha Rao (T-001)", help: "The teacher's staff ID or name. Empty: the teacher assigned to this subject in Teacher Allocation.", aliases: ["teacher name", "staff", "staff name", "staff id", "staff code", "faculty", "subject teacher"] },
      { key: "room", label: "Room", example: "Lab 1", help: "Only when the period is not in the section's own room.", aliases: ["room no", "room number", "lab", "venue", "classroom"] },
    ],
    withOptions: () => makeKind(),
    async check(tx, ctx, row, seen, place) {
      const run = await importRun(tx, ctx, seen);
      const problems: string[] = [];
      let choices: RowChoice[] | undefined;
      const sec = sectionIn(run, row.className ?? "", row.sectionName ?? "");
      if ("problem" in sec) problems.push(sec.problem);
      const day = (row.day ?? "").trim() ? dayIn(row.day ?? "") : null;
      if ((row.day ?? "").trim() && day === null) problems.push(`Day "${row.day}" is not a weekday. Write Monday or Mon.`);
      const subj = (row.subject ?? "").trim() ? subjectIn(run, row.subject ?? "") : null;
      if (subj && "problem" in subj) problems.push(subj.problem);
      const teacher = (row.teacher ?? "").trim() ? teacherIn(run, row.teacher ?? "", place?.decision) : null;
      if (teacher && "problem" in teacher) { problems.push(teacher.problem); choices = teacher.choices; }
      if (!("section" in sec)) return { ok: false, problems, ...(choices ? { choices } : {}) };
      const section = sec.section;
      const label = sectionWords(section);
      const year = run.years.get(section.yearId)!;
      if (year.closed) problems.push(`${year.name} is closed. Its Time Table cannot change.`);

      // The school's period plan for that day (Academic Settings).
      const plan = await planOf(tx, ctx, seen, section.campusId);
      const periodRaw = (row.period ?? "").trim();
      const n = periodRaw ? periodIn(periodRaw, plan.slots) : null;
      let slot: PeriodSlot | undefined;
      if (periodRaw && n === null) problems.push(`Period "${periodRaw}" is not a period number or name. Write 3 or Period 3.`);
      if (day !== null && !plan.days.includes(day)) problems.push(`${DAY_NAMES[day]} is not a working day in Academic Settings.`);
      else if (n !== null) {
        const teaching = plan.slots.filter((s) => !s.isBreak);
        slot = plan.slots.find((s) => s.number === n && !s.isBreak) ?? undefined;
        const asBreak = plan.slots.find((s) => s.number === n && s.isBreak);
        if (!plan.slots.length) problems.push("The school's period plan is empty. Add the periods in Academic Settings, Period master, first.");
        else if (!slot && asBreak) problems.push(`Period ${n} is ${asBreak.label} in the period plan, not a teaching period.`);
        else if (!slot) problems.push(`Period ${n} is not in the school's period plan. Its periods are ${teaching.map((s) => s.number).sort((a, b) => a - b).join(", ")} (Academic Settings, Period master).`);
        else if (day !== null && !slot.days.includes(day)) problems.push(`Period ${n} does not run on ${DAY_NAMES[day]} in the period plan.`);
      }
      const subject = subj && "subject" in subj ? subj.subject : null;
      if (subject) {
        const mapped = await tx.subjectClass.findFirst({ where: { subjectId: subject.id, classId: section.classId, OR: [mapActiveOn(todayIn()), { archivedAt: null, toDate: null }] } });
        if (!mapped) problems.push(`${subject.name} is not taught in ${section.className}. Map it to the class in Academic Management, Subjects first.`);
      }
      // No teacher in the row: the teacher assigned to the subject in this section.
      let staff = teacher && "staff" in teacher ? teacher.staff : null;
      if (!teacher && subject) {
        const assigned = await tx.teacherAllocation.findMany({ where: { sectionId: section.id, subjectId: subject.id, isMain: true, ...allocationActiveOn(todayIn()) }, select: { staffId: true } });
        const ids = [...new Set(assigned.map((a) => a.staffId))];
        staff = ids.length === 1 ? run.staff.find((s) => s.id === ids[0] && s.working) ?? null : null;
        if (!staff) problems.push(`Teacher is empty, and ${ids.length > 1 ? "more than one teacher is" : "no teacher is"} assigned to ${subject.name} in ${label}. Give the teacher, or assign one in Teacher Allocation.`);
      }
      if (problems.length || day === null || !slot || !subject || !staff) return { ok: false, problems, ...(choices ? { choices } : {}) };

      // Clashes inside the file: the same period twice, a teacher or a room in two places at once.
      const where = `period ${slot.number} on ${DAY_NAMES[day]}`;
      const line = place?.line ? ` (row ${place.line})` : "";
      let who = busy.get(seen);
      if (!who) { who = new Map(); busy.set(seen, who); }
      const cell = `cell:${section.id}:${day}:${slot.number}`;
      const room = (row.room ?? "").trim() || null;
      if (who.has(cell)) problems.push(`${label}, ${where} is twice in the file${who.get(cell)}. Keep one row.`);
      const t = `teacher:${staff.id}:${day}:${slot.number}`;
      if (who.has(t)) problems.push(`${staff.fullName} is already in ${who.get(t)}, ${where}. A teacher cannot be in two places at once.`);
      const r = room ? `room:${plain(room)}:${day}:${slot.number}` : null;
      if (r && who.has(r)) problems.push(`Room ${room} is already booked for ${who.get(r)}, ${where}.`);
      if (problems.length) return { ok: false, problems };
      who.set(cell, line);
      who.set(t, `${label}${line}`);
      if (r) who.set(r, `${label}${line}`);
      runOf(run.token).sections.add(section.id);
      return { ok: true, value: { sectionId: section.id, section: label, yearId: section.yearId, campusId: section.campusId, day, periodNo: slot.number, startTime: slot.startTime, endTime: slot.endTime, subjectId: subject.id, subject: subject.name, staffId: staff.id, staffName: staff.fullName, room, run: run.token } };
    },
    async save(tx, ctx, v) {
      const year = await tx.academicYear.findUnique({ where: { id: v.yearId }, select: { status: true, name: true } });
      if (!year || year.status === "CLOSED") throw new RowProblem(`${year?.name ?? "This year"} is closed. Its Time Table cannot change.`);
      const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
      // The year's draft: the one being worked on, or a new one copied from the published Time Table.
      const { version, created: versionCreated } = await makeDraft(tx, ctx, v.yearId, v.campusId, todayIn(school?.timeZone ?? undefined));
      const before: Before = { versionId: version.id, versionCreated, cleared: [], cell: null };
      const state = runOf(v.run);
      if (!state.cleared.has(version.id)) {
        // The first row saved replaces the draft periods (not the breaks) of every class the file names, all at once,
        // so a teacher moving between them is never in two places. A class an earlier import still standing filled is added to.
        const earlier = await importedPeriodIds(tx);
        const sections = await tx.section.findMany({ where: { id: { in: [...state.sections, v.sectionId] }, academicYearId: v.yearId }, select: { id: true } });
        for (const sec of sections) {
          const mine = await tx.timetablePeriod.findMany({ where: { versionId: version.id, sectionId: sec.id, archivedAt: null, isBreak: false }, select: { id: true } });
          if (mine.some((p) => earlier.has(p.id))) continue;
          before.cleared.push(...mine.map((p) => p.id));
        }
        if (before.cleared.length) await tx.timetablePeriod.updateMany({ where: { id: { in: before.cleared } }, data: { archivedAt: new Date() } });
      }
      // A class the file does not name keeps its periods: a teacher or room booked there at this time is a clash.
      const clash = await clashFor(tx, { versionId: version.id, sectionId: v.sectionId, days: [v.day], periodNo: v.periodNo, staffId: v.staffId, room: v.room });
      if (clash.length) throw new RowProblem(`${clash.join(" ")} That is in the draft Time Table, in a class this file does not change. Change that period first, or put that class in the file too.`);
      const at = { versionId_sectionId_dayOfWeek_periodNo: { versionId: version.id, sectionId: v.sectionId, dayOfWeek: v.day, periodNo: v.periodNo } };
      const existing = await tx.timetablePeriod.findUnique({ where: at });
      if (existing) before.cell = { subjectId: existing.subjectId, staffId: existing.staffId, room: existing.room, isBreak: existing.isBreak, label: existing.label, startTime: existing.startTime, endTime: existing.endTime, archived: Boolean(existing.archivedAt) };
      const data = { startTime: v.startTime, endTime: v.endTime, subjectId: v.subjectId, staffId: v.staffId, room: v.room, isBreak: false, label: null, archivedAt: null };
      const period = await tx.timetablePeriod.upsert({ where: at, create: { schoolId: ctx.schoolId, versionId: version.id, sectionId: v.sectionId, dayOfWeek: v.day, periodNo: v.periodNo, ...data }, update: data });
      await writeAudit(tx, ctx, { action: "changed", recordType: "Timetable Period", recordId: period.id, before: before.cell ? { ...before.cell } : undefined, after: { section: v.section, day: DAY_NAMES[v.day], period: v.periodNo, subject: v.subject, teacher: v.staffName, room: v.room, draft: version.name, source: "Import" } });
      state.cleared.add(version.id);
      // A new period in the draft is "added"; one that made the draft, replaced a period or cleared the class first keeps what was there, for Undo.
      if (!existing && !before.cleared.length && !versionCreated) return { id: period.id, created: true };
      return { id: period.id, created: false, before: before as unknown as Record<string, unknown>, after: { periodId: period.id } };
    },
    async undo(tx, ctx, ids) {
      const periods = await tx.timetablePeriod.findMany({ where: { id: { in: ids } }, select: { id: true, versionId: true, archivedAt: true } });
      const drafts = await stillDraft(tx, periods.map((p) => p.versionId));
      const live = periods.filter((p) => !p.archivedAt && drafts.has(p.versionId)).map((p) => p.id);
      if (live.length) await tx.timetablePeriod.updateMany({ where: { id: { in: live } }, data: { archivedAt: new Date() } });
      await writeAudit(tx, ctx, { action: "undone", recordType: "Timetable Period", recordId: null, after: { reason: "Import of the Time Table undone", archived: live.length } });
    },
    async revert(tx, ctx, rows: UpdatedRow[]) {
      const drafts = await stillDraft(tx, rows.map((r) => String((r.before as unknown as Before).versionId ?? "")));
      let back = 0;
      // Last row first: a period cleared by the first row of a class and filled again by a later one ends as it was.
      for (const r of [...rows].reverse()) {
        const b = r.before as unknown as Before;
        // A draft discarded since has nothing to put back.
        if (!drafts.has(b.versionId)) continue;
        const cell = b.cell;
        if (cell) {
          await tx.timetablePeriod.update({ where: { id: r.id }, data: { subjectId: cell.subjectId, staffId: cell.staffId, room: cell.room, isBreak: cell.isBreak, label: cell.label, startTime: cell.startTime, endTime: cell.endTime, archivedAt: cell.archived ? new Date() : null } });
        } else {
          await tx.timetablePeriod.updateMany({ where: { id: r.id, archivedAt: null }, data: { archivedAt: new Date() } });
        }
        if (b.cleared?.length) await tx.timetablePeriod.updateMany({ where: { id: { in: b.cleared } }, data: { archivedAt: null } });
        back++;
      }
      // A draft this import made is discarded again when nothing is left in it.
      await dropEmptyDrafts(tx, ctx, rows.map((r) => r.before as unknown as Before).filter((b) => b.versionCreated).map((b) => b.versionId));
      await writeAudit(tx, ctx, { action: "undone", recordType: "Timetable Period", recordId: null, after: { reason: "Import of the Time Table undone", putBack: back } });
      return back;
    },
  };
}

/** Periods brought in by Time Table imports still standing (not undone). */
async function importedPeriodIds(tx: Tx): Promise<Set<string>> {
  const batches = await tx.importBatch.findMany({ where: { kind: TIMETABLE_IMPORT, undoneAt: null }, select: { createdIds: true, updatedRows: true } });
  const ids = new Set<string>();
  for (const b of batches) {
    for (const id of b.createdIds as string[]) ids.add(id);
    for (const u of (b.updatedRows ?? []) as unknown as UpdatedRow[]) ids.add(u.id);
  }
  return ids;
}

/**
 * Undo changes a draft only: a Time Table published since is changed by
 * starting a new draft. Returns the drafts still open (a draft discarded since
 * has nothing to put back).
 */
async function stillDraft(tx: Tx, versionIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(versionIds.filter(Boolean))];
  const versions = await tx.timetableVersion.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, status: true, publishedAt: true } });
  const published = versions.find((v) => v.publishedAt || v.status === "PUBLISHED");
  if (published) {
    throw new AcademicRuleError(`${published.name} is published, so this import cannot be undone. Start a draft on the Time Table page and change the periods there.`);
  }
  return new Set(versions.filter((v) => v.status === "DRAFT").map((v) => v.id));
}

/** A draft the import made, left with no periods after Undo, is archived, as Discard draft does. */
async function dropEmptyDrafts(tx: Tx, ctx: SchoolContext, versionIds: string[]) {
  for (const id of [...new Set(versionIds.filter(Boolean))]) {
    const v = await tx.timetableVersion.findFirst({ where: { id, status: "DRAFT", archivedAt: null } });
    if (!v) continue;
    if (await tx.timetablePeriod.count({ where: { versionId: id, archivedAt: null } })) continue;
    await tx.timetableVersion.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await writeAudit(tx, ctx, { action: "discarded", recordType: "Timetable Version", recordId: id, before: { name: v.name }, after: { reason: "Import of the Time Table undone" } });
  }
}

defineImport(makeKind());
