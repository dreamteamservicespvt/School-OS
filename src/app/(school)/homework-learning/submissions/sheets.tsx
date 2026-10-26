"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, EyeOff, Reply, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Segmented, Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { ActionButton } from "@/components/students/confirm-action";
import { gradeFor, scoreProblem, type GradeBand } from "@/lib/homework/words";
import { acceptLateAction, bulkCompleteAction, commentAction, draftFeedbackAction, excuseAction, gradeAction, hideCommentAction, remindParentsAction } from "./actions";
import { Words } from "@/lib/i18n/client";
import { DateInput } from "@/components/ui/date-input";

export type ThreadItem = { id: string; who: string; when: string; text: string; fromStudent: boolean; hidden: string | null };

/** The discussion between teacher and student on one piece of work, with a reply box. */
export function Thread({ items, submissionId, canReply }: { items: ThreadItem[]; submissionId: string; canReply: boolean }) {
  const [reply, setReply] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  if (!items.length && !canReply) return null;
  const send = () => start(async () => {
    const fd = new FormData();
    fd.set("id", submissionId);
    fd.set("body", reply);
    const r = await commentAction(null, fd);
    if (r && !r.ok) setProblem(r.message ?? "That did not send."); else { setReply(""); setProblem(null); router.refresh(); }
  });
  return (
    <div className="rounded-2xl border border-line p-3">
      <p className="text-[12px] text-ink3 font-semibold mb-2"><Words k="Discussion" /></p>
      {items.length === 0 && <p className="text-[13px] text-ink3"><Words k="No messages yet." /></p>}
      <ul className="flex flex-col gap-2">
        {items.map((t) => (
          <li key={t.id} className="text-[13.5px]">
            <b className="font-semibold">{t.who}</b> <span className="text-ink3 text-[12px]">· {t.when}</span>
            {t.hidden ? <p className="text-ink3 italic"><Words k="Hidden:" /> {t.hidden}</p> : <p className="text-ink2">{t.text}</p>}
            {canReply && t.fromStudent && !t.hidden && (
              <ActionButton action={hideCommentAction} fields={{ commentId: t.id, reason: "Not about the homework" }} variant="ghost" size="sm" className="!h-7 !px-2 text-ink3"><EyeOff size={13} aria-hidden="true" /><Words k="Hide" /></ActionButton>
            )}
          </li>
        ))}
      </ul>
      {canReply && (
        <div className="flex gap-2 mt-2">
          <label htmlFor={`reply-${submissionId}`} className="sr-only"><Words k="Reply to the student" /></label>
          <input id={`reply-${submissionId}`} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the student" className={cx(inputCls(problem), "!h-10")}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (reply.trim()) send(); } }} />
          <Button variant="secondary" icon={Reply} disabled={!reply.trim()} loading={busy} onClick={send} className="!h-10"><Words k="Reply" /></Button>
        </div>
      )}
      {problem && <p className="text-[12.5px] text-bad mt-1" role="alert">{problem}</p>}
    </div>
  );
}

/** Mark one student's work (mod-homework.jsx GradeSheet). The left side is the work, from the server. */
export function GradeSheet({ closeHref, id, name, sub, max, bands, showGrade, start, handedIn, ai, resubmitDefault, extra }: {
  closeHref: string; id: string; name: string; sub: string; max: number; bands: GradeBand[]; showGrade: boolean; ai: boolean; resubmitDefault: { words: string; iso: string };
  start: { result: string; score: string; feedback: string; resubmit: boolean };
  handedIn: React.ReactNode; extra?: React.ReactNode;
}) {
  const [result, setResult] = useState(useTyped("result", start.result).value || "COMPLETE");
  const scoreT = useTyped("score", start.score);
  const [score, setScore] = useState(scoreT.value);
  const [fb, setFb] = useState(useTyped("feedback", start.feedback).value);
  const [resub, setResub] = useState(start.resubmit);
  const [draft, setDraft] = useState<{ text: string; source: string } | null>(null);
  const [aiProblem, setAiProblem] = useState<string | null>(null);
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [drafting, startDraft] = useTransition();
  const untilT = useTyped("resubmitUntil", resubmitDefault.iso);
  const live = scoreProblem(score, max);
  const err = scoreT.error ?? (score !== "" ? live : null);
  const grade = score !== "" && !live ? gradeFor(Number(score), max, bands) : "—";
  const first = name.split(" ")[0];
  return (
    <SheetForm wide title={name} sub={sub} closeHref={closeHref} action={gradeAction} submitLabel={<><Check size={16} aria-hidden="true" /><Words k="Save" /></>} pendingText="Saving…"
      hidden={{ id, result, fromSuggestion: fromSuggestion ? "1" : "" }} submitDisabled={!!(score !== "" && live)}>
      <div className="grid md:grid-cols-[1fr_1fr] gap-5">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold text-ink2"><Words k="What" /> {first} <Words k="handed in" /></p>
          {handedIn}
          {extra}
        </div>
        <div className="flex flex-col gap-4">
          <FieldShell label="Status" id="gr-result" required>
            <Segmented value={result} onChange={setResult} className="w-full" label="Status" options={[{ value: "COMPLETE", label: "Complete" }, { value: "INCORRECT", label: "Incorrect" }]} />
          </FieldShell>
          <div className="grid grid-cols-2 gap-3">
            <FieldShell label={`Score out of ${max}`} id="gr-score" error={err ?? undefined}>
              <input id="gr-score" name="score" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.trim())} aria-invalid={err ? true : undefined}
                placeholder={`0 to ${max}`} className={cx(inputCls(err), "h-11 tnum !text-[18px] font-semibold")} />
            </FieldShell>
            {showGrade && <FieldShell label="Grade" id="gr-grade" help="Worked out from the score"><div id="gr-grade" className="h-11 rounded-xl bg-sunken/60 px-3.5 flex items-center font-semibold">{grade}</div></FieldShell>}
          </div>
          <FieldShell label="Feedback" id="gr-fb" help="The student sees this">
            <textarea id="gr-fb" name="feedback" rows={3} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="One thing done well, one thing to fix" className={cx(inputCls(), "py-2.5")} />
          </FieldShell>
          {ai && (!draft ? (
            <div className="flex flex-col gap-1">
              <Button variant="soft" size="sm" icon={Sparkles} className="self-start" loading={drafting}
                onClick={() => startDraft(async () => { const r = await draftFeedbackAction(id, result, score); if (r.text) { setDraft({ text: r.text, source: r.source ?? "" }); setAiProblem(null); } else setAiProblem(r.problem ?? "No draft this time."); })}><Words k="Suggest feedback" /></Button>
              {aiProblem && <p className="text-[12.5px] text-ink3">{aiProblem}</p>}
            </div>
          ) : (
            <div className="rounded-2xl border border-brand/25 bg-brand/[.03] p-3.5">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold"><Sparkles size={15} className="text-brand" aria-hidden="true" /><Words k="Feedback draft" /><Pill tone="brand" className="!h-5 !text-[11px] ml-auto"><Words k="Suggestion" /></Pill></p>
              <p className="text-[13.5px] text-ink2 mt-1.5">{draft.text}</p>
              <p className="text-[12px] text-ink3 mt-1.5"><Words k="Based on:" /> {draft.source}</p>
              <div className="flex gap-2 mt-2"><Button size="sm" variant="soft" onClick={() => { setFb(draft.text); setFromSuggestion(true); setDraft(null); }}><Words k="Use and edit" /></Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}><Words k="Discard" /></Button></div>
            </div>
          ))}
          <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
            <Switch id="gr-resub" on={resub} onChange={setResub} label="Allow hand in again" name="resubmit" />
            <label htmlFor="gr-resub" className="text-[13.5px] flex-1"><b className="font-semibold block"><Words k="Allow hand in again" /></b><span className="text-ink3 text-[12.5px]"><Words k="Only for this student" />{resub ? "" : `, until ${resubmitDefault.words}`}</span></label>
          </div>
          {resub && <FieldShell label="Hand in again until" id="gr-until"><DateInput id="gr-until" name="resubmitUntil" defaultValue={untilT.value} key={untilT.key} className={cx(inputCls(), "h-11 tnum")} /></FieldShell>}
        </div>
      </div>
    </SheetForm>
  );
}

/** Mark Complete for the ticked students, after a preview (rule 6). */
export function BulkCompleteSheet({ closeHref, hw, ids, rows }: { closeHref: string; hw: string; ids: string; rows: { name: string; from: string; skip: boolean }[] }) {
  const n = rows.filter((r) => !r.skip).length;
  return (
    <SheetForm title={`Mark ${rows.length} students Complete?`} closeHref={closeHref} action={bulkCompleteAction} hidden={{ hw, ids }} submitDisabled={n === 0}
      submitLabel={<><CheckCheck size={16} aria-hidden="true" />{`Mark ${n} Complete`}</>} pendingText="Saving…">
      <div className="text-[14px] text-ink2 flex flex-col gap-2">
        <p><Words k="For work checked in class. Each student’s status becomes Complete, with no score. You can undo it from the message that follows." /></p>
        <ul className="rounded-xl border border-line divide-y divide-line/70 max-h-60 overflow-y-auto scroll-thin">
          {rows.map((r) => <li key={r.name} className="flex justify-between gap-3 px-3 py-1.5 text-[13px]"><span>{r.name}</span><span className="text-ink3">{r.skip ? "Already checked · skipped" : `${r.from} → Complete`}</span></li>)}
        </ul>
      </div>
    </SheetForm>
  );
}

export function RemindSheet({ closeHref, hw, ids, names, title }: { closeHref: string; hw: string; ids: string; names: string[]; title: string }) {
  return (
    <SheetForm title="Remind parents?" closeHref={closeHref} action={remindParentsAction} hidden={{ hw, ids }} submitDisabled={!names.length}
      submitLabel={`Send to ${names.length} parents`} pendingText="Sending…">
      <p className="text-[14px] text-ink2">{names.length ? <><Words k="Parents of" /> {names.join(", ")} <Words k="get one message saying “" />{title}<Words k="” is not handed in. Cost:" /> {names.length} <Words k="credits. A message cannot be unsent." /></> : "Everyone ticked has already handed in. Reminders go only to parents of students who have not."}</p>
    </SheetForm>
  );
}

export function ExcuseButton({ id, excused }: { id: string; excused: boolean }) {
  return <ActionButton action={excuseAction} fields={{ id, excused: excused ? "0" : "1" }} variant="ghost" size="sm">{excused ? "Give back" : "Excuse"}</ActionButton>;
}

export function AcceptLateButton({ id }: { id: string }) {
  return <ActionButton action={acceptLateAction} fields={{ id }} variant="secondary" size="sm"><Words k="Accept as on time" /></ActionButton>;
}
