"use client";

// Resend, revoke or reissue one Parent Link (11-communication.md, Revoke or reissue form).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resendAction, revokeAction } from "../actions";

type Opt = { value: string; label: string };
const field = "h-11 w-full rounded-lg border border-line-strong bg-surface px-3";

export function LinkPanel({ id, channels, reasons }: { id: string; channels: Opt[]; reasons: string[] }) {
  const router = useRouter();
  const [channel, setChannel] = useState(channels[0]?.value ?? "");
  const [mode, setMode] = useState<"reissue" | "revoke">("reissue");
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const resend = () => start(async () => {
    setMsg(null);
    const m = await resendAction(id, channel);
    if (m) setMsg(m);
    else router.refresh();
  });

  const revoke = (e: React.FormEvent) => {
    e.preventDefault();
    const out: Record<string, string> = {};
    if (!reason) out.reason = "Choose a reason.";
    if (reason === "Other" && other.trim().length < 5) out.other = "Write the reason in at least 5 characters.";
    if (mode === "reissue" && !channels.length) out.reason = "Neither WhatsApp nor SMS is switched on, so a new link cannot be sent. Choose Revoke only.";
    setErr(out);
    if (Object.keys(out).length) return;
    start(async () => {
      setMsg(null);
      const r = await revokeAction(id, mode, reason, other, channel);
      if (typeof r === "string") setMsg(r);
      else if (r && "newId" in r) router.push(`/communication/parent-link/${r.newId}`);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {msg && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{msg}</p>}
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <h2 className="font-semibold">Resend the same link</h2>
        <p className="text-sm text-ink-2">For a guardian who lost the message. Phones already confirmed keep working.</p>
        {channels.length ? (
          <>
            <label className="block text-sm font-medium" htmlFor="pl-ch">Send by</label>
            <select id="pl-ch" value={channel} onChange={(e) => setChannel(e.target.value)} className={field}>
              {channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <Button variant="secondary" className="w-full" loading={pending} loadingText="Sending" onClick={resend}>Resend link</Button>
          </>
        ) : <p className="text-sm text-danger">Neither WhatsApp nor SMS is switched on. Switch one on in Settings, SMS, WhatsApp &amp; Email.</p>}
      </div>

      <form onSubmit={revoke} noValidate className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <h2 className="font-semibold">Revoke or reissue</h2>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Action <span className="text-danger" aria-hidden>*</span></legend>
          {([["reissue", "Revoke and send a new link"], ["revoke", "Revoke only"]] as const).map(([v, l]) => (
            <label key={v} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="size-5 accent-[var(--brand)]" /> {l}
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="pl-reason" className="mb-1 block text-sm font-medium">Reason <span className="text-danger" aria-hidden>*</span></label>
          <select id="pl-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} ${err.reason ? "border-danger" : ""}`} aria-invalid={err.reason ? true : undefined}>
            <option value="">Choose…</option>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {err.reason && <p className="mt-1 text-sm text-danger">{err.reason}</p>}
        </div>
        <div>
          <label htmlFor="pl-other" className="mb-1 block text-sm font-medium">{reason === "Other" ? "Write the reason" : "Note (optional)"}{reason === "Other" && <span className="text-danger" aria-hidden> *</span>}</label>
          <textarea id="pl-other" rows={2} value={other} maxLength={300} onChange={(e) => setOther(e.target.value)} className={`w-full rounded-lg border bg-surface px-3 py-2 ${err.other ? "border-danger" : "border-line-strong"}`} />
          {err.other && <p className="mt-1 text-sm text-danger">{err.other}</p>}
        </div>
        <p className="text-sm text-ink-2">{mode === "reissue" ? "The old link stops working at once on every phone, and a new one goes to the registered mobile." : "The link stops working at once on every phone. The parent gets no new link."}</p>
        <Button type="submit" variant="danger" className="w-full" loading={pending} loadingText="Working">{mode === "reissue" ? "Revoke and reissue" : "Revoke link"}</Button>
      </form>
    </div>
  );
}
