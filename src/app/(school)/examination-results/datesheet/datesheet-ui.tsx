"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarDays, CircleAlert, IdCard, Pencil, Plus, Printer, Send, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { MenuItem, MenuLink, MoreMenu } from "@/components/ui/kit-client";
import { ActionSheet, SwitchField } from "../_components/sheets";
import { archiveExamAction, publishDatesheetAction, restoreExamAction, saveCategoriesForm, makeSeatingForm } from "./actions";

/** The "..." menu on a datesheet card: print, edit, archive or restore. */
export function DatesheetMenu({ examId, title, archived, writable, printHref, editHref, hasResults }: { examId: string; title: string; archived: boolean; writable: boolean; printHref: string; editHref: string; hasResults: boolean }) {
  const [sheet, setSheet] = useState<"archive" | "restore" | null>(null);
  return (
    <>
      <MoreMenu size="sm" label={`More actions for ${title}`}>
        <MenuLink href={printHref} external icon={<Printer size={17} />}>Print datesheet</MenuLink>
        {writable && !archived && <MenuLink href={editHref} icon={<Pencil size={17} />}>{hasResults ? "Change title" : "Edit"}</MenuLink>}
        {writable && !archived && !hasResults && <MenuItem onSelect={() => setSheet("archive")} icon={<Archive size={17} />} tone="bad">Archive</MenuItem>}
        {writable && archived && <MenuItem onSelect={() => setSheet("restore")} icon={<ArchiveRestore size={17} />}>Restore</MenuItem>}
      </MoreMenu>
      <ArchiveSheet examId={examId} title={title} open={sheet === "archive"} onClose={() => setSheet(null)} />
      <ActionSheet open={sheet === "restore"} onClose={() => setSheet(null)} title={`Restore ${title}?`} confirmLabel="Restore datesheet" confirmIcon={<ArchiveRestore size={17} />}
        run={() => restoreExamAction(examId)}>
        <p>The datesheet comes back to the list. If it was published, its exam days go back on the School Calendar and Parent Link.</p>
      </ActionSheet>
    </>
  );
}

export function ArchiveSheet({ examId, title, open, onClose, doneHref }: { examId: string; title: string; open?: boolean; onClose?: () => void; doneHref?: string }) {
  return (
    <ActionSheet open={open} onClose={onClose} title={`Archive ${title}?`} confirmLabel="Archive datesheet" confirmVariant="danger" confirmIcon={<Archive size={17} />}
      doneHref={doneHref} run={() => archiveExamAction(examId)}>
      <p>The datesheet leaves the list and its exam days come off the School Calendar and Parent Link. Nothing is deleted: find it with Show, Archived, and restore it from there.</p>
    </ActionSheet>
  );
}

export function ArchiveButton({ examId, title }: { examId: string; title: string }) {
  return (
    <ActionSheet trigger={{ label: "Archive", variant: "danger-soft", icon: <Archive size={17} /> }} title={`Archive ${title}?`} confirmLabel="Archive datesheet" confirmVariant="danger"
      confirmIcon={<Archive size={17} />} doneHref="/examination-results/datesheet" run={() => archiveExamAction(examId)}>
      <p>The datesheet leaves the list and its exam days come off the School Calendar and Parent Link. You can restore it from the archived list.</p>
    </ActionSheet>
  );
}

export function RestoreButton({ examId }: { examId: string }) {
  return (
    <ActionSheet trigger={{ label: "Restore", variant: "secondary", size: "sm", icon: <ArchiveRestore size={15} /> }} title="Restore this datesheet?" confirmLabel="Restore datesheet"
      run={() => restoreExamAction(examId)}>
      <p>The datesheet comes back to the list. If it was published, its exam days go back on the School Calendar and Parent Link.</p>
    </ActionSheet>
  );
}

/** Publishing (A10): says exactly what happens, with the parents' message as a choice. */
export function PublishSheet({ examId, title, papers, students, firstDay, past = 0, nextDay = null, startOpen }: {
  examId: string; title: string; papers: number; students: number; firstDay: string;
  /** Papers already held (before today), and the first day of a paper still to come. */
  past?: number; nextDay?: string | null; startOpen?: boolean;
}) {
  const allPast = papers > 0 && past >= papers;
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(startOpen));
  return (
    <>
      <Button variant="primary" icon={Send} onClick={() => setOpen(true)}>Publish datesheet</Button>
      <ActionSheet open={open} onClose={() => { setOpen(false); if (startOpen) router.replace(`/examination-results/datesheet/${examId}`, { scroll: false }); }}
        title={`Publish ${title}?`} confirmLabel="Publish datesheet" confirmIcon={<Send size={17} />} pendingText="Publishing…"
        run={(fd) => publishDatesheetAction(examId, fd.get("tellParents") === "on")}>
        <ul className="flex flex-col gap-2 text-[14px] text-ink2">
          <li className="flex gap-2"><CalendarDays size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />{papers} {papers === 1 ? "paper goes" : "papers go"} on the School Calendar and into the Time Table, from {firstDay}.</li>
          <li className="flex gap-2"><IdCard size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />Admit cards become ready to print. Invigilators are told their papers.</li>
          <li className="flex gap-2"><Send size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />Parents of {students} students see the datesheet on Parent Link{allPast ? "" : ", with a reminder the day before each paper still to come"}.</li>
        </ul>
        {allPast ? (
          <p className="flex gap-2 rounded-xl border border-line bg-sunken/60 px-4 py-3 text-[13.5px] text-ink2" role="note">
            <CircleAlert size={17} className="text-warn shrink-0 mt-0.5" aria-hidden="true" />
            {papers === 1 ? "The paper is" : `All ${papers} papers are`} already over, so no message goes to parents about {papers === 1 ? "it" : "them"}.
          </p>
        ) : (
          <SwitchField name="tellParents" label="Message parents now" defaultOn
            help={past ? `One message to each family about the papers still to come, from ${nextDay}. ${past} ${past === 1 ? "paper is" : "papers are"} already over and left out. A message cannot be unsent.` : "One message to each family. A message cannot be unsent."} />
        )}
      </ActionSheet>
    </>
  );
}

type Cat = { name: string; max: string };

/** Splits a paper's maximum marks into categories, such as Theory 80 and Internal 20. */
export function CategoriesButton({ entryId, subject, maxMarks, current, names, classes }: { entryId: string; subject: string; maxMarks: number; current: { name: string; max: number }[]; names: string[]; classes: number }) {
  const start: Cat[] = current.length ? current.map((c) => ({ name: c.name, max: String(c.max) })) : [{ name: "Theory", max: String(Math.round(maxMarks * 0.8)) }, { name: "Internal", max: String(maxMarks - Math.round(maxMarks * 0.8)) }];
  const [cats, setCats] = useState<Cat[]>(start);
  const sum = cats.reduce((s, c) => s + (Number(c.max) || 0), 0);
  const listId = `cats-${entryId}`;
  const ok = cats.length === 0 || sum === maxMarks;
  return (
    <ActionSheet trigger={{ label: current.length ? "Change" : "Set split", variant: "ghost", size: "sm", icon: <SlidersHorizontal size={15} />, ariaLabel: `Mark categories for ${subject}` }}
      title={`Mark categories: ${subject}`} sub="The split shows as columns in Marks Entry and on the report card." confirmLabel="Save categories" pendingText="Saving…"
      run={(fd) => (ok ? saveCategoriesForm(fd) : Promise.resolve(`The categories add up to ${sum}. They must add up to ${maxMarks}.`))}>
      <input type="hidden" name="entryId" value={entryId} />
      <p>Split the {maxMarks} marks, for example Theory 80 and Internal 20. Teachers enter each part and the total is worked out. Remove every row to go back to one mark out of {maxMarks}.</p>
      <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
      <ul className="flex flex-col gap-2">
        {cats.map((c, i) => (
          <li key={i} className="flex items-end gap-2">
            <label className="flex-1 min-w-0">
              <span className="text-[12px] text-ink3 font-semibold">Category</span>
              <input name="catName" list={listId} value={c.name} maxLength={30} onChange={(e) => setCats(cats.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className={cx(inputCls(!c.name.trim()), "h-10")} />
            </label>
            <label className="w-24">
              <span className="text-[12px] text-ink3 font-semibold">Out of</span>
              <input name="catMax" inputMode="numeric" value={c.max} onChange={(e) => setCats(cats.map((x, k) => (k === i ? { ...x, max: e.target.value.replace(/\D/g, "") } : x)))} className={cx(inputCls(!ok), "h-10 tnum")} />
            </label>
            <button type="button" aria-label={`Remove ${c.name || "this row"}`} onClick={() => setCats(cats.filter((_, k) => k !== i))} className="size-10 grid place-items-center rounded-xl text-ink3 hover:bg-sunken hover:text-bad"><Trash2 size={17} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setCats([...cats, { name: "", max: "" }])}>Add a category</Button>
        {cats.length > 0 && <p className={cx("text-[13px] font-semibold tnum flex items-center gap-1.5", ok ? "text-ok" : "text-bad")} aria-live="polite">{!ok && <CircleAlert size={14} aria-hidden="true" />}Adds up to {sum} of {maxMarks}</p>}
      </div>
      {classes > 1 && (
        <label className="flex items-start gap-3 rounded-xl border border-line px-4 py-3">
          <input type="checkbox" name="allClasses" defaultChecked className="mt-0.5 size-5 rounded-md accent-brand" />
          <span className="text-[14px]"><b className="font-semibold block text-ink">Use this split in every class</b><span className="text-[12.5px] text-ink3">{subject} in all {classes} classes of this exam</span></span>
        </label>
      )}
    </ActionSheet>
  );
}

type Room = { name: string; seats: string };

/** Makes a seat plan for one sitting: rooms with seats, by class and roll number. */
export function SeatingButton({ examId, sittings, rooms: startRooms }: { examId: string; sittings: { key: string; label: string; classes: string[] }[]; rooms: string[] }) {
  const [rooms, setRooms] = useState<Room[]>(startRooms.length ? startRooms.map((r) => ({ name: r, seats: "40" })) : [{ name: "", seats: "40" }]);
  const total = rooms.reduce((s, r) => s + (Number(r.seats) || 0), 0);
  return (
    <ActionSheet trigger={{ label: "Make seat plan", variant: "primary" }} wide title="Make a seat plan" sub="Seat numbers per room by roll number. Making it again for a sitting replaces the old one."
      confirmLabel="Make seat plan" pendingText="Seating…" run={(fd) => makeSeatingForm(fd)}>
      <input type="hidden" name="examId" value={examId} />
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Sitting</span>
        <select name="sitting" defaultValue={sittings[0]?.key ?? ""} className={cx(inputCls(), "h-11")}>
          {sittings.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.classes.join(", ")})</option>)}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-ink2 mb-1.5">Rooms and seats</legend>
        {rooms.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="flex-1 min-w-0"><span className="sr-only">Room</span>
              <input name="roomName" value={r.name} maxLength={40} placeholder="Room 12" onChange={(e) => setRooms(rooms.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className={cx(inputCls(), "h-10")} />
            </label>
            <label className="w-24"><span className="sr-only">Seats</span>
              <input name="roomSeats" inputMode="numeric" value={r.seats} onChange={(e) => setRooms(rooms.map((x, k) => (k === i ? { ...x, seats: e.target.value.replace(/\D/g, "") } : x)))} className={cx(inputCls(), "h-10 tnum")} />
            </label>
            <button type="button" aria-label={`Remove ${r.name || "this room"}`} disabled={rooms.length === 1} onClick={() => setRooms(rooms.filter((_, k) => k !== i))} className="size-10 grid place-items-center rounded-xl text-ink3 hover:bg-sunken hover:text-bad disabled:opacity-40"><Trash2 size={17} aria-hidden="true" /></button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setRooms([...rooms, { name: "", seats: "40" }])}>Add a room</Button>
          <span className="text-[13px] text-ink3 tnum">{total} seats</span>
        </div>
      </fieldset>
      <SwitchField name="mix" label="Mix classes in a room" help="Two classes sit in turns, so neighbours write different papers." defaultOn />
    </ActionSheet>
  );
}
