"use client";

// The actions of the enquiry panel (02 §2): log a call, set the next
// follow-up, add a note, send a message from a template, change status or
// source, reassign, close as lost, reopen, archive.

import { useState } from "react";
import { FormDialog } from "../../_components/forms";
import { SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import {
  archiveAction, callAction, changeSourceAction, changeStatusAction, closeLostAction, followUpAction, messageAction, noteAction, reassignAction, reopenAction, restoreAction,
} from "../actions";

type Props = {
  id: string;
  status: string;
  source: string;
  sourceLabel: string;
  closed: boolean;
  lost: boolean;
  archived: boolean;
  full: boolean;
  canArchive: boolean;
  defaultFollowUp: string;
  statuses: Option[];
  sources: Option[];
  owners: Option[];
  lossReasons: Option[];
  outcomes: readonly string[];
  templates: { key: string; label: string; text: string }[];
  hasEmail: boolean;
};

function MessageFields({ templates, hasEmail, f }: { templates: Props["templates"]; hasEmail: boolean; f: { err: (k: string) => string | undefined; val: (k: string, d?: string) => string | undefined } }) {
  const [template, setTemplate] = useState(f.val("template", templates[0]?.key) ?? "");
  const [text, setText] = useState(f.val("text", templates[0]?.text) ?? "");
  return (
    <>
      <SelectField label="Send by" name="channel" required options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, ...(hasEmail ? [{ value: "email", label: "Email" }] : [])]} defaultValue={f.val("channel", "whatsapp")} error={f.err("channel")} />
      <SelectField label="Template" name="template" options={[...templates.map((t) => ({ value: t.key, label: t.label })), { value: "admission-enquiry-message", label: "Write my own" }]} value={template}
        onChange={(e) => { setTemplate(e.target.value); const t = templates.find((x) => x.key === e.target.value); setText(t ? t.text : ""); }} />
      <TextArea label="Message" name="text" required rows={5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} error={f.err("text")} help="Saved in this enquiry's communication history. It cannot be unsent." />
    </>
  );
}

export function PanelActions(p: Props) {
  const hidden = { id: p.id };
  if (p.archived) {
    return p.canArchive ? (
      <FormDialog trigger="Restore" title="Restore this enquiry" action={restoreAction} hidden={hidden} submitLabel="Restore">
        {() => <p>The enquiry comes back to the list with its full history.</p>}
      </FormDialog>
    ) : null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <FormDialog trigger="Log a call" triggerVariant="primary" title="Log a call" action={callAction} hidden={hidden} submitLabel="Save call">
        {(f) => (
          <>
            <SelectField label="Call" name="direction" required options={[{ value: "outgoing", label: "Outgoing (we called)" }, { value: "incoming", label: "Incoming (they called)" }]} defaultValue={f.val("direction", "outgoing")} />
            <SelectField label="How it went" name="outcome" required options={p.outcomes.map((o) => ({ value: o, label: o }))} placeholder="Choose" defaultValue={f.val("outcome")} error={f.err("outcome")} />
            <TextArea label="Note" name="note" maxLength={1000} defaultValue={f.val("note")} error={f.err("note")} />
            {!p.closed && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Next follow-up" name="nextFollowUpAt" type="datetime-local" defaultValue={f.val("nextFollowUpAt", p.defaultFollowUp)} error={f.err("nextFollowUpAt")} />
                <TextField label="Next action" name="nextAction" maxLength={200} defaultValue={f.val("nextAction")} error={f.err("nextAction")} />
              </div>
            )}
          </>
        )}
      </FormDialog>
      {!p.closed && (
        <FormDialog trigger="Set follow-up" title="Next follow-up" action={followUpAction} hidden={hidden} submitLabel="Save follow-up">
          {(f) => (
            <>
              <TextField label="Date and time" name="nextFollowUpAt" type="datetime-local" required defaultValue={f.val("nextFollowUpAt", p.defaultFollowUp)} error={f.err("nextFollowUpAt")} help="The owner gets a reminder at this time." />
              <TextField label="Next action" name="nextAction" maxLength={200} placeholder="Call to fix a school visit" defaultValue={f.val("nextAction")} error={f.err("nextAction")} />
            </>
          )}
        </FormDialog>
      )}
      <FormDialog trigger="Add note" title="Add note" action={noteAction} hidden={hidden} submitLabel="Add note">
        {(f) => <TextArea label="Note" name="text" required rows={4} maxLength={2000} defaultValue={f.val("text")} error={f.err("text")} help="Notes are kept in the activity log and never deleted." />}
      </FormDialog>
      <FormDialog trigger="Send message" title="Send a message" action={messageAction} hidden={hidden} submitLabel="Send" wide>
        {(f) => <MessageFields templates={p.templates} hasEmail={p.hasEmail} f={f} />}
      </FormDialog>
      {!p.closed && (
        <FormDialog trigger="Change status" title="Change status" action={changeStatusAction} hidden={hidden} submitLabel="Change status">
          {(f) => <SelectField label="Status" name="status" required options={p.statuses} defaultValue={f.val("status", p.status)} error={f.err("status")} help="Applied and Admitted are set by School OS. To close as lost, use Close as lost." />}
        </FormDialog>
      )}
      {p.full && (
        <FormDialog trigger="Change source" title="Change source" action={changeSourceAction} hidden={hidden} submitLabel="Change source">
          {(f) => (
            <>
              <p className="text-ink-2">Now: {p.sourceLabel}. The first recorded source stays in the activity log and the source reports.</p>
              <SelectField label="New source" name="source" required options={p.sources} defaultValue={f.val("source", p.source)} error={f.err("source")} />
              <TextArea label="Reason" name="reason" required maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />
            </>
          )}
        </FormDialog>
      )}
      <FormDialog trigger="Reassign" title="Reassign enquiry" action={reassignAction} hidden={hidden} submitLabel="Reassign">
        {(f) => (
          <>
            <SelectField label="New owner" name="ownerStaffId" required options={p.owners} placeholder="Choose" defaultValue={f.val("ownerStaffId")} error={f.err("ownerStaffId")} help="The new owner is told. The history keeps the old and new owner." />
            <TextField label="Reason" name="reason" maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />
          </>
        )}
      </FormDialog>
      {!p.closed && (
        <FormDialog trigger="Close as lost" triggerVariant="danger-outline" title="Close as lost" action={closeLostAction} hidden={hidden} submitLabel="Close as lost" submitVariant="danger">
          {(f) => (
            <>
              <SelectField label="Why was it lost?" name="reason" required options={p.lossReasons} placeholder="Choose" defaultValue={f.val("reason")} error={f.err("reason")} />
              <TextArea label="Note" name="note" maxLength={500} defaultValue={f.val("note")} error={f.err("note")} help="Needed when the reason is Other." />
            </>
          )}
        </FormDialog>
      )}
      {p.lost && (
        <FormDialog trigger="Reopen" title="Reopen enquiry" action={reopenAction} hidden={hidden} submitLabel="Reopen">
          {(f) => <TextField label="Next follow-up" name="nextFollowUpAt" type="datetime-local" required defaultValue={f.val("nextFollowUpAt", p.defaultFollowUp)} error={f.err("nextFollowUpAt")} />}
        </FormDialog>
      )}
      {p.canArchive && (
        <FormDialog trigger="Archive" triggerVariant="ghost" title="Archive this enquiry" action={archiveAction} hidden={hidden} submitLabel="Archive" submitVariant="danger">
          {(f) => (
            <>
              <p>Use this only for an enquiry entered by mistake. It leaves the list and reports but is kept, and can be restored.</p>
              <TextField label="Reason" name="reason" required maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />
            </>
          )}
        </FormDialog>
      )}
    </div>
  );
}
