"use client";

// Cancel, retry failed and resend (to unread or failed, by any channel) with
// the usual preview of count and cost before it goes.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, RotateCcw, Send, X } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/controls";
import { cancelMessage, doResend, previewResend, retryMessage, type ResendPreview } from "./actions";

type Channel = "whatsapp" | "sms" | "email" | "app";

export function MessageActions({ id, scheduledWords, canCancel, retryable, overLimit, retryLimit, unread, failed, channels, labels }: {
  id: string; scheduledWords: string | null; canCancel: boolean; retryable: number; overLimit: number; retryLimit: number; unread: number; failed: number; channels: Channel[]; labels: Record<Channel, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "unread" | "failed">(null);
  const [channel, setChannel] = useState<Channel>(channels.includes("sms") ? "sms" : channels[0] ?? "app");
  const [preview, setPreview] = useState<ResendPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [sending, startSend] = useTransition();

  const check = (who: "unread" | "failed", ch: Channel) => {
    setPreview(null);
    setError(null);
    startCheck(async () => setPreview(await previewResend(id, who, ch)));
  };
  const openResend = (who: "unread" | "failed") => { setOpen(who); check(who, channel); };

  return (
    <>
      {canCancel && (
        <ConfirmButton trigger={<><X size={17} aria-hidden="true" />Cancel scheduled message</>} triggerVariant="danger-soft" title="Cancel this scheduled message?" confirmLabel="Cancel the message" confirmVariant="danger"
          onConfirm={async () => { const m = await cancelMessage(id); if (!m) router.refresh(); return m; }}>
          {scheduledWords} Nobody will receive it, and the credits come back.
        </ConfirmButton>
      )}
      {retryable > 0 && (
        <ConfirmButton trigger={<><RotateCcw size={17} aria-hidden="true" />Retry failed ({retryable})</>} title={`Retry ${retryable} failed?`} confirmLabel={`Retry ${retryable}`}
          onConfirm={async () => { const m = await retryMessage(id); if (!m) router.refresh(); return m; }}>
          They are sent again on the same channel. Each message can be retried up to {retryLimit} times.{overLimit > 0 && ` ${overLimit} reached the limit; resend them by another channel instead.`}
        </ConfirmButton>
      )}
      {failed > 0 && <Button variant="secondary" icon={MessageSquareText} onClick={() => openResend("failed")}>Resend failed by another channel</Button>}
      {unread > 0 && <Button variant="primary" icon={Send} onClick={() => openResend("unread")}>Resend to {unread.toLocaleString("en-IN")} unread</Button>}

      <Dialog open={open !== null} onClose={() => setOpen(null)}
        title={open === "failed" ? `Resend to ${failed} failed?` : `Resend to ${unread.toLocaleString("en-IN")} who have not read it?`}
        sub={open === "failed" ? "Only the people whose message failed." : "Everyone not yet at Read. Those who read it are left out."}
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>
          <Button loading={sending} loadingText="Sending" disabled={!preview?.ok || Boolean(preview.problem) || preview.people === 0}
            onClick={() => startSend(async () => { const m = await doResend(id, open!, channel); if (m) setError(m); })}>
            {preview?.ok ? `Resend to ${preview.people} by ${labels[channel]}` : "Resend"}
          </Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Segmented label="Channel" value={channel} onChange={(v) => { setChannel(v as Channel); if (open) check(open, v as Channel); }} className="self-start"
            options={channels.map((c) => ({ value: c, label: labels[c] }))} />
          <div aria-live="polite" className="text-[13.5px] text-ink2 tnum">
            {checking && <p className="text-ink3">Checking count and cost…</p>}
            {!checking && preview && !preview.ok && <p className="text-bad">{preview.message}</p>}
            {!checking && preview?.ok && (
              <>
                <p>{preview.people} {preview.people === 1 ? "person" : "people"} · {preview.cost}.{channel === "sms" ? " Uses the approved SMS template with its DLT template ID." : ""}</p>
                {preview.skipped.length > 0 && <p className="text-ink3">Left out: {preview.skipped.join("; ")}</p>}
                {preview.problem && <p className="mt-1 text-bad">{preview.problem}</p>}
              </>
            )}
          </div>
          {error && <p role="alert" className="text-[13.5px] text-bad">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
