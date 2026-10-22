"use client";

// The payment / receipt sheet and the cancel sheet (mod-fees.jsx PaymentSheet,
// CancelSheet). Opened by the page address (?pay=<id>, ?cancel=<id>).

import { useActionState, useState } from "react";
import Link from "next/link";
import { Ban, BookOpen, BookText, Check, Download, MessageCircle, Printer, Send, Stamp as StampIcon, Undo2, X } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Banner, Mini } from "@/components/money/kit";
import { UrlSheet, SheetForm } from "@/components/ui/url-sheet";
import { SArea, SMoney, SSelect } from "@/components/ui/sheet-fields";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { CANCEL_REASONS, cancelReasonLabel } from "@/lib/fees/words";
import { PayPill, Stamp } from "./bits";
import type { PaySheetData } from "../_lib/pay-sheet";
import { cancelPaymentAction, newLinkForFailed, rejectPayment, verifyPayment } from "../payments/actions";
import { resendReceipt } from "../collect/[studentId]/actions";
import { Words } from "@/lib/i18n/client";

export function PaymentSheet({ p, closeHref, cancelHref, canEdit, ledgerHref }: { p: PaySheetData; closeHref: string; cancelHref: string; canEdit: boolean; ledgerHref: string | null }) {
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState("");
  const [vState, verify, verifying] = useActionState<FormState<unknown>, FormData>(verifyPayment as never, null);
  const [rState, reject, rejectingNow] = useActionState<FormState<unknown>, FormData>(rejectPayment as never, null);
  const [sState, resend, sending] = useActionState<FormState<unknown>, FormData>(resendReceipt as never, null);
  const [lState, relink, linking] = useActionState<FormState<unknown>, FormData>(newLinkForFailed as never, null);
  const posted = p.status === "POSTED" && !p.broughtIn;
  const pdf = `/fee-management/payments/${p.id}/receipt`;
  const results = [vState, rState, sState, lState].filter((s) => s && !s.ok);
  const done = [vState, rState, sState, lState].find((s) => s?.ok);
  return (
    <UrlSheet wide closeHref={closeHref} title={p.title} sub={p.sub}>
      <div className="flex flex-col gap-4">
        <div className="relative rounded-2xl border border-line overflow-hidden">
          {p.status === "CANCELLED" && <Stamp />}
          <div className="flex justify-between items-center gap-3 px-4 py-3 bg-sunken/60 text-[13px]">
            <span className="font-mono font-semibold">{p.receiptNo ?? "No receipt made"}</span>
            <PayPill status={p.status} broughtIn={p.broughtIn} />
          </div>
          <ul className="px-4 py-2 text-[14px]">
            {p.lines.length === 0 && <li className="py-1.5 text-ink3"><Words k="No fee rows: nothing was posted." /></li>}
            {p.lines.map((l, i) => (
              <li key={i} className="flex justify-between py-1.5 gap-3"><span>{l.label}</span><span className={cx("tnum font-medium", p.status === "CANCELLED" && "line-through text-ink3")}>{l.amount}</span></li>
            ))}
            {p.discount && <li className="flex justify-between py-1.5 gap-3 text-ink3"><span><Words k="Discount given with this payment" /></span><span className="tnum">{p.discount}</span></li>}
          </ul>
          {p.tax && (
            <div className="mx-4 mb-3 rounded-xl bg-info/8 px-3 py-2.5 text-[13px] text-ink2">
              <p className="font-semibold text-ink"><Words k="Tax invoice" /> <span className="font-mono text-[12.5px]">{p.tax.number}</span> <Words k="made with this receipt" />{p.tax.cancelled ? " (cancelled)" : ""}</p>
              <p className="tnum">{p.tax.text}</p>
            </div>
          )}
          <div className="flex justify-between gap-3 px-4 py-3 border-t border-line text-[14px]">
            <span className="text-ink3 min-w-0 break-words">{p.modeText}</span><b className="tnum shrink-0">{p.total}</b>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Mini k={p.online ? "Posted by" : "Collected by"} v={p.collectedBy} />
          <Mini k="Goes to" v={p.goesTo} />
          {p.parent && <Mini k="Parent" v={<span className="tnum">{p.parent}{p.phone ? ` · ${p.phone}` : ""}</span>} />}
          <Mini k="Day Book" v={p.dayBook} />
          {p.note && <Mini k="Note" v={p.note} />}
        </div>

        {p.status === "CANCELLED" && p.cancel && (
          <Banner tone="bad" icon={Ban} title={`Cancelled${p.cancel.when ? ` on ${p.cancel.when}` : ""} by ${p.cancel.by}: ${p.cancel.reason}.`}>{p.cancel.note ?? ""}</Banner>
        )}
        {p.status === "FAILED" && (
          <Banner tone="bad" title={p.failure ?? "The payment did not go through."}><Words k="No money was posted and no receipt was made. The parent can pay again by a new link." /></Banner>
        )}
        {p.cancelWaiting && <Banner tone="warn" title="Cancelling this payment waits for approval."><Words k="It stays posted until it is decided in Approvals." /></Banner>}
        {p.status === "WAITING" && (
          <div className="rounded-2xl border border-warn/40 bg-warn/[.06] p-4 flex flex-col gap-3">
            <p className="text-[14px]"><b className="font-semibold"><Words k="Check before posting." /></b> <span className="text-ink2">{p.mode === "CHEQUE" ? "Posts once the accountant confirms the cheque is cleared or deposited." : "Match the UTR with the bank statement. Then it posts and the receipt becomes final."}</span></p>
            {canEdit && p.verify?.canDecide && !rejecting && (
              <div className="flex gap-2 flex-wrap">
                <form action={verify}><input type="hidden" name="paymentId" value={p.id} /><Button type="submit" variant="primary" icon={Check} loading={verifying}><Words k="Approve and post" /></Button></form>
                <Button variant="danger-soft" icon={X} onClick={() => setRejecting(true)}><Words k="Reject" /></Button>
              </div>
            )}
            {canEdit && p.verify && !p.verify.canDecide && <p className="text-[13px] text-ink3"><Words k="Someone else decides this one in Approvals. Nobody approves their own request." /></p>}
            {rejecting && (
              <form action={reject} className="flex flex-col gap-2">
                <input type="hidden" name="paymentId" value={p.id} />
                <label htmlFor="rej-why" className="text-[13px] font-semibold text-ink2"><Words k="Why is it rejected?" /> <span className="text-bad" aria-hidden="true">*</span></label>
                <input id="rej-why" name="why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Example: UTR not found in the bank statement" className={cx(inputCls(rState?.errors?.why), "h-11")} />
                <div className="flex gap-2"><Button type="submit" variant="danger" disabled={why.trim().length < 5} loading={rejectingNow}><Words k="Reject payment" /></Button><Button variant="ghost" onClick={() => setRejecting(false)}><Words k="Back" /></Button></div>
              </form>
            )}
          </div>
        )}
        {results.map((s, i) => <Alert key={i} tone="danger">{s!.message}</Alert>)}
        {done && <Alert tone="success">{done.message}</Alert>}

        <div className="flex gap-2 flex-wrap">
          {p.receiptNo && (
            <>
              <a href={pdf} target="_blank" rel="noopener" className={buttonClass("secondary")}><Printer size={17} aria-hidden="true" /><Words k="Print" /></a>
              <a href={`${pdf}?download=1`} className={buttonClass("secondary")}><Download size={17} aria-hidden="true" /><Words k="PDF" /></a>
              {p.tax && <a href={`/fee-management/payments/${p.id}/tax-invoice?download=1`} className={buttonClass("secondary")}><BookText size={17} aria-hidden="true" /><Words k="Tax invoice" /></a>}
              {posted && canEdit && (
                <form action={resend}><input type="hidden" name="paymentId" value={p.id} /><Button type="submit" variant="secondary" icon={MessageCircle} loading={sending}><Words k="WhatsApp" /></Button></form>
              )}
            </>
          )}
          {p.canResendLink && canEdit && (
            <form action={relink}><input type="hidden" name="paymentId" value={p.id} /><Button type="submit" variant="primary" icon={Send} loading={linking}><Words k="Send new link" /></Button></form>
          )}
          {ledgerHref && <Link href={ledgerHref} className={buttonClass("ghost")}><BookOpen size={17} aria-hidden="true" /><Words k="Student fee ledger" /></Link>}
          {posted && canEdit && !p.cancelWaiting && (
            <Link href={cancelHref} scroll={false} className={buttonClass("danger-soft", "md", "md:ml-auto")}><Ban size={17} aria-hidden="true" /><Words k="Cancel with a reason" /></Link>
          )}
        </div>
        {posted && canEdit && <p className="text-[12.5px] text-ink3 -mt-1"><Words k="Payments are never deleted or edited. A wrong one is cancelled with a reason and stays on record." /></p>}
      </div>
    </UrlSheet>
  );
}

export function CancelSheet({ p, closeHref, doneHref, needsOk, approver }: { p: PaySheetData; closeHref: string; doneHref: string; needsOk: boolean; approver: string }) {
  const [reason, setReason] = useState("");
  return (
    <SheetForm title={`Cancel receipt ${p.receiptNo}?`} sub="Payments are never deleted. This one stays on record with a cancelled stamp."
      closeHref={closeHref} doneHref={doneHref} action={cancelPaymentAction} submitVariant="danger" hidden={{ paymentId: p.id }}
      submitLabel={<><Ban size={17} aria-hidden="true" />{needsOk ? "Send for approval" : `Cancel receipt ${p.receiptNo}`}</>} pendingText="Cancelling…">
      <ul className="rounded-xl bg-sunken/70 p-3.5 text-[13.5px] text-ink2 flex flex-col gap-1.5">
        <li className="flex gap-2"><Undo2 size={15} className="shrink-0 mt-0.5 text-ink3" aria-hidden="true" />{p.total} <Words k="goes back into" /> {p.studentName}<Words k="’s dues." /></li>
        <li className="flex gap-2"><StampIcon size={15} className="shrink-0 mt-0.5 text-ink3" aria-hidden="true" /><Words k="The receipt is marked cancelled. The parent gets the cancelled copy." /></li>
        <li className="flex gap-2"><BookOpen size={15} className="shrink-0 mt-0.5 text-ink3" aria-hidden="true" /><Words k="The Day Book gets a reversal today. The original line stays." /></li>
      </ul>
      {needsOk && <Banner tone="warn" title={`Needs ${approver}’s approval.`}><Words k="This payment is older than today (" />{p.paidOn}<Words k="), so it is decided in Approvals." /></Banner>}
      <SSelect name="reason" label="Reason" required placeholder="Choose a reason" options={CANCEL_REASONS.map((r) => ({ value: r, label: cancelReasonLabel(r) }))} onChange={(e) => setReason(e.target.value)} />
      {reason === "Cheque bounced" && <SMoney name="bounceCharge" label="Bounce charge" help="Optional. Added to the student’s dues as its own row." />}
      <SArea name="note" label="Note" required={reason === "Other"} help="Printed on the cancelled receipt and kept in the audit log" placeholder="Example: collected again as the next receipt" />
    </SheetForm>
  );
}
