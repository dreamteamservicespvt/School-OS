// Question Papers (08 §2, optional): a question bank by class, subject,
// chapter (from the syllabus tree), type and difficulty, and papers made from
// it manually, automatically (total marks and a difficulty mix) or from a
// blueprint (chapter-wise marks and question types). Printed with or without
// answers. Teachers work only on the subjects they teach.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { esc } from "../pdf";
import { ExamRuleError } from "./common";
import { classInScope, examInScope, type ExamScope } from "./scope";

export const QUESTION_TYPES = [
  { value: "mcq", label: "MCQ" },
  { value: "short", label: "Short answer" },
  { value: "long", label: "Long answer" },
  { value: "true-false", label: "True or false" },
  { value: "fill-blank", label: "Fill in the blanks" },
  { value: "match", label: "Match the following" },
] as const;
export const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;
export const typeLabel = (t: string) => QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;
export const difficultyLabel = (d: string) => DIFFICULTIES.find((x) => x.value === d)?.label ?? d;

/** May this person add questions and papers for this class and subject? Full reach: any class (of their campus, when limited to one). */
export async function writesBank(tx: Tx, scope: ExamScope, yearId: string, classId: string, subjectId: string) {
  if (scope.manage) return classInScope(tx, scope, classId);
  if (!scope.teaches || scope.teaches.length === 0) return false;
  const sections = await tx.section.findMany({ where: { academicYearId: yearId, classId, archivedAt: null }, select: { id: true } });
  return scope.teaches.some((t) => t.subjectId === subjectId && sections.some((s) => s.id === t.sectionId));
}

/** The class and subject pairs a teacher may use, or null for every pair. */
export async function bankPairs(tx: Tx, scope: ExamScope, yearId: string) {
  if (scope.manage) return null;
  const sections = await tx.section.findMany({ where: { id: { in: (scope.teaches ?? []).map((t) => t.sectionId) } }, select: { id: true, classId: true } });
  const pairs = new Map<string, { classId: string; subjectId: string }>();
  for (const t of scope.teaches ?? []) {
    const c = sections.find((s) => s.id === t.sectionId)?.classId;
    if (c) pairs.set(`${c}|${t.subjectId}`, { classId: c, subjectId: t.subjectId });
  }
  void yearId;
  return [...pairs.values()];
}

/** Chapters of the syllabus tree for a class and subject. */
export async function chaptersFor(tx: Tx, yearId: string, classId: string, subjectId: string) {
  return tx.syllabusItem.findMany({ where: { academicYearId: yearId, classId, subjectId, kind: "CHAPTER", archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true } });
}

export type QuestionInput = {
  id?: string | null; classId: string; subjectId: string; chapterId: string | null; type: string; text: string;
  options: string[]; answer: string | null; marks: number; difficulty: string; tags: string[];
};

export function checkQuestion(q: QuestionInput): { field: string; message: string } | null {
  if (!q.classId) return { field: "classId", message: "Choose the class." };
  if (!q.subjectId) return { field: "subjectId", message: "Choose the subject." };
  if (!q.chapterId) return { field: "chapterId", message: "Choose the chapter. Chapters come from the syllabus in Academic Management." };
  if (!QUESTION_TYPES.some((t) => t.value === q.type)) return { field: "type", message: "Choose the question type." };
  if (q.text.trim().length < 3) return { field: "text", message: "Type the question." };
  if (q.text.length > 4000) return { field: "text", message: "The question is too long. Keep it under 4,000 characters." };
  if (!Number.isInteger(q.marks) || q.marks < 1 || q.marks > 100) return { field: "marks", message: "Marks must be a whole number from 1 to 100." };
  if (!DIFFICULTIES.some((d) => d.value === q.difficulty)) return { field: "difficulty", message: "Choose the difficulty." };
  const opts = q.options.map((o) => o.trim()).filter(Boolean);
  if (q.type === "mcq") {
    if (opts.length < 2) return { field: "options", message: "An MCQ needs at least two options, one per line." };
    if (!q.answer?.trim()) return { field: "answer", message: "Type the correct option." };
    if (!opts.some((o) => o.toLowerCase() === q.answer!.trim().toLowerCase())) return { field: "answer", message: "The correct answer must be one of the options, typed the same way." };
  }
  if (q.type === "true-false" && !["true", "false"].includes((q.answer ?? "").trim().toLowerCase())) return { field: "answer", message: "Choose True or False as the answer." };
  if (q.type === "match") {
    if (opts.length < 2) return { field: "options", message: "Add at least two pairs, one per line, such as Tiger = Carnivore." };
    if (opts.some((o) => !o.includes("="))) return { field: "options", message: "Write each pair with an equals sign, such as Tiger = Carnivore." };
  }
  return null;
}

const normal = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Adds or changes a question. A question with the same words in the same subject is refused (duplicate check). */
export async function saveQuestion(tx: Tx, ctx: SchoolContext, scope: ExamScope, yearId: string, q: QuestionInput) {
  const problem = checkQuestion(q);
  if (problem) throw new ExamRuleError(problem.message, problem.field);
  if (!(await writesBank(tx, scope, yearId, q.classId, q.subjectId))) throw new ExamRuleError("You can add questions only for the subjects you teach.");
  const same = await tx.question.findMany({ where: { classId: q.classId, subjectId: q.subjectId, archivedAt: null, ...(q.id ? { id: { not: q.id } } : {}) }, select: { id: true, text: true } });
  if (same.some((x) => normal(x.text) === normal(q.text))) throw new ExamRuleError("This question is already in the bank for this subject.", "text");
  const data = {
    classId: q.classId, subjectId: q.subjectId, chapterId: q.chapterId, type: q.type, text: q.text.trim(),
    options: q.type === "mcq" || q.type === "match" ? q.options.map((o) => o.trim()).filter(Boolean) : [],
    answer: q.answer?.trim() || null, marks: q.marks, difficulty: q.difficulty, tags: [...new Set(q.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 10),
  };
  if (q.id) {
    const before = await tx.question.findFirst({ where: { id: q.id, archivedAt: null } });
    if (!before || !(await classInScope(tx, scope, before.classId))) throw new ExamRuleError("This question was not found.");
    if (!(await writesBank(tx, scope, yearId, before.classId, before.subjectId))) throw new ExamRuleError("You can change questions only for the subjects you teach.");
    const row = await tx.question.update({ where: { id: q.id }, data });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Question", recordId: row.id, before, after: row });
    return row;
  }
  const row = await tx.question.create({ data: { schoolId: ctx.schoolId, createdById: ctx.userId, ...data } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Question", recordId: row.id, after: row });
  return row;
}

export async function archiveQuestion(tx: Tx, ctx: SchoolContext, scope: ExamScope, yearId: string, id: string) {
  const q = await tx.question.findFirst({ where: { id, archivedAt: null } });
  if (!q || !(await classInScope(tx, scope, q.classId))) throw new ExamRuleError("This question was not found.");
  if (!(await writesBank(tx, scope, yearId, q.classId, q.subjectId))) throw new ExamRuleError("You can archive questions only for the subjects you teach.");
  await tx.question.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Question", recordId: id, before: { text: q.text } });
}

/** `classIds`: only these classes (the classes of the person's campus, when limited to one). */
export type BankFilters = { q?: string; classId?: string; subjectId?: string; chapterId?: string; type?: string; difficulty?: string; classIds?: string[] };

export async function questionBank(tx: Tx, pairs: { classId: string; subjectId: string }[] | null, f: BankFilters, page: { skip: number; take: number }) {
  const and: Prisma.QuestionWhereInput[] = [];
  if (f.q) and.push({ OR: [{ text: { contains: f.q, mode: "insensitive" } }, { tags: { has: f.q } }] });
  if (f.classIds) and.push({ classId: { in: f.classIds } });
  if (pairs) and.push(pairs.length ? { OR: pairs.map((p) => ({ classId: p.classId, subjectId: p.subjectId })) } : { id: { in: [] } });
  const where: Prisma.QuestionWhereInput = {
    archivedAt: null,
    ...(f.classId ? { classId: f.classId } : {}), ...(f.subjectId ? { subjectId: f.subjectId } : {}), ...(f.chapterId ? { chapterId: f.chapterId } : {}),
    ...(f.type ? { type: f.type } : {}), ...(f.difficulty ? { difficulty: f.difficulty } : {}),
    AND: and,
  };
  const [rows, total] = await Promise.all([
    tx.question.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: page.skip, take: page.take }),
    tx.question.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const papers = ids.length ? await tx.questionPaper.findMany({ where: { archivedAt: null, questionIds: { hasSome: ids } }, select: { id: true, title: true, questionIds: true } }) : [];
  const chapters = await tx.syllabusItem.findMany({ where: { id: { in: rows.map((r) => r.chapterId).filter((x): x is string => Boolean(x)) } }, select: { id: true, title: true } });
  return {
    total,
    rows: rows.map((r) => ({ ...r, chapter: chapters.find((c) => c.id === r.chapterId)?.title ?? "", usedIn: papers.filter((p) => p.questionIds.includes(r.id)).map((p) => p.title) })),
  };
}

// ---------- Papers ----------

export type DifficultyMix = { easy: number; medium: number; hard: number };
export type BlueprintRow = { chapterId: string; type: string; count: number; marksEach: number };

/** Picks questions for a total, matching the difficulty mix (percent of marks) as closely as the bank allows. */
export function pickAutomatic(bank: { id: string; marks: number; difficulty: string }[], total: number, mix: DifficultyMix, seed = 1): string[] {
  let state = seed;
  const rand = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  const chosen: string[] = [];
  let sum = 0;
  for (const d of ["hard", "medium", "easy"] as const) {
    const target = Math.round((total * mix[d]) / 100);
    const pool = bank.filter((q) => q.difficulty === d).map((q) => ({ q, r: rand() })).sort((a, b) => a.r - b.r).map((x) => x.q);
    let got = 0;
    for (const q of pool) {
      if (got + q.marks > target || sum + q.marks > total) continue;
      chosen.push(q.id); got += q.marks; sum += q.marks;
      if (got === target) break;
    }
  }
  // Fill any gap with whatever fits.
  if (sum < total) for (const q of bank) {
    if (chosen.includes(q.id) || sum + q.marks > total) continue;
    chosen.push(q.id); sum += q.marks;
    if (sum === total) break;
  }
  return chosen;
}

export async function makePaper(
  tx: Tx, ctx: SchoolContext, scope: ExamScope, yearId: string,
  input: { id?: string | null; title: string; examId: string | null; classId: string; subjectId: string; method: "manual" | "automatic" | "blueprint"; questionIds?: string[]; total?: number; mix?: DifficultyMix; blueprint?: BlueprintRow[]; durationMin: number | null; instructions: string | null },
) {
  if (input.title.trim().length < 2) throw new ExamRuleError("Type a title for the paper.", "title");
  if (!input.classId || !input.subjectId) throw new ExamRuleError("Choose the class and subject.", "classId");
  if (!(await writesBank(tx, scope, yearId, input.classId, input.subjectId))) throw new ExamRuleError("You can make papers only for the subjects you teach.");
  if (input.examId && scope.yearIds && !(await tx.exam.findFirst({ where: { id: input.examId, ...examInScope(scope) }, select: { id: true } }))) throw new ExamRuleError("This exam was not found.", "examId");
  if (input.durationMin !== null && (!Number.isInteger(input.durationMin) || input.durationMin < 15 || input.durationMin > 600)) throw new ExamRuleError("Duration must be from 15 minutes to 10 hours.", "durationMin");
  const bank = await tx.question.findMany({ where: { classId: input.classId, subjectId: input.subjectId, archivedAt: null } });
  let ids: string[] = [];
  if (input.method === "manual") {
    ids = (input.questionIds ?? []).filter((id) => bank.some((q) => q.id === id));
    if (ids.length === 0) throw new ExamRuleError("Pick at least one question.", "questionIds");
  } else if (input.method === "automatic") {
    const total = input.total ?? 0;
    const mix = input.mix ?? { easy: 30, medium: 50, hard: 20 };
    if (!Number.isInteger(total) || total < 1 || total > 1000) throw new ExamRuleError("Total marks must be a whole number from 1 to 1000.", "total");
    if (mix.easy + mix.medium + mix.hard !== 100) throw new ExamRuleError(`The difficulty mix adds up to ${mix.easy + mix.medium + mix.hard}%. It must be 100%.`, "mix");
    const have = bank.reduce((n, q) => n + q.marks, 0);
    if (have < total) throw new ExamRuleError(`The bank has questions worth ${have} marks for this subject. Add questions or lower the total.`, "total");
    ids = pickAutomatic(bank, total, mix, Date.now() % 2147483646 + 1);
    const got = bank.filter((q) => ids.includes(q.id)).reduce((n, q) => n + q.marks, 0);
    if (got !== total) throw new ExamRuleError(`The bank's questions cannot make exactly ${total} marks (closest is ${got}). Try ${got} or add questions.`, "total");
  } else {
    const rows = (input.blueprint ?? []).filter((r) => r.count > 0);
    if (rows.length === 0) throw new ExamRuleError("Add at least one blueprint row: chapter, type, how many and marks each.", "blueprint");
    for (const r of rows) {
      const pool = bank.filter((q) => q.chapterId === r.chapterId && q.type === r.type && q.marks === r.marksEach && !ids.includes(q.id));
      if (pool.length < r.count) {
        const ch = await tx.syllabusItem.findFirst({ where: { id: r.chapterId }, select: { title: true } });
        throw new ExamRuleError(`${ch?.title ?? "A chapter"} has ${pool.length} ${typeLabel(r.type).toLowerCase()} questions of ${r.marksEach} marks, but the blueprint needs ${r.count}.`, "blueprint");
      }
      ids.push(...pool.slice(0, r.count).map((q) => q.id));
    }
  }
  const totalMarks = bank.filter((q) => ids.includes(q.id)).reduce((n, q) => n + q.marks, 0);
  const data = { title: input.title.trim(), examId: input.examId, classId: input.classId, subjectId: input.subjectId, method: input.method, questionIds: ids, totalMarks, durationMin: input.durationMin, instructions: input.instructions?.trim() || null };
  if (input.id) {
    const before = await tx.questionPaper.findFirst({ where: { id: input.id, archivedAt: null } });
    if (!before || !(await classInScope(tx, scope, before.classId))) throw new ExamRuleError("This paper was not found.");
    if (before.status === "final") throw new ExamRuleError("This paper is final. Make a copy to change it.");
    const row = await tx.questionPaper.update({ where: { id: input.id }, data });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Question Paper", recordId: row.id, before, after: row });
    return row;
  }
  const row = await tx.questionPaper.create({ data: { schoolId: ctx.schoolId, createdById: ctx.userId, ...data } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Question Paper", recordId: row.id, after: row });
  return row;
}

export async function setPaperStatus(tx: Tx, ctx: SchoolContext, scope: ExamScope, yearId: string, id: string, to: "draft" | "final" | "archived") {
  const p = await tx.questionPaper.findFirst({ where: { id, archivedAt: null } });
  if (!p || !(await classInScope(tx, scope, p.classId))) throw new ExamRuleError("This paper was not found.");
  if (!(await writesBank(tx, scope, yearId, p.classId, p.subjectId))) throw new ExamRuleError("You can change papers only for the subjects you teach.");
  const data = to === "archived" ? { archivedAt: new Date() } : { status: to };
  await tx.questionPaper.update({ where: { id }, data });
  await writeAudit(tx, ctx, { action: to === "archived" ? "archived" : `marked-${to}`, recordType: "Question Paper", recordId: id, before: { status: p.status }, after: data });
}

export async function paperView(tx: Tx, id: string) {
  const paper = await tx.questionPaper.findFirst({ where: { id, archivedAt: null } });
  if (!paper) return null;
  const qs = await tx.question.findMany({ where: { id: { in: paper.questionIds } } });
  const [klass, subject, exam] = await Promise.all([
    tx.schoolClass.findFirst({ where: { id: paper.classId }, select: { name: true } }),
    tx.subject.findFirst({ where: { id: paper.subjectId }, select: { name: true } }),
    paper.examId ? tx.exam.findFirst({ where: { id: paper.examId }, select: { title: true } }) : null,
  ]);
  const questions = paper.questionIds.map((qid) => qs.find((q) => q.id === qid)).filter((q): q is NonNullable<typeof q> => Boolean(q));
  return { paper, questions, className: klass?.name ?? "", subjectName: subject?.name ?? "", examTitle: exam?.title ?? null };
}

/** A printable paper, grouped by question type, with or without the answer key. */
export function paperHtml(schoolName: string, view: NonNullable<Awaited<ReturnType<typeof paperView>>>, withAnswers: boolean) {
  const { paper, questions } = view;
  let n = 0;
  const sections = QUESTION_TYPES.map((t) => ({ t, qs: questions.filter((q) => q.type === t.value) })).filter((s) => s.qs.length);
  const body = sections.map((s, i) => `<h3>Section ${String.fromCharCode(65 + i)}: ${esc(s.t.label)}</h3><ol start="${n + 1}">${s.qs.map((q) => {
    n++;
    const opts = q.type === "mcq" ? `<ol type="a" class="opts">${q.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ol>`
      : q.type === "match" ? `<table class="match"><tbody>${q.options.map((o, k) => { const [a, b] = o.split("="); return `<tr><td>${k + 1}. ${esc(a.trim())}</td><td>${String.fromCharCode(97 + k)}. ${esc((q.options[(k + 1) % q.options.length].split("=")[1] ?? b ?? "").trim())}</td></tr>`; }).join("")}</tbody></table>`
      : q.type === "true-false" ? `<p class="opts">True / False</p>` : "";
    const ans = withAnswers && (q.answer || q.type === "match") ? `<p class="ans">Answer: ${esc(q.type === "match" ? q.options.join("; ") : q.answer ?? "")}</p>` : "";
    return `<li><span class="m">[${q.marks}]</span>${esc(q.text).replace(/\n/g, "<br>")}${opts}${ans}</li>`;
  }).join("")}</ol>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,"Noto Sans",sans-serif;font-size:11pt;color:#111}
    h1{font-size:15pt;text-align:center;margin:0}h2{font-size:12.5pt;text-align:center;margin:2mm 0}
    .meta{display:flex;justify-content:space-between;border-top:1px solid #333;border-bottom:1px solid #333;padding:2mm 0;margin:3mm 0}
    h3{font-size:11.5pt;margin:5mm 0 2mm}li{margin:0 0 3mm}.m{float:right;font-weight:bold}.opts{margin:1mm 0}.ans{color:#0a5;margin:1mm 0}
    .match td{padding:0.5mm 6mm 0.5mm 0}.ins{white-space:pre-wrap;font-size:10pt}
  </style></head><body><h1>${esc(schoolName)}</h1><h2>${esc(paper.title)}${withAnswers ? " (answer key)" : ""}</h2>
  <div class="meta"><span>Class: ${esc(view.className)} · ${esc(view.subjectName)}</span><span>${paper.durationMin ? `Time: ${Math.floor(paper.durationMin / 60) ? `${Math.floor(paper.durationMin / 60)} h ` : ""}${paper.durationMin % 60 ? `${paper.durationMin % 60} min` : ""}` : ""}</span><span>Maximum marks: ${paper.totalMarks}</span></div>
  ${paper.instructions ? `<p class="ins">${esc(paper.instructions)}</p>` : ""}${body}</body></html>`;
}
