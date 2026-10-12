"use client";

import { SelectField, TextField } from "@/components/ui/field";
import { FormDialog, type Action } from "../_components/forms";
import { Upload } from "lucide-react";

type Option = { value: string; label: string };

/** Upload a staff document; with replace, renews an expired one or adds the missing file. */
export function UploadDocumentForm({ staffOptions, types, action, fixedStaffId, replace }: {
  staffOptions: Option[]; types: string[]; action: Action; fixedStaffId?: string; replace?: { id: string; kind: string };
}) {
  const hidden: Record<string, string> = {};
  if (fixedStaffId) hidden.staffId = fixedStaffId;
  if (replace) { hidden.replaceId = replace.id; hidden.kind = replace.kind; }
  return (
    <FormDialog trigger={<><Upload size={replace ? 15 : 17} aria-hidden="true" />{replace ? "Renew" : "Upload document"}</>} triggerSize={replace ? "sm" : "md"} triggerVariant={replace ? "secondary" : "primary"}
      title={replace ? `Renew ${replace.kind}` : "Upload document"} action={action} submitLabel="Save document" pendingText="Uploading…" hidden={hidden} multipart>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {!fixedStaffId && <SelectField label="Staff member" name="staffId" required options={staffOptions} placeholder="Choose" defaultValue={f.val("staffId")} error={f.err("staffId")} className="sm:col-span-2" />}
          {!replace && (
            <>
              <TextField label="Document type" name="kind" required list="staff-doc-types" defaultValue={f.val("kind")} error={f.err("kind")} help="Choose from the list or type another." />
              <datalist id="staff-doc-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
            </>
          )}
          <TextField label="Number on the document" name="number" defaultValue={f.val("number")} error={f.err("number")} help="Optional. ID numbers show only the last 4 digits to others." />
          <TextField label="Issue date" name="issuedOn" type="date" defaultValue={f.val("issuedOn")} error={f.err("issuedOn")} />
          <TextField label="Expiry date" name="expiresOn" type="date" defaultValue={f.val("expiresOn")} error={f.err("expiresOn")} help="Leave empty if it never expires. Reminders go before this date." />
          <div className="sm:col-span-2">
            <label htmlFor="doc-file" className="mb-1 block text-sm font-medium">File <span className="text-danger" aria-hidden="true">*</span></label>
            <input id="doc-file" name="file" type="file" required accept="image/jpeg,image/png,application/pdf" className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-sm" aria-describedby="doc-file-help" />
            <p id="doc-file-help" className={`mt-1 text-sm ${f.err("file") ? "text-danger" : "text-ink-2"}`}>{f.err("file") ?? "PDF, JPG or PNG, up to 10 MB."}</p>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
