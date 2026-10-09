"use client";

// The buttons and short forms on an application: review, send back, move,
// withdraw, papers, consent with a one-time code, and the application fee.

import { ActionButton, FormDialog } from "../../_components/forms";
import { CheckboxField, SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import {
  cancelPaymentAction, confirmConsentAction, counterPaymentAction, exceptionAction, moveAction, originalSeenAction, rejectDocAction, remindAction,
  reviewAction, sendBackAction, sendCodeAction, uploadDocAction, verifyDocAction, withdrawAction,
} from "../actions";

export function AppActions({ id, canReview, moves, closed }: { id: string; canReview: boolean; moves: Option[]; closed: boolean }) {
  const hidden = { id };
  return (
    <div className="flex flex-wrap gap-2">
      {canReview && (
        <FormDialog trigger="Mark reviewed" triggerVariant="primary" title="Mark as reviewed" action={reviewAction} hidden={hidden} submitLabel="Mark reviewed">
          {(f) => <TextArea label="Note" name="note" maxLength={500} defaultValue={f.val("note")} error={f.err("note")} help="Optional. Kept in the history." />}
        </FormDialog>
      )}
      {moves.map((m) => (
        <ActionButton key={m.value} action={moveAction} hidden={{ id, to: m.value }} size="md" variant={m.value === "DECISION" ? "primary" : "secondary"} pendingText="Moving…">{m.label}</ActionButton>
      ))}
      {!closed && (
        <FormDialog trigger="Send back to parent" title="Send back for missing details" action={sendBackAction} hidden={hidden} submitLabel="Send to parent">
          {(f) => <TextArea label="What is missing" name="note" required rows={3} maxLength={500} defaultValue={f.val("note")} error={f.err("note")} help="The parent gets this by WhatsApp or SMS." />}
        </FormDialog>
      )}
      {!closed && (
        <FormDialog trigger="Withdraw" triggerVariant="danger-outline" title="Withdraw application" action={withdrawAction} hidden={hidden} submitLabel="Withdraw" submitVariant="danger">
          {(f) => (
            <>
              <p>Use this when the family is no longer interested. The application stays on record as withdrawn.</p>
              <TextArea label="Reason" name="reason" required maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />
            </>
          )}
        </FormDialog>
      )}
    </div>
  );
}

export function UploadDoc({ applicationId, docTypes, defaultType, label = "Upload document", variant = "secondary" }: { applicationId: string; docTypes: Option[]; defaultType?: string; label?: string; variant?: "primary" | "secondary" }) {
  return (
    <FormDialog trigger={label} triggerVariant={variant} triggerSize="sm" title="Upload document" action={uploadDocAction} hidden={{ id: applicationId }} submitLabel="Upload" pendingText="Uploading…" multipart>
      {(f) => (
        <>
          <SelectField label="Document type" name="docType" required options={docTypes} defaultValue={f.val("docType", defaultType)} error={f.err("docType")} />
          <div>
            <label htmlFor="doc-file" className="mb-1 block text-sm font-medium">File <span className="text-danger" aria-hidden="true">*</span></label>
            <input id="doc-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png" capture="environment" className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-sm" />
            <p className="mt-1 text-sm text-ink-2">PDF, JPG or PNG, up to 5 MB. On a phone you can take a photo.</p>
            {f.err("file") && <p className="mt-1 text-sm text-danger">{f.err("file")}</p>}
          </div>
          <TextField label="Note" name="note" maxLength={300} defaultValue={f.val("note")} />
        </>
      )}
    </FormDialog>
  );
}

export function DocActions({ docId, status, canVerify, originalSeen }: { docId: string; status: string; canVerify: boolean; originalSeen: boolean }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {status !== "VERIFIED" && canVerify && <ActionButton action={verifyDocAction} hidden={{ docId }} pendingText="Verifying…">Verify</ActionButton>}
      {!originalSeen && <ActionButton action={originalSeenAction} hidden={{ docId }} variant="ghost">Original seen</ActionButton>}
      {(status === "RECEIVED" || status === "VERIFIED") && (
        <FormDialog trigger="Reject" triggerVariant="ghost" triggerSize="sm" title="Reject this paper" action={rejectDocAction} hidden={{ docId }} submitLabel="Reject" submitVariant="danger">
          {(f) => (
            <>
              <TextField label="Reason" name="reason" required maxLength={200} placeholder="Photo not clear" defaultValue={f.val("reason")} error={f.err("reason")} />
              <CheckboxField label="Tell the parent the reason" name="tellParent" defaultChecked />
            </>
          )}
        </FormDialog>
      )}
    </span>
  );
}

export function RemindButton({ id }: { id: string }) {
  return <ActionButton action={remindAction} hidden={{ id }} pendingText="Sending…">Remind parent of missing papers</ActionButton>;
}

export function ExceptionDialog({ id }: { id: string }) {
  return (
    <FormDialog trigger="Record exception" triggerSize="sm" title="Admit with papers pending" action={exceptionAction} hidden={{ id }} submitLabel="Record exception">
      {(f) => (
        <>
          <p>The admission can then be confirmed before every required paper is verified. The reason is kept in the history.</p>
          <TextArea label="Reason" name="reason" required maxLength={300} placeholder="TC to come from the old school by 30-06" defaultValue={f.val("reason")} error={f.err("reason")} />
        </>
      )}
    </FormDialog>
  );
}

export function ConsentForms({ id, phone, texts, parent }: { id: string; phone: string; texts: { type: string; title: string; text: string; version: number; required: boolean }[]; parent: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton action={sendCodeAction} hidden={{ id }} size="md" pendingText="Sending…">Send code to {phone}</ActionButton>
      <FormDialog trigger="Enter code and record consent" triggerVariant="primary" title="Consent on the application" action={confirmConsentAction} hidden={{ id }} submitLabel="Record consent" wide>
        {(f) => (
          <>
            <p className="text-ink-2">Read each text to the guardian, or let them read it. Tick only what they agree to. Then type the code sent to their mobile.</p>
            {texts.map((t) => (
              <div key={t.type} className="rounded-xl border border-line p-3">
                <CheckboxField label={`${t.title}${t.required ? " (needed for admission)" : " (optional)"}`} name={`consent_${t.type}`} defaultChecked={f.val(`consent_${t.type}`) === "on"} help={<span className="whitespace-pre-wrap">{t.text}{t.version ? ` (version ${t.version})` : ""}</span>} />
                {f.err(`consent_${t.type}`) && <p className="mt-1 text-sm text-danger">{f.err(`consent_${t.type}`)}</p>}
              </div>
            ))}
            <TextField label="Guardian giving consent" name="givenByName" required maxLength={120} defaultValue={f.val("givenByName", parent)} error={f.err("givenByName")} />
            <TextField label="One-time code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} defaultValue={f.val("code")} error={f.err("code")} help="6 digits. Works for 10 minutes." />
          </>
        )}
      </FormDialog>
    </div>
  );
}

export function FeeForm({ id, left, modes }: { id: string; left: string; modes: Option[] }) {
  return (
    <FormDialog trigger="Collect fee at counter" triggerVariant="primary" triggerSize="sm" title="Collect application fee" action={counterPaymentAction} hidden={{ id }} submitLabel="Record payment">
      {(f) => (
        <>
          <TextField label="Amount (₹)" name="amount" required inputMode="decimal" defaultValue={f.val("amount", left)} error={f.err("amount")} />
          <SelectField label="Paid by" name="mode" required options={modes} defaultValue={f.val("mode", "cash")} error={f.err("mode")} />
          <TextField label="Reference" name="reference" maxLength={80} defaultValue={f.val("reference")} error={f.err("reference")} help="Cheque number or UPI / card transaction ID. Not needed for cash." />
          <p className="text-sm text-ink-2">A receipt is made only after the money is received.</p>
        </>
      )}
    </FormDialog>
  );
}

export function CancelPayment({ paymentId }: { paymentId: string }) {
  return (
    <FormDialog trigger="Cancel" triggerVariant="ghost" triggerSize="sm" title="Cancel this payment" action={cancelPaymentAction} hidden={{ paymentId }} submitLabel="Cancel payment" submitVariant="danger">
      {(f) => (
        <>
          <p>The payment and its receipt number stay on record, marked cancelled.</p>
          <TextArea label="Reason" name="reason" required maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />
        </>
      )}
    </FormDialog>
  );
}
