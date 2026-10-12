"use client";

// Buttons and short forms on Admission Decision: approve, reject, waiting
// list moves, the offer letter, confirm admission and undo.

import { ActionButton, ActionForm, FormDialog } from "../_components/forms";
import { SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { confirmAction, decideAction, moveWaitAction, offerAcceptedAction, offerSeatAction, offerSentAction, rerankAction, undoAction, waitAction } from "./actions";

export function DecideButtons({ id, name, waitingList, seatsNote }: { id: string; name: string; waitingList: boolean; seatsNote: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <FormDialog trigger="Approve" triggerVariant="primary" triggerSize="sm" title={`Approve ${name}`} action={decideAction} hidden={{ id, decision: "approve" }} submitLabel="Approve">
        {(f) => (
          <>
            <p>{seatsNote}</p>
            <TextArea label="Remarks" name="remarks" maxLength={1000} defaultValue={f.val("remarks")} error={f.err("remarks")} help="Optional. Kept in the decision history." />
            <p className="text-sm text-ink-2">The parent gets a message that the admission is approved.</p>
          </>
        )}
      </FormDialog>
      <FormDialog trigger="Reject" triggerVariant="danger-outline" triggerSize="sm" title={`Reject ${name}`} action={decideAction} hidden={{ id, decision: "reject" }} submitLabel="Reject" submitVariant="danger">
        {(f) => (
          <>
            <TextArea label="Remarks" name="remarks" required maxLength={1000} defaultValue={f.val("remarks")} error={f.err("remarks")} help="Required. The parent is told, with these remarks." />
          </>
        )}
      </FormDialog>
      {waitingList && (
        <FormDialog trigger="Waiting list" triggerSize="sm" title={`Put ${name} on the waiting list`} action={waitAction} hidden={{ id }} submitLabel="Add to waiting list">
          {(f) => (
            <>
              <p>The position is set by the school&apos;s rules: sibling, quota, test score, then date applied.</p>
              <TextArea label="Note" name="note" maxLength={500} defaultValue={f.val("note")} error={f.err("note")} />
            </>
          )}
        </FormDialog>
      )}
    </div>
  );
}

export function WaitingActions({ id, name, rank, count }: { id: string; name: string; rank: number; count: number }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      <ActionButton action={offerSeatAction} hidden={{ id }} pendingText="Sending…">Offer seat</ActionButton>
      {count > 1 && (
        <FormDialog trigger="Move" triggerSize="sm" triggerVariant="ghost" title={`Move ${name} on the waiting list`} action={moveWaitAction} hidden={{ id }} submitLabel="Move">
          {(f) => (
            <>
              <p>Now at position {rank} of {count}.</p>
              <TextField label="New position" name="toRank" required inputMode="numeric" defaultValue={f.val("toRank")} error={f.err("toRank")} />
              <TextArea label="Reason" name="reason" required maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} help="Required. Written to the history." />
            </>
          )}
        </FormDialog>
      )}
    </span>
  );
}

export function Rerank({ yearId, classId, className }: { yearId: string; classId: string; className: string }) {
  return (
    <FormDialog trigger="Re-rank by the rules" triggerSize="sm" title={`Re-rank the ${className} waiting list`} action={rerankAction} hidden={{ yearId, classId }} submitLabel="Re-rank">
      {(f) => (
        <>
          <p>Every position is worked out again from the rules. Moves made by hand are replaced.</p>
          <TextArea label="Reason" name="reason" required maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />
        </>
      )}
    </FormDialog>
  );
}

export function OfferButtons({ id, sent, accepted, hasEmail }: { id: string; sent: boolean; accepted: boolean; hasEmail: boolean }) {
  const channels: Option[] = [{ value: "whatsapp", label: "WhatsApp or SMS" }, ...(hasEmail ? [{ value: "email", label: "Email" }] : []), { value: "printed", label: "Printed and handed over" }];
  return (
    <span className="flex flex-wrap gap-1">
      <FormDialog trigger={sent ? "Send offer again" : "Send offer letter"} triggerSize="sm" title="Send the offer letter" action={offerSentAction} hidden={{ id }} submitLabel="Record as sent">
        {(f) => <SelectField label="How" name="channel" required options={channels} defaultValue={f.val("channel", "whatsapp")} error={f.err("channel")} />}
      </FormDialog>
      {sent && !accepted && <ActionButton action={offerAcceptedAction} hidden={{ id }}>Mark accepted</ActionButton>}
    </span>
  );
}

export function ConfirmForm({ id, sections, defaultSection, today }: { id: string; sections: Option[]; defaultSection: string | null; today: string }) {
  return (
    <ActionForm action={confirmAction} hidden={{ id }} submitLabel="Confirm admission" pendingText="Making the student record…" keep>
      {(f) => (
        <>
          <SelectField label="Section" name="sectionId" required options={sections} defaultValue={f.val("sectionId", defaultSection)} error={f.err("sectionId")} help="The section with most free seats is chosen for you." />
          <TextField label="Admission date" name="admissionDate" type="date" required defaultValue={f.val("admissionDate", today)} error={f.err("admissionDate")} />
        </>
      )}
    </ActionForm>
  );
}

export function UndoAdmission({ id }: { id: string }) {
  return (
    <FormDialog trigger="Undo admission" triggerVariant="danger-outline" title="Undo this admission" action={undoAction} hidden={{ id }} submitLabel="Undo admission" submitVariant="danger">
      {() => <p>The student record, the new parent records, their Parent Links and the class place are archived. The application goes back to approved. This works for 10 minutes, and only if nothing else has happened to the student.</p>}
    </FormDialog>
  );
}
