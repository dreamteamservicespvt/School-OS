import "server-only";

import { redirect } from "next/navigation";
import { withSchool, type SchoolContext } from "@/lib/db";
import type { CommAccess } from "@/lib/communication/access";
import { COMM_FEATURES } from "@/lib/communication/features";
import { audienceOptions, MAX_OPTIONS, MAX_QUESTIONS, QUESTION_KINDS, questionsWhere, SURVEY_EXAMPLES, surveyOnCampus } from "@/lib/communication/surveys";
import type { SurveyFormData } from "./survey-form";

/** Survey pages exist only when the school has switched Surveys on. */
export function requireSurveys(access: CommAccess) {
  if (!access.current.features.has(COMM_FEATURES.surveys)) redirect("/communication/surveys");
}

/** campusId: a person limited to one campus chooses among their campus's groups, and changes only their campus's drafts. */
export async function surveyFormData(ctx: SchoolContext, tz: string, id: string | null, example: string | null, campusId?: string | null): Promise<SurveyFormData | null> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  return withSchool(ctx, async (tx) => {
    const audiences = await audienceOptions(tx, ctx, campusId);
    // An example's group ("parents", "staff") is the campus's for a person limited to one.
    const shown = (v: string) => (audiences.some((a) => a.value === v) ? v : audiences.find((a) => a.value.startsWith(`${v}@`))?.value ?? audiences[0]?.value ?? v);
    const base = { audiences, kinds: QUESTION_KINDS.map((k) => ({ key: k.key, label: k.label })), maxQuestions: MAX_QUESTIONS, maxOptions: MAX_OPTIONS, minDate: today };
    if (id) {
      const s = await tx.survey.findFirst({ where: { id, schoolId: ctx.schoolId, archivedAt: null, status: "DRAFT" } });
      if (!s || !(await surveyOnCampus(tx, s, campusId))) return null;
      const qs = await tx.surveyQuestion.findMany({ where: questionsWhere(ctx, id), orderBy: { sortOrder: "asc" } });
      return {
        ...base, id, title: s.title, audience: shown(s.audienceValue), anonymous: s.anonymous,
        closesOn: s.closesOn && s.closesOn.toISOString().slice(0, 10) >= today ? s.closesOn.toISOString().slice(0, 10) : "",
        questions: qs.map((q) => ({ kind: q.kind, text: q.text, options: q.options, required: q.required })),
      };
    }
    const ex = SURVEY_EXAMPLES.find((e) => e.key === example);
    return {
      ...base, id: null, title: ex?.title ?? "", audience: shown(ex?.audience ?? "parents"), anonymous: ex?.anonymous ?? true, closesOn: "",
      questions: ex ? ex.questions : [{ kind: "rating", text: "", options: [], required: true }],
    };
  });
}
