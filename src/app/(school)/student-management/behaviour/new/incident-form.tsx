"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, FormArea, FormCheck, FormText } from "@/components/students/action-form";
import { StudentPicker } from "@/components/students/student-picker";
import type { PickedStudent } from "../../_actions/lookup";
import { reportIncidentAction } from "../../_actions/behaviour";

type Type = { key: string; label: string; kind: string; points: number };

export function IncidentForm({ types, sections, initial, today, pointsOn, back }: {
  types: Type[]; sections: { value: string; label: string }[]; initial: PickedStudent[]; today: string; pointsOn: boolean; back: "profile" | "list";
}) {
  const [typeKey, setTypeKey] = useState(types.find((t) => t.kind === "incident")?.key ?? types[0]?.key ?? "");
  const type = types.find((t) => t.key === typeKey);
  const kinds = [
    { kind: "incident", label: "Incident" }, { kind: "warning", label: "Warning" }, { kind: "suspension", label: "Suspension" },
    { kind: "reward", label: "Reward" }, { kind: "recognition", label: "Recognition" },
  ].filter((k) => types.some((t) => t.kind === k.kind));
  return (
    <ActionForm action={reportIncidentAction} submitLabel="Save" pendingText="Saving…"
      footer={<Link href={back === "profile" && initial[0] ? `/student-management/students/${initial[0].id}?tab=behaviour` : "/student-management/behaviour"} className="inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-semibold text-ink2 transition hover:bg-sunken hover:text-ink">Cancel</Link>}>
      <input type="hidden" name="back" value={back} />
      <StudentPicker name="studentIds" label="Student(s)" multiple sections={sections} initial={initial} help="One or more, from your classes." />
      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold text-ink2">Type<span className="text-bad" aria-hidden="true"> *</span></legend>
        <input type="hidden" name="typeKey" value={typeKey} />
        <div className="space-y-2">
          {kinds.map((k) => (
            <div key={k.kind}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink2">{k.label}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {types.filter((t) => t.kind === k.kind).map((t) => (
                  <button key={t.key} type="button" aria-pressed={t.key === typeKey} onClick={() => setTypeKey(t.key)}
                    className={`min-h-11 rounded-full border px-4 text-[15px] ${t.key === typeKey ? "border-brand bg-brand/8 font-medium text-brand" : "border-line bg-surface hover:bg-sunken"}`}>
                    {t.label}{pointsOn && t.points ? ` (${t.points > 0 ? "+" : ""}${t.points})` : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <FormArea name="description" label="What happened" required rows={2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormText name="date" label="Date" type="date" required max={today} defaultValue={today} />
        {pointsOn && <FormText key={typeKey} name="points" label="Points" inputMode="numeric" defaultValue={type?.points ?? 0} help="From the type; change if needed." />}
      </div>
      {type?.kind === "suspension" && (
        <fieldset className="grid gap-4 rounded-xl border border-danger/30 p-4 sm:grid-cols-2">
          <legend className="px-1 font-semibold">Suspension</legend>
          <FormText name="suspensionFrom" label="From" type="date" required defaultValue={today} />
          <FormText name="suspensionTo" label="To" type="date" required defaultValue={today} />
          <FormText name="approvedBy" label="Approved by" required className="sm:col-span-2" help="As written on the letter, for example the Principal." />
        </fieldset>
      )}
      <FormText name="actionTaken" label="Action taken" />
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand">Add a photo</summary>
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Photo" className="mt-1 block w-full rounded-xl border border-line bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-brand/10 file:px-3 file:text-brand" />
      </details>
      <FormCheck name="informParent" label="Inform parent" help="Sends a message to the primary contact using the school's template (when messaging is set up in Communication)." />
    </ActionForm>
  );
}
