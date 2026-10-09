"use client";

// Send to existing families (P11): choose who, check the preview, then send
// and see the result summary.
import Link from "next/link";
import { useState, useTransition } from "react";
import { previewFamilies, sendFamiliesAction, type FamiliesPreview, type FamiliesResult } from "../actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Opt = { value: string; label: string; group?: string };
const field = "h-11 w-full rounded-lg border border-line-strong bg-surface px-3";

export function FamiliesForm({ who: whoOpts, channels }: { who: Opt[]; channels: Opt[] }) {
  const [who, setWho] = useState("school");
  const [channel, setChannel] = useState(channels[0]?.value ?? "");
  const [sendAt, setSendAt] = useState("");
  const [preview, setPreview] = useState<Extract<FamiliesPreview, { ok: true }> | null>(null);
  const [result, setResult] = useState<Extract<FamiliesResult, { ok: true }> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fd = () => {
    const f = new FormData();
    f.set("who", who);
    f.set("channel", channel);
    f.set("sendAt", sendAt);
    return f;
  };
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPreview(null); setMsg(null); };

  const check = () => start(async () => {
    setMsg(null);
    const r = await previewFamilies(fd());
    if (r.ok) setPreview(r);
    else { setPreview(null); setMsg(r.message); }
  });
  const send = () => start(async () => {
    setMsg(null);
    const r = await sendFamiliesAction(fd());
    if (r.ok) { setResult(r); setPreview(null); }
    else setMsg(r.message);
  });

  if (result) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h3 className="text-lg font-semibold">Done</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>{result.made} new link{result.made === 1 ? "" : "s"} made and {sendAt ? "scheduled" : "queued to send"} ({result.queued} message{result.queued === 1 ? "" : "s"}).</li>
          <li>{result.alreadyHad} guardian{result.alreadyHad === 1 ? "" : "s"} already had a link and were left out.</li>
          {result.skipped.length > 0 && <li>Skipped: {result.skipped.join("; ")}.</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          {result.messageId && <ButtonLink href={`/communication/history/${result.messageId}`} variant="primary">See delivery</ButtonLink>}
          <ButtonLink href="/communication/parent-link">Back to links</ButtonLink>
          <Button variant="ghost" onClick={() => setResult(null)}>Send to more families</Button>
        </div>
      </div>
    );
  }

  const groups = [...new Set(whoOpts.map((o) => o.group ?? ""))];
  return (
    <div className="space-y-4">
      {msg && <Alert tone="danger">{msg}</Alert>}
      <div className="grid gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-3 sm:p-5">
        <div>
          <label htmlFor="f-who" className="mb-1 block text-sm font-medium">Who <span className="text-danger" aria-hidden>*</span></label>
          <select id="f-who" value={who} onChange={(e) => change(setWho)(e.target.value)} className={field}>
            {groups.map((g) => g ? (
              <optgroup key={g} label={g}>{whoOpts.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
            ) : whoOpts.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
          <p className="mt-1 text-sm text-ink-2">Guardians with no active link.</p>
        </div>
        <div>
          <label htmlFor="f-ch" className="mb-1 block text-sm font-medium">Channel <span className="text-danger" aria-hidden>*</span></label>
          <select id="f-ch" value={channel} onChange={(e) => change(setChannel)(e.target.value)} className={field}>
            {channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <p className="mt-1 text-sm text-ink-2">Uses the Parent Link template.</p>
        </div>
        <div>
          <label htmlFor="f-at" className="mb-1 block text-sm font-medium">Send at</label>
          <input id="f-at" type="datetime-local" value={sendAt} onChange={(e) => change(setSendAt)(e.target.value)} className={field} />
          <p className="mt-1 text-sm text-ink-2">Leave blank to send now.</p>
        </div>
      </div>

      {preview ? (
        <div className="space-y-3 rounded-2xl border border-brand bg-brand-soft/40 p-5">
          <h3 className="font-semibold">Check before sending</h3>
          <ul className="space-y-1">
            <li><strong>{preview.todo.toLocaleString("en-IN")}</strong> guardian{preview.todo === 1 ? "" : "s"} in {preview.label} will get a new link by {preview.channel === "sms" ? "SMS" : "WhatsApp"}{preview.scheduled ? ` at ${preview.scheduled.replace("T", " ")}` : ""}.</li>
            <li>{preview.alreadyHave.toLocaleString("en-IN")} already have an active link and are left out.</li>
            <li>Uses about {preview.credits.toLocaleString("en-IN")} {preview.channel === "sms" ? "SMS" : "WhatsApp"} credits{preview.balance !== null ? `; you have ${preview.balance.toLocaleString("en-IN")}` : ""}.</li>
          </ul>
          {preview.balance !== null && preview.credits > preview.balance && <Alert tone="danger">Not enough credits. <Link href="/settings/messaging" className="underline">Add credits</Link> first.</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} loading={pending} loadingText="Sending" disabled={preview.todo === 0 || (preview.balance !== null && preview.credits > preview.balance)}>
              {preview.todo === 0 ? "Nobody to send to" : `Send ${preview.todo.toLocaleString("en-IN")} link${preview.todo === 1 ? "" : "s"}`}
            </Button>
            <Button variant="secondary" onClick={() => setPreview(null)}>Change</Button>
          </div>
        </div>
      ) : (
        <Button onClick={check} loading={pending} loadingText="Checking">Check and send</Button>
      )}
    </div>
  );
}
