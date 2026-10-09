"use server";

import { z } from "zod";
import { parseForm, type FormState } from "@/lib/forms";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { AcademicRuleError, isoDay, plural, todayIn } from "@/lib/academic/common";
import { mainCampusId } from "@/lib/academic/settings";
import { academicScope, type AcademicScope } from "@/lib/academic/scope";
import { KIND_ORDER, addItem, archiveItem, archiveLessonPlan, copySyllabus, flatten, logProgress, moveItem, nextPendingTopic, nextPeriodDate, saveLessonPlan, syllabusTree, untick, updateItem } from "@/lib/academic/syllabus";
import { act, actSimple } from "../_lib/server";

const PATH = "/academic-management/syllabus";
const uuid = (m: string) => z.string().uuid(m);
const day = (label: string) => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `Choose the ${label}.`).transform((v) => new Date(`${v}T00:00:00Z`));
const optDay = (label: string) => z.string().trim().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), `Give the ${label} as a date.`).transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));
const longText = (label: string) => z.string().trim().max(4000, `${label} can be at most 4000 characters.`).optional().transform((v) => v || null);

function ownSection(scope: AcademicScope, sectionId: string) {
  if (scope.sectionIds && !scope.sectionIds.includes(sectionId)) throw new AcademicRuleError("You can only record this for your own classes.");
}

// ------------------------------------------------------------ the syllabus tree (set-up)

const itemSchema = z.object({
  yearId: uuid("Choose the year."), classId: uuid("Choose a class."), subjectId: uuid("Choose a subject."),
  parentId: z.string().trim().optional().transform((v) => v || null),
  kind: z.enum(["UNIT", "CHAPTER", "LESSON", "TOPIC"], { errorMap: () => ({ message: "Choose unit, chapter, lesson or topic." }) }),
  title: z.string().trim().min(1, "Give a title.").max(200, "The title can be at most 200 characters."),
  plannedFrom: optDay("planned start"), plannedTo: optDay("planned end"),
});

export async function addItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(itemSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current }) => {
    const r = await addItem(tx, current.ctx, d);
    return { flash: { message: `${r.title} added.` } };
  }, { formData: fd, yearId: d.yearId, revalidate: [PATH] });
}

const editSchema = z.object({ id: uuid("This item was not found."), title: z.string().trim().min(1, "Give a title.").max(200, "The title can be at most 200 characters."), plannedFrom: optDay("planned start"), plannedTo: optDay("planned end") });

export async function updateItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(editSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current }) => {
    await updateItem(tx, current.ctx, d.id, d);
    return { flash: { message: `${d.title} saved.` } };
  }, { formData: fd, yearOf: async (tx) => (await tx.syllabusItem.findFirst({ where: { id: d.id } }))?.academicYearId ?? null, revalidate: [PATH] });
}

export async function archiveItemAction(id: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const r = await archiveItem(tx, current.ctx, id);
    return { flash: { message: `${r.item.title}${r.ids.length > 1 ? ` and ${plural(r.ids.length - 1, "item")} under it` : ""} archived. Progress already logged stays in history.` } };
  }, { yearOf: async (tx) => (await tx.syllabusItem.findFirst({ where: { id } }))?.academicYearId ?? null, revalidate: [PATH] });
}

export async function moveItemAction(id: string, dir: "up" | "down"): Promise<string | undefined> {
  if (dir !== "up" && dir !== "down") return "Choose up or down.";
  return actSimple("edit", async ({ tx, current }) => { await moveItem(tx, current.ctx, id, dir); }, { yearOf: async (tx) => (await tx.syllabusItem.findFirst({ where: { id } }))?.academicYearId ?? null, revalidate: [PATH] });
}

const copySchema = z.object({
  yearId: uuid("Choose the year."), classId: uuid("Choose a class."), subjectId: uuid("Choose a subject."),
  from: z.string().trim().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}:[0-9a-f-]{36}$/i, "Choose where to copy from."),
});

export async function copySyllabusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(copySchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const [fromYear, fromClass, fromSubject] = d.from.split(":");
  return act("create", async ({ tx, current }) => {
    const n = await copySyllabus(tx, current.ctx, { yearId: fromYear, classId: fromClass, subjectId: fromSubject }, { yearId: d.yearId, classId: d.classId, subjectId: d.subjectId });
    return { flash: { message: `Copied ${plural(n, "item")}. Planned dates moved to this year; check them.` } };
  }, { formData: fd, yearId: d.yearId, revalidate: [PATH] });
}

/**
 * Adds many items at once from a pasted list (P10). Dashes or indents give
 * the level: no dash = unit, "-" = chapter, "--" = lesson, "---" = topic.
 * A planned end date may follow " | ", like "- Fractions | 30-11-2026".
 */
export async function pasteItemsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ yearId: uuid("Choose the year."), classId: uuid("Choose a class."), subjectId: uuid("Choose a subject."), text: z.string().min(1, "Paste the list of units, chapters and topics.").max(50_000, "That list is too long. Paste at most 1000 lines at a time.") }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const lines = d.text.split(/\r?\n/).map((l) => l.replace(/\t/g, "  ")).filter((l) => l.trim());
  if (lines.length > 1000) return { ok: false, message: "Paste at most 1000 lines at a time.", errors: { text: "Paste at most 1000 lines at a time." }, values: { text: d.text } };
  const parsedLines: { depth: number; title: string; plannedTo: Date | null; line: number }[] = [];
  for (const [i, l] of lines.entries()) {
    const m = /^(\s*)(-*)\s*(.*)$/.exec(l)!;
    const depth = Math.min(3, m[2].length || Math.floor(m[1].length / 2));
    const [titlePart, datePart] = m[3].split("|").map((s) => s.trim());
    let plannedTo: Date | null = null;
    if (datePart) {
      const dm = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(datePart);
      if (!dm) return { ok: false, message: `Line ${i + 1}: write the date like 30-11-2026.`, errors: { text: `Line ${i + 1}: write the date like 30-11-2026.` }, values: { text: d.text } };
      plannedTo = new Date(Date.UTC(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1])));
    }
    if (!titlePart) continue;
    if (titlePart.length > 200) return { ok: false, message: `Line ${i + 1} is longer than 200 characters.`, errors: { text: `Line ${i + 1} is longer than 200 characters.` }, values: { text: d.text } };
    parsedLines.push({ depth, title: titlePart, plannedTo, line: i + 1 });
  }
  return act("create", async ({ tx, current }) => {
    const parents: (string | null)[] = [null, null, null, null];
    let n = 0;
    for (const p of parsedLines) {
      let depth = p.depth;
      while (depth > 0 && !parents[depth - 1]) depth--;
      const row = await addItem(tx, current.ctx, { yearId: d.yearId, classId: d.classId, subjectId: d.subjectId, parentId: depth > 0 ? parents[depth - 1] : null, kind: KIND_ORDER[depth], title: p.title, plannedFrom: null, plannedTo: p.plannedTo });
      parents[depth] = row.id;
      for (let k = depth + 1; k < 4; k++) parents[k] = null;
      n++;
    }
    return { flash: { message: `Added ${plural(n, "item")} to the syllabus.` } };
  }, { formData: fd, yearId: d.yearId, revalidate: [PATH] });
}

// ------------------------------------------------------------ the daily log

const logSchema = z.object({
  yearId: uuid("Choose the year."), sectionId: uuid("Choose a class and section."),
  itemIds: z.array(z.string().uuid()).min(1, "Tick at least one topic."),
  date: day("date"), status: z.enum(["taught", "completed"]),
});

export async function logProgressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = logSchema.safeParse({ yearId: fd.get("yearId"), sectionId: fd.get("sectionId"), itemIds: fd.getAll("itemIds"), date: fd.get("date"), status: fd.get("status") ?? "taught" });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first.message, errors: { [String(first.path[0] ?? "itemIds")]: first.message } };
  }
  const d = parsed.data;
  return act("edit", async ({ tx, current, scope }) => {
    ownSection(scope, d.sectionId);
    if (d.date > todayIn(current.school.timeZone)) throw new AcademicRuleError("Topics can be ticked for today or earlier, not for a future date.", "date");
    const n = await logProgress(tx, current.ctx, { ...d, staffId: scope.staffId });
    return { flash: { message: d.status === "completed" ? "Marked completed. Progress updated." : `${plural(d.itemIds.length, "topic")} ticked for ${formatDate(d.date)}.${n < d.itemIds.length ? " Some were already ticked." : ""} Progress updated.` } };
  }, { formData: fd, yearId: d.yearId, needs: "any", revalidate: [PATH] });
}

export async function untickAction(input: { sectionId: string; itemId: string; date: string }): Promise<string | undefined> {
  const ok = z.object({ sectionId: z.string().uuid(), itemId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(input);
  if (!ok.success) return "That tick was not found.";
  return actSimple("edit", async ({ tx, current, scope }) => {
    ownSection(scope, input.sectionId);
    const n = await untick(tx, current.ctx, input.sectionId, input.itemId, new Date(`${input.date}T00:00:00Z`));
    if (!n) throw new AcademicRuleError("That tick was already taken back.");
    return { flash: { message: "Tick taken back. Progress updated." } };
  }, { yearOf: async (tx) => (await tx.section.findFirst({ where: { id: input.sectionId } }))?.academicYearId ?? null, needs: "any", revalidate: [PATH] });
}

// ------------------------------------------------------------ lesson plans

/** Defaults for a new lesson plan: the topics, the next pending topic, the next period of the subject. */
export async function planDefaultsAction(sectionId: string, subjectId: string): Promise<{ topics: { id: string; label: string }[]; topicId: string; date: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sectionId) || !/^[0-9a-f-]{36}$/i.test(subjectId)) return null;
  const { current } = await requireAction("academic-management", "view");
  return withSchool(current.ctx, async (tx) => {
    const section = await tx.section.findFirst({ where: { id: sectionId, archivedAt: null } });
    if (!section) return null;
    const scope = await academicScope(tx, current, section.academicYearId);
    if (scope.sectionIds && !scope.sectionIds.includes(section.id)) return null;
    const today = todayIn(current.school.timeZone);
    const tree = await syllabusTree(tx, section.academicYearId, section.classId, subjectId, section.id, today);
    const topics = flatten(tree).map((n) => ({ id: n.id, label: `${"— ".repeat(n.depth)}${n.title}${n.status === "Completed" ? " (completed)" : n.status === "Taught" ? " (taught)" : ""}` }));
    const next = await nextPendingTopic(tx, section.academicYearId, section.id, section.classId, subjectId, today);
    const campusId = await mainCampusId(tx, current.ctx);
    const date = await nextPeriodDate(tx, current.ctx, section.id, subjectId, today, campusId);
    return { topics, topicId: next?.id ?? "", date: isoDay(date) };
  });
}

const planSchema = z.object({
  id: z.string().trim().optional().transform((v) => v || undefined),
  yearId: uuid("Choose the year."),
  pair: z.string().trim().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i, "Choose the class, section and subject."),
  topicId: uuid("Choose a topic."),
  date: day("date"),
  objectives: longText("Objectives"), resources: longText("Resources"), activities: longText("Activities and homework"),
});

export async function saveLessonPlanAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(planSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const [sectionId, subjectId] = d.pair.split(":");
  return act(d.id ? "edit" : "create", async ({ tx, current, scope }) => {
    ownSection(scope, sectionId);
    if (d.id) {
      const plan = await tx.lessonPlan.findFirst({ where: { id: d.id, archivedAt: null } });
      if (!plan) throw new AcademicRuleError("This lesson plan was not found.");
      if (!scope.manage && plan.staffId !== scope.staffId) throw new AcademicRuleError("Only the teacher who wrote this plan can change it.");
    }
    if (!scope.staffId && !d.id) throw new AcademicRuleError("Your login is not linked to a staff record, so a plan cannot be saved in your name.");
    const r = await saveLessonPlan(tx, current.ctx, { yearId: d.yearId, sectionId, subjectId, topicId: d.topicId, staffId: scope.staffId ?? "", date: d.date, objectives: d.objectives, resources: d.resources, activities: d.activities }, d.id);
    return { flash: { message: r.message } };
  }, { formData: fd, yearId: d.yearId, needs: "any", revalidate: [PATH] });
}

export async function archiveLessonPlanAction(id: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current, scope }) => {
    const plan = await tx.lessonPlan.findFirst({ where: { id, archivedAt: null } });
    if (plan && !scope.manage && plan.staffId !== scope.staffId) throw new AcademicRuleError("Only the teacher who wrote this plan can remove it.");
    await archiveLessonPlan(tx, current.ctx, id);
    return { flash: { message: "Lesson plan archived." } };
  }, { yearOf: async (tx) => (await tx.lessonPlan.findFirst({ where: { id } }))?.academicYearId ?? null, needs: "any", revalidate: [PATH] });
}

/** Items of another class or year to copy from, for the Copy dialog. */
export async function copySourcesAction(yearIds: string[], subjectId: string): Promise<{ value: string; label: string }[]> {
  if (!/^[0-9a-f-]{36}$/i.test(subjectId) || !Array.isArray(yearIds) || yearIds.some((y) => !/^[0-9a-f-]{36}$/i.test(y))) return [];
  const { current } = await requireAction("academic-management", "view");
  return withSchool(current.ctx, async (tx) => {
    const rows = await tx.syllabusItem.groupBy({ by: ["academicYearId", "classId", "subjectId"], where: { academicYearId: { in: yearIds }, archivedAt: null, parentId: null }, _count: { _all: true } });
    const [classes, years, subjects] = await Promise.all([
      tx.schoolClass.findMany({ where: { id: { in: rows.map((r) => r.classId) } }, select: { id: true, name: true } }),
      tx.academicYear.findMany({ where: { id: { in: yearIds } }, select: { id: true, name: true } }),
      tx.subject.findMany({ where: { id: { in: rows.map((r) => r.subjectId) } }, select: { id: true, name: true } }),
    ]);
    return rows
      .map((r) => ({ value: `${r.academicYearId}:${r.classId}:${r.subjectId}`, label: `${classes.find((c) => c.id === r.classId)?.name ?? ""}, ${subjects.find((s) => s.id === r.subjectId)?.name ?? ""} (${years.find((y) => y.id === r.academicYearId)?.name ?? ""})`, same: r.subjectId === subjectId }))
      .sort((a, b) => Number(b.same) - Number(a.same) || a.label.localeCompare(b.label))
      .map(({ value, label }) => ({ value, label }));
  });
}

