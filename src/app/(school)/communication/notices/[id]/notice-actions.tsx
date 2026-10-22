"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, BellRing, Check, CircleCheck, Pencil, Send } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/controls";
import { Pill } from "@/components/ui/badge";
import { acknowledgeNotice, archiveNoticeAction, previewNoticeResend, remindAction, resendNotice, type NoticeResendPreview } from "../actions";
import { Words } from "@/lib/i18n/client";

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
    <>
      {canAck && (acked
        ? <Pill tone="ok" className="!h-10 !px-4 !text-[14px]"><CircleCheck size={16} aria-hidden="true" /><Words k="You have read this" /></Pill>
        : <Button icon={Check} loading={ackPending} loadingText="Saving" onClick={() => startAck(async () => { await acknowledgeNotice(id); router.refresh(); })}><Words k="I have read this" /></Button>)}
      {canEdit && <ButtonLink href={`/communication/notices/${id}/edit`} icon={Pencil}><Words k="Edit draft" /></ButtonLink>}
      {canRemind > 0 && (
        <ConfirmButton trigger={<><BellRing size={17} aria-hidden="true" /><Words k="Remind" /> {canRemind} <Words k="not acknowledged" /></>} title="Remind those who have not acknowledged?" confirmLabel={`Remind ${canRemind}`}
          onConfirm={async () => { const m = await remindAction(id); if (!m) router.refresh(); return m; }}>
          {canRemind} {canRemind === 1 ? "person gets" : "people get"} <Words k="an app notification asking them to read and acknowledge the notice." />
        </ConfirmButton>
      )}
      {unseen > 0 && channels.length > 0 && <Button variant="soft" icon={Send} onClick={() => { setOpen(true); check(ch); }}><Words k="Resend to" /> {unseen.toLocaleString("en-IN")} <Words k="not seen" /></Button>}
      {canArchive && (
        <ConfirmButton trigger={<><Archive size={17} aria-hidden="true" /><Words k="Archive" /></>} triggerVariant="ghost" title="Archive this notice?" confirmLabel="Archive notice" confirmVariant="danger"
          onConfirm={async () => { const m = await archiveNoticeAction(id); if (!m) router.push("/communication/notices"); return m; }}>
          <Words k="It leaves the notice board and every Parent Link at once. Messages already delivered cannot be unsent." />
        </ConfirmButton>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Resend to ${unseen.toLocaleString("en-IN")} parents?`} sub="Only parents who have not opened it on Parent Link or read it on WhatsApp."
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}><Words k="Close" /></Button>
          <Button loading={sending} loadingText="Sending" disabled={!preview?.ok || Boolean(preview.problem) || preview.people === 0}
            onClick={() => startSend(async () => { const m = await resendNotice(id, ch); if (m) setError(m); })}>
            {preview?.ok ? `Resend to ${preview.people} parents` : "Resend"}
          </Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Segmented label="Channel" value={ch} onChange={(v) => { setCh(v as Ch); check(v as Ch); }} className="self-start" options={channels.map((c) => ({ value: c, label: LABEL[c] }))} />
          <div aria-live="polite" className="text-[13.5px] text-ink2 tnum">
            {checking && <p className="text-ink3"><Words k="Checking count and cost…" /></p>}
            {!checking && preview && !preview.ok && <p className="text-bad">{preview.message}</p>}
            {!checking && preview?.ok && (
              <>
                <p>{preview.people} <Words k="parents ·" /> {preview.cost}.{ch === "sms" ? " Uses the Notice SMS template with its DLT template ID." : ""}</p>
                {preview.skipped.length > 0 && <p className="text-ink3"><Words k="Left out:" /> {preview.skipped.join("; ")}</p>}
                {preview.problem && <p className="text-bad">{preview.problem}</p>}
              </>
            )}
          </div>
          {error && <p role="alert" className="text-[13.5px] text-bad">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
