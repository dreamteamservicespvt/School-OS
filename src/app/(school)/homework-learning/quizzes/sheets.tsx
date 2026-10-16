"use client";

// Quizzes' sheets (mod-homework.jsx CreateQuizSheet, QuizResults and TakeQuiz).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Library, Lock, Plus, Send, Timer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { Dialog } from "@/components/ui/dialog";
import { cx } from "@/components/ui/cx";
import { ActionButton } from "@/components/students/confirm-action";
import { Text } from "../sheets";
import { archiveQuizAction, closeQuizAction, createQuizAction, markShortAction, openQuizAction, submitQuizAction } from "./actions";

export type QKind = "CHOICE" | "TRUE_FALSE" | "SHORT";
export type QDraft = { kind: QKind; text: string; options: string[]; correctIndex: number | null; marks: number };
export type QuizSection = { id: string; label: string; classId: string; subjects: { id: string; name: string }[] };
export type BankQuestion = QDraft & { id: string };

const blank = (): QDraft => ({ kind: "CHOICE", text: "", options: ["", "", "", ""], correctIndex: 0, marks: 1 });

/** One question being written: the text, its choices with the right one ticked, and its marks. */
function QuestionEditor({ q, n, onChange, onRemove }: { q: QDraft; n: number; onChange: (q: QDraft) => void; onRemove: () => void }) {
  const kind = (k: QKind) => onChange(k === "TRUE_FALSE" ? { ...q, kind: k, options: ["True", "False"], correctIndex: 0 } : k === "SHORT" ? { ...q, kind: k, options: [], correctIndex: null } : { ...q, kind: k, options: q.options.length >= 2 && q.kind === "CHOICE" ? q.options : ["", "", "", ""], correctIndex: 0 });
  return (
    <li className="rounded-xl border border-line p-3 flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <span className="text-[14px] font-semibold pt-2.5 tnum">{n}.</span>
        <label htmlFor={`q-${n}`} className="sr-only">Question {n}</label>
        <textarea id={`q-${n}`} rows={1} value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} placeholder="Type the question" className={cx(inputCls(), "py-2 flex-1 resize-y")} />
        <button type="button" onClick={onRemove} aria-label={`Remove question ${n}`} className="w-10 h-10 grid place-items-center rounded-lg text-ink3 hover:bg-sunken shrink-0"><Trash2 size={16} aria-hidden="true" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-5">
        <label className="sr-only" htmlFor={`qk-${n}`}>Question {n} type</label>
        <select id={`qk-${n}`} value={q.kind} onChange={(e) => kind(e.target.value as QKind)} className={cx(inputCls(), "!h-9 !w-auto text-[13px]")}>
          <option value="CHOICE">Multiple choice</option><option value="TRUE_FALSE">True or false</option><option value="SHORT">Short answer</option>
        </select>
        <label className="sr-only" htmlFor={`qm-${n}`}>Question {n} marks</label>
        <select id={`qm-${n}`} value={q.marks} onChange={(e) => onChange({ ...q, marks: Number(e.target.value) })} className={cx(inputCls(), "!h-9 !w-auto text-[13px]")}>
          {[1, 2, 3, 4, 5].map((m) => <option key={m} value={m}>{m} {m === 1 ? "mark" : "marks"}</option>)}
        </select>
        {q.kind === "SHORT" && <span className="text-[12.5px] text-ink3">You mark short answers yourself</span>}
      </div>
      {q.kind !== "SHORT" && (
        <fieldset className="flex flex-col gap-1.5 pl-5">
          <legend className="sr-only">Choices for question {n}; tick the right one</legend>
          {q.options.map((o, j) => (
            <div key={j} className="flex items-center gap-2">
              <input type="radio" name={`right-${n}`} checked={q.correctIndex === j} onChange={() => onChange({ ...q, correctIndex: j })} aria-label={`Choice ${"abcdef"[j]} is right`} className="size-4 accent-[var(--color-ok)]" />
              {q.kind === "TRUE_FALSE" ? <span className={cx("h-9 px-3 rounded-lg text-[13.5px] inline-flex items-center", q.correctIndex === j ? "bg-ok/10 text-ok font-semibold" : "bg-sunken text-ink2")}>{o}</span> : (
                <>
                  <label className="sr-only" htmlFor={`qo-${n}-${j}`}>Choice {"abcdef"[j]}</label>
                  <input id={`qo-${n}-${j}`} value={o} onChange={(e) => onChange({ ...q, options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} placeholder={`Choice ${"abcdef"[j]}`}
                    className={cx(inputCls(), "!h-9 text-[13.5px]", q.correctIndex === j && "!border-ok")} />
                  {q.options.length > 2 && <button type="button" aria-label={`Remove choice ${"abcdef"[j]}`} onClick={() => onChange({ ...q, options: q.options.filter((_, k) => k !== j), correctIndex: q.correctIndex === j ? 0 : (q.correctIndex ?? 0) > j ? (q.correctIndex ?? 0) - 1 : q.correctIndex })} className="w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken shrink-0"><X size={15} aria-hidden="true" /></button>}
                </>
              )}
            </div>
          ))}
          {q.kind === "CHOICE" && q.options.length < 6 && <Button size="sm" variant="ghost" icon={Plus} className="self-start" onClick={() => onChange({ ...q, options: [...q.options, ""] })}>Add a choice</Button>}
        </fieldset>
      )}
    </li>
  );
}

/** Create quiz, or edit a draft: class and subject, questions that mark themselves, when it opens and closes, time limit and attempts. */
export function QuizSheet({ closeHref, sections, bank, start, defaults, edit }: {
  closeHref: string; sections: QuizSection[]; bank: Record<string, BankQuestion[]>;
  start?: { id: string; title: string; questions: QDraft[]; opensAt: string; closesAt: string; timeLimit: string; attempts: string; showAnswers: boolean; label: string; kept: boolean };
  defaults: { opensAt: string; closesAt: string }; edit?: boolean;
}) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const section = sections.find((x) => x.id === sectionId) ?? sections[0];
  const [subjectId, setSubjectId] = useState(section?.subjects[0]?.id ?? "");
  const [qs, setQs] = useState<QDraft[]>(start?.questions ?? [blank()]);
  const [show, setShow] = useState(start?.showAnswers ?? true);
  const [bankOpen, setBankOpen] = useState(false);
  const qT = useTyped("questions", null);
  const opensT = useTyped("opensAt", start?.opensAt ?? defaults.opensAt);
  const closesT = useTyped("closesAt", start?.closesAt ?? defaults.closesAt);
  const limitT = useTyped("timeLimit", start?.timeLimit ?? "10");
  const triesT = useTyped("attempts", start?.attempts ?? "1");
  const label = start?.label ?? section?.label ?? "";
  const pool = section ? bank[`${section.classId}|${subjectId}`] ?? [] : [];
  const kept = !!start?.kept;
  return (
    <SheetForm wide title={edit ? `Edit: ${start?.title}` : "Create quiz"} sub="Multiple choice and true or false questions mark themselves" closeHref={closeHref} action={createQuizAction}
      hidden={{ questions: JSON.stringify(qs), ...(start ? { id: start.id, label } : { sectionId: section?.id ?? "", subjectId }) }}
      submitLabel={<><Send size={16} aria-hidden="true" />Open for {label}</>} pendingText="Saving…"
      extraButtons={<Button type="submit" name="intent" value="draft" variant="secondary">Save draft</Button>}>
      <Text name="title" label="Title" required start={start?.title} placeholder="Simple equations: practice 2" />
      {!start && (
        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Class and section" id="cq-cls" required>
            <select id="cq-cls" value={section?.id} onChange={(e) => { setSectionId(e.target.value); const n = sections.find((x) => x.id === e.target.value); if (n && !n.subjects.some((x) => x.id === subjectId)) setSubjectId(n.subjects[0]?.id ?? ""); }} className={cx(inputCls(), "h-11")}>
              {sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </FieldShell>
          <FieldShell label="Subject" id="cq-sub" required>
            <select id="cq-sub" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={cx(inputCls(), "h-11")}>
              {section?.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </FieldShell>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink2">Questions · {qs.length}</p>
          {!kept && (
            <div className="flex gap-2">
              {pool.length > 0 && <Button size="sm" variant="ghost" icon={Library} onClick={() => setBankOpen((x) => !x)}>From question bank</Button>}
              <Button size="sm" variant="soft" icon={Plus} onClick={() => setQs((x) => [...x, blank()])}>Add</Button>
            </div>
          )}
        </div>
        {kept && <p className="text-[12.5px] text-ink3">Students have taken this quiz, so its questions stay as they are.</p>}
        {bankOpen && (
          <ul className="rounded-xl border border-brand/25 bg-brand/[.03] p-2 max-h-56 overflow-y-auto scroll-thin flex flex-col gap-1">
            {pool.map((b) => {
              const added = qs.some((q) => q.text === b.text);
              return (
                <li key={b.id} className="flex items-center gap-2 px-2 py-1.5 text-[13.5px]">
                  <span className="flex-1 min-w-0">{b.text}<span className="text-ink3 text-[12px]"> · {b.kind === "TRUE_FALSE" ? "True or false" : `${b.options.length} choices`}</span></span>
                  <Button size="sm" variant={added ? "ghost" : "secondary"} disabled={added} onClick={() => setQs((x) => [...x.filter((q) => q.text.trim()), { kind: b.kind, text: b.text, options: b.options, correctIndex: b.correctIndex, marks: b.marks }])}>{added ? "Added" : "Add"}</Button>
                </li>
              );
            })}
          </ul>
        )}
        {kept ? (
          <ol className="flex flex-col gap-2">
            {qs.map((q, i) => (
              <li key={i} className="rounded-xl border border-line p-3">
                <p className="text-[14px] font-semibold">{i + 1}. {q.text}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">{q.options.map((o, j) => <span key={j} className={cx("h-7 px-2.5 rounded-lg text-[12.5px] inline-flex items-center gap-1", j === q.correctIndex ? "bg-ok/10 text-ok font-semibold" : "bg-sunken text-ink2")}>{j === q.correctIndex && <Check size={12} aria-hidden="true" />}{o}</span>)}</div>
              </li>
            ))}
          </ol>
        ) : (
          <ol className="flex flex-col gap-2">
            {qs.map((q, i) => <QuestionEditor key={i} q={q} n={i + 1} onChange={(nq) => setQs((x) => x.map((y, k) => (k === i ? nq : y)))} onRemove={() => setQs((x) => x.filter((_, k) => k !== i))} />)}
          </ol>
        )}
        {qT.error && <p className="text-[12.5px] text-bad" role="alert">{qT.error}</p>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <FieldShell label="Opens" id="cq-open" error={opensT.error} help="Default: now"><input id="cq-open" name="opensAt" type="datetime-local" defaultValue={opensT.value} key={opensT.key} className={cx(inputCls(opensT.error), "h-11 tnum")} /></FieldShell>
        <FieldShell label="Closes" id="cq-close" error={closesT.error} help="Default: 7 days later"><input id="cq-close" name="closesAt" type="datetime-local" defaultValue={closesT.value} key={closesT.key} className={cx(inputCls(closesT.error), "h-11 tnum")} /></FieldShell>
        <FieldShell label="Time limit" id="cq-time" error={limitT.error}>
          <select id="cq-time" name="timeLimit" defaultValue={limitT.value} key={limitT.key} disabled={kept} className={cx(inputCls(limitT.error), "h-11")}>
            <option value="none">None</option>{[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </FieldShell>
        <FieldShell label="Attempts" id="cq-tries" error={triesT.error}>
          <select id="cq-tries" name="attempts" defaultValue={triesT.value} key={triesT.key} disabled={kept} className={cx(inputCls(triesT.error), "h-11")}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </FieldShell>
      </div>
      <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
        <Switch id="cq-show" on={show} onChange={setShow} label="Show answers after" name="showAnswers" />
        <label htmlFor="cq-show" className="text-[13.5px]"><b className="font-semibold block">Show answers after</b><span className="text-ink3 text-[12.5px]">Students see the right answers once they hand in</span></label>
      </div>
    </SheetForm>
  );
}

export function ArchiveQuizSheet({ closeHref, id, title }: { closeHref: string; id: string; title: string }) {
  return (
    <SheetForm title={`Archive “${title}”?`} closeHref={closeHref} action={archiveQuizAction} submitLabel="Archive quiz" pendingText="Archiving…" hidden={{ id }}>
      <p className="text-[14px] text-ink2">It leaves the quiz lists for teachers and students. Scores already taken are kept in the audit log.</p>
    </SheetForm>
  );
}

export function CloseQuizButton({ id }: { id: string }) {
  return <ActionButton action={closeQuizAction} fields={{ id }} variant="secondary" size="md"><Lock size={16} aria-hidden="true" />Close quiz now</ActionButton>;
}
export function OpenQuizButton({ id, label }: { id: string; label: string }) {
  return <ActionButton action={openQuizAction} fields={{ id }} variant="primary" size="md"><Send size={16} aria-hidden="true" />Open for {label}</ActionButton>;
}

/** Marks for one student's short answers. */
export function MarkShortSheet({ closeHref, attemptId, name, items }: { closeHref: string; attemptId: string; name: string; items: { id: string; no: number; text: string; answer: string; marks: number; given: number | null }[] }) {
  return (
    <SheetForm title={`Short answers: ${name}`} sub="The quiz marked the rest itself" closeHref={closeHref} action={markShortAction} hidden={{ attemptId }} submitLabel="Save marks" pendingText="Saving…">
      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-line p-3 flex flex-col gap-2">
          <p className="text-[14px] font-semibold">{it.no}. {it.text}</p>
          <p className="text-[14px] text-ink2 bg-sunken/60 rounded-lg px-3 py-2 whitespace-pre-line">{it.answer || "Not answered"}</p>
          <FieldShell label={`Marks out of ${it.marks}`} id={`m-${it.id}`}>
            <input id={`m-${it.id}`} name={`m_${it.id}`} inputMode="numeric" defaultValue={it.given ?? ""} className={cx(inputCls(), "h-11 w-28 tnum")} />
          </FieldShell>
        </div>
      ))}
    </SheetForm>
  );
}

type TakeQ = { id: string; kind: QKind; text: string; options: string[] };

/** Taking a quiz (mod-homework.jsx TakeQuiz): one question at a time, a timer, and a check before handing in. */
export function TakeQuiz({ attemptId, questions, endsAt, attemptsLeft }: { attemptId: string; questions: TakeQ[]; endsAt: number | null; attemptsLeft: number }) {
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<string, number | string>>({});
  const [sure, setSure] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const total = questions.length;
  const answered = questions.filter((q) => ans[q.id] !== undefined && ans[q.id] !== "").length;
  const submit = () => start(async () => {
    const r = await submitQuizAction(attemptId, ans);
    if (r.problem) setProblem(r.problem); else router.refresh();
  });
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => setLeft(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  useEffect(() => { if (left === 0 && !busy) submit(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = questions[i];
  return (
    <>
      <Card className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="font-semibold text-ink2">Question {i + 1} of {total}</span>
          {left !== null && <span className={cx("inline-flex items-center gap-1.5 tnum", left < 60 ? "text-bad font-semibold" : "text-ink3")} role="timer" aria-live="off"><Timer size={15} aria-hidden="true" />{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left</span>}
        </div>
        <div className="h-2 rounded-full bg-sunken mt-2 overflow-hidden"><div className="h-full bg-brand rounded-full transition-all" style={{ width: `${((i + 1) / total) * 100}%` }} /></div>
        <p className="font-display text-[20px] md:text-[22px] font-semibold leading-snug mt-5" id={`tq-${q.id}`}>{q.text}</p>
        {q.kind === "SHORT" ? (
          <textarea aria-labelledby={`tq-${q.id}`} rows={4} value={String(ans[q.id] ?? "")} onChange={(e) => setAns((x) => ({ ...x, [q.id]: e.target.value }))} placeholder="Type your answer" className={cx(inputCls(), "py-2.5 mt-4")} />
        ) : (
          <div className="flex flex-col gap-2 mt-4" role="radiogroup" aria-labelledby={`tq-${q.id}`}>
            {q.options.map((o, j) => (
              <button key={j} type="button" role="radio" aria-checked={ans[q.id] === j} onClick={() => setAns((x) => ({ ...x, [q.id]: j }))}
                className={cx("flex items-center gap-3 p-3.5 rounded-2xl border text-left text-[15px] transition", ans[q.id] === j ? "border-brand ring-1 ring-brand bg-brand/5 font-semibold" : "border-line hover:border-ink3/40")}>
                <span className={cx("w-6 h-6 rounded-full border-2 grid place-items-center shrink-0 text-[11px] font-bold", ans[q.id] === j ? "border-brand text-brand" : "border-line text-ink3")}>{"abcdef"[j]}</span>{o}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-5">
          <Button variant="secondary" icon={ChevronLeft} disabled={i === 0} onClick={() => setI(i - 1)} className="flex-1">Previous</Button>
          {i < total - 1 ? <Button variant="primary" iconRight={ChevronRight} onClick={() => setI(i + 1)} className="flex-1">Next</Button>
            : <Button variant="primary" icon={Send} onClick={() => setSure(true)} className="flex-1">Submit</Button>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
          {questions.map((x, k) => <button key={x.id} type="button" onClick={() => setI(k)} aria-label={`Go to question ${k + 1}`} aria-current={k === i ? "step" : undefined} className={cx("w-8 h-8 rounded-lg text-[12.5px] font-semibold tnum", k === i ? "bg-ink text-bg" : ans[x.id] !== undefined && ans[x.id] !== "" ? "bg-brand/12 text-brand" : "bg-sunken text-ink3")}>{k + 1}</button>)}
        </div>
        {problem && <p className="text-[13.5px] text-bad mt-3" role="alert">{problem}</p>}
      </Card>
      {sure && (
        <Dialog open title="Submit your answers?" onClose={() => setSure(false)}
          footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSure(false)}>Go back</Button><Button variant="primary" icon={Send} loading={busy} onClick={submit}>Submit {answered} answers</Button></div>}>
          <p className="text-[14px] text-ink2">You answered {answered} of {total} questions.{answered < total ? ` ${total - answered} are blank and count as wrong.` : ""} {attemptsLeft <= 1 ? "This is your last attempt, so you cannot change them after this." : `You have ${attemptsLeft - 1} more ${attemptsLeft - 1 === 1 ? "attempt" : "attempts"} after this.`}</p>
        </Dialog>
      )}
    </>
  );
}
