"use server";

// Exam Settings (08 §6). Only people with full reach (manage) change these;
// every change is audited by the library functions. A change that alters how
// results are worked out (grade scale, rules, weights, boards) works out the
// draft results again at once; published results never change (rule 15).
import type { ExamPattern } from "@prisma/client";
import type { SchoolContext, Tx } from "@/lib/db";
import type { Band } from "@/lib/exams/grades";
import { ExamRuleError } from "@/lib/exams/common";
import { recomputeDrafts } from "@/lib/exams/results";
import {
  addListItem, archiveArea, archiveCompetency, archiveGradeScale, archiveListItem, examSettings, importPreset, saveArea, saveBoards, saveClassPatterns, saveCompetency, saveGradeScale, saveRemarkPhrases, saveRules, saveWeights, setExamFeature,
  type BoardChoice, type RulesInput,
} from "@/lib/exams/settings";
import { actSimple, str } from "../_lib/server";
import { EXAM_FEATURES } from "./features";

const DRAFTS = " Draft results are worked out again; published results do not change.";
/** Long enough for a school with many exams and sections to work its drafts out again. */
const RECOMPUTE = { timeout: 180_000 };
const redo = (tx: Tx, ctx: SchoolContext) => recomputeDrafts(tx, ctx);

const UUID = /^[0-9a-f-]{36}$/i;
type ListKind = "examType" | "markCategory";
const KINDS: ListKind[] = ["examType", "markCategory"];

const kindOk = (k: string): ListKind => {
  if (!KINDS.includes(k as ListKind)) throw new ExamRuleError("Reload the page and try again.");
  return k as ListKind;
};

export async function addListItemAction(kind: string, name: string) {
  return actSimple("edit", async ({ tx, current }) => {
    const row = await addListItem(tx, current.ctx, kindOk(kind), String(name ?? ""));
    return { flash: { message: `${row.name} added.` } };
  });
}

export async function archiveListItemAction(kind: string, id: string) {
  return actSimple("archive", async ({ tx, current }) => {
    if (!UUID.test(id)) throw new ExamRuleError("Reload the page and try again.");
    await archiveListItem(tx, current.ctx, kindOk(kind), id);
    return { flash: { message: "Archived. It is no longer offered for new exams." } };
  });
}

function cleanBands(raw: unknown): Band[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 20) throw new ExamRuleError("A grade scale needs from 2 to 20 grades.", "bands");
  return raw.map((b) => {
    const x = b as Record<string, unknown>;
    const points = x.points === null || x.points === "" || x.points === undefined ? null : Number(x.points);
    return { grade: String(x.grade ?? "").slice(0, 10), from: Number(x.from), to: Number(x.to), points: points === null || Number.isFinite(points) ? points : null, remark: String(x.remark ?? "").slice(0, 60), passing: Boolean(x.passing) };
  });
}

export async function saveScaleAction(id: string | null, name: string, bands: unknown) {
  return actSimple("edit", async ({ tx, current }) => {
    if (id && !UUID.test(id)) throw new ExamRuleError("Reload the page and try again.");
    const row = await saveGradeScale(tx, current.ctx, { id, name: String(name ?? ""), bands: cleanBands(bands) });
    if (id) await redo(tx, current.ctx);
    return { flash: { message: `${row.name} saved${row.version > 1 ? ` as version ${row.version}` : ""}. Published results keep the scale they were made with.` } };
  }, RECOMPUTE);
}

export async function importPresetAction(key: string) {
  return actSimple("edit", async ({ tx, current }) => {
    const row = await importPreset(tx, current.ctx, String(key));
    return { flash: { message: `${row.name} added. Change it if your school differs.` } };
  });
}

export async function archiveScaleAction(id: string) {
  return actSimple("archive", async ({ tx, current }) => {
    if (!UUID.test(id)) throw new ExamRuleError("Reload the page and try again.");
    await archiveGradeScale(tx, current.ctx, id);
    return { flash: { message: "Grade scale archived." } };
  });
}

export async function saveWeightsAction(weights: { examTypeId: string; weight: number }[]) {
  return actSimple("edit", async ({ tx, current }) => {
    if (!Array.isArray(weights) || weights.length > 50) throw new ExamRuleError("Reload the page and try again.");
    await saveWeights(tx, current.ctx, weights.map((w) => ({ examTypeId: String(w.examTypeId), weight: Number(w.weight) })));
    await redo(tx, current.ctx);
    return { flash: { message: `Final result weights saved.${DRAFTS}` } };
  }, RECOMPUTE);
}

const int = (fd: FormData, k: string, min: number, max: number, words: string) => {
  const v = Number(str(fd, k));
  if (!Number.isInteger(v) || v < min || v > max) throw new ExamRuleError(`${words} must be a whole number from ${min} to ${max}.`, k);
  return v;
};

export async function saveRulesForm(fd: FormData) {
  return actSimple("edit", async ({ tx, current }) => {
    const input: RulesInput = {
      ranksOn: fd.get("ranksOn") === "on",
      tieRule: str(fd, "tieRule") === "dense" ? "dense" : "skip",
      passPercentSubject: int(fd, "passPercentSubject", 0, 100, "Pass marks per subject"),
      passPercentOverall: int(fd, "passPercentOverall", 0, 100, "Pass marks overall"),
      graceMarks: int(fd, "graceMarks", 0, 20, "Grace marks"),
      compartmentSubjects: int(fd, "compartmentSubjects", 0, 5, "Compartment subjects"),
      absentRule: str(fd, "absentRule") === "leave-out" ? "leave-out" : "zero",
      gradeOnlyGrades: str(fd, "gradeOnlyGrades").split(",").map((g) => g.trim()).filter(Boolean).slice(0, 12),
      publishRoles: fd.getAll("publishRoles").map(String).filter(Boolean).slice(0, 20),
      marksDueDays: int(fd, "marksDueDays", 1, 60, "Marks due"),
      reminderDaysBefore: int(fd, "reminderDaysBefore", 0, 7, "Reminder days"),
      gpaOn: fd.get("gpaOn") === "on",
      defaultScaleId: str(fd, "defaultScaleId"),
      lateMarks: str(fd, "lateMarks") === "off" ? "off" : "approval",
      lateJoinRule: str(fd, "lateJoinRule") === "zero" ? "zero" : "leave-out",
    };
    await saveRules(tx, current.ctx, input);
    await redo(tx, current.ctx);
    return { flash: { message: `Exam rules saved.${DRAFTS}` } };
  }, RECOMPUTE);
}

/** Default exam pattern per class: { [classId]: "PERCENTAGE" | "GRADING" | "CGPA" }. */
export async function saveClassPatternsAction(patterns: Record<string, string>) {
  return actSimple("edit", async ({ tx, current }) => {
    const entries = Object.entries(patterns ?? {});
    if (entries.length > 300 || entries.some(([id]) => !UUID.test(id))) throw new ExamRuleError("Reload the page and try again.");
    let chosen: Record<string, ExamPattern> = Object.fromEntries(entries.map(([id, p]) => [id, String(p) as ExamPattern]));
    if (current.campusId) {
      // One campus: only that campus's classes; the other campuses' classes keep their patterns.
      const mine = new Set((await tx.schoolClass.findMany({ where: { campusId: current.campusId }, select: { id: true } })).map((c) => c.id));
      if (Object.keys(chosen).some((id) => !mine.has(id))) throw new ExamRuleError("A class here was archived or changed. Reload the page.");
      const others = Object.entries((await examSettings(tx, current.ctx)).classPatterns).filter(([id]) => !mine.has(id));
      const open = new Set((await tx.schoolClass.findMany({ where: { id: { in: others.map(([id]) => id) }, archivedAt: null }, select: { id: true } })).map((c) => c.id));
      chosen = { ...Object.fromEntries(others.filter(([id]) => open.has(id))), ...chosen };
    }
    await saveClassPatterns(tx, current.ctx, chosen);
    return { flash: { message: "Exam pattern per class saved. New datesheets start with it; exams already made keep theirs." } };
  });
}

/** Grade scale and report card format per board: { [board]: { scaleId, reportBase } }. */
export async function saveBoardsAction(boards: Record<string, { scaleId?: string | null; reportBase?: string | null }>) {
  return actSimple("edit", async ({ tx, current }) => {
    const entries = Object.entries(boards ?? {});
    if (entries.length > 20) throw new ExamRuleError("Reload the page and try again.");
    const clean: Record<string, BoardChoice> = {};
    for (const [board, c] of entries) {
      const scaleId = c?.scaleId ? String(c.scaleId) : null;
      if (scaleId && !UUID.test(scaleId)) throw new ExamRuleError("Reload the page and try again.");
      clean[String(board).slice(0, 60)] = { scaleId, reportBase: c?.reportBase ? String(c.reportBase) : null };
    }
    await saveBoards(tx, current.ctx, clean);
    await redo(tx, current.ctx);
    return { flash: { message: `Board settings saved. Each class uses its board's grade scale and report card format.${DRAFTS}` } };
  }, RECOMPUTE);
}

export async function saveCompetencyForm(fd: FormData) {
  return actSimple("edit", async ({ tx, current }) => {
    const id = str(fd, "id");
    const subjectId = str(fd, "subjectId");
    if ((id && !UUID.test(id)) || (subjectId && !UUID.test(subjectId))) throw new ExamRuleError("Reload the page and try again.");
    const row = await saveCompetency(tx, current.ctx, { id: id || null, subjectId, name: str(fd, "name"), levels: str(fd, "levels").split(",") });
    return { flash: { message: `${row.name} saved.` } };
  });
}

export async function archiveCompetencyAction(id: string) {
  return actSimple("archive", async ({ tx, current }) => {
    if (!UUID.test(id)) throw new ExamRuleError("Reload the page and try again.");
    await archiveCompetency(tx, current.ctx, id);
    return { flash: { message: "Competency archived. Levels already given stay on past report cards." } };
  });
}

export async function saveAreaForm(fd: FormData) {
  return actSimple("edit", async ({ tx, current }) => {
    const id = str(fd, "id");
    if (id && !UUID.test(id)) throw new ExamRuleError("Reload the page and try again.");
    const row = await saveArea(tx, current.ctx, { id: id || null, name: str(fd, "name"), kind: str(fd, "kind") || "area", grades: str(fd, "grades").split(","), description: str(fd, "description") || null });
    return { flash: { message: `${row.name} saved.` } };
  });
}

export async function archiveAreaAction(id: string) {
  return actSimple("archive", async ({ tx, current }) => {
    if (!UUID.test(id)) throw new ExamRuleError("Reload the page and try again.");
    await archiveArea(tx, current.ctx, id);
    return { flash: { message: "Area archived. Grades already given stay on past report cards." } };
  });
}

export async function setFeatureAction(key: string, on: boolean) {
  return actSimple("edit", async ({ tx, current }) => {
    if (!(EXAM_FEATURES as readonly string[]).includes(key)) throw new ExamRuleError("This cannot be switched here.");
    await setExamFeature(tx, current.ctx, key, Boolean(on));
    // Different boards changes which grade scale each class's draft results use.
    if (key === "exam-boards") await redo(tx, current.ctx);
    return { flash: { message: on ? "Switched on." : "Switched off." } };
  }, RECOMPUTE);
}

/** The phrase bank for remark suggestions: { [phraseKey]: sentences }. */
export async function saveRemarkPhrasesAction(phrases: Record<string, string[]>) {
  return actSimple("edit", async ({ tx, current }) => {
    if (!phrases || typeof phrases !== "object" || Array.isArray(phrases)) throw new ExamRuleError("Reload the page and try again.");
    const n = await saveRemarkPhrases(tx, current.ctx, Object.fromEntries(Object.entries(phrases).slice(0, 40).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, 5).map((x) => String(x ?? "").slice(0, 400)) : []])));
    return { flash: { message: n ? "Remark phrases saved." : "Remark phrases are back to the ready-made ones." } };
  });
}
