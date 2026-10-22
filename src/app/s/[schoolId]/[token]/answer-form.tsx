"use client";

// The questions, one card each, big enough to tap on a phone (parent.jsx). Stars for ratings,
// radio buttons for choices, a box for text and a date picker for dates.
import { useState, useTransition } from "react";
import { CircleCheck, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { inputCls } from "@/components/ui/field";
import { PhoneCard, PhoneNotice } from "@/components/parent-link/phone-shell";
import { submitSurveyAction } from "./actions";
import { Words } from "@/lib/i18n/client";

type Q = { id: string; kind: string; text: string; options: string[]; required: boolean };
const RATING_WORDS = ["", "Very poor", "Poor", "Okay", "Good", "Very good"];

export function AnswerForm({ schoolId, token, questions }: { schoolId: string; token: string; questions: Q[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const set = (id: string, v: string) => { setAnswers((a) => ({ ...a, [id]: v })); setMissing((m) => { const n = new Set(m); n.delete(id); return n; }); };

  if (done) return <PhoneNotice title="Thank you!" icon={<CircleCheck size={26} className="text-ok" />}><Words k="Your answers reached the school." /></PhoneNotice>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const gaps = new Set(questions.filter((q) => q.required && !(answers[q.id] ?? "").trim()).map((q) => q.id));
    setMissing(gaps);
    if (gaps.size) {
      setMessage(`Please answer ${gaps.size === 1 ? "the marked question" : `the ${gaps.size} marked questions`}.`);
      document.getElementById(`q-${[...gaps][0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setMessage(null);
    start(async () => {
      const r = await submitSurveyAction(schoolId, token, answers);
      if (r.ok) setDone(true);
      else setMessage(r.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {questions.map((q, i) => {
        const v = answers[q.id] ?? "";
        const bad = missing.has(q.id);
        return (
          <PhoneCard key={q.id} id={`q-${q.id}`} className={cx(bad && "!border-bad")} aria-labelledby={`ql-${q.id}`}>
            <p id={`ql-${q.id}`} className="font-semibold text-[15px] leading-snug"><span className="text-ink3 tnum mr-1">{i + 1}.</span>{q.text}{q.required ? <span className="text-bad"> *</span> : <span className="text-ink3 font-normal text-[13px]"> <Words k="(optional)" /></span>}</p>
            {q.kind === "rating" && (
              <div className="mt-3">
                <div role="radiogroup" aria-labelledby={`ql-${q.id}`} className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={v === String(k)} aria-label={`${k} of 5, ${RATING_WORDS[k]}`} onClick={() => set(q.id, String(k))}
                      className={cx("flex-1 h-12 rounded-xl grid place-items-center border transition", Number(v) >= k ? "bg-warn/12 border-warn/40 text-warn" : "border-line text-ink3 hover:bg-sunken")}>
                      <Star size={22} fill={Number(v) >= k ? "currentColor" : "none"} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <p className="text-[12.5px] text-ink3 mt-1.5 h-4">{v ? RATING_WORDS[Number(v)] : "Tap a star"}</p>
              </div>
            )}
            {q.kind === "choice" && (
              <div role="radiogroup" aria-labelledby={`ql-${q.id}`} className="mt-3 flex flex-col gap-2">
                {q.options.map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={v === o} onClick={() => set(q.id, o)}
                    className={cx("flex items-center gap-3 p-3.5 rounded-2xl border text-left transition", v === o ? "border-brand ring-1 ring-brand bg-brand/5" : "border-line hover:bg-sunken/60")}>
                    <span className={cx("w-5 h-5 rounded-full border-2 grid place-items-center shrink-0", v === o ? "border-brand" : "border-line")}>{v === o && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
                    <span className="text-[14.5px] font-medium">{o}</span>
                  </button>
                ))}
              </div>
            )}
            {q.kind === "text" && (
              <textarea aria-labelledby={`ql-${q.id}`} value={v} maxLength={1000} rows={3} onChange={(e) => set(q.id, e.target.value)} className={cx(inputCls(bad), "mt-3 h-auto py-2.5 resize-y")} placeholder="Write here" />
            )}
            {q.kind === "date" && (
              <input type="date" aria-labelledby={`ql-${q.id}`} value={v} onChange={(e) => set(q.id, e.target.value)} className={cx(inputCls(bad), "mt-3 h-12 tnum")} />
            )}
            {bad && <p className="text-[12.5px] text-bad mt-2"><Words k="Please answer this question." /></p>}
          </PhoneCard>
        );
      })}
      {message && <p role="alert" className="rounded-2xl bg-bad/10 border border-bad/30 text-bad text-[14px] px-4 py-3">{message}</p>}
      <Button type="submit" size="lg" icon={Send} loading={pending} loadingText="Sending" className="w-full !h-14 !text-[16px]"><Words k="Send answers" /></Button>
    </form>
  );
}
