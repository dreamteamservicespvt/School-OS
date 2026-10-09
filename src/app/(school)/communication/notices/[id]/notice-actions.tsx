"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { acknowledgeNotice, archiveNoticeAction, previewNoticeResend, remindAction, resendNotice, type NoticeResendPreview } from "../actions";

type Ch = "whatsapp" | "sms" | "email";
const LABEL: Record<Ch, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" };

export function NoticeActions({ id, canEdit, canArchive, canAck, acked, canRemind, unseen, channels }: {
  id: string; canEdit: boolean; canArchive: boolean; canAck: boolean; acked: boolean; canRemind: number; unseen: number; channels: Ch[];
}) {
  const router = useRouter();
  const [ackPending, startAck] = useTransition();
  const [open, setOpen] = useState(false);
  const [ch, setCh] = useState<Ch>(channels[0] ?? "whatsapp");
  const [preview, setPreview] = useState<NoticeResendPreview | null>(null);
  const [checking, startCheck] = useTransition();
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const check = (c: Ch) => { setPreview(null); setError(null); startCheck(async () => setPreview(await previewNoticeResend(id, c))); };

  return (
    <div className="flex flex-wrap gap-2">
      {canAck && (acked
        ? <span className="inline-flex min-h-11 items-center rounded-lg bg-success-soft px-4 font-medium text-success">You have read this</span>
        : <Button loading={ackPending} loadingText="Saving" onClick={() => startAck(async () => { await acknowledgeNotice(id); router.refresh(); })}>I have read this</Button>)}
      {canEdit && <ButtonLink href={`/communication/notices/${id}/edit`}>Change</ButtonLink>}
      {canRemind > 0 && (
        <ConfirmButton trigger={`Remind (${canRemind})`} title="Remind those who have not acknowledged?" confirmLabel={`Remind ${canRemind}`}
          onConfirm={async () => { const m = await remindAction(id); if (!m) router.refresh(); return m; }}>
          {canRemind} {canRemind === 1 ? "person gets" : "people get"} an app notification asking them to read and acknowledge the notice.
        </ConfirmButton>
      )}
      {unseen > 0 && channels.length > 0 && <Button variant="secondary" onClick={() => { setOpen(true); check(ch); }}>Resend to parents who have not seen it ({unseen})</Button>}
      {canArchive && (
        <ConfirmButton trigger="Archive" triggerVariant="danger-outline" title="Archive this notice?" confirmLabel="Archive notice" confirmVariant="danger"
          onConfirm={async () => { const m = await archiveNoticeAction(id); if (!m) router.push("/communication/notices"); return m; }}>
          It leaves the notice board and every Parent Link at once. Messages already delivered cannot be unsent.
        </ConfirmButton>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Resend to parents who have not seen it">
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Channel</legend>
            <div className="flex flex-wrap gap-2">
              {channels.map((c) => (
                <label key={c} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 ${ch === c ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line-strong"}`}>
                  <input type="radio" className="sr-only" checked={ch === c} onChange={() => { setCh(c); check(c); }} />{LABEL[c]}
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
                {preview.problem && <p className="text-danger">{preview.problem}</p>}
              </>
            )}
          </div>
          {error && <p role="alert" className="text-danger">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button loading={sending} loadingText="Sending" disabled={!preview?.ok || Boolean(preview.problem) || preview.people === 0}
              onClick={() => startSend(async () => { const m = await resendNotice(id, ch); if (m) setError(m); })}>
              {preview?.ok ? `Resend to ${preview.people}` : "Resend"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
