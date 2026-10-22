"use client";

// Send to existing families (P11): choose who, check the preview, then send
// and see the result summary.
import Link from "next/link";
import { useState, useTransition } from "react";
import { previewFamilies, sendFamiliesAction, type FamiliesPreview, type FamiliesResult } from "../actions";
import { CircleCheck, Send } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";

type Opt = { value: string; label: string; group?: string };
const field = cx(inputCls(), "h-11 pr-9");

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
      <Card>
        <CardHeader title="Sent" icon={CircleCheck} description={sendAt ? "Scheduled. The result summary is in Message History." : "The result summary is in Message History."} />
        <ul className="px-5 pb-4 flex flex-col gap-1.5 text-[14px]">
          <li><b className="font-semibold tnum">{result.made.toLocaleString("en-IN")}</b> <Words k="new link" />{result.made === 1 ? "" : "s"} <Words k="made and" /> {sendAt ? "scheduled" : "queued to send"} ({result.queued.toLocaleString("en-IN")} <Words k="message" />{result.queued === 1 ? "" : "s"}).</li>
          <li><b className="font-semibold tnum">{result.alreadyHad.toLocaleString("en-IN")}</b> <Words k="guardian" />{result.alreadyHad === 1 ? "" : "s"} <Words k="already had a link and were left out." /></li>
          {result.skipped.length > 0 && <li className="text-warn"><Words k="Skipped:" /> {result.skipped.join("; ")}.</li>}
        </ul>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          {result.messageId && <ButtonLink href={`/communication/history/${result.messageId}`} variant="primary"><Words k="See delivery" /></ButtonLink>}
          <ButtonLink href="/communication/parent-link" variant="secondary"><Words k="Back to links" /></ButtonLink>
          <Button variant="ghost" onClick={() => setResult(null)}><Words k="Send to more families" /></Button>
        </div>
      </Card>
    );
  }

  const groups = [...new Set(whoOpts.map((o) => o.group ?? ""))];
  const over = preview && preview.balance !== null && preview.credits > preview.balance;
  return (
    <div className="flex flex-col gap-5 lg:gap-6 max-w-3xl">
      {msg && <Banner tone="bad" title={msg} />}
      <Card>
        <CardHeader title="Who and how" icon={Send} description="New families get theirs automatically when the admission is approved" />
        <div className="px-5 pb-5 flex flex-col gap-3">
          <FieldShell label="Who" id="f-who" required help="Guardians who already have an active link are left out. Use Resend on their link instead.">
            <select id="f-who" value={who} onChange={(e) => change(setWho)(e.target.value)} className={field}>
              {groups.map((g) => g ? (
                <optgroup key={g} label={g}>{whoOpts.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
              ) : whoOpts.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
          </FieldShell>
          <FieldShell label="Channel" id="f-ch" required help="Uses the Parent Link template">
            <Segmented value={channel} onChange={change(setChannel)} options={channels} className="w-full" label="Channel" />
          </FieldShell>
          <FieldShell label="Send at" id="f-at" help="Leave blank to send now">
            <input id="f-at" type="datetime-local" value={sendAt} onChange={(e) => change(setSendAt)(e.target.value)} className={cx(inputCls(), "h-11 tnum")} />
          </FieldShell>
        </div>
      </Card>

      {preview ? (
        <Card className="border-brand/40">
          <CardHeader title="Check before sending" icon={CircleCheck} />
          <ul className="px-5 pb-4 flex flex-col gap-1.5 text-[14px]">
            <li><b className="font-semibold tnum">{preview.todo.toLocaleString("en-IN")}</b> <Words k="guardian" />{preview.todo === 1 ? "" : "s"} <Words k="in" /> {preview.label} <Words k="get a new link by" /> {preview.channel === "sms" ? "SMS" : "WhatsApp"}{preview.scheduled ? ` at ${preview.scheduled.replace("T", " ")}` : ""}.</li>
            <li className="text-ink2">{preview.alreadyHave.toLocaleString("en-IN")} <Words k="already have an active link and are left out." /></li>
          </ul>
          <p className={cx("mx-5 mb-4 text-[13.5px] tnum rounded-xl px-3.5 py-2.5", over ? "bg-bad/10 text-bad" : "bg-sunken/70 text-ink2")}>
            {preview.credits.toLocaleString("en-IN")} <Words k="credits" />{preview.balance !== null ? ` of ${preview.balance.toLocaleString("en-IN")} available` : ""}.{over && <> <Words k="Not enough." /> <Link href="/settings/messaging" className="underline font-semibold"><Words k="Add credits" /></Link> <Words k="first." /></>}
          </p>
          <div className="px-5 pb-5 flex flex-wrap gap-2 justify-end">
            <Button variant="secondary" onClick={() => setPreview(null)}><Words k="Change" /></Button>
            <Button icon={Send} onClick={send} loading={pending} loadingText="Sending" disabled={preview.todo === 0 || Boolean(over)}>
              {preview.todo === 0 ? "Nobody to send to" : `Send to ${preview.todo.toLocaleString("en-IN")} guardian${preview.todo === 1 ? "" : "s"}`}
            </Button>
          </div>
        </Card>
      ) : (
        <Button onClick={check} loading={pending} loadingText="Checking" className="self-end"><Words k="Check and send" /></Button>
      )}
    </div>
  );
}
