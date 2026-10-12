"use client";

// The buttons and sheets on an application (design: ApplicationDetail,
// ReviewSheet): review or send back, move to a step, withdraw, the
// application fee (Razorpay link or counter), consent with a one-time code,
// and the papers exception. Only shown to people who may do them; the server
// checks again.

import { useState } from "react";
import { Ban, Banknote, ChevronRight, CircleCheck, ClipboardCheck, FolderOpen, Gavel, Hourglass, IndianRupee, Pencil, Printer, Send, ShieldCheck } from "lucide-react";
import { ButtonLink, Button } from "@/components/ui/button";
import { MoreMenu, type MenuItem } from "@/components/ui/more-menu";
import { CheckboxField, SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { Segmented } from "@/components/ui/controls";
import { ActionButton, FormSheet } from "../../_components/forms";
import {
  cancelPaymentAction, confirmConsentAction, counterPaymentAction, exceptionAction, moveAction, remindAction,
  reviewAction, sendBackAction, sendCodeAction, sendFeeLinkAction, withdrawAction,
} from "../actions";

const MOVE_ICON: Record<string, typeof FolderOpen> = { REVIEWED: CircleCheck, DOCUMENTS: FolderOpen, TEST_INTERVIEW: ClipboardCheck, DECISION: Hourglass };

export function AppActions({ id, name, applicationNo, parent, moves, canReview, decisionHref, editHref, fee }: {
  id: string; name: string; applicationNo: string; parent: string;
  moves: Option[]; canReview: boolean; decisionHref: string | null; editHref: string | null;
  fee: { due: boolean; amount: string; online: boolean; phone: string; modes: Option[] } | null;
}) {
  const [sheet, setSheet] = useState<null | "review" | "withdraw" | "fee" | "counter" | "move">(null);
  const [mode, setMode] = useState<"ok" | "back">("ok");
  const [moveTo, setMoveTo] = useState<Option | null>(null);
  const close = () => setSheet(null);
  const items: MenuItem[] = [
    ...moves.map((m) => ({ icon: MOVE_ICON[m.value] ?? ChevronRight, label: m.label, onClick: () => { setMoveTo(m); setSheet("move"); } })),
    ...(editHref ? [{ icon: Pencil, label: "Edit form", href: editHref }] : []),
    { icon: Printer, label: "Print application", onClick: () => window.print() },
    { icon: Ban, label: "Withdraw", onClick: () => setSheet("withdraw"), tone: "bad" as const },
  ];
  const primaryMove = !canReview && !decisionHref ? moves[0] : null;
  return (
    <div className="flex gap-2 flex-wrap print:hidden">
      {decisionHref ? <ButtonLink href={decisionHref} variant="primary" icon={Gavel}>Open in Admission Decision</ButtonLink>
        : canReview ? <Button variant="primary" icon={CircleCheck} onClick={() => setSheet("review")}>Review</Button>
          : primaryMove ? <Button variant="primary" icon={MOVE_ICON[primaryMove.value] ?? ChevronRight} onClick={() => { setMoveTo(primaryMove); setSheet("move"); }}>{primaryMove.label}</Button> : null}
      {fee?.due && <Button variant="secondary" icon={IndianRupee} onClick={() => setSheet(fee.online ? "fee" : "counter")}>Collect application fee</Button>}
      <MoreMenu items={items} />

      <FormSheet open={sheet === "review"} onClose={close} title="Review application" sub={`${name} · ${applicationNo}`}
        action={mode === "ok" ? reviewAction : sendBackAction} hidden={{ id }} submitLabel={mode === "ok" ? "Mark reviewed" : `Send to ${parent}`} submitIcon={mode === "ok" ? CircleCheck : Send}>
        {(f) => (
          <>
            <Segmented label="Review" value={mode} onChange={(v) => setMode(v as "ok" | "back")} options={[{ value: "ok", label: "Looks right" }, { value: "back", label: "Send back for details" }]} className="w-full" />
            <TextArea key={mode} label={mode === "ok" ? "Note (staff only)" : "What is missing"} name="note" required={mode === "back"} rows={3} maxLength={500}
              placeholder={mode === "ok" ? "Optional" : "For example: previous school marks for Class 5"} defaultValue={f.val("note")} error={f.err("note")}
              help={mode === "back" ? "The parent gets this by WhatsApp or SMS. Saved in the history." : undefined} />
          </>
        )}
      </FormSheet>

      <FormSheet open={sheet === "move"} onClose={close} title={moveTo?.label ?? "Move"} sub={`${name} · ${applicationNo}`} action={moveAction} hidden={{ id, to: moveTo?.value ?? "" }}
        submitLabel={moveTo?.label ?? "Move"} submitIcon={moveTo ? MOVE_ICON[moveTo.value] ?? ChevronRight : null}>
        {() => <p className="text-[14px] text-ink2">The same checks as on each page apply. The move is kept in the application’s history.</p>}
      </FormSheet>

      <FormSheet open={sheet === "withdraw"} onClose={close} title={`Withdraw ${name}’s application?`} sub="The parent is no longer interested. The application stays on record and its number is never reused."
        action={withdrawAction} hidden={{ id }} submitLabel="Withdraw application" submitVariant="danger" submitIcon={Ban}>
        {(f) => <TextArea label="Reason" name="reason" required rows={2} maxLength={300} placeholder="Chose another school" defaultValue={f.val("reason")} error={f.err("reason")} />}
      </FormSheet>

      {fee && (
        <>
          <FormSheet open={sheet === "fee"} onClose={close} title="Collect application fee" sub={`${name} · ${fee.amount}`} action={sendFeeLinkAction} hidden={{ id }}
            submitLabel="Send Razorpay link" submitIcon={Send}>
            {() => (
              <div className="flex flex-col gap-2.5">
                {fee.online ? (
                  <div className="flex items-center gap-3 rounded-xl border border-line p-3.5">
                    <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Send size={18} aria-hidden="true" /></span>
                    <span className="flex-1"><b className="font-semibold text-[14px] block">Send a Razorpay payment link</b><span className="text-[12.5px] text-ink3">To +91 {fee.phone}. UPI, card or net banking. The receipt is made only after Razorpay confirms.</span></span>
                  </div>
                ) : (
                  <p className="text-[13px] text-ink3 rounded-xl bg-sunken px-3.5 py-3">Online payment is not set up. Connect Razorpay in Settings, Payment Gateways, to send links.</p>
                )}
                <button type="button" onClick={() => setSheet("counter")} className="flex items-center gap-3 rounded-xl border border-line p-3.5 text-left hover:bg-sunken/60 transition">
                  <span className="w-10 h-10 rounded-xl bg-sunken grid place-items-center shrink-0"><Banknote size={18} aria-hidden="true" /></span>
                  <span className="flex-1"><b className="font-semibold text-[14px] block">Collect at the counter</b><span className="text-[12.5px] text-ink3">Cash, UPI, card or cheque, with a receipt</span></span>
                  <ChevronRight size={18} className="text-ink3" aria-hidden="true" />
                </button>
              </div>
            )}
          </FormSheet>
          <FormSheet open={sheet === "counter"} onClose={close} title="Collect at the counter" sub={`${name} · ${applicationNo}`} action={counterPaymentAction} hidden={{ id }} submitLabel="Record payment" submitIcon={IndianRupee}>
            {(f) => (
              <>
                <TextField label="Amount (₹)" name="amount" required inputMode="decimal" defaultValue={f.val("amount", fee.amount.replace(/[^\d.]/g, ""))} error={f.err("amount")} className="tnum" />
                <SelectField label="Paid by" name="mode" required options={fee.modes} defaultValue={f.val("mode", "cash")} error={f.err("mode")} />
                <TextField label="Reference" name="reference" maxLength={80} defaultValue={f.val("reference")} error={f.err("reference")} help="Cheque number or UPI / card transaction ID. Not needed for cash." />
                <p className="text-[13px] text-ink3">A receipt is made only after the money is received.</p>
              </>
            )}
          </FormSheet>
        </>
      )}
    </div>
  );
}

export function RemindButton({ id }: { id: string }) {
  return <ActionButton action={remindAction} hidden={{ id }} icon={Send} busyLabel="Sending…">Remind parent</ActionButton>;
}

export function ExceptionButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Admit with papers pending</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Admit with papers pending" sub="The admission can then be confirmed before every required paper is verified." action={exceptionAction} hidden={{ id }} submitLabel="Record exception">
        {(f) => <TextArea label="Reason" name="reason" required rows={2} maxLength={300} placeholder="TC to come from the old school by 30-06" defaultValue={f.val("reason")} error={f.err("reason")} help="Kept in the history." />}
      </FormSheet>
    </>
  );
}

export function ConsentButtons({ id, phone, texts, parent }: { id: string; phone: string; texts: { type: string; title: string; text: string; version: number; required: boolean }[]; parent: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton action={sendCodeAction} hidden={{ id }} icon={Send} variant="soft" busyLabel="Sending…">Send code to {phone}</ActionButton>
      <Button size="sm" variant="primary" icon={ShieldCheck} onClick={() => setOpen(true)}>Enter code</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} wide title="Consent on the application" sub="Read each text to the guardian, or let them read it. Tick only what they agree to." action={confirmConsentAction} hidden={{ id }} submitLabel="Record consent" submitIcon={ShieldCheck}>
        {(f) => (
          <>
            {texts.map((t) => (
              <div key={t.type} className="rounded-xl border border-line p-3">
                <CheckboxField label={`${t.title}${t.required ? " (needed for admission)" : " (optional)"}`} name={`consent_${t.type}`} defaultChecked={f.val(`consent_${t.type}`) === "on"} help={<span className="whitespace-pre-wrap">{t.text}{t.version ? ` (version ${t.version})` : ""}</span>} />
                {f.err(`consent_${t.type}`) && <p className="mt-1 text-[12.5px] text-bad">{f.err(`consent_${t.type}`)}</p>}
              </div>
            ))}
            <TextField label="Guardian giving consent" name="givenByName" required maxLength={120} defaultValue={f.val("givenByName", parent)} error={f.err("givenByName")} />
            <TextField label="One-time code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} defaultValue={f.val("code")} error={f.err("code")} help="6 digits. Works for 10 minutes." className="tnum tracking-widest" />
          </>
        )}
      </FormSheet>
    </div>
  );
}

export function CancelPayment({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Cancel</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Cancel this payment" sub="The payment and its receipt number stay on record, marked cancelled." action={cancelPaymentAction} hidden={{ paymentId }} submitLabel="Cancel payment" submitVariant="danger">
        {(f) => <TextArea label="Reason" name="reason" required maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />}
      </FormSheet>
    </>
  );
}
