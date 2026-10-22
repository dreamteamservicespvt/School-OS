import { notFound, redirect } from "next/navigation";
import { Check, CirclePlay, ListChecks, X } from "lucide-react";
import { withSchool } from "@/lib/db";
import { studentQuizState } from "@/lib/homework/quizzes";
import { HomeworkProblem } from "@/lib/homework/access";
import { momentWords, plural } from "@/lib/homework/words";
import { Card, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { ActionButton } from "@/components/students/confirm-action";
import { BackLink, Ring } from "../../_components/bits";
import { BASE, homeworkGuard, UUID } from "../../_lib/page";
import { startQuizAction } from "../actions";
import { TakeQuiz } from "../sheets";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Quiz") };
}

/** A student's quiz (mod-homework.jsx TakeQuiz): start it, answer one question at a time, then the score and the answers. */
export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await homeworkGuard("quizzes");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  if (!p.student) redirect(`${BASE}/quizzes?open=${id}`);
  const st = await withSchool(p.current.ctx, async (tx) => {
    try {
      const x = await studentQuizState(tx, p.scope, id, p.now);
      const [subject, teacher] = await Promise.all([
        tx.subject.findUnique({ where: { id: x.quiz.subjectId }, select: { name: true } }),
        x.quiz.teacherId ? tx.staff.findUnique({ where: { id: x.quiz.teacherId }, select: { fullName: true } }) : null,
      ]);
      return { ...x, subject: subject?.name ?? "", teacher: teacher?.fullName ?? "" };
    } catch (e) {
      if (e instanceof HomeworkProblem) return null;
      throw e;
    }
  });
  if (!st) notFound();
  const z = st.quiz;
  const back = <BackLink href={`${BASE}/quizzes`} label="Quizzes" sub={z.title} />;
  const left = z.attemptsAllowed - st.done.length;

  if (st.running) {
    const endsAt = z.timeLimitMin ? st.running.startedAt.getTime() + z.timeLimitMin * 60_000 : null;
    return (
      <div className="max-w-2xl mx-auto">
        {back}
        <TakeQuiz attemptId={st.running.id} endsAt={endsAt} attemptsLeft={left}
          questions={z.questions.map((q) => ({ id: q.id, kind: q.kind, text: q.text, options: q.options }))} />
      </div>
    );
  }

  const last = st.done[st.done.length - 1];
  if (!last) {
    return (
      <div className="max-w-2xl mx-auto">
        {back}
        <Card className="p-6 flex flex-col items-center text-center gap-2">
          <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand grid place-items-center" aria-hidden="true"><ListChecks size={26} /></span>
          <h1 className="font-display text-[24px] font-semibold">{z.title}</h1>
          <p className="text-[14px] text-ink3">{st.subject}{st.teacher ? ` · ${st.teacher}` : ""} · {plural(z.questions.length, "question")} · {z.timeLimitMin ? `${z.timeLimitMin} min` : "no time limit"} · {plural(z.attemptsAllowed, "attempt")}</p>
          {z.closesAt && <p className="text-[13.5px] text-ink2"><Words k="Closes" /> {momentWords(z.closesAt, p.tz)}</p>}
          <div className="mt-3">{st.canStart
            ? <ActionButton action={startQuizAction} fields={{ id: z.id }} variant="primary" size="md"><CirclePlay size={16} aria-hidden="true" /><Words k="Start quiz" /></ActionButton>
            : <p className="text-[14px] text-ink3">{st.word === "Scheduled" ? "This quiz has not opened yet." : "This quiz is closed."}</p>}</div>
          {z.timeLimitMin && st.canStart && <p className="text-[12.5px] text-ink3"><Words k="The timer starts when you press Start. Answers are handed in when time runs out." /></p>}
        </Card>
      </div>
    );
  }

  const answers = last.answers as Record<string, unknown>;
  const manual = last.manualMarks as Record<string, number>;
  const ratio = last.maxScore ? (last.score ?? 0) / last.maxScore : 0;
  const showAnswers = z.showAnswers;
  return (
    <div className="max-w-2xl mx-auto">
      {back}
      <Card className="p-6 flex flex-col items-center text-center">
        <Ring value={ratio * 100} size={110} stroke={10} tone={ratio >= 0.7 ? "ok" : "warn"}><span className="font-display text-[28px] font-semibold tnum">{last.score ?? 0}<span className="text-[15px] text-ink3">/{last.maxScore}</span></span></Ring>
        <h1 className="font-display text-[24px] font-semibold mt-4">{ratio >= 0.8 ? "Very well done!" : ratio >= 0.5 ? "Good try!" : "Keep practising"}</h1>
        <p className="text-[14px] text-ink3 mt-1">{z.title} · {st.subject}{st.teacher ? ` · ${st.teacher} can see your score` : ""}</p>
        {last.needsMarking && <p className="text-[13.5px] text-warn mt-1"><Words k="Your teacher still marks the written answers, so the score can go up." /></p>}
        {st.canStart && <div className="mt-4"><ActionButton action={startQuizAction} fields={{ id: z.id }} variant="secondary" size="md"><CirclePlay size={16} aria-hidden="true" /><Words k="Try again ·" /> {plural(left, "attempt")} <Words k="left" /></ActionButton></div>}
      </Card>
      <Card className="mt-5">
        <CardHeader title="Your answers" description={showAnswers ? "Correct answers are shown because your teacher allowed it" : "Your teacher shows the right answers in class"} icon={ListChecks} />
        <ol className="px-5 pb-5 flex flex-col gap-3">
          {z.questions.map((q, k) => {
            const a = answers[q.id];
            const ok = q.kind === "SHORT" ? typeof manual[q.id] === "number" && manual[q.id] >= q.marks / 2 : a === q.correctIndex;
            const pending = q.kind === "SHORT" && typeof manual[q.id] !== "number" && typeof a === "string";
            const yours = q.kind === "SHORT" ? (typeof a === "string" ? a : null) : typeof a === "number" ? q.options[a] : null;
            return (
              <li key={q.id} className="flex gap-3">
                <span className={cx("w-6 h-6 rounded-full grid place-items-center shrink-0 mt-0.5", pending ? "bg-sunken text-ink3" : ok ? "bg-ok/15 text-ok" : "bg-bad/10 text-bad")}>
                  {pending ? <span className="text-[11px] font-bold">?</span> : ok ? <Check size={14} strokeWidth={3} aria-label="Right" /> : <X size={14} strokeWidth={3} aria-label="Wrong" />}
                </span>
                <div className="text-[14px]">
                  <p className="font-semibold">{k + 1}. {q.text}</p>
                  <p className="text-ink2">{yours !== null ? `You: ${yours}` : "Not answered"}
                    {showAnswers && !ok && q.kind !== "SHORT" && q.correctIndex !== null && <span className="text-ok"> <Words k="· Answer:" /> {q.options[q.correctIndex]}</span>}
                    {q.kind === "SHORT" && typeof manual[q.id] === "number" && <span className="text-ink3"> · {manual[q.id]} <Words k="of" /> {q.marks}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
