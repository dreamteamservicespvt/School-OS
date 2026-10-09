"use client";

// Cancel, retry failed and resend (to unread or failed, by any channel) with
// the usual preview of count and cost before it goes.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cancelMessage, doResend, previewResend, retryMessage, type ResendPreview } from "./actions";

type Channel = "whatsapp" | "sms" | "email" | "app";

export function MessageActions({ id, scheduledWords, canCancel, retryable, overLimit, retryLimit, unread, failed, channels, labels }: {
  id: string; scheduledWords: string | null; canCancel: boolean; retryable: number; overLimit: number; retryLimit: number; unread: number; failed: number; channels: Channel[]; labels: Record<Channel, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "unread" | "failed">(null);
  const [channel, setChannel] = useState<Channel>(channels[0] ?? "app");
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
    <div className="flex flex-wrap gap-2">
      {canCancel && (
        <ConfirmButton trigger="Cancel message" triggerVariant="danger-outline" title="Cancel this scheduled message?" confirmLabel="Cancel message" confirmVariant="danger"
          onConfirm={async () => { const m = await cancelMessage(id); if (!m) router.refresh(); return m; }}>
          {scheduledWords} Nobody will get it, and the credits come back.
        </ConfirmButton>
      )}
      {retryable > 0 && (
        <ConfirmButton trigger={`Retry failed (${retryable})`} title={`Retry ${retryable} failed?`} confirmLabel={`Retry ${retryable}`}
          onConfirm={async () => { const m = await retryMessage(id); if (!m) router.refresh(); return m; }}>
          They are sent again on the same channel. Each message can be retried up to {retryLimit} times.{overLimit > 0 && ` ${overLimit} reached the limit; resend them by another channel instead.`}
        </ConfirmButton>
      )}
      {unread > 0 && <Button variant="secondary" onClick={() => openResend("unread")}>Resend to unread ({unread})</Button>}
      {failed > 0 && <Button variant="secondary" onClick={() => openResend("failed")}>Resend failed by another channel</Button>}

      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open === "failed" ? "Resend to failed" : "Resend to unread"}>
        <div className="space-y-4">
          <p className="text-ink-2">{open === "failed" ? `Sends again to the ${failed} who failed.` : `Sends again to the ${unread} not yet at Read.`} Choose the channel; you see the count and cost before it goes.</p>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Channel</legend>
            <div className="flex flex-wrap gap-2">
              {channels.map((c) => (
                <label key={c} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 ${channel === c ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line-strong"}`}>
                  <input type="radio" name="resend-channel" className="sr-only" checked={channel === c} onChange={() => { setChannel(c); if (open) check(open, c); }} />
                  {labels[c]}
                </label>
              ))}
            </div>
          </fieldset>
          <div aria-live="polite" className="min-h-16 rounded-xl bg-surface-2 p-3">
            {checking && <p className="text-ink-2">Checking count and cost…</p>}
            {!checking && preview && !preview.ok && <p className="text-danger">{preview.message}</p>}
            {!checking && preview?.ok && (
              <>
                <p className="font-semibold">Users to notify: {preview.people} · {preview.cost}</p>
                {preview.skipped.length > 0 && <p className="text-sm text-ink-2">Left out: {preview.skipped.join("; ")}</p>}
                {preview.problem && <p className="mt-1 text-danger">{preview.problem}</p>}
              </>
            )}
          </div>
          {error && <p role="alert" className="text-danger">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>
            <Button loading={sending} loadingText="Sending" disabled={!preview?.ok || Boolean(preview.problem) || preview.people === 0}
              onClick={() => startSend(async () => { const m = await doResend(id, open!, channel); if (m) setError(m); })}>
              {preview?.ok ? `Resend to ${preview.people}` : "Resend"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
