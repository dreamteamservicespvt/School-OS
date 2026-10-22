"use client";

// Add or change one field: a custom field on a record, or a field of a custom form.
import { useActionState, useEffect, useState } from "react";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { FIELD_TYPES, checkFieldDefinition, type CustomFieldDef } from "@/lib/custom-field-rules";
import { fieldAction, formFieldAction } from "./actions";
import { Words } from "@/lib/i18n/client";

type Props = {
  mode: "record" | "form";
  /** The record type (custom fields) or form id (form fields). */
  owner: string;
  others: CustomFieldDef[];
  field?: CustomFieldDef;
  trigger: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
};

export function FieldEditor({ mode, owner, others, field, trigger, triggerVariant = "secondary" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={triggerVariant} onClick={() => setOpen(true)}>{trigger}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={field ? `Change ${field.label}` : "Add a field"}>
        <FieldForm mode={mode} owner={owner} others={others} field={field} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function FieldForm({ mode, owner, others, field, onDone }: Omit<Props, "trigger" | "triggerVariant"> & { onDone: () => void }) {
  const [state, action] = useActionState(mode === "record" ? fieldAction : formFieldAction, null);
  const v = (k: string, d: string) => state?.values?.[k] ?? d;
  const [label, setLabel] = useState(v("label", field?.label ?? ""));
  const [type, setType] = useState(v("fieldType", field?.fieldType ?? "text"));
  const [choices, setChoices] = useState(v("choices", field?.choices.join("\n") ?? ""));
  const [showField, setShowField] = useState(v("showWhenField", field?.showWhen?.fieldKey ?? ""));
  const [showValue, setShowValue] = useState(v("showWhenValue", field?.showWhen?.equals ?? ""));
  const [checked, setChecked] = useState<Record<string, string>>({});
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);

  const parents = others.filter((o) => !o.archived && (o.fieldType === "choice" || o.fieldType === "yesno") && o.key !== field?.key);
  const parent = parents.find((p) => p.key === showField);
  const draft = () => ({ label, fieldType: type, required: false, choices: choices.split("\n"), showWhen: showField ? { fieldKey: showField, equals: showValue } : null });
  const errors = { ...checked, ...(state?.errors ?? {}) };

  return (
    <form action={action} className="space-y-4" noValidate onSubmit={(e) => {
      const found = checkFieldDefinition(draft(), others.filter((o) => o.key !== field?.key));
      setChecked(found);
      if (Object.keys(found).length) e.preventDefault();
    }}>
      {mode === "record" ? <input type="hidden" name="recordType" value={owner} /> : <input type="hidden" name="formId" value={owner} />}
      {field && (mode === "record" ? <input type="hidden" name="id" value={field.id} /> : <input type="hidden" name="fieldKey" value={field.key} />)}
      <FormMessage state={state?.ok ? null : state} />
      <TextField label="Label" name="label" required value={label} maxLength={80} error={errors.label} onChange={(e) => setLabel(e.target.value)}
        onBlur={() => setChecked((c) => ({ ...c, label: checkFieldDefinition(draft(), others.filter((o) => o.key !== field?.key)).label ?? "" }))} />
      <SelectField label="Type" name="fieldType" required value={type} disabled={Boolean(field)} options={FIELD_TYPES} onChange={(e) => setType(e.target.value)} error={errors.fieldType}
        help={field ? "The type cannot change once saved, because answers already given must still fit." : undefined} />
      {field && <input type="hidden" name="fieldType" value={type} />}
      {type === "choice" && (
        <TextArea label="Choices" name="choices" required rows={4} value={choices} onChange={(e) => setChoices(e.target.value)} error={errors.choices} help="One per line. At least 2." />
      )}
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="required" defaultChecked={v("required", field?.required ? "on" : "") === "on"} className="size-5 accent-brand" />
        <span><Words k="Required" /> <span className="text-sm text-ink-2"><Words k="(only when the field is shown)" /></span></span>
      </label>
      {mode === "record" ? (
        <SelectField label="Visible to" name="visibility" required defaultValue={v("visibility", field?.visibility ?? "everyone")}
          options={[{ value: "everyone", label: "Everyone who can see the record" }, { value: "restricted", label: "Restricted: School Admin and Principal only" }]} />
      ) : (
        <TextField label="Help text" name="help" maxLength={200} defaultValue={v("help", field?.help ?? "")} error={errors.help} help="Shown under the field. Optional." />
      )}
      <fieldset className="rounded-xl border border-line p-3">
        <legend className="px-1 text-sm font-medium"><Words k="Show only when (optional)" /></legend>
        {parents.length === 0 ? (
          <p className="text-sm text-ink-2"><Words k="Add a choice or yes-or-no field first; then this field can show only for one of its answers." /></p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Another field" name="showWhenField" value={showField} onChange={(e) => { setShowField(e.target.value); setShowValue(""); }}
              options={parents.map((p) => ({ value: p.key, label: p.label }))} placeholder="Always show" error={errors.showWhenField} />
            {parent && (
              <SelectField label="Has the answer" name="showWhenValue" required value={showValue} onChange={(e) => setShowValue(e.target.value)}
                options={parent.fieldType === "yesno" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : parent.choices.map((c) => ({ value: c, label: c }))}
                placeholder="Choose the answer" error={errors.showWhenValue} />
            )}
          </div>
        )}
      </fieldset>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}><Words k="Cancel" /></Button>
        <SubmitButton pendingText="Saving…">{field ? "Save field" : "Add field"}</SubmitButton>
      </div>
    </form>
  );
}
