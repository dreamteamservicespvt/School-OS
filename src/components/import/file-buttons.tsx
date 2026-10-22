"use client";

// The buttons for a file being brought in, on every import page (Settings,
// Switching to School OS, and each module's own Import page): each says what
// it will do, shows it is working and explains in plain words when
// something did not happen. "place" says which page the person is on.

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { ActionButton } from "@/app/(school)/settings/action-button";
import {
  addClassesAction, addOptionsAction, chooseRowAction, importAction, leaveOutAction, removeAction, tidyAction, undoBatchAction, undoFileImportAction, undoFixAction,
} from "@/app/(school)/_imports/file-actions";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type OnFile = { place: string; id: string };

export function TidySwitch({ place, id, on }: OnFile & { on: boolean }) {
  const router = useRouter();
  return <ActionButton label={on ? "Switch tidy-ups off" : "Switch tidy-ups on"} run={async () => { const p = await tidyAction(place, id, !on); if (!p) router.refresh(); return p; }} />;
}

export function AddClassesButton({ place, id, words, labels }: OnFile & { words: string[]; labels: string[] }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger={`Add ${plural(words.length, "missing class", "missing classes")} to this year`} title="Add these classes and sections to this year?" confirmLabel={`Add ${plural(words.length, "class", "classes")}`}
      onConfirm={async () => { const p = await addClassesAction(place, id, words); if (!p) router.refresh(); return p; }}>
      <p>They are added in Academic Management with 40 seats each, and the rows are matched to them:</p>
      <p className="mt-2 font-medium text-ink">{labels.slice(0, 12).join(", ")}{labels.length > 12 ? ` and ${labels.length - 12} more` : ""}</p>
      <p className="mt-2">Check the spelling first: a class written wrongly should be matched to the right class instead.</p>
    </ConfirmButton>
  );
}

export function AddOptionsButton({ place, id, column, words }: OnFile & { column: "designation" | "department"; words: string[] }) {
  const router = useRouter();
  const what = column === "designation" ? "designation" : "department";
  return (
    <ConfirmButton trigger={`Add ${plural(words.length, what)} to HR Settings`} title={`Add these ${what}s to HR Settings?`} confirmLabel={`Add ${plural(words.length, what)}`}
      onConfirm={async () => { const p = await addOptionsAction(place, id, column, words); if (!p) router.refresh(); return p; }}>
      <p className="font-medium text-ink">{words.slice(0, 12).join(", ")}{words.length > 12 ? ` and ${words.length - 12} more` : ""}</p>
      {column === "designation" && <p className="mt-2">New designations have no default role, so logins for these staff are made from their profile later.</p>}
    </ConfirmButton>
  );
}

export function LeaveOutButton({ place, id, lines, out, label }: OnFile & { lines: number[]; out: boolean; label?: string }) {
  const router = useRouter();
  return <ActionButton variant="ghost" label={label ?? (out ? "Leave out" : "Bring back")} run={async () => { const p = await leaveOutAction(place, id, lines, out); if (!p) router.refresh(); return p; }} />;
}

/** The choices for a row that may already be on record: nothing is merged until one is picked. */
export function RowChoices({ place, id, line, choices }: OnFile & { line: number; choices: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-sm font-medium text-ink">Choose what this row is:</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {choices.map((c) => <ActionButton key={c.value} variant="secondary" label={c.label} run={async () => { const p = await chooseRowAction(place, id, line, c.value); if (!p) router.refresh(); return p; }} />)}
      </div>
    </div>
  );
}

export function ClearChoiceButton({ place, id, line }: OnFile & { line: number }) {
  const router = useRouter();
  return <ActionButton variant="ghost" label="Change my choice" run={async () => { const p = await chooseRowAction(place, id, line, ""); if (!p) router.refresh(); return p; }} />;
}

export function UndoFixButton({ place, id, line }: OnFile & { line: number }) {
  const router = useRouter();
  return <ActionButton variant="ghost" label="Undo my fix" run={async () => { const p = await undoFixAction(place, id, line); if (!p) router.refresh(); return p; }} />;
}

export function ImportButton({ place, id, ready, problems, one, many }: OnFile & { ready: number; problems: number; one: string; many: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger={`Bring in ${plural(ready, one, many)}`} triggerVariant="primary" title={`Bring in ${plural(ready, one, many)}?`} confirmLabel={`Bring in ${plural(ready, "row")}`}
      onConfirm={async () => { const p = await importAction(place, id); if (!p) router.refresh(); return p; }}>
      <p>Only the {plural(ready, "ready row")} are imported.{problems ? ` The ${plural(problems, "row")} with problems stay here; fix them and bring them in after.` : ""}</p>
      <p className="mt-2">You can undo the whole import later from this page; what it added is archived, never lost.</p>
    </ConfirmButton>
  );
}

export function RemoveFileButton({ place, id, imported, back }: OnFile & { imported: boolean; back: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Remove from list" triggerVariant="ghost" title="Remove this file from the list?" confirmLabel="Remove file"
      onConfirm={async () => { const p = await removeAction(place, id); if (!p) { router.push(back); router.refresh(); } return p; }}>
      {imported ? "The records it brought in stay in School OS. To take them out, use Undo import first." : "Nothing from it has been imported. The choices and fixes made for it are dropped."}
    </ConfirmButton>
  );
}

export function UndoImportButton({ place, id, added, one, many }: OnFile & { added: number; one: string; many: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Undo import" triggerVariant="danger-outline" title={`Undo the import of ${plural(added, one, many)}?`} confirmLabel={`Undo import of ${plural(added, "record")}`} confirmVariant="danger"
      onConfirm={async () => { const p = await undoFileImportAction(place, id); if (!p) router.refresh(); return p; }}>
      The {plural(added, "record")} it added are archived, and the file opens again so you can fix it and bring it in again. This is written to the audit log.
    </ConfirmButton>
  );
}

/** Undo for an earlier import in a page's history: taken back as a whole, and its file opens again. */
export function UndoBatchButton({ place, batchId, label, added, one, many }: { place: string; batchId: string; label: string; added: number; one: string; many: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Undo this import" triggerVariant="danger-outline" title={`Undo this import of ${label.toLowerCase()}?`} confirmLabel={`Undo import of ${plural(added, one, many)}`} confirmVariant="danger"
      onConfirm={async () => { const p = await undoBatchAction(place, batchId); if (!p) router.refresh(); return p; }}>
      The {plural(added, one, many)} it brought in are taken back as a whole and the import stays in the history. This is written to the audit log.
    </ConfirmButton>
  );
}
