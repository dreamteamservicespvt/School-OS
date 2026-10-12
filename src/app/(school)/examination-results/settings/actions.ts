"use server";

// Exam Settings (08 §6). Only people with full reach (manage) change these;
// every change is audited by the library functions.
import type { Band } from "@/lib/exams/grades";
import { ExamRuleError } from "@/lib/exams/common";
import {
  addListItem, archiveArea, archiveGradeScale, archiveListItem, importPreset, saveArea, saveGradeScale, saveRules, saveWeights, setExamFeature, type RulesInput,
} from "@/lib/exams/settings";
import { actSimple, str } from "../_lib/server";
import { EXAM_FEATURES } from "./features";

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
    return { flash: { message: `${row.name} saved${row.version > 1 ? ` as version ${row.version}` : ""}. Published results keep the scale they were made with.` } };
  });
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
    return { flash: { message: "Final result weights saved. Final results are worked out again when marks change." } };
  });
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
    };
    await saveRules(tx, current.ctx, input);
    return { flash: { message: "Exam rules saved. They apply to results worked out from now on." } };
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
    return { flash: { message: on ? "Switched on." : "Switched off." } };
  });
}
