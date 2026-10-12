"use client";

// Resend, revoke or reissue one Parent Link (11-communication.md, Revoke or reissue form),
// as buttons at the top of the link with a dialog (mod-communication.jsx LinkSheet).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { resendAction, revokeAction } from "../actions";

type Opt = { value: string; label: string };

export function LinkPanel({ id, name, channels, reasons }: { id: string; name: string; channels: Opt[]; reasons: string[] }) {
  const router = useRouter();
  const [channel, setChannel] = useState(channels[0]?.value ?? "");
  const [open, setOpen] = useState<"resend" | "revoke" | null>(null);
  const [mode, setMode] = useState<"reissue" | "revoke">("reissue");
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => { setOpen(null); setMsg(null); setErr({}); };

  const resend = () => start(async () => {
    setMsg(null);
    const m = await resendAction(id, channel);
    if (m) setMsg(m);
    else { close(); router.refresh(); }
  });

  const revoke = () => {
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
      else { close(); router.refresh(); }
    });
  };

  const channelPick = channels.length > 1 && (
    <FieldShell label="Send by" id="pl-ch">
      <Segmented value={channel} onChange={setChannel} options={channels} className="w-full" label="Send by" />
    </FieldShell>
  );

  return (
    <>
      <Button variant="secondary" icon={Send} onClick={() => setOpen("resend")}>Resend link</Button>
      <Button variant="danger-soft" icon={Ban} onClick={() => setOpen("revoke")}>Revoke or reissue</Button>

      <Dialog open={open === "resend"} onClose={close} title={`Resend ${name}’s link`} sub="The same link, for a guardian who lost the message. Phones already confirmed keep working."
        footer={<>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button icon={Send} loading={pending} loadingText="Sending" disabled={!channels.length} onClick={resend}>Resend link</Button>
        </>}>
        <div className="flex flex-col gap-3">
          {channels.length ? channelPick || <p className="text-[14px] text-ink2">It goes by {channels[0].label} to the registered mobile.</p>
            : <p className="text-[14px] text-bad">Neither WhatsApp nor SMS is switched on. Switch one on in Settings, SMS, WhatsApp &amp; Email.</p>}
          {msg && <p role="alert" className="text-[13px] text-bad">{msg}</p>}
        </div>
      </Dialog>

      <Dialog open={open === "revoke"} onClose={close} title={`Revoke ${name}’s link`} sub="The old link stops working at once on every phone. The reason is logged."
        footer={<>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="danger" loading={pending} loadingText="Working" onClick={revoke}>{mode === "reissue" ? "Revoke and send a new link" : "Revoke only"}</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <FieldShell label="Action" id="pl-mode" required>
            <Segmented value={mode} onChange={(v) => setMode(v as "reissue" | "revoke")} options={[{ value: "reissue", label: "Revoke and reissue" }, { value: "revoke", label: "Revoke only" }]} className="w-full" label="Action" />
          </FieldShell>
          <FieldShell label="Reason" id="pl-reason" required error={err.reason}>
            <select id="pl-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={cx(inputCls(err.reason), "h-11 pr-9")} aria-invalid={err.reason ? true : undefined}>
              <option value="">Choose…</option>
              {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </FieldShell>
          <FieldShell label={reason === "Other" ? "Say why" : "Note (optional)"} id="pl-other" required={reason === "Other"} error={err.other}>
            <textarea id="pl-other" rows={2} value={other} maxLength={300} onChange={(e) => setOther(e.target.value)} className={cx(inputCls(err.other), "py-2.5")} />
          </FieldShell>
          {mode === "reissue" && channelPick}
          <p className="text-[13px] text-ink3">{mode === "reissue" ? "A new link goes to the registered mobile. A one-time code is needed on the first open." : "The parent gets no new link."}</p>
          {msg && <p role="alert" className="text-[13px] text-bad">{msg}</p>}
        </div>
      </Dialog>
    </>
  );
}
