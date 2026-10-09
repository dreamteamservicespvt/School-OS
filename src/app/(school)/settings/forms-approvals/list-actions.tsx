"use client";

import { useActionState } from "react";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionButton } from "../action-button";
import {
  archiveFieldAction, archiveFormAction, createFormAction, defaultRuleAction, formDetailsAction, moveFieldAction, moveFormFieldAction, publishFormAction, removeFormFieldAction,
} from "./actions";

export function MoveButtons({ id, formId, first, last, label }: { id: string; formId?: string; first: boolean; last: boolean; label: string }) {
  const move = (d: "up" | "down") => (formId ? moveFormFieldAction(formId, id, d) : moveFieldAction(id, d));
  return (
    <span className="inline-flex gap-1">
      {!first && <ActionButton variant="ghost" label={<><span aria-hidden="true">↑</span><span className="sr-only">Move {label} up</span></>} run={() => move("up")} />}
      {!last && <ActionButton variant="ghost" label={<><span aria-hidden="true">↓</span><span className="sr-only">Move {label} down</span></>} run={() => move("down")} />}
    </span>
  );
}

export function ArchiveFieldButton({ id, label, archived }: { id: string; label: string; archived: boolean }) {
  if (archived) return <ActionButton label="Restore" pendingLabel="Restoring…" run={() => archiveFieldAction(id, false)} />;
  return (
    <ConfirmButton trigger="Archive" triggerVariant="ghost" title={`Archive ${label}?`} confirmLabel={`Archive ${label}`} onConfirm={() => archiveFieldAction(id, true)}>
      {label} no longer shows on forms. Answers already given are kept, and you can restore the field later.
    </ConfirmButton>
  );
}

export function RemoveFormFieldButton({ formId, fieldKey, label }: { formId: string; fieldKey: string; label: string }) {
  return (
    <ConfirmButton trigger="Remove" triggerVariant="ghost" title={`Remove ${label}?`} confirmLabel={`Remove ${label}`} onConfirm={() => removeFormFieldAction(formId, fieldKey)}>
      The field leaves this draft. Answers to versions already published are kept.
    </ConfirmButton>
  );
}

export function PublishButton({ formId, name, fields }: { formId: string; name: string; fields: number }) {
  return (
    <ConfirmButton trigger="Publish" triggerVariant="primary" title={`Publish ${name}?`} confirmLabel={`Publish ${name}`} onConfirm={() => publishFormAction(formId)}>
      The form with its {fields} field{fields === 1 ? "" : "s"} becomes the version people fill in. Answers already given stay with the version they were given on.
    </ConfirmButton>
  );
}

export function ArchiveFormButton({ formId, name, archived }: { formId: string; name: string; archived: boolean }) {
  if (archived) return <ActionButton label="Restore" pendingLabel="Restoring…" run={() => archiveFormAction(formId, false)} />;
  return (
    <ConfirmButton trigger="Archive" triggerVariant="ghost" title={`Archive ${name}?`} confirmLabel={`Archive ${name}`} onConfirm={() => archiveFormAction(formId, true)}>
      Nobody can fill in {name} any more. Answers already given are kept. You can restore it later.
    </ConfirmButton>
  );
}

export function DefaultRuleButton({ type, label }: { type: string; label: string }) {
  return (
    <ConfirmButton trigger="Use the default rule" triggerVariant="ghost" title={`Use the default rule for ${label}?`} confirmLabel="Use the default rule" onConfirm={() => defaultRuleAction(type)}>
      Your school&apos;s rule for {label} is set aside and the default is used for new requests. Requests already waiting keep their approver.
    </ConfirmButton>
  );
}

const ABOUT = [
  { value: "general", label: "Anyone (general form)" },
  { value: "student", label: "A student" },
  { value: "guardian", label: "A parent or guardian" },
  { value: "staff", label: "A staff member" },
  { value: "enquiry", label: "An enquiry" },
];

export function FormDetailsForm({ formId, name, description, aboutType }: { formId?: string; name: string; description: string; aboutType: string }) {
  const [state, action] = useActionState(formId ? formDetailsAction : createFormAction, null);
  return (
    <form action={action} className="space-y-4">
      {formId && <input type="hidden" name="formId" value={formId} />}
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Form name" name="name" required maxLength={80} defaultValue={state?.values?.name ?? name} error={state?.errors?.name} placeholder="For example: Teacher appraisal" />
        <SelectField label="The form is about" name="aboutType" required options={ABOUT} defaultValue={state?.values?.aboutType ?? aboutType} error={state?.errors?.aboutType} />
      </div>
      <TextArea label="Description" name="description" rows={2} maxLength={500} defaultValue={state?.values?.description ?? description} help="Shown at the top of the form. Optional." />
      <SubmitButton variant={formId ? "secondary" : "primary"} pendingText="Saving…">{formId ? "Save details" : "Create form"}</SubmitButton>
    </form>
  );
}
