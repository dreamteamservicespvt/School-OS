"use server";

import { plural } from "@/lib/academic/common";
import { enqueue } from "@/lib/jobs";
import { writeAudit } from "@/lib/audit";
import { ExamRuleError } from "@/lib/exams/common";
import { draftRemarks, findPeriod, markCards, saveCoScholastic, saveCompetencyLevels, saveRemarks, type RemarkRow } from "@/lib/exams/report-cards";
import { periodPublished } from "@/lib/exams/report-status";
import { sectionInfo } from "@/lib/exams/results";
import { sectionStudents } from "@/lib/exams/roster";
import { writesReportCards } from "@/lib/exams/scope";
import { aiAllowed } from "@/lib/settings/switch-rules";
import { act, actSimple } from "../_lib/server";

const UUID = /^[0-9a-f-]{36}$/i;
const PERIOD = /^(year|exam:[0-9a-f-]{36}|term:[0-9a-f-]{36})$/i;

function check(sectionId: string, period: string) {
  if (!UUID.test(sectionId) || !PERIOD.test(period)) throw new ExamRuleError("Choose the class and the report card period first.");
}

export type GridResult = { ok: boolean; message: string };

async function grid(work: Parameters<typeof act>[1]): Promise<GridResult> {
  const r = await act("edit", work, { needs: "any" });
  return { ok: Boolean(r?.ok), message: r?.message ?? "" };
}

/** Saves the remarks grid (class teacher remarks, principal remarks, typed attendance). */
export async function saveRemarksAction(sectionId: string, period: string, rows: RemarkRow[]): Promise<GridResult> {
  return grid(async ({ tx, current, scope }) => {
    check(sectionId, period);
    if (!Array.isArray(rows) || rows.length > 300) throw new ExamRuleError("Reload the page and try again.");
    const n = await saveRemarks(tx, current.ctx, scope, { sectionId, period, rows, principal: scope.principal });
    return { flash: { message: n ? `Saved for ${plural(n, "student")}.` : "Nothing had changed." } };
  });
}

export async function saveCoScholasticAction(sectionId: string, period: string, rows: { studentId: string; areaId: string; grade: string | null }[]): Promise<GridResult> {
  return grid(async ({ tx, current, scope }) => {
    check(sectionId, period);
    if (!Array.isArray(rows) || rows.length > 5000) throw new ExamRuleError("Reload the page and try again.");
    const n = await saveCoScholastic(tx, current.ctx, scope, { sectionId, period, rows });
    return { flash: { message: n ? `${plural(n, "grade")} saved.` : "Nothing had changed." } };
  });
}

export async function saveCompetencyAction(sectionId: string, period: string, rows: { studentId: string; competencyId: string; level: string | null }[]): Promise<GridResult> {
  return grid(async ({ tx, current, scope }) => {
    check(sectionId, period);
    if (!Array.isArray(rows) || rows.length > 5000) throw new ExamRuleError("Reload the page and try again.");
    const n = await saveCompetencyLevels(tx, current.ctx, scope, { sectionId, period, rows });
    return { flash: { message: n ? `${plural(n, "level")} saved.` : "Nothing had changed." } };
  });
}

/** Suggestions only: nothing is saved until the teacher keeps them and saves. */
export async function draftRemarksAction(sectionId: string, period: string): Promise<{ ok: boolean; message: string; drafts: { studentId: string; text: string | null; why: string }[] }> {
  let drafts: { studentId: string; text: string | null; why: string }[] = [];
  const r = await act("view", async ({ tx, current, scope }) => {
    check(sectionId, period);
    if (!writesReportCards(scope, sectionId)) throw new ExamRuleError("Only the class teacher of this section, the Exam In-charge or the Principal can draft remarks.");
    if (!aiAllowed(current, "ai-teacher-assistant")) throw new ExamRuleError(current.features.has("ai-teacher-assistant") && current.features.has("ai-assistant") ? "Remark suggestions are not used by your role in this school." : "Remark suggestions are switched off for this school.");
    drafts = await draftRemarks(tx, current.ctx, sectionId, period);
  }, { needs: "any" });
  return { ok: Boolean(r?.ok), message: r?.message ?? "", drafts };
}

export async function markCardsAction(sectionId: string, period: string, studentIds: string[], as: "PRINTED" | "SENT") {
  return actSimple("edit", async ({ tx, current, scope }) => {
    check(sectionId, period);
    if (as !== "PRINTED" && as !== "SENT") throw new ExamRuleError("Choose printed or sent.");
    const n = await markCards(tx, current.ctx, scope, { sectionId, period, studentIds: studentIds.filter((s) => UUID.test(s)), as });
    if (n === 0) throw new ExamRuleError("None of these report cards is ready yet, so nothing was marked.");
    return { flash: { message: `${plural(n, "report card")} marked as ${as === "PRINTED" ? "printed" : "sent"}.` } };
  }, { needs: "any" });
}

/** Makes the PDF of a whole section in the background; the person is told when it is ready. */
export async function makePdfAction(sectionId: string, period: string) {
  return actSimple("print", async ({ tx, current, scope }) => {
    check(sectionId, period);
    if (!writesReportCards(scope, sectionId)) throw new ExamRuleError("Only the class teacher of this section, the Exam In-charge or the Principal can print these report cards.");
    const section = await sectionInfo(tx, sectionId);
    const option = await findPeriod(tx, section.academicYearId, section.classId, period);
    if (!option) throw new ExamRuleError("This report card period was not found.");
    const roster = await sectionStudents(tx, [sectionId], section.academicYearId);
    const ready: string[] = [];
    for (const s of roster) if (await periodPublished(tx, s.studentId, option)) ready.push(s.studentId);
    if (ready.length === 0) throw new ExamRuleError("No report card here is ready: the results are not published yet.");
    const job = await enqueue(tx, current.ctx, "exams:report-cards-pdf", `report-cards:${sectionId}:${option.key}:${current.user.id}:${Date.now()}`, { sectionId, period: option.key, studentIds: ready });
    await writeAudit(tx, current.ctx, { action: "report-cards-pdf-asked", recordType: "Report Card", recordId: `${sectionId}:${option.key}`, after: { section: section.label, period: option.label, count: ready.length, jobId: job.id } });
    return { flash: { message: `Making ${plural(ready.length, "report card")} of ${section.label}. You will get a notification with the PDF in a few minutes.` } };
  }, { needs: "any" });
}
