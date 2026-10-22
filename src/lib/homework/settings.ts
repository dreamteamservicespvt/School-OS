// Homework Settings (17 §6): submission rules, late marking, grading, course
// access, display and the optional pages. One row per school, made with the
// defaults the first time it is read for a change.
import "server-only";

import type { HomeworkSetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { dayStartUtc } from "../periods";
import { OPTIONAL_PAGES, HomeworkProblem, type OptionalFeature } from "./access";
import { readBands, type GradeBand } from "./words";
import { aiAllowed, type AiWho } from "../settings/switch-rules";

export type HomeworkSettings = Omit<HomeworkSetting, "gradeBands"> & { gradeBands: GradeBand[] };

const DEFAULTS = (schoolId: string): HomeworkSettings => ({
  id: "", schoolId, onlineSubmission: true, maxFileMb: 10, resubmit: "per-student", discussionOn: true, graceMinutes: 0, missingOn: true,
  gradingShow: "both", defaultMaxMarks: 100, gradeBands: readBands(null), feedbackVisible: true, listView: "cards", cardShowsSeen: true, cardShowsFiles: false,
  classTeacherReadsCourses: true, studentCourses: "section", updatedById: null, createdAt: new Date(0), updatedAt: new Date(0),
});

export async function homeworkSettings(tx: Tx, ctx: SchoolContext): Promise<HomeworkSettings> {
  const row = await tx.homeworkSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (!row) return DEFAULTS(ctx.schoolId);
  return { ...row, gradeBands: readBands(row.gradeBands) };
}

export type SettingsChange = Partial<Pick<HomeworkSetting,
  "onlineSubmission" | "maxFileMb" | "resubmit" | "discussionOn" | "graceMinutes" | "missingOn" | "gradingShow" | "defaultMaxMarks" | "feedbackVisible" |
  "listView" | "cardShowsSeen" | "cardShowsFiles" | "classTeacherReadsCourses" | "studentCourses">> & { gradeBands?: GradeBand[] };

export async function saveHomeworkSettings(tx: Tx, ctx: SchoolContext, change: SettingsChange, section: string) {
  if (change.maxFileMb !== undefined && (change.maxFileMb < 1 || change.maxFileMb > 10)) throw new HomeworkProblem("Files can be from 1 to 10 MB.", "maxFileMb");
  if (change.graceMinutes !== undefined && (change.graceMinutes < 0 || change.graceMinutes > 24 * 60)) throw new HomeworkProblem("Grace time can be from 0 to 24 hours.", "graceMinutes");
  if (change.defaultMaxMarks !== undefined && (change.defaultMaxMarks < 1 || change.defaultMaxMarks > 100)) throw new HomeworkProblem("Default maximum marks must be from 1 to 100.", "defaultMaxMarks");
  if (change.gradeBands) {
    const b = change.gradeBands;
    if (!b.length || b.some((x) => !x.grade.trim() || x.from < 0 || x.from > 100)) throw new HomeworkProblem("Each grade needs a name and a start from 0 to 100%.", "gradeBands");
    if (!b.some((x) => x.from === 0)) throw new HomeworkProblem("One grade must start at 0%, so every score gets a grade.", "gradeBands");
    if (new Set(b.map((x) => x.from)).size !== b.length) throw new HomeworkProblem("Two grades start at the same percentage.", "gradeBands");
  }
  const before = await homeworkSettings(tx, ctx);
  const data = { ...change, gradeBands: change.gradeBands ? [...change.gradeBands].sort((a, b) => b.from - a.from) : undefined, updatedById: ctx.userId };
  await tx.homeworkSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, ...data }, update: data });
  const pick = (o: object) => Object.fromEntries(Object.keys(change).map((k) => [k, (o as Record<string, unknown>)[k]]));
  await writeAudit(tx, ctx, { action: "changed", recordType: "Homework Settings", recordId: ctx.schoolId, before: JSON.parse(JSON.stringify(pick(before))), after: JSON.parse(JSON.stringify({ section, ...pick({ ...before, ...change }) })) });
}

/** Switches one optional page (Study Material, Quizzes, Discussions, Online Classes) on or off for the school. */
export async function setOptionalPage(tx: Tx, ctx: SchoolContext, feature: OptionalFeature, on: boolean) {
  const def = OPTIONAL_PAGES.find((o) => o.feature === feature);
  if (!def) throw new HomeworkProblem("That page was not found.");
  const was = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: feature } } });
  await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: feature } }, create: { schoolId: ctx.schoolId, featureKey: feature, isOn: on }, update: { isOn: on } });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "School Feature", recordId: feature, before: { on: was?.isOn ?? false }, after: { on, page: def.label } });
  return def;
}

/** The moment a hand-in for this due date counts as late: after 11:59 PM on the due date, plus the grace time. */
export function lateAfter(dueDate: Date, timeZone: string, graceMinutes: number) {
  const next = new Date(dueDate.getTime() + 86_400_000).toISOString().slice(0, 10);
  return new Date(dayStartUtc(next, timeZone).getTime() + graceMinutes * 60_000);
}

/** The School Features Homework & Learning reads: its optional pages and the teacher assistant. */
export async function homeworkFeatures(tx: Tx, ctx: SchoolContext): Promise<Set<string>> {
  const keys = [...OPTIONAL_PAGES.map((o) => o.feature), "ai-assistant", "ai-teacher-assistant"];
  const rows = await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: keys } }, select: { featureKey: true } });
  return new Set(rows.map((r) => r.featureKey));
}

/** The school has AI and the teacher assistant on (Settings, Modules On/Off). Who may use it is checked by teacherAssistantFor. */
export const assistantOn = (features: ReadonlySet<string>) => features.has("ai-assistant") && features.has("ai-teacher-assistant");

/** The teacher assistant drafts for this person only when the school has it on and their role uses the AI assistant. */
export const teacherAssistantFor = (features: ReadonlySet<string>, who: Pick<AiWho, "roles" | "aiRoles">) =>
  assistantOn(features) && aiAllowed({ ...who, features }, "ai-teacher-assistant");
