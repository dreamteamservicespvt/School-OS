"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/field";
import { FormDialog } from "../../academic-management/_components/form-dialog";
import { archiveExamAction, publishDatesheetAction, restoreExamAction, saveCategoriesAction, makeSeatingAction } from "./actions";

export function PublishButton({ examId, title, papers, firstDay }: { examId: string; title: string; papers: number; firstDay: string }) {
  const router = useRouter();
  const [tell, setTell] = useState(true);
  return (
    <ConfirmButton trigger="Publish" triggerVariant="primary" title={`Publish ${title}?`} confirmLabel="Publish datesheet"
      onConfirm={async () => { const e = await publishDatesheetAction(examId, tell); if (!e) router.refresh(); return e; }}>
      <p>{papers} papers from {firstDay} will go on the School Calendar and the Time Table. Admit cards can then be printed, invigilators are told, and parents see the datesheet on Parent Link.</p>
      <CheckboxField className="mt-3" label="Message parents now" name="tellParents" checked={tell} onChange={(e) => setTell(e.target.checked)}
        help="One message to each family. Reminders also go the day before each exam." />
    </ConfirmButton>
  );
}

export function ArchiveButton({ examId, title }: { examId: string; title: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Archive" triggerVariant="danger-outline" title={`Archive ${title}?`} confirmLabel="Archive datesheet" confirmVariant="danger"
      onConfirm={async () => { const e = await archiveExamAction(examId); if (!e) router.push("/examination-results/datesheet"); return e; }}>
      <p>The datesheet leaves the list and its exam days come off the School Calendar and Parent Link. You can restore it from the archived list.</p>
    </ConfirmButton>
  );
}

export function RestoreButton({ examId }: { examId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); const e = await restoreExamAction(examId); setBusy(false); if (e) setError(e); else router.refresh(); }}>Restore</Button>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

type Cat = { name: string; max: string };

export function CategoriesButton({ entryId, subject, maxMarks, current, names, classes }: { entryId: string; subject: string; maxMarks: number; current: { name: string; max: number }[]; names: string[]; classes: number }) {
  const start: Cat[] = current.length ? current.map((c) => ({ name: c.name, max: String(c.max) })) : [{ name: "Theory", max: String(Math.round(maxMarks * 0.8)) }, { name: "Internal", max: String(maxMarks - Math.round(maxMarks * 0.8)) }];
  const [cats, setCats] = useState<Cat[]>(start);
  const sum = cats.reduce((s, c) => s + (Number(c.max) || 0), 0);
  const listId = `cats-${entryId}`;
  return (
    <FormDialog trigger={current.length ? "Change categories" : "Mark categories"} triggerSize="sm" title={`Mark categories: ${subject}`} action={saveCategoriesAction} submitLabel="Save categories" hidden={{ entryId }}>
      {() => (
        <>
          <p className="text-ink-2">Split the {maxMarks} marks, for example Theory 80 and Internal 20. Teachers then enter each part and the total is worked out. Remove every row to go back to one mark out of {maxMarks}.</p>
          <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
          <ul className="space-y-2">
            {cats.map((c, i) => (
              <li key={i} className="flex items-end gap-2">
                <label className="flex-1 text-sm">Category
                  <input name="catName" list={listId} value={c.name} maxLength={30} onChange={(e) => setCats(cats.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3" />
                </label>
                <label className="w-24 text-sm">Out of
                  <input name="catMax" type="number" inputMode="numeric" min={1} value={c.max} onChange={(e) => setCats(cats.map((x, k) => (k === i ? { ...x, max: e.target.value } : x)))} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3" />
                </label>
                <Button variant="ghost" aria-label={`Remove ${c.name || "this row"}`} onClick={() => setCats(cats.filter((_, k) => k !== i))}>Remove</Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCats([...cats, { name: "", max: "" }])}>Add a category</Button>
            {cats.length > 0 && <p className={`text-sm ${sum === maxMarks ? "text-success" : "text-danger"}`} aria-live="polite">Adds up to {sum} of {maxMarks}</p>}
          </div>
          {classes > 1 && <CheckboxField label={`Use this split for ${subject} in every class of this exam`} name="allClasses" defaultChecked />}
        </>
      )}
    </FormDialog>
  );
}

type Room = { name: string; seats: string };

export function SeatingButton({ examId, sittings, rooms: startRooms }: { examId: string; sittings: { key: string; label: string; classes: string[] }[]; rooms: string[] }) {
  const [rooms, setRooms] = useState<Room[]>(startRooms.length ? startRooms.map((r) => ({ name: r, seats: "40" })) : [{ name: "", seats: "40" }]);
  const [sitting, setSitting] = useState(sittings[0]?.key ?? "");
  const total = rooms.reduce((s, r) => s + (Number(r.seats) || 0), 0);
  return (
    <FormDialog trigger="Make seat plan" triggerVariant="primary" title="Make a seat plan" action={makeSeatingAction} submitLabel="Make seat plan" hidden={{ examId }} wide>
      {() => (
        <>
          <label className="block text-sm font-medium">Sitting
            <select name="sitting" value={sitting} onChange={(e) => setSitting(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 font-normal">
              {sittings.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.classes.join(", ")})</option>)}
            </select>
          </label>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Rooms and seats</legend>
            <ul className="space-y-2">
              {rooms.map((r, i) => (
                <li key={i} className="flex items-end gap-2">
                  <label className="flex-1 text-sm">Room<input name="roomName" value={r.name} maxLength={40} placeholder="Room 12" onChange={(e) => setRooms(rooms.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3" /></label>
                  <label className="w-24 text-sm">Seats<input name="roomSeats" type="number" inputMode="numeric" min={1} max={500} value={r.seats} onChange={(e) => setRooms(rooms.map((x, k) => (k === i ? { ...x, seats: e.target.value } : x)))} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3" /></label>
                  <Button variant="ghost" aria-label={`Remove ${r.name || "this room"}`} onClick={() => setRooms(rooms.filter((_, k) => k !== i))} disabled={rooms.length === 1}>Remove</Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="secondary" size="sm" onClick={() => setRooms([...rooms, { name: "", seats: "40" }])}>Add a room</Button>
              <span className="text-sm text-ink-2">{total} seats</span>
            </div>
          </fieldset>
          <CheckboxField label="Mix classes" name="mix" defaultChecked help="Students of different classes sit next to each other, so neighbours write different papers." />
          <p className="text-sm text-ink-2">Seats go by class and roll number. Making the plan again for the same sitting replaces the old one.</p>
        </>
      )}
    </FormDialog>
  );
}
