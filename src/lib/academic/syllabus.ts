// Syllabus & Lesson Plans (04 §2): the syllabus tree per class and subject,
// planned dates, the daily log of topics taught, progress against plan
// (chapters running late) and lesson plans.
import "server-only";

import type { SyllabusItem, SyllabusItemKind } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { AcademicRuleError, addDays, plural, weekday } from "./common";
import { effectiveVersion } from "./timetable";
import { dayOff } from "./calendar";

export const KIND_ORDER: SyllabusItemKind[] = ["UNIT", "CHAPTER", "LESSON", "TOPIC"];
export const KIND_WORDS: Record<SyllabusItemKind, string> = { UNIT: "Unit", CHAPTER: "Chapter", LESSON: "Lesson", TOPIC: "Topic" };

export type ItemStatus = "Planned" | "Taught" | "Completed" | "Pending";

export type TreeNode = SyllabusItem & { children: TreeNode[]; status: ItemStatus; plannedTo: Date | null; ownPlannedTo: Date | null; lastTaught: Date | null; leaves: number; done: number };

export async function syllabusItems(tx: Tx, yearId: string, classId: string, subjectId: string) {
  return tx.syllabusItem.findMany({ where: { academicYearId: yearId, classId, subjectId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

/** The tree with each item's status for one section (or for the class when no section is given). */
export async function syllabusTree(tx: Tx, yearId: string, classId: string, subjectId: string, sectionId: string | null, today: Date) {
  const items = await syllabusItems(tx, yearId, classId, subjectId);
  const entries = sectionId
    ? await tx.syllabusProgressEntry.findMany({ where: { sectionId, itemId: { in: items.map((i) => i.id) }, archivedAt: null }, orderBy: { date: "asc" } })
    : [];
  const byParent = new Map<string | null, SyllabusItem[]>();
  for (const i of items) byParent.set(i.parentId, [...(byParent.get(i.parentId) ?? []), i]);
  const build = (item: SyllabusItem, inheritedTo: Date | null): TreeNode => {
    const plannedTo = item.plannedTo ?? inheritedTo;
    const children = (byParent.get(item.id) ?? []).map((c) => build(c, plannedTo));
    const mine = entries.filter((e) => e.itemId === item.id);
    const completedHere = mine.some((e) => e.status === "completed");
    const lastTaught = [...mine.map((e) => e.date), ...children.map((c) => c.lastTaught).filter((d): d is Date => Boolean(d))].sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    let leaves: number, done: number;
    if (children.length === 0) { leaves = 1; done = mine.length > 0 ? 1 : 0; }
    else { leaves = children.reduce((n, c) => n + c.leaves, 0); done = completedHere ? leaves : children.reduce((n, c) => n + c.done, 0); }
    let status: ItemStatus;
    if (completedHere || (children.length > 0 && leaves > 0 && done === leaves)) status = "Completed";
    else if (mine.length > 0 || done > 0) status = "Taught";
    else if (plannedTo && plannedTo < today) status = "Pending";
    else status = "Planned";
    return { ...item, ownPlannedTo: item.plannedTo, plannedTo, children, status, lastTaught, leaves, done };
  };
  return (byParent.get(null) ?? []).map((i) => build(i, null));
}

export function flatten(nodes: TreeNode[], depth = 0): (TreeNode & { depth: number })[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

/** % completed against % planned by today, and chapters running late (the old Delay Dashboard). */
export function progressOf(nodes: TreeNode[], today: Date) {
  const flat = flatten(nodes);
  const leaves = flat.filter((n) => n.children.length === 0);
  const total = leaves.length;
  const done = nodes.reduce((n, x) => n + x.done, 0);
  const plannedByToday = leaves.filter((l) => l.plannedTo && l.plannedTo <= today).length;
  const late = flat.filter((n) => (n.kind === "CHAPTER" || (n.kind === "UNIT" && !n.children.some((c) => c.kind === "CHAPTER"))) && n.plannedTo && n.plannedTo < today && n.status !== "Completed" && n.done < n.leaves);
  return {
    total, done,
    completedPct: total ? Math.round((done / total) * 100) : 0,
    plannedPct: total ? Math.round((plannedByToday / total) * 100) : 0,
    late: late.map((l) => ({ id: l.id, title: l.title, plannedTo: l.plannedTo!, done: l.done, leaves: l.leaves })),
  };
}

export type ItemInput = { yearId: string; classId: string; subjectId: string; parentId: string | null; kind: SyllabusItemKind; title: string; plannedFrom: Date | null; plannedTo: Date | null };

export async function addItem(tx: Tx, ctx: SchoolContext, input: ItemInput) {
  const title = input.title.trim();
  if (!title) throw new AcademicRuleError("Give a title.", "title");
  if (title.length > 200) throw new AcademicRuleError("The title can be at most 200 characters.", "title");
  if (input.plannedFrom && input.plannedTo && input.plannedTo < input.plannedFrom) throw new AcademicRuleError("The planned end must be on or after the planned start.", "plannedTo");
  if (input.parentId) {
    const parent = await tx.syllabusItem.findFirst({ where: { id: input.parentId, archivedAt: null, classId: input.classId, subjectId: input.subjectId, academicYearId: input.yearId } });
    if (!parent) throw new AcademicRuleError("The item to add under was not found.", "parentId");
    if (KIND_ORDER.indexOf(input.kind) <= KIND_ORDER.indexOf(parent.kind)) throw new AcademicRuleError(`A ${KIND_WORDS[input.kind].toLowerCase()} cannot go under a ${KIND_WORDS[parent.kind].toLowerCase()}.`, "kind");
  }
  const last = await tx.syllabusItem.aggregate({ where: { academicYearId: input.yearId, classId: input.classId, subjectId: input.subjectId, parentId: input.parentId, archivedAt: null }, _max: { sortOrder: true } });
  const row = await tx.syllabusItem.create({
    data: { schoolId: ctx.schoolId, academicYearId: input.yearId, classId: input.classId, subjectId: input.subjectId, parentId: input.parentId, kind: input.kind, title, plannedFrom: input.plannedFrom, plannedTo: input.plannedTo, sortOrder: (last._max.sortOrder ?? 0) + 1, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Syllabus Item", recordId: row.id, after: { kind: input.kind, title, plannedTo: input.plannedTo?.toISOString().slice(0, 10) ?? null } });
  return row;
}

export async function updateItem(tx: Tx, ctx: SchoolContext, id: string, input: { title: string; plannedFrom: Date | null; plannedTo: Date | null }) {
  const item = await tx.syllabusItem.findFirst({ where: { id, archivedAt: null } });
  if (!item) throw new AcademicRuleError("This item was not found.");
  const title = input.title.trim();
  if (!title) throw new AcademicRuleError("Give a title.", "title");
  if (input.plannedFrom && input.plannedTo && input.plannedTo < input.plannedFrom) throw new AcademicRuleError("The planned end must be on or after the planned start.", "plannedTo");
  await tx.syllabusItem.update({ where: { id }, data: { title, plannedFrom: input.plannedFrom, plannedTo: input.plannedTo } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Syllabus Item", recordId: id, before: { title: item.title, plannedFrom: item.plannedFrom?.toISOString() ?? null, plannedTo: item.plannedTo?.toISOString() ?? null }, after: { title, plannedFrom: input.plannedFrom?.toISOString() ?? null, plannedTo: input.plannedTo?.toISOString() ?? null } });
  return item;
}

/** Archives an item with everything under it; its progress stays in history. */
export async function archiveItem(tx: Tx, ctx: SchoolContext, id: string) {
  const item = await tx.syllabusItem.findFirst({ where: { id, archivedAt: null } });
  if (!item) throw new AcademicRuleError("This item was not found.");
  const all = await syllabusItems(tx, item.academicYearId, item.classId, item.subjectId);
  const ids = [id];
  for (let i = 0; i < ids.length; i++) for (const c of all.filter((x) => x.parentId === ids[i])) ids.push(c.id);
  const at = new Date();
  await tx.syllabusItem.updateMany({ where: { id: { in: ids } }, data: { archivedAt: at } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Syllabus Item", recordId: id, before: { title: item.title, items: ids.length } });
  return { item, ids, at };
}

export async function moveItem(tx: Tx, ctx: SchoolContext, id: string, dir: "up" | "down") {
  const item = await tx.syllabusItem.findFirst({ where: { id, archivedAt: null } });
  if (!item) throw new AcademicRuleError("This item was not found.");
  const siblings = await tx.syllabusItem.findMany({ where: { academicYearId: item.academicYearId, classId: item.classId, subjectId: item.subjectId, parentId: item.parentId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const i = siblings.findIndex((s) => s.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  for (const [k, s] of siblings.entries()) await tx.syllabusItem.update({ where: { id: s.id }, data: { sortOrder: k + 1 } });
  await writeAudit(tx, ctx, { action: "reordered", recordType: "Syllabus Item", recordId: id, after: { dir } });
}

/** Copies a syllabus from another class or year; planned dates move with the year. */
export async function copySyllabus(tx: Tx, ctx: SchoolContext, from: { yearId: string; classId: string; subjectId: string }, to: { yearId: string; classId: string; subjectId: string }) {
  const items = await syllabusItems(tx, from.yearId, from.classId, from.subjectId);
  if (items.length === 0) throw new AcademicRuleError("There is no syllabus there to copy.");
  const existing = await tx.syllabusItem.count({ where: { academicYearId: to.yearId, classId: to.classId, subjectId: to.subjectId, archivedAt: null } });
  if (existing > 0) throw new AcademicRuleError("This class and subject already have a syllabus. Archive it first to copy another one.");
  const [fy, ty] = await Promise.all([tx.academicYear.findUniqueOrThrow({ where: { id: from.yearId } }), tx.academicYear.findUniqueOrThrow({ where: { id: to.yearId } })]);
  const shift = ty.startDate.getTime() - fy.startDate.getTime();
  const move = (d: Date | null) => (d ? new Date(d.getTime() + shift) : null);
  const ids = new Map<string, string>();
  const ordered = [...items].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  // Parents first, so every child finds its new parent.
  const pending = [...ordered];
  while (pending.length) {
    const i = pending.findIndex((x) => !x.parentId || ids.has(x.parentId));
    const it = pending.splice(i === -1 ? 0 : i, 1)[0];
    const row = await tx.syllabusItem.create({
      data: { schoolId: ctx.schoolId, academicYearId: to.yearId, classId: to.classId, subjectId: to.subjectId, parentId: it.parentId ? ids.get(it.parentId) ?? null : null, kind: it.kind, title: it.title, sortOrder: it.sortOrder, plannedFrom: move(it.plannedFrom), plannedTo: move(it.plannedTo), createdById: ctx.userId },
    });
    ids.set(it.id, row.id);
  }
  await writeAudit(tx, ctx, { action: "copied", recordType: "Syllabus Item", recordId: null, after: { from, to, items: items.length } });
  return items.length;
}

/** The daily log: topics taught today, or a chapter completed. Safe to tick twice. */
export async function logProgress(tx: Tx, ctx: SchoolContext, input: { yearId: string; sectionId: string; itemIds: string[]; date: Date; status: "taught" | "completed"; staffId: string | null; note?: string | null }) {
  if (input.itemIds.length === 0) throw new AcademicRuleError("Tick at least one topic.", "itemIds");
  const section = await tx.section.findFirst({ where: { id: input.sectionId, academicYearId: input.yearId, archivedAt: null } });
  if (!section) throw new AcademicRuleError("This section was not found.");
  const items = await tx.syllabusItem.findMany({ where: { id: { in: input.itemIds }, classId: section.classId, archivedAt: null } });
  if (items.length !== new Set(input.itemIds).size) throw new AcademicRuleError("A ticked topic is not in this class's syllabus.");
  let added = 0;
  for (const item of items) {
    const same = await tx.syllabusProgressEntry.findFirst({ where: { sectionId: section.id, itemId: item.id, date: input.date, status: input.status, archivedAt: null } });
    if (same) continue;
    await tx.syllabusProgressEntry.create({ data: { schoolId: ctx.schoolId, academicYearId: input.yearId, sectionId: section.id, itemId: item.id, staffId: input.staffId, date: input.date, status: input.status, note: input.note ?? null, createdById: ctx.userId } });
    added++;
  }
  await writeAudit(tx, ctx, { action: input.status === "completed" ? "completed" : "taught", recordType: "Syllabus Progress Entry", recordId: section.id, after: { items: items.map((i) => i.title), date: input.date.toISOString().slice(0, 10) } });
  return added;
}

/** Takes back a tick (a mistake in the daily log). */
export async function untick(tx: Tx, ctx: SchoolContext, sectionId: string, itemId: string, date: Date) {
  const rows = await tx.syllabusProgressEntry.findMany({ where: { sectionId, itemId, date, archivedAt: null } });
  if (!rows.length) return 0;
  await tx.syllabusProgressEntry.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "untaught", recordType: "Syllabus Progress Entry", recordId: sectionId, after: { itemId, date: date.toISOString().slice(0, 10) } });
  return rows.length;
}

/** The next pending topic for a section and subject, for the lesson plan's default. */
export async function nextPendingTopic(tx: Tx, yearId: string, sectionId: string, classId: string, subjectId: string, today: Date) {
  const tree = await syllabusTree(tx, yearId, classId, subjectId, sectionId, today);
  return flatten(tree).find((n) => n.children.length === 0 && n.done === 0) ?? null;
}

/** The next date with a period of this subject in this section in the published Time Table (the lesson plan's default). */
export async function nextPeriodDate(tx: Tx, ctx: SchoolContext, sectionId: string, subjectId: string, from: Date, campusId: string) {
  for (let i = 0; i < 21; i++) {
    const date = addDays(from, i);
    if (await dayOff(tx, ctx, date, campusId)) continue;
    const version = await effectiveVersion(tx, ctx, campusId, date);
    if (!version) continue;
    const has = await tx.timetablePeriod.findFirst({ where: { versionId: version.id, sectionId, subjectId, dayOfWeek: weekday(date), archivedAt: null } });
    if (has) return date;
  }
  return from;
}

export type LessonPlanInput = { yearId: string; sectionId: string; subjectId: string; topicId: string; staffId: string; date: Date; objectives: string | null; resources: string | null; activities: string | null };

export async function saveLessonPlan(tx: Tx, ctx: SchoolContext, input: LessonPlanInput, id?: string) {
  const section = await tx.section.findFirst({ where: { id: input.sectionId, academicYearId: input.yearId, archivedAt: null }, include: { schoolClass: true } });
  if (!section) throw new AcademicRuleError("Choose a class and section.", "sectionId");
  const topic = await tx.syllabusItem.findFirst({ where: { id: input.topicId, classId: section.classId, subjectId: input.subjectId, archivedAt: null } });
  if (!topic) throw new AcademicRuleError("Choose a topic from this subject's syllabus.", "topicId");
  const year = await tx.academicYear.findUniqueOrThrow({ where: { id: input.yearId } });
  if (input.date < year.startDate || input.date > year.endDate) throw new AcademicRuleError(`The date must be inside ${year.name}.`, "date");
  const data = { sectionId: section.id, subjectId: input.subjectId, topicId: topic.id, date: input.date, objectives: input.objectives, resources: input.resources, activities: input.activities };
  if (id) {
    const before = await tx.lessonPlan.findFirst({ where: { id, archivedAt: null } });
    if (!before) throw new AcademicRuleError("This lesson plan was not found.");
    const row = await tx.lessonPlan.update({ where: { id }, data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Lesson Plan", recordId: id, before: { topicId: before.topicId, date: before.date.toISOString(), objectives: before.objectives }, after: { topic: topic.title, date: input.date.toISOString().slice(0, 10), objectives: input.objectives } });
    return { row, message: `Lesson plan for ${topic.title} saved.` };
  }
  const row = await tx.lessonPlan.create({ data: { schoolId: ctx.schoolId, academicYearId: input.yearId, staffId: input.staffId, createdById: ctx.userId, ...data } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Lesson Plan", recordId: row.id, after: { topic: topic.title, section: `${section.schoolClass.name} ${section.name}`, date: input.date.toISOString().slice(0, 10) } });
  return { row, message: `Lesson plan for ${topic.title} on ${formatDate(input.date)} saved.` };
}

export async function archiveLessonPlan(tx: Tx, ctx: SchoolContext, id: string) {
  const plan = await tx.lessonPlan.findFirst({ where: { id, archivedAt: null } });
  if (!plan) throw new AcademicRuleError("This lesson plan was not found.");
  await tx.lessonPlan.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Lesson Plan", recordId: id });
  return plan;
}

/** Syllabus completion for every section and subject a set of allocations covers (progress view). */
export async function progressBoard(tx: Tx, yearId: string, pairs: { sectionId: string; classId: string; subjectId: string; label: string; subject: string; teacher: string | null }[], today: Date) {
  const out = [];
  for (const p of pairs) {
    const tree = await syllabusTree(tx, yearId, p.classId, p.subjectId, p.sectionId, today);
    if (tree.length === 0) { out.push({ ...p, total: 0, done: 0, completedPct: 0, plannedPct: 0, late: [] as ReturnType<typeof progressOf>["late"] }); continue; }
    out.push({ ...p, ...progressOf(tree, today) });
  }
  return out;
}

export function lateWords(late: { title: string; plannedTo: Date }[]) {
  return late.length ? `${plural(late.length, "chapter")} running late: ${late.slice(0, 2).map((l) => `${l.title} (by ${formatDate(l.plannedTo)})`).join(", ")}${late.length > 2 ? "…" : ""}` : "On plan";
}
