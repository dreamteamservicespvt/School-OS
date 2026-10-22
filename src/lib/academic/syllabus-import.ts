// The syllabus from Excel (04 §2 Syllabus & Lesson Plans, "import from Excel
// (P10)", gap list G44): one row per chapter, or per topic of a chapter, for a
// class and subject of this year, with an optional unit above the chapter, its
// order and the month or week it is planned for. Rows of one chapter build one
// tree: the chapter is added once and its topics go under it, in the file's
// order unless the Order column says otherwise. Progress and the "running
// late" list count the planned dates from the first day.
//
// A chapter or topic already in the syllabus is a row problem, never a second
// copy. Brought in from Academic Management, Import, or Switching to School OS,
// by people with full Academic Management (as for setting up the curriculum).
// Undo archives what the import added, with anything added under it since.
// Imported by src/lib/import-registry.ts.
import "server-only";

import type { SyllabusItemKind } from "@prisma/client";
import type { Tx } from "../db";
import { defineImport, RowProblem, type ImportKind } from "../importer";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { readDate } from "../move-in/tidy";
import { addDays } from "./common";
import { mapActiveOn } from "./subjects";
import { addItem } from "./syllabus";
import { classIn, importRun, subjectIn } from "./import-common";

export const SYLLABUS_IMPORT = "academic-syllabus";

type Step = { kind: SyllabusItemKind; title: string };
type Row = {
  yearId: string; classId: string; className: string; subjectId: string; subject: string;
  path: Step[]; order: number | null; plannedFrom: Date | null; plannedTo: Date | null;
  run: string;
};

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** A month's number from its name or its first three letters (and "Sept"); null for anything else ("Juny"). */
const monthOf = (w: string) => {
  const v = w.toLowerCase();
  const i = MONTH_NAMES.findIndex((m) => m === v || m.slice(0, 3) === v || (v === "sept" && m === "september"));
  return i < 0 ? null : i + 1;
};
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0));

/**
 * When a row is planned, inside the year: a month ("July", "Jul 2026", "07-2026"),
 * a week of the school year ("Week 5"), a week of a month ("Week 2 of July"),
 * or a date it is finished by ("31-07-2026"). Null when empty; a string when it
 * cannot be read, with the problem.
 */
export function plannedIn(raw: string, year: { startDate: Date; endDate: Date; name: string }): { from: Date | null; to: Date | null } | null | string {
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return null;
  const inYear = (from: Date, to: Date) => {
    const f = from < year.startDate ? year.startDate : from;
    const t = to > year.endDate ? year.endDate : to;
    return f > t ? `${raw.trim()} is not inside ${year.name}.` : { from: f, to: t };
  };
  /** The month's year inside the school year when the file does not say it. */
  const yearOfMonth = (m: number, y?: number) => {
    if (y) return y < 100 ? 2000 + y : y;
    const start = year.startDate.getUTCFullYear();
    return utc(start, m, 1) >= utc(start, year.startDate.getUTCMonth() + 1, 1) ? start : start + 1;
  };
  let m: RegExpExecArray | null;
  // Week N of the school year.
  if ((m = /^(?:week|wk|w)\s*[-.:#]?\s*(\d{1,2})$/i.exec(v))) {
    const n = Number(m[1]);
    if (n < 1 || n > 53) return "Write the week as Week 1 to Week 53 of the school year.";
    const from = addDays(year.startDate, (n - 1) * 7);
    return inYear(from, addDays(from, 6));
  }
  // Week N of a month: "Week 2 of July", "July week 2", "Jul-2026 W2".
  const weekOfMonth = /^(?:week|wk|w)\s*(\d)\s*(?:of|,|-|in)?\s*([a-z]{3,9})\.?\s*[-/ ]?\s*(\d{2}|\d{4})?$/i.exec(v) ?? null;
  const monthWeek = !weekOfMonth ? /^([a-z]{3,9})\.?\s*[-/ ]?\s*(\d{4})?\s*[,-]?\s*(?:week|wk|w)\s*(\d)$/i.exec(v) : null;
  if (weekOfMonth || monthWeek) {
    const [n, word, y] = weekOfMonth ? [Number(weekOfMonth[1]), weekOfMonth[2], weekOfMonth[3]] : [Number(monthWeek![3]), monthWeek![1], monthWeek![2]];
    const mon = monthOf(word);
    if (!mon) return `Write the planned month or week like July, Week 5 or Week 2 of July.`;
    if (n < 1 || n > 5) return "A month has weeks 1 to 5.";
    const yy = yearOfMonth(mon, y ? Number(y) : undefined);
    const from = utc(yy, mon, 1 + (n - 1) * 7);
    const end = lastDay(yy, mon);
    if (from > end) return `${raw.trim()} is not a week of that month.`;
    const to = addDays(from, 6);
    return inYear(from, to > end ? end : to);
  }
  // A month: "July", "Jul 2026", "July-26", "07-2026", "2026-07".
  if ((m = /^([a-z]{3,9})\.?\s*[-/ ]?\s*(\d{2}|\d{4})?$/i.exec(v)) && monthOf(m[1])) {
    const mon = monthOf(m[1])!;
    const yy = yearOfMonth(mon, m[2] ? Number(m[2]) : undefined);
    return inYear(utc(yy, mon, 1), lastDay(yy, mon));
  }
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(v)) || (m = /^(\d{4})[-/.](\d{1,2})$/.exec(v))) {
    const [mon, yy] = m[1].length === 4 ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
    if (mon >= 1 && mon <= 12) return inYear(utc(yy, mon, 1), lastDay(yy, mon));
  }
  // A date it is to be finished by.
  const d = readDate(v);
  if (d) return d < year.startDate || d > year.endDate ? `${formatDate(d)} is not inside ${year.name}.` : { from: null, to: d };
  return "Write the planned month or week like July, Week 5 or Week 2 of July, or the date it is finished by.";
}

/** Items a run has added, by run: a chapter added for a topic row is the same chapter for the next rows. Kept for a short while only. */
const addedBy = new Map<string, Set<string>>();
function addedIn(run: string) {
  let s = addedBy.get(run);
  if (!s) {
    if (addedBy.size > 200) addedBy.delete(addedBy.keys().next().value!);
    s = new Set();
    addedBy.set(run, s);
  }
  return s;
}

const findStep = (tx: Tx, v: Pick<Row, "yearId" | "classId" | "subjectId">, parentId: string | null, step: Step) =>
  tx.syllabusItem.findFirst({ where: { academicYearId: v.yearId, classId: v.classId, subjectId: v.subjectId, parentId, kind: step.kind, archivedAt: null, title: { equals: step.title, mode: "insensitive" } } });

function makeKind(): ImportKind<Row> {
  return {
    key: SYLLABUS_IMPORT,
    label: "Syllabus",
    columns: [
      { key: "class", label: "Class", required: true, example: "Class 5", help: "The class, as in Classes & Sections. The syllabus is the same for every section of the class.", aliases: ["class name", "standard", "std", "grade"] },
      { key: "subject", label: "Subject", required: true, example: "Mathematics", help: "The subject's name or code in Subjects.", aliases: ["subject name", "subject code", "sub"] },
      { key: "unit", label: "Unit", example: "Numbers", help: "Optional: the unit the chapter is in.", aliases: ["unit name", "theme", "part", "section of book"] },
      { key: "chapter", label: "Chapter", required: true, example: "Fractions", help: "The chapter (or lesson) name.", aliases: ["chapter name", "chapter title", "lesson", "lesson name", "chapter no and name"] },
      { key: "topic", label: "Topic", example: "Adding fractions", help: "Optional: one topic of the chapter. Repeat the chapter on each topic's row.", aliases: ["topic name", "sub topic", "subtopic", "topics", "concept"] },
      { key: "order", label: "Order", example: "1", help: "Optional: the chapter's (or topic's) place, 1 first. Empty keeps the file's order.", aliases: ["sequence", "seq", "sl no", "s no", "order no", "chapter no", "serial no"] },
      { key: "planned", label: "Planned month or week", example: "July", help: "A month (July), a week of the school year (Week 5), a week of a month (Week 2 of July), or the date it is finished by.", aliases: ["month", "planned month", "week", "planned week", "planned", "plan", "to be completed by", "completion month", "target month", "target", "by"] },
    ],
    withOptions: () => makeKind(),
    async check(tx, ctx, row, seen) {
      const run = await importRun(tx, ctx, seen);
      const problems: string[] = [];
      const cls = (row.class ?? "").trim() ? classIn(run, row.class ?? "") : null;
      if (cls && "problem" in cls) problems.push(cls.problem);
      const subj = (row.subject ?? "").trim() ? subjectIn(run, row.subject ?? "") : null;
      if (subj && "problem" in subj) problems.push(subj.problem);
      const titles = { unit: (row.unit ?? "").trim(), chapter: (row.chapter ?? "").trim(), topic: (row.topic ?? "").trim() };
      for (const [k, t] of Object.entries(titles)) if (t.length > 200) problems.push(`The ${k} can be at most 200 characters.`);
      const orderRaw = (row.order ?? "").trim().replace(/\.0+$/, "");
      const order = orderRaw ? Number(orderRaw) : null;
      if (orderRaw && (!/^\d{1,3}$/.test(orderRaw) || order === 0)) problems.push("Order must be a whole number like 1, 2 or 3.");
      if (!cls || !("classId" in cls) || !subj || !("subject" in subj) || !titles.chapter) return { ok: false, problems };
      const year = run.years.get(cls.yearId)!;
      if (year.closed) problems.push(`${year.name} is closed. Its syllabus cannot change.`);
      const planned = plannedIn(row.planned ?? "", year);
      if (typeof planned === "string") problems.push(planned);
      const subject = subj.subject;
      const mapped = await tx.subjectClass.findFirst({ where: { subjectId: subject.id, classId: cls.classId, OR: [mapActiveOn(year.startDate), { archivedAt: null, toDate: null }] } });
      if (!mapped) problems.push(`${subject.name} is not taught in ${cls.className}. Map it to the class in Academic Management, Subjects first.`);
      if (problems.length) return { ok: false, problems };

      const path: Step[] = [
        ...(titles.unit ? [{ kind: "UNIT" as const, title: titles.unit }] : []),
        { kind: "CHAPTER", title: titles.chapter },
        ...(titles.topic ? [{ kind: "TOPIC" as const, title: titles.topic }] : []),
      ];
      const where = `${cls.className}, ${subject.name}`;
      const last = path.at(-1)!;
      const key = `syllabus:${cls.classId}:${subject.id}:${path.map((s) => s.title.toLowerCase().replace(/\s+/g, " ")).join(">")}`;
      if (seen.has(key)) return { ok: false, problems: [`${last.title} is twice in the file for ${where}. Keep one row.`] };
      seen.add(key);
      // Already in the syllabus (typed, copied or brought in before): never a second copy.
      let parentId: string | null = null;
      for (const [i, step] of path.entries()) {
        const found = await findStep(tx, { yearId: cls.yearId, classId: cls.classId, subjectId: subject.id }, parentId, step);
        if (!found) break;
        if (i === path.length - 1) return { ok: false, problems: [`${last.title} is already in the syllabus of ${where}. Leave this row out.`] };
        parentId = found.id;
      }
      const p = planned && typeof planned !== "string" ? planned : null;
      return { ok: true, value: { yearId: cls.yearId, classId: cls.classId, className: cls.className, subjectId: subject.id, subject: subject.name, path, order, plannedFrom: p?.from ?? null, plannedTo: p?.to ?? null, run: run.token } };
    },
    async save(tx, ctx, v) {
      const year = await tx.academicYear.findUnique({ where: { id: v.yearId }, select: { status: true, name: true } });
      if (!year || year.status === "CLOSED") throw new RowProblem(`${year?.name ?? "This year"} is closed. Its syllabus cannot change.`);
      const added = addedIn(v.run);
      const mine: string[] = [];
      let parentId: string | null = null;
      for (const [i, step] of v.path.entries()) {
        const isLast = i === v.path.length - 1;
        const found = await findStep(tx, v, parentId, step);
        if (found && !isLast) { parentId = found.id; continue; }
        if (found) {
          // A chapter added earlier in this import for its topics' rows: this row gives its order and plan.
          if (!added.has(found.id)) throw new RowProblem(`${step.title} is already in the syllabus of ${v.className}, ${v.subject}.`);
          await tx.syllabusItem.update({ where: { id: found.id }, data: { ...(v.order !== null ? { sortOrder: v.order } : {}), ...(v.plannedFrom || v.plannedTo ? { plannedFrom: v.plannedFrom, plannedTo: v.plannedTo } : {}) } });
          return { id: found.id, created: false };
        }
        const row = await addItem(tx, ctx, { yearId: v.yearId, classId: v.classId, subjectId: v.subjectId, parentId, kind: step.kind, title: step.title, plannedFrom: isLast ? v.plannedFrom : null, plannedTo: isLast ? v.plannedTo : null });
        if (isLast && v.order !== null) await tx.syllabusItem.update({ where: { id: row.id }, data: { sortOrder: v.order } });
        mine.push(row.id);
        parentId = row.id;
      }
      for (const id of mine) added.add(id);
      // The first item this row added: Undo archives it with what is under it.
      return { id: mine[0], created: true };
    },
    async undo(tx, ctx, ids) {
      const all = new Set<string>();
      let level = await tx.syllabusItem.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true } });
      while (level.length) {
        for (const i of level) all.add(i.id);
        level = await tx.syllabusItem.findMany({ where: { parentId: { in: level.map((i) => i.id) }, archivedAt: null, id: { notIn: [...all] } }, select: { id: true } });
      }
      if (all.size) await tx.syllabusItem.updateMany({ where: { id: { in: [...all] } }, data: { archivedAt: new Date() } });
      await writeAudit(tx, ctx, { action: "archived", recordType: "Syllabus Item", recordId: null, after: { reason: "Import of the syllabus undone", items: all.size } });
    },
  };
}

defineImport(makeKind());
