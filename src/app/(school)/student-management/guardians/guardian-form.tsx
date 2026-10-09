// The Add / edit parent or guardian form (03 §2, "Form fields: Add parent or guardian").
import Link from "next/link";
import type { Guardian } from "@prisma/client";
import { ActionForm, FormArea, FormCheck, FormSelect, FormText } from "@/components/students/action-form";
import { LANGUAGES, RELATIONS } from "@/lib/students/labels";
import type { FormState } from "@/lib/forms";
import { PhoneMatches } from "./phone-matches";

export function GuardianForm({ action, g, studentId, canRestrict, cancelHref }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  g?: Guardian | null;
  studentId: string | null;
  canRestrict: boolean;
  cancelHref: string;
}) {
  const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
  return (
    <ActionForm action={action} submitLabel={g ? "Save parent" : "Add parent"} pendingText="Saving…"
      footer={<Link href={cancelHref} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Cancel</Link>}>
      <PhoneMatches studentId={studentId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect name="relationship" label="Relation" required options={RELATIONS.map((r) => ({ value: r, label: r }))} defaultValue={g?.relationship ?? "Father"} />
        <FormText name="name" label="Full name" required defaultValue={g?.name} autoComplete="off" />
        <FormText name="phone" label="Phone" required type="tel" inputMode="numeric" defaultValue={g?.phone} help="+91. Used for messages and the one-time code for Parent Link." />
        <FormText name="altPhone" label="Other phone" type="tel" inputMode="numeric" defaultValue={g?.altPhone} />
        <FormText name="email" label="Email" type="email" defaultValue={g?.email} />
        <FormText name="occupation" label="Occupation" defaultValue={g?.occupation} />
        <FormText name="dateOfBirth" label="Date of birth" type="date" defaultValue={iso(g?.dateOfBirth)} help="For parents' birthdays on the Dashboard." />
        <FormSelect name="language" label="Message language" required options={LANGUAGES} defaultValue={g?.language ?? "en"} />
        <FormArea name="address" label="Address" rows={2} className="sm:col-span-2" defaultValue={g?.address} />
      </div>
      <FormCheck name="optedOut" label="Opted out of messages" defaultChecked={g?.optedOut ?? false} help="No WhatsApp or SMS except urgent safety messages." />
      {!g && studentId && <FormCheck name="emergency" label="Emergency contact" help="Adds them to the student's emergency contacts." />}
      {!g && studentId && canRestrict && (
        <fieldset className="space-y-3 rounded-xl border border-danger/30 p-4">
          <legend className="px-1 font-semibold">Custody / access restriction</legend>
          <FormCheck name="restricted" label="This person must not collect or contact the student" help="Restricted field. They will not be on the pickup list and show in red in Front Office." />
          <FormArea name="restriction" label="Note" rows={2} />
        </fieldset>
      )}
    </ActionForm>
  );
}
