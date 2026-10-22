"use client";

// New survey or a draft (mod-communication.jsx SurveyBuilder): title, questions (rating, choice,
// text, date), who gets it, the closing date, anonymous answers, and save as draft or send now.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, Plus, Send, Trash2, Users, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { audienceCountAction, saveSurveyAction } from "./actions";
import { Words } from "@/lib/i18n/client";

type Q = { key: number; kind: string; text: string; options: string[]; required: boolean };
export type SurveyFormData = {
  id: string | null;
  title: string;
  audience: string;
  anonymous: boolean;
  closesOn: string;
  minDate: string;
  questions: Omit<Q, "key">[];
  audiences: { value: string; label: string }[];
  kinds: { key: string; label: string }[];
  maxQuestions: number;
  maxOptions: number;
};

export function SurveyForm({ data }: { data: SurveyFormData }) {
  const router = useRouter();
  const [title, setTitle] = useState(data.title);
  const [audience, setAudience] = useState(data.audience);
  const [anonymous, setAnonymous] = useState(data.anonymous);
  const [closesOn, setClosesOn] = useState(data.closesOn);
  const [qs, setQs] = useState<Q[]>(() => data.questions.map((q, i) => ({ ...q, key: i })));
  const [count, setCount] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    void audienceCountAction(audience).then((n) => { if (live) setCount(n); });
    return () => { live = false; };
  }, [audience]);

  const change = (key: number, patch: Partial<Q>) => setQs((x) => x.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  const titleErr = tried && title.trim().length < 3 ? "Give the survey a title" : undefined;
  const qErr = (q: Q) => (!tried ? undefined : q.text.trim().length < 3 ? "Write the question" : q.kind === "choice" && q.options.filter((o) => o.trim()).length < 2 ? "Give at least two choices" : undefined);

  function save(send: boolean) {
    setTried(true);
    setMessage(null);
    if (title.trim().length < 3 || !qs.length || qs.some((q) => q.text.trim().length < 3 || (q.kind === "choice" && q.options.filter((o) => o.trim()).length < 2))) {
      setMessage(!qs.length ? "Add at least one question." : "Please fix the marked fields.");
      return;
    }
    setSending(send);
    start(async () => {
      const r = await saveSurveyAction(data.id, { title, audience, anonymous, closesOn: closesOn || null, questions: qs.map(({ kind, text, options, required }) => ({ kind, text, options, required })) }, send);
      if (!r.ok) setMessage(r.message);
      else router.push(`/communication/surveys/${r.id}`);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(false); }} noValidate className="flex flex-col gap-5 lg:gap-6">
      {message && <Banner tone="bad" title={message} />}
      <Card>
        <CardHeader title="The survey" icon={ClipboardList} description="Choice, rating, text and date questions. Each person answers once." />
        <div className="px-5 pb-5 flex flex-col gap-4">
          <FieldShell label="Title" id="sv-title" required error={titleErr}>
            <input id="sv-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={cx(inputCls(titleErr), "h-11")} aria-invalid={Boolean(titleErr)} />
          </FieldShell>
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-ink2"><Words k="Questions" /> <span className="text-bad">*</span></p>
            {qs.map((q, i) => {
              const err = qErr(q);
              return (
                <div key={q.key} className="rounded-xl border border-line p-3 flex flex-col gap-2">
                  <div className="flex flex-col md:flex-row gap-2">
                    <span className="w-7 h-7 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum shrink-0 md:mt-2">{i + 1}</span>
                    <label htmlFor={`sv-qt-${q.key}`} className="sr-only"><Words k="Question" /> {i + 1} <Words k="type" /></label>
                    <select id={`sv-qt-${q.key}`} value={q.kind} onChange={(e) => change(q.key, { kind: e.target.value, options: e.target.value === "choice" && q.options.length < 2 ? ["", ""] : q.options })} className={cx(inputCls(), "h-11 pr-9 md:w-36 shrink-0")}>
                      {data.kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                    </select>
                    <div className="flex-1 min-w-0">
                      <input id={`sv-q-${q.key}`} value={q.text} maxLength={300} onChange={(e) => change(q.key, { text: e.target.value })} className={cx(inputCls(err), "h-11")} aria-label={`Question ${i + 1}`} aria-invalid={Boolean(err)} placeholder="Write the question" />
                      {err && <p className="text-[12.5px] text-bad mt-1">{err}</p>}
                    </div>
                    <button type="button" onClick={() => setQs((x) => x.filter((y) => y.key !== q.key))} className="w-10 h-10 grid place-items-center rounded-xl text-ink3 hover:bg-sunken shrink-0 self-end md:self-auto md:mt-0.5" aria-label={`Remove question ${i + 1}`}><Trash2 size={17} aria-hidden="true" /></button>
                  </div>
                  {q.kind === "choice" && (
                    <div className="md:pl-9 flex flex-col gap-1.5">
                      {q.options.map((o, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full border-2 border-line shrink-0" aria-hidden="true" />
                          <input value={o} maxLength={80} onChange={(e) => change(q.key, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} className={cx(inputCls(), "h-10")} aria-label={`Question ${i + 1}, choice ${j + 1}`} placeholder={`Choice ${j + 1}`} />
                          <button type="button" onClick={() => change(q.key, { options: q.options.filter((_, k) => k !== j) })} className="w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken shrink-0" aria-label={`Remove choice ${j + 1}`}><X size={16} aria-hidden="true" /></button>
                        </div>
                      ))}
                      {q.options.length < data.maxOptions && <button type="button" onClick={() => change(q.key, { options: [...q.options, ""] })} className="self-start text-[13px] font-semibold text-brand hover:underline px-1 py-1"><Words k="Add a choice" /></button>}
                    </div>
                  )}
                  <label className="md:pl-9 flex items-center gap-2 text-[13px] text-ink2 w-fit">
                    <input type="checkbox" checked={q.required} onChange={(e) => change(q.key, { required: e.target.checked })} className="w-4 h-4 accent-[var(--color-brand)]" />
                    <Words k="Must be answered" />
                  </label>
                </div>
              );
            })}
            {qs.length < data.maxQuestions && (
              <Button type="button" variant="secondary" icon={Plus} className="self-start" onClick={() => setQs((x) => [...x, { key: Math.max(0, ...x.map((y) => y.key)) + 1, kind: "rating", text: "", options: [], required: true }])}><Words k="Add question" /></Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Who answers" icon={Users} description="Each person gets their own link by WhatsApp or email. Opted-out parents are left out." />
        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FieldShell label="Send to" id="sv-aud" required help={count == null ? "Counting…" : `${count.toLocaleString("en-IN")} ${count === 1 ? "person" : "people"} with a phone or email`}>
              <select id="sv-aud" value={audience} onChange={(e) => setAudience(e.target.value)} className={cx(inputCls(), "h-11 pr-9")}>
                {data.audiences.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </FieldShell>
            <FieldShell label="Closes on" id="sv-close" help="Leave empty for 7 days after sending">
              <input id="sv-close" type="date" value={closesOn} min={data.minDate} onChange={(e) => setClosesOn(e.target.value)} className={cx(inputCls(), "h-11 tnum")} />
            </FieldShell>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div><p className="text-[14px] font-semibold"><Words k="Anonymous answers" /></p><p className="text-[12.5px] text-ink3"><Words k="Names are not stored with the answers. Only who has answered is kept, for reminders." /></p></div>
            <Switch on={anonymous} onChange={setAnonymous} label="Anonymous answers" id="sv-anon" />
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 justify-end">
        <ButtonLink href={data.id ? `/communication/surveys/${data.id}` : "/communication/surveys"} variant="secondary"><Words k="Cancel" /></ButtonLink>
        <Button type="submit" variant="secondary" icon={Check} loading={pending && !sending} disabled={pending}><Words k="Save draft" /></Button>
        <Button type="button" icon={Send} loading={pending && sending} disabled={pending || count === 0} onClick={() => save(true)}>
          {count ? `Send to ${count.toLocaleString("en-IN")}` : "Send now"}
        </Button>
      </div>
    </form>
  );
}
