"use client";

// The buttons of the move-in screens: each says what it will do, shows it is
// working and explains in plain words when something did not happen.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { ActionButton } from "../../action-button";
import { addClassesAction, addOptionsAction, chooseRowAction, goLiveAction, importAction, leaveOutAction, removeAction, tidyAction, undoFileImportAction, undoFixAction } from "./actions";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function TidySwitch({ id, on }: { id: string; on: boolean }) {
  const router = useRouter();
  return <ActionButton label={on ? "Switch tidy-ups off" : "Switch tidy-ups on"} run={async () => { const p = await tidyAction(id, !on); if (!p) router.refresh(); return p; }} />;
}

export function AddClassesButton({ id, words, labels }: { id: string; words: string[]; labels: string[] }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger={`Add ${plural(words.length, "missing class", "missing classes")} to this year`} title="Add these classes and sections to this year?" confirmLabel={`Add ${plural(words.length, "class", "classes")}`}
      onConfirm={async () => { const p = await addClassesAction(id, words); if (!p) router.refresh(); return p; }}>
      <p>They are added in Academic Management with 40 seats each, and the rows are matched to them:</p>
      <p className="mt-2 font-medium text-ink">{labels.slice(0, 12).join(", ")}{labels.length > 12 ? ` and ${labels.length - 12} more` : ""}</p>
      <p className="mt-2">Check the spelling first: a class written wrongly should be matched to the right class instead.</p>
    </ConfirmButton>
  );
}

export function AddOptionsButton({ id, column, words }: { id: string; column: "designation" | "department"; words: string[] }) {
  const router = useRouter();
  const what = column === "designation" ? "designation" : "department";
  return (
    <ConfirmButton trigger={`Add ${plural(words.length, what)} to HR Settings`} title={`Add these ${what}s to HR Settings?`} confirmLabel={`Add ${plural(words.length, what)}`}
      onConfirm={async () => { const p = await addOptionsAction(id, column, words); if (!p) router.refresh(); return p; }}>
      <p className="font-medium text-ink">{words.slice(0, 12).join(", ")}{words.length > 12 ? ` and ${words.length - 12} more` : ""}</p>
      {column === "designation" && <p className="mt-2">New designations have no default role, so logins for these staff are made from their profile later.</p>}
    </ConfirmButton>
  );
}

export function LeaveOutButton({ id, lines, out, label }: { id: string; lines: number[]; out: boolean; label?: string }) {
  const router = useRouter();
  return <ActionButton variant="ghost" label={label ?? (out ? "Leave out" : "Bring back")} run={async () => { const p = await leaveOutAction(id, lines, out); if (!p) router.refresh(); return p; }} />;
}

/** The choices for a row that may already be on record: nothing is merged until one is picked. */
export function RowChoices({ id, line, choices }: { id: string; line: number; choices: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-sm font-medium text-ink">Choose what this row is:</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {choices.map((c) => <ActionButton key={c.value} variant="secondary" label={c.label} run={async () => { const p = await chooseRowAction(id, line, c.value); if (!p) router.refresh(); return p; }} />)}
      </div>
    </div>
  );
}

export function ClearChoiceButton({ id, line }: { id: string; line: number }) {
  const router = useRouter();
  return <ActionButton variant="ghost" label="Change my choice" run={async () => { const p = await chooseRowAction(id, line, ""); if (!p) router.refresh(); return p; }} />;
}

export function UndoFixButton({ id, line }: { id: string; line: number }) {
  const router = useRouter();
  return <ActionButton variant="ghost" label="Undo my fix" run={async () => { const p = await undoFixAction(id, line); if (!p) router.refresh(); return p; }} />;
}

export function ImportButton({ id, ready, problems, label }: { id: string; ready: number; problems: number; label: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger={`Bring in ${plural(ready, label.replace(/s$/, ""), label)}`} triggerVariant="primary" title={`Bring in ${plural(ready, label.replace(/s$/, ""), label)}?`} confirmLabel={`Bring in ${plural(ready, "row")}`}
      onConfirm={async () => { const p = await importAction(id); if (!p) router.refresh(); return p; }}>
      <p>Only the {plural(ready, "ready row")} are imported.{problems ? ` The ${plural(problems, "row")} with problems stay here; fix them and bring them in after.` : ""}</p>
      <p className="mt-2">You can undo the whole import later from this page; what it added is archived, never lost.</p>
    </ConfirmButton>
  );
}

export function RemoveFileButton({ id, imported }: { id: string; imported: boolean }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Remove from list" triggerVariant="ghost" title="Remove this file from the list?" confirmLabel="Remove file"
      onConfirm={async () => { const p = await removeAction(id); if (!p) { router.push("/settings/data-security/switching"); router.refresh(); } return p; }}>
      {imported ? "The records it brought in stay in School OS. To take them out, use Undo import first." : "Nothing from it has been imported. The choices and fixes made for it are dropped."}
    </ConfirmButton>
  );
}

export function UndoImportButton({ id, added, label }: { id: string; added: number; label: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Undo import" triggerVariant="danger-outline" title={`Undo the import of ${plural(added, label.replace(/s$/, ""), label)}?`} confirmLabel={`Undo import of ${plural(added, "record")}`} confirmVariant="danger"
      onConfirm={async () => { const p = await undoFileImportAction(id); if (!p) router.refresh(); return p; }}>
      The {plural(added, "record")} it added are archived, and the file opens again so you can fix it and bring it in again. This is written to the audit log.
    </ConfirmButton>
  );
}

export function GoLiveButton({ students, staff, guardians, owedBefore }: { students: number; staff: number; guardians: number; owedBefore?: { amount: string; students: number } | null }) {
  const router = useRouter();
  const [send, setSend] = useState(true);
  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-1 size-5 accent-[var(--brand)]" />
        <span><span className="font-medium">Send each parent their Parent Link now</span><span className="block text-sm text-ink-2">{plural(guardians, "parent")} get a link to check their child&apos;s details and give consent (DPDP Act 2023).</span></span>
      </label>
      <ConfirmButton trigger="Go live" triggerVariant="primary" title="Go live on School OS?" confirmLabel={send ? "Go live and send Parent Links" : "Go live"} typeToConfirm="go live"
        onConfirm={async () => { const p = await goLiveAction(send); if (!p) router.refresh(); return p; }}>
        <p>School OS becomes your school&apos;s record from today, with {plural(students, "student")} and {plural(staff, "staff member", "staff")}. This summary is kept as it is now.</p>
        <p className="mt-2">Automatic messages to parents, fee reminders and late fees start now.</p>
        {owedBefore && <p className="mt-2 font-medium text-ink">{owedBefore.amount} of fees due before go-live is still owed by {plural(owedBefore.students, "student")}. Reminders and late fees will go for it. Settle it first under “Fees due before go-live” if the old software collected it or it is in the old dues.</p>}
        {send ? <p className="mt-2">Every parent is sent their Parent Link with the consent request, by WhatsApp or SMS as set up in Settings.</p> : <p className="mt-2">Parent Links are not sent now. Send them from Communication, Parent Link, when you are ready.</p>}
      </ConfirmButton>
    </div>
  );
}
