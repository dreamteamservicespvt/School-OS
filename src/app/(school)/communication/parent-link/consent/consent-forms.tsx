"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { consentRequestAction, remindConsentAction, type ConsentRequestState } from "../actions";
import { BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";

type Opt = { value: string; label: string; group?: string };

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
    <form onSubmit={(e) => { e.preventDefault(); submit(p ? "send" : "check"); }} noValidate className="px-5 pb-5 flex flex-col gap-3">
      {state && !state.ok && state.message && <Banner tone="bad" title={state.message} />}
      <FieldShell label="Consent type" id="c-type" required error={err("consentTextId")} help="Texts and versions are in Settings, Data Backup & Security">
        <select id="c-type" value={text} onChange={(e) => { setText(e.target.value); reset(); }} className={cx(inputCls(err("consentTextId")), "h-11 pr-9")}>
          <option value="">Choose…</option>
          {texts.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </FieldShell>
      <FieldShell label="Who" id="c-who" required help="Guardians with no current consent of this type">
        <select id="c-who" value={who} onChange={(e) => { setWho(e.target.value); reset(); }} className={cx(inputCls(), "h-11 pr-9")}>
          {groups.map((g) => g ? (
            <optgroup key={g} label={g}>{whoOpts.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          ) : whoOpts.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </FieldShell>
      <FieldShell label="Reply by" id="c-reply" error={err("replyBy")} help="Reminders stop after this date">
        <input id="c-reply" type="date" min={minDate} value={replyBy} onChange={(e) => { setReplyBy(e.target.value); reset(); }} className={cx(inputCls(err("replyBy")), "h-11 tnum")} />
      </FieldShell>
      {p && (
        <p className="text-[13.5px] text-ink2 tnum rounded-xl bg-sunken/70 px-3.5 py-2.5">
          <b className="font-semibold text-ink">{p.todo.toLocaleString("en-IN")}</b> of {p.total.toLocaleString("en-IN")} guardian{p.total === 1 ? "" : "s"} in {p.label} will be asked. {(p.total - p.todo).toLocaleString("en-IN")} already gave this consent and are left out.
        </p>
      )}
      <div className="flex justify-end gap-2">
        {p && <Button variant="secondary" onClick={reset}>Change</Button>}
        <Button type="submit" icon={p ? Send : undefined} loading={pending} loadingText={p ? "Sending" : "Checking"} disabled={Boolean(p && p.todo === 0)}>
          {p ? (p.todo === 0 ? "Nobody to ask" : `Send to ${p.todo.toLocaleString("en-IN")} guardian${p.todo === 1 ? "" : "s"}`) : "Check and send"}
        </Button>
      </div>
    </form>
  );
}

export function RemindButton({ id, count }: { id: string; count: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end shrink-0">
      <Button variant="ghost" size="sm" icon={BellRing} loading={pending} loadingText="Sending" onClick={() => start(async () => {
        setMsg(null);
        const m = await remindConsentAction(id);
        if (m) setMsg(m);
        else router.refresh();
      })}>Remind {count.toLocaleString("en-IN")}</Button>
      {msg && <p role="alert" className="mt-1 text-[12.5px] text-bad max-w-60 text-right">{msg}</p>}
    </div>
  );
}
