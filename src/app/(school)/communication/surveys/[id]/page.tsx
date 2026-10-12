import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, MessageSquareText, Pencil, Quote, Star, Users, UserX } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { formatDate } from "@/lib/format";
import { QUESTION_KINDS, questionsWhere, shownStatus, surveyResults } from "@/lib/communication/surveys";
import { Card, CardHeader } from "@/components/ui/card";
import { Stats } from "@/components/ui/stats";
import { HBars } from "@/components/ui/charts";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { BackLink, RecordHead } from "@/components/ui/split";
import { ExportMenu } from "@/components/communication/export-menu";
import { EmptyState } from "@/components/empty-state";
import { requireSurveys } from "../form-data";
import { STATUS_LABEL, STATUS_TONE } from "../status";
import { SurveyButtons } from "./survey-buttons";

export const metadata: Metadata = { title: "Survey" };

const KIND_LABEL: Record<string, string> = Object.fromEntries(QUESTION_KINDS.map((k) => [k.key, k.label]));
const fmt = (n: number) => n.toLocaleString("en-IN");

export default async function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await commOfficePage();
  requireSurveys(access);
  const { current } = access;
  const tz = current.school.timeZone;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const survey = await tx.survey.findFirst({ where: { id, schoolId: current.ctx.schoolId, archivedAt: null } });
    if (!survey) return null;
    if (survey.status === "DRAFT") {
      const questions = await tx.surveyQuestion.findMany({ where: questionsWhere(current.ctx, id), orderBy: { sortOrder: "asc" } });
      return { survey, questions, results: null, answered: 0, comments: 0 };
    }
    const r = await surveyResults(tx, current.ctx, id);
    const answered = await tx.surveyInvite.count({ where: { schoolId: current.ctx.schoolId, surveyId: id, answeredAt: { not: null } } });
    const comments = r.results.reduce((a, q) => a + (q.kind === "text" ? q.answered : 0), 0);
    return { survey, questions: r.questions, results: r.results, answered, comments };
  });
  if (!data) notFound();
  const { survey, results } = data;
  const status = shownStatus(survey, tz);
  const ratings = (results ?? []).filter((q) => q.kind === "rating" && q.answered > 0) as Extract<NonNullable<typeof results>[number], { kind: "rating" }>[];
  const avg = ratings.length ? ratings.reduce((a, q) => a + (q.average ?? 0) * q.answered, 0) / ratings.reduce((a, q) => a + q.answered, 0) : null;
  const waiting = Math.max(0, survey.invitedCount - data.answered);
  const sub = [survey.number, survey.audienceLabel, survey.anonymous ? "anonymous" : null, survey.sentAt ? `sent ${formatDate(survey.sentAt, tz)}` : "not sent yet",
    survey.closesOn ? `${status === "CLOSED" ? "closed" : "closes"} ${formatDate(survey.closedAt ?? survey.closesOn, survey.closedAt ? tz : "UTC")}` : null].filter(Boolean).join(" · ");

  return (
    <>
      <BackLink href="/communication/surveys" label="Surveys" sub={survey.number} />
      <RecordHead
        title={<span className="inline-flex items-center gap-2.5 flex-wrap">{survey.title}<Pill tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Pill></span>}
        sub={<span className="text-[14px] text-ink3">{sub}</span>}
        actions={
          <div className="flex flex-wrap gap-2">
            {survey.status === "DRAFT" && <ButtonLink href={`/communication/surveys/${id}/edit`} variant="secondary" icon={Pencil}>Change</ButtonLink>}
            <SurveyButtons id={id} status={status} waiting={waiting} invited={null} />
            {survey.status !== "DRAFT" && data.answered > 0 && <ExportMenu href={`/communication/surveys/${id}/export`} label="Export answers" />}
          </div>
        }
      />

      {survey.status === "DRAFT" || !results ? (
        <div className="flex flex-col gap-5 lg:gap-6">
          <Banner tone="info" title="This survey is a draft.">Nobody has it yet. Change it as needed, then send it. Each person gets their own link.</Banner>
          <Card>
            <CardHeader title="Questions" icon={ClipboardList} description={`${data.questions.length} ${data.questions.length === 1 ? "question" : "questions"}`} />
            <ol className="px-5 pb-4 divide-y divide-line/70">
              {data.questions.map((q, i) => (
                <li key={q.id} className="py-3 flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-medium">{q.text}{q.required && <span className="text-bad"> *</span>}</p>
                    <p className="text-[12.5px] text-ink3">{KIND_LABEL[q.kind] ?? q.kind}{q.options.length ? ` · ${q.options.join(", ")}` : ""}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:gap-6">
          <Stats items={[
            { label: "Answered", value: `${fmt(data.answered)} of ${fmt(survey.invitedCount)}`, icon: Users, sub: survey.invitedCount ? `${Math.round((data.answered / survey.invitedCount) * 100)}% response` : undefined },
            { label: "Average rating", value: avg != null ? `${avg.toFixed(1)} of 5` : "–", icon: Star, tone: avg == null ? undefined : avg >= 4 ? "ok" : avg >= 3 ? "warn" : "bad" },
            { label: "Not answered yet", value: fmt(waiting), icon: UserX, tone: waiting && status === "OPEN" ? "warn" : undefined, sub: status === "OPEN" && waiting ? "Remind sends their link again" : undefined },
            { label: "Comments", value: fmt(data.comments), icon: MessageSquareText },
          ]} />
          {data.answered === 0 && (
            <Card><EmptyState Icon={ClipboardList} title="No answers yet">{status === "OPEN" ? "Answers show here as people reply. Use Remind for those who have not answered." : "Nobody answered before the survey closed."}</EmptyState></Card>
          )}
          {data.answered > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6">
              {results.filter((q) => q.kind === "rating" || q.kind === "choice").map((q) => (
                <Card key={q.id}>
                  <CardHeader title={`${q.n}. ${q.text}`} description={q.kind === "rating" ? `Rating 1 to 5 · ${fmt(q.answered)} answers${q.average != null ? ` · average ${q.average.toFixed(1)}` : ""}` : `Choice · ${fmt(q.answered)} answers`} />
                  <div className="px-5 pb-5">
                    {q.kind === "rating"
                      ? <HBars rows={[5, 4, 3, 2, 1].map((k) => ({ k: `${k} star${k > 1 ? "s" : ""}`, v: q.counts[k - 1], label: fmt(q.counts[k - 1]) }))} max={Math.max(1, ...q.counts)} unit="" labelWidth={64} ariaLabel={`Answers to question ${q.n}`} />
                      : q.kind === "choice" ? <HBars rows={q.counts.map((c) => ({ k: c.option, v: c.count, label: fmt(c.count) }))} max={Math.max(1, ...q.counts.map((c) => c.count))} unit="" labelWidth={110} ariaLabel={`Answers to question ${q.n}`} /> : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
          {data.answered > 0 && results.filter((q) => q.kind === "text" || q.kind === "date").map((q) => q.kind === "text" || q.kind === "date" ? (
            <Card key={q.id}>
              <CardHeader title={`${q.n}. ${q.text}`} description={`${q.kind === "text" ? "Text" : "Date"} answers, newest first · ${fmt(q.answered)} ${q.answered === 1 ? "answer" : "answers"}`} />
              {q.answers.length ? (
                <ul className="px-5 pb-4 divide-y divide-line/70">
                  {q.answers.slice(0, 12).map((a, i) => (
                    <li key={i} className="py-2.5 text-[14px] flex gap-3">
                      {q.kind === "text" ? <Quote size={15} className="text-ink3 shrink-0 mt-1" aria-hidden="true" /> : <CalendarDays size={15} className="text-ink3 shrink-0 mt-1" aria-hidden="true" />}
                      <span className="min-w-0 break-words">{q.kind === "date" ? formatDate(new Date(`${a.text}T00:00:00Z`), "UTC") : a.text}{a.who && <span className="block text-[12px] text-ink3">{a.who}</span>}</span>
                      <span className="ml-auto text-[12px] text-ink3 shrink-0 tnum">{formatDate(a.at, survey.anonymous ? "UTC" : tz)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-5 pb-5 text-[13.5px] text-ink3">No answers to this question.</p>}
              {q.answered > 12 && <p className="px-5 pb-4 text-[12.5px] text-ink3">and {fmt(q.answered - 12)} more in the export</p>}
            </Card>
          ) : null)}
        </div>
      )}
    </>
  );
}
