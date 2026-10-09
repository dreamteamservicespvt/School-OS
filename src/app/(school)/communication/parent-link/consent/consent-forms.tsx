"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { consentRequestAction, remindConsentAction, type ConsentRequestState } from "../actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Opt = { value: string; label: string; group?: string };
const field = "h-11 w-full rounded-lg border bg-surface px-3";

export function ConsentRequestForm({ texts, who: whoOpts, defaultReplyBy, minDate }: { texts: Opt[]; who: Opt[]; defaultReplyBy: string; minDate: string }) {
  const router = useRouter();
  const [state, setState] = useState<ConsentRequestState>(null);
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [who, setWho] = useState("school");
  const [replyBy, setReplyBy] = useState(defaultReplyBy);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const submit = (intent: "check" | "send") => {
    const out: Record<string, string> = {};
    if (!text) out.consentTextId = "Choose a consent type.";
    if (!replyBy) out.replyBy = "Choose a reply-by date.";
    else if (replyBy < minDate) out.replyBy = "The reply-by date has passed. Choose a later date.";
    setErrors(out);
    if (Object.keys(out).length) return;
    const f = new FormData();
    f.set("consentTextId", text);
    f.set("who", who);
    f.set("replyBy", replyBy);
    f.set("intent", intent);
    start(async () => {
      const r = await consentRequestAction(null, f);
      setState(r);
      if (r?.ok && r.message === "sent") { setChecked(false); setText(""); router.refresh(); }
      else if (r?.ok && r.preview) setChecked(true);
    });
  };
  const reset = () => setChecked(false);
  const err = (k: string) => errors[k] ?? (!state?.ok ? state?.errors?.[k] : undefined);
  const groups = [...new Set(whoOpts.map((o) => o.group ?? ""))];
  const p = checked && state?.ok ? state.preview : undefined;

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(p ? "send" : "check"); }} noValidate className="space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
      {state && !state.ok && state.message && <Alert tone="danger">{state.message}</Alert>}
      <div>
        <label htmlFor="c-type" className="mb-1 block text-sm font-medium">Consent type <span className="text-danger" aria-hidden>*</span></label>
        <select id="c-type" value={text} onChange={(e) => { setText(e.target.value); reset(); }} className={`${field} ${err("consentTextId") ? "border-danger" : "border-line-strong"}`}>
          <option value="">Choose…</option>
          {texts.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {err("consentTextId") && <p className="mt-1 text-sm text-danger">{err("consentTextId")}</p>}
      </div>
      <div>
        <label htmlFor="c-who" className="mb-1 block text-sm font-medium">Who <span className="text-danger" aria-hidden>*</span></label>
        <select id="c-who" value={who} onChange={(e) => { setWho(e.target.value); reset(); }} className={`${field} border-line-strong`}>
          {groups.map((g) => g ? (
            <optgroup key={g} label={g}>{whoOpts.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          ) : whoOpts.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <p className="mt-1 text-sm text-ink-2">Guardians with no current consent of this type.</p>
      </div>
      <div>
        <label htmlFor="c-reply" className="mb-1 block text-sm font-medium">Reply by</label>
        <input id="c-reply" type="date" min={minDate} value={replyBy} onChange={(e) => { setReplyBy(e.target.value); reset(); }} className={`${field} ${err("replyBy") ? "border-danger" : "border-line-strong"}`} />
        {err("replyBy") ? <p className="mt-1 text-sm text-danger">{err("replyBy")}</p> : <p className="mt-1 text-sm text-ink-2">Reminders stop after this date.</p>}
      </div>
      {p && (
        <div className="rounded-xl bg-brand-soft/50 p-3">
          <p><strong>{p.todo}</strong> of {p.total} guardian{p.total === 1 ? "" : "s"} in {p.label} will be asked. {p.total - p.todo} already gave this consent and are left out.</p>
        </div>
      )}
      <Button type="submit" loading={pending} loadingText={p ? "Sending" : "Checking"} disabled={Boolean(p && p.todo === 0)}>
        {p ? (p.todo === 0 ? "Nobody to ask" : `Send to ${p.todo} guardian${p.todo === 1 ? "" : "s"}`) : "Check and send"}
      </Button>
    </form>
  );
}

export function RemindButton({ id, count }: { id: string; count: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Button variant="secondary" size="sm" loading={pending} loadingText="Sending" onClick={() => start(async () => {
        setMsg(null);
        const m = await remindConsentAction(id);
        if (m) setMsg(m);
        else router.refresh();
      })}>Remind {count} waiting</Button>
      {msg && <p role="alert" className="mt-1 text-sm text-danger">{msg}</p>}
    </div>
  );
}
