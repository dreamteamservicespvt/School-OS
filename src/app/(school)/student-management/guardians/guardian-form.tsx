// The Add / edit parent or guardian form (03 §2, "Form fields: Add parent or guardian").
import { SMS_OFFERED } from "@/lib/messaging/sms-offered";
import Link from "next/link";
import type { Guardian } from "@prisma/client";
import { ActionForm, FormArea, FormCheck, FormSelect, FormText } from "@/components/students/action-form";
import { LANGUAGES, RELATIONS } from "@/lib/students/labels";
import type { FormState } from "@/lib/forms";
import { PhoneMatches } from "./phone-matches";
import { Words } from "@/lib/i18n/client";

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
      footer={<Link href={cancelHref} className="inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-semibold text-ink2 transition hover:bg-sunken hover:text-ink"><Words k="Cancel" /></Link>}>
      <PhoneMatches studentId={studentId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect name="relationship" label="Relation" required options={RELATIONS.map((r) => ({ value: r, label: r }))} defaultValue={g?.relationship ?? "Father"} />
        <FormText name="name" label="Full name" required defaultValue={g?.name} autoComplete="off" />
        <FormText name="phone" label="Phone" required type="tel" inputMode="numeric" defaultValue={g?.phone} help="+91. For messages and Parent Link codes." />
        {g && <FormCheck name="sendLink" label="If the phone changes, send Parent Link to the new number" defaultChecked help="Parent Link is the parents' app." />}
        <FormText name="altPhone" label="Other phone" type="tel" inputMode="numeric" defaultValue={g?.altPhone} />
        <FormText name="email" label="Email" type="email" defaultValue={g?.email} />
        <FormText name="occupation" label="Occupation" defaultValue={g?.occupation} />
        <FormText name="dateOfBirth" label="Date of birth" type="date" defaultValue={iso(g?.dateOfBirth)} />
        <FormSelect name="language" label="Message language" required options={LANGUAGES} defaultValue={g?.language ?? "en"} />
        <FormArea name="address" label="Address" rows={2} className="sm:col-span-2" defaultValue={g?.address} />
      </div>
      <FormCheck name="optedOut" label="Opted out of messages" defaultChecked={g?.optedOut ?? false} help={SMS_OFFERED ? "No WhatsApp or SMS except urgent safety messages." : "No WhatsApp messages except urgent safety messages."} />
      {!g && studentId && <FormCheck name="emergency" label="Emergency contact" />}
      {!g && studentId && canRestrict && (
        <fieldset className="space-y-3 rounded-xl border border-danger/30 p-4">
          <legend className="px-1 font-semibold"><Words k="Custody / access restriction" /></legend>
          <FormCheck name="restricted" label="This person must not collect or contact the student" help="Shown in red at Front Office. No pickup, Parent Link or messages." />
          <FormArea name="restriction" label="Note" rows={2} />
        </fieldset>
      )}
    </ActionForm>
  );
}
