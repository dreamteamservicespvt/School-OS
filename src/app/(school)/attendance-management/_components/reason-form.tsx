"use client";

// Set an absence reason later, from the day's absent list (for example after
// the parent calls back). Only the reason changes, never the mark or the %.

import { useRouter } from "next/navigation";
import { SelectField, TextField } from "@/components/ui/field";
import { FormDialog, type Action } from "../../staff-hr-management/_components/forms";

export function ReasonButton({ action, studentId, date, name, reasons, current, note }: {
  action: Action; studentId: string; date: string; name: string;
  reasons: { key: string; label: string }[]; current: string | null; note: string | null;
}) {
  const router = useRouter();
  return (
    <FormDialog trigger={current && current !== "not-known" ? "Change" : "Set reason"} triggerVariant="secondary" triggerSize="sm"
      title={`Reason for the absence of ${name}`} action={action} submitLabel="Save reason" hidden={{ studentId, date }}
      onSaved={() => router.refresh()}>
      {(f) => (
        <>
          <SelectField label="Reason" name="reason" required error={f.err("reason")} defaultValue={f.val("reason", current ?? "not-known")}
            options={reasons.map((r) => ({ value: r.key, label: r.label }))} />
          <TextField label="Short note" name="note" maxLength={100} defaultValue={f.val("note", note ?? "")} error={f.err("note")}
            help="Needed for Other. For example: the parent called at 11; grandmother unwell." />
          <p className="text-[13px] text-ink3">The mark and the attendance % do not change. The change is kept in the audit log.</p>
        </>
      )}
    </FormDialog>
  );
}
