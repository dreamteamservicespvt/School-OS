"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { CheckboxField, TextArea } from "@/components/ui/field";
import { FormDialog, err, v } from "../../academic-management/_components/form-dialog";
import { cancelScheduledAction, publishAction, unpublishAction } from "./actions";

type Sec = { id: string; label: string; ready: boolean; problems: string[]; published: boolean; scheduled: string | null };

export function PublishButton({ keyName, title, sections, chosen, nowLocal }: { keyName: string; title: string; sections: Sec[]; chosen: string; nowLocal: string }) {
  const [when, setWhen] = useState<"now" | "later">("now");
  const open = sections.filter((s) => !s.published && !s.scheduled);
  return (
    <FormDialog trigger="Publish results" triggerVariant="primary" title={`Publish ${title}`} action={publishAction} submitLabel={when === "now" ? "Publish now" : "Set publish date"} hidden={{ key: keyName }} wide>
      {(state) => (
        <>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Sections</legend>
            {open.length === 0 && <p className="text-ink-2">Every section is already published or has a publish date.</p>}
            <ul className="space-y-2">
              {open.map((s) => (
                <li key={s.id}>
                  <label className={`flex items-start gap-3 rounded-lg border p-3 ${s.ready ? "border-line" : "border-danger/40 bg-danger-soft/40"}`}>
                    <input type="checkbox" name="sectionIds" value={s.id} defaultChecked={s.ready && (s.id === chosen || open.length <= 8)} disabled={!s.ready} className="mt-0.5 size-5 accent-[var(--brand)]" />
                    <span>
                      <span className="font-medium">{s.label}</span>
                      {s.ready ? <span className="block text-sm text-success">Complete, ready to publish</span> : <span className="block text-sm text-danger">{s.problems.join(" ")}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {err(state, "sectionIds") && <p className="mt-1 text-sm text-danger">{err(state, "sectionIds")}</p>}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Publish on</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} className="size-5 accent-[var(--brand)]" /> Now</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="when" value="later" checked={when === "later"} onChange={() => setWhen("later")} className="size-5 accent-[var(--brand)]" /> On a date and time</label>
            {when === "later" && (
              <div>
                <input type="datetime-local" name="publishOn" min={nowLocal} defaultValue={v(state, "publishOn", nowLocal)} aria-label="Publish date and time" className="h-11 rounded-lg border border-line-strong bg-surface px-3" />
                {err(state, "publishOn") && <p className="mt-1 text-sm text-danger">{err(state, "publishOn")}</p>}
                <p className="mt-1 text-sm text-ink-2">Results publish by themselves then, if every mark is still complete.</p>
              </div>
            )}
          </fieldset>
          <CheckboxField label="Message parents" name="messageParents" defaultChecked help='One message to each family, using the "Results published" template. The report card appears on Parent Link.' />
          <p className="text-sm text-ink-2">Publishing locks the marks of these sections. A change after that needs a reason and an approval.</p>
        </>
      )}
    </FormDialog>
  );
}

export function UnpublishButton({ keyName, title, sections }: { keyName: string; title: string; sections: { id: string; label: string }[] }) {
  return (
    <FormDialog trigger="Unpublish" triggerVariant="danger-outline" title={`Unpublish ${title}`} action={unpublishAction} submitLabel="Unpublish results" hidden={{ key: keyName }} danger>
      {(state) => (
        <>
          <p className="text-ink-2">The results go back to draft and the report cards come off Parent Link until they are published again. Parents are not messaged.</p>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Sections</legend>
            {sections.map((s) => <label key={s.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="sectionIds" value={s.id} defaultChecked={sections.length === 1} className="size-5 accent-[var(--brand)]" /> {s.label}</label>)}
          </fieldset>
          <TextArea label="Reason" name="reason" required rows={3} defaultValue={v(state, "reason")} error={err(state, "reason")} help="For example: Science marks of 7 B were entered for the wrong exam." />
        </>
      )}
    </FormDialog>
  );
}

export function CancelScheduleButton({ id, when }: { id: string; when: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Cancel publish date" title="Cancel the publish date?" confirmLabel="Cancel publish date"
      onConfirm={async () => { const e = await cancelScheduledAction(id); if (!e) router.refresh(); return e; }}>
      <p>The results were set to publish on {when}. They stay in draft until you publish them.</p>
    </ConfirmButton>
  );
}
