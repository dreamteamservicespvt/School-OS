"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { SearchIcon } from "@/components/icons";
import { FormDialog, err, v } from "./_components/form-dialog";
import {
  addClassAction, addClassesAction, addStreamAction, archiveClassAction, archiveSectionAction, archiveStreamAction,
  reorderClassesAction, restoreSectionAction, saveSectionAction, updateClassAction,
} from "./class-actions";

type Section = { id: string; name: string; seats: number; students: number; classTeacherId: string | null; classTeacherName: string | null; room: string | null; streamId: string | null; streamName: string | null };
type Klass = { id: string; name: string; sortOrder: number; level: string | null; board: string | null; sections: Section[] };
type Teacher = { id: string; name: string; designation: string; duties: string[] };
type Option = { id: string; name: string };

const BOARDS = ["CBSE", "ICSE", "State Board", "IB", "Cambridge (IGCSE)", "NIOS"];

export function AddClassButtons({ yearId, classes, levels, boardsOn, schoolBoard, quickOnly }: { yearId: string; classes: Option[]; levels: string[]; boardsOn: boolean; schoolBoard: string | null; quickOnly?: boolean }) {
  return (
    <>
      <FormDialog trigger="Add several classes" triggerVariant={quickOnly ? "primary" : "secondary"} title="Add several classes" action={addClassesAction} submitLabel="Add classes" pendingText="Adding…" hidden={{ yearId }}>
        {(state) => <ManyClassesFields state={state} />}
      </FormDialog>
      {!quickOnly && (
        <FormDialog trigger="Add class" triggerVariant="primary" title="Add a class" action={addClassAction} submitLabel="Add class" pendingText="Adding…" hidden={{ yearId }}>
          {(state) => (
            <>
              <TextField label="Class name" name="name" required autoFocus defaultValue={v(state, "name")} error={err(state, "name")} help="Any name: Nursery, Class 5, B.Sc 1, or a batch such as 7:00 to 8:00." />
              <SelectField label="Order" name="position" required defaultValue={v(state, "position", "end")} error={err(state, "position")}
                options={[{ value: "end", label: "After the last class" }, { value: "start", label: "First" }, ...classes.map((c) => ({ value: c.id, label: `After ${c.name}` }))]} />
              <SelectField label="Level" name="level" defaultValue={v(state, "level")} placeholder="Guess from the name" options={levels.map((l) => ({ value: l, label: l }))} help="Used to group reports." />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Sections" name="sections" required defaultValue={v(state, "sections", "A")} error={err(state, "sections")} help="Type A, B, C to add several at once." />
                <TextField label="Seats per section" name="seats" inputMode="numeric" defaultValue={v(state, "seats", "40")} error={err(state, "seats")} />
              </div>
              {boardsOn && <BoardField state={state} schoolBoard={schoolBoard} />}
            </>
          )}
        </FormDialog>
      )}
    </>
  );
}

function ManyClassesFields({ state }: { state: Parameters<typeof v>[0] }) {
  const [names, setNames] = useState(v(state, "names"));
  return (
    <>
      <TextArea label="Class names" name="names" required rows={5} value={names} onChange={(e) => setNames(e.target.value)} error={err(state, "names")}
        help="One per line, or a range like Class 1 to Class 10. Classes are added in this order." />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => setNames("Nursery\nLKG\nUKG\nClass 1 to Class 10")}>Nursery to Class 10</Button>
        <Button size="sm" variant="ghost" onClick={() => setNames("Nursery\nLKG\nUKG\nClass 1 to Class 12")}>Nursery to Class 12</Button>
        <Button size="sm" variant="ghost" onClick={() => setNames("Class 1 to Class 12")}>Class 1 to 12</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Sections in each class" name="sections" required defaultValue={v(state, "sections", "A")} error={err(state, "sections")} help="For example A, B. Change single classes later." />
        <TextField label="Seats per section" name="seats" inputMode="numeric" defaultValue={v(state, "seats", "40")} error={err(state, "seats")} />
      </div>
    </>
  );
}

function BoardField({ state, schoolBoard, value }: { state: Parameters<typeof v>[0]; schoolBoard: string | null; value?: string | null }) {
  return (
    <>
      <TextField label="Board" name="board" list="academic-boards" defaultValue={v(state, "board", value)} error={err(state, "board")}
        placeholder={schoolBoard ? `${schoolBoard} (the school's board)` : "The school's board"} help="Sets the grading scale and report card format in Examination & Results. Leave empty for the school's board." />
      <datalist id="academic-boards">{BOARDS.map((b) => <option key={b} value={b} />)}</datalist>
    </>
  );
}

export function ClassesBoard(props: {
  yearId: string; classes: Klass[]; teachers: Teacher[]; streams: Option[]; canEdit: boolean; streamsOn: boolean; boardsOn: boolean; schoolBoard: string | null; levels: string[];
  archived: { id: string; label: string; archivedOn: string }[] | null; showArchivedToggle: boolean;
}) {
  const { yearId, canEdit } = props;
  const [order, setOrder] = useState(props.classes.map((c) => c.id));
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const byId = useMemo(() => new Map(props.classes.map((c) => [c.id, c])), [props.classes]);
  // A new list from the server wins over the local order.
  const known = order.length === props.classes.length && props.classes.every((c) => order.includes(c.id));
  const ids = known ? order : props.classes.map((c) => c.id);

  const save = (next: string[]) => {
    setOrder(next);
    setProblem(null);
    start(async () => {
      const p = await reorderClassesAction(yearId, next);
      if (p) { setProblem(p); setOrder(props.classes.map((c) => c.id)); }
      router.refresh();
    });
  };
  const move = (id: string, by: number) => {
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  const term = q.trim().toLowerCase();
  const shown = ids.map((id) => byId.get(id)!).filter(Boolean).filter((c) =>
    !term || c.name.toLowerCase().includes(term) || c.sections.some((s) => `${c.name} ${s.name}`.toLowerCase().includes(term) || (s.classTeacherName ?? "").toLowerCase().includes(term) || (s.room ?? "").toLowerCase().includes(term)));

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-60">
          <SearchIcon className="pointer-events-none absolute left-3 top-3 size-5 text-ink-2" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a class, section, teacher or room" aria-label="Find a class, section, teacher or room"
            className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-10 pr-3 text-base" />
        </div>
        {props.showArchivedToggle && (
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" className="size-5 accent-brand" checked={sp.get("archived") === "1"}
              onChange={(e) => { const n = new URLSearchParams(sp.toString()); if (e.target.checked) n.set("archived", "1"); else n.delete("archived"); router.replace(`${pathname}?${n}`); }} />
            Archived
          </label>
        )}
        {saving && <span className="text-sm text-ink-2" role="status">Saving the new order…</span>}
      </div>
      {problem && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{problem}</p>}
      {props.archived && (
        <section className="mb-5 rounded-2xl border border-dashed border-line bg-surface p-4">
          <h2 className="font-semibold">Archived sections</h2>
          {props.archived.length === 0 ? <p className="mt-1 text-sm text-ink-2">Nothing archived in this year.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {props.archived.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{a.label}</span>
                  {canEdit && <ConfirmButton trigger="Restore" title={`Restore ${a.label}?`} confirmLabel={`Restore ${a.label}`} onConfirm={async () => { const p = await restoreSectionAction(a.id); if (!p) router.refresh(); return p; }}>It comes back with its seats and class teacher.</ConfirmButton>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {shown.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-ink-2">Nothing matches “{q}”. <button type="button" className="font-medium text-brand-text underline" onClick={() => setQ("")}>Clear the search</button></p>}
      <ol className="space-y-3">
        {shown.map((c) => {
          const i = ids.indexOf(c.id);
          const students = c.sections.reduce((n, s) => n + s.students, 0);
          return (
            <li key={c.id}
              onDragOver={(e) => { if (dragging && dragging !== c.id) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (!dragging || dragging === c.id) return; const next = ids.filter((x) => x !== dragging); next.splice(next.indexOf(c.id) + (ids.indexOf(dragging) < i ? 1 : 0), 0, dragging); setDragging(null); save(next); }}
              className={`rounded-2xl border bg-surface shadow-card ${dragging === c.id ? "border-brand opacity-60" : "border-line"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  {canEdit && !term && (
                    <span draggable onDragStart={() => setDragging(c.id)} onDragEnd={() => setDragging(null)} title="Drag to reorder"
                      className="hidden cursor-grab select-none px-1 text-ink-2 sm:inline" aria-hidden="true">⋮⋮</span>
                  )}
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  {c.level && <Badge>{c.level}</Badge>}
                  {props.boardsOn && <Badge tone="brand">{c.board ?? props.schoolBoard ?? "School board"}</Badge>}
                  <span className="text-sm text-ink-2">{c.sections.length} {c.sections.length === 1 ? "section" : "sections"} · {students} students</span>
                </div>
                {canEdit && (
                  <div className="no-print flex flex-wrap items-center gap-1">
                    {!term && <>
                      <Button size="sm" variant="ghost" aria-label={`Move ${c.name} up`} disabled={i === 0 || saving} onClick={() => move(c.id, -1)}>↑</Button>
                      <Button size="sm" variant="ghost" aria-label={`Move ${c.name} down`} disabled={i === ids.length - 1 || saving} onClick={() => move(c.id, 1)}>↓</Button>
                    </>}
                    <SectionDialog mode="add" yearId={yearId} classId={c.id} className={c.name} teachers={props.teachers} streams={props.streams} streamsOn={props.streamsOn} defaultSeats={c.sections[0]?.seats ?? 40} />
                    <FormDialog trigger="Edit" triggerSize="sm" triggerVariant="ghost" triggerLabel={`Edit ${c.name}`} title={`Edit ${c.name}`} action={updateClassAction} submitLabel="Save class" hidden={{ classId: c.id, yearId }}>
                      {(state) => (
                        <>
                          <TextField label="Class name" name="name" required defaultValue={v(state, "name", c.name)} error={err(state, "name")} />
                          <SelectField label="Level" name="level" defaultValue={v(state, "level", c.level)} placeholder="No level" options={props.levels.map((l) => ({ value: l, label: l }))} />
                          {props.boardsOn && <BoardField state={state} schoolBoard={props.schoolBoard} value={c.board} />}
                        </>
                      )}
                    </FormDialog>
                    <ConfirmButton trigger="Archive" triggerVariant="ghost" triggerClassName="min-h-11 text-danger" title={`Archive ${c.name}?`} confirmLabel={`Archive ${c.name}`} confirmVariant="danger"
                      onConfirm={async () => { const p = await archiveClassAction(c.id, yearId); if (!p) router.refresh(); return p; }}>
                      {students > 0 ? `${c.name} has ${students} students. Move or promote them first.` : `${c.name} and its ${c.sections.length} sections leave this year's lists. Its history stays. You can undo for 10 seconds.`}
                    </ConfirmButton>
                  </div>
                )}
              </div>
              {c.sections.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-2">No sections in this year. {canEdit && "Add a section to place students."}</p>
              ) : (
                <div className="relative overflow-x-auto">
                  <table className="w-full text-left text-[15px]">
                    <caption className="sr-only">Sections of {c.name}</caption>
                    <thead className="bg-surface-2 text-sm text-ink-2">
                      <tr>
                        <th scope="col" className="px-4 py-2 font-medium">Section</th>
                        {props.streamsOn && <th scope="col" className="px-4 py-2 font-medium">Stream</th>}
                        <th scope="col" className="px-4 py-2 font-medium">Class teacher</th>
                        <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">Room</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Students</th>
                        <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">Seats</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Seats left</th>
                        {canEdit && <th scope="col" className="px-2 py-2"><span className="sr-only">Actions</span></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {c.sections.map((s) => {
                        const left = s.seats - s.students;
                        return (
                          <tr key={s.id}>
                            <td className="px-4 py-2 font-medium"><Link className="text-brand-text hover:underline" href={`/academic-management/time-table?section=${s.id}`}>{c.name} {s.name}</Link></td>
                            {props.streamsOn && <td className="px-4 py-2">{s.streamName ?? <span className="text-ink-2">None</span>}</td>}
                            <td className="px-4 py-2">{s.classTeacherName ?? <Badge tone="warning">Not set</Badge>}</td>
                            <td className="hidden px-4 py-2 sm:table-cell">{s.room ?? <span className="text-ink-2">Not set</span>}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{s.students}</td>
                            <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{s.seats}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{left < 0 ? <Badge tone="danger">{left}</Badge> : left === 0 ? <Badge tone="warning">Full</Badge> : left}</td>
                            {canEdit && (
                              <td className="whitespace-nowrap px-2 py-1 text-right">
                                <SectionDialog mode="edit" yearId={yearId} classId={c.id} className={c.name} section={s} teachers={props.teachers} streams={props.streams} streamsOn={props.streamsOn} defaultSeats={s.seats} />
                                <ConfirmButton trigger="Archive" triggerVariant="ghost" triggerClassName="min-h-11 text-danger" title={`Archive ${c.name} ${s.name}?`} confirmLabel={`Archive ${c.name} ${s.name}`} confirmVariant="danger"
                                  onConfirm={async () => { const p = await archiveSectionAction(s.id); if (!p) router.refresh(); return p; }}>
                                  {s.students > 0 ? `Move or promote the ${s.students} students first. A section with students cannot be archived.` : "It leaves this year's lists and dropdowns. You can undo for 10 seconds."}
                                </ConfirmButton>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SectionDialog({ mode, yearId, classId, className, section, teachers, streams, streamsOn, defaultSeats }: {
  mode: "add" | "edit"; yearId: string; classId: string; className: string; section?: Section; teachers: Teacher[]; streams: Option[]; streamsOn: boolean; defaultSeats: number;
}) {
  const teacherOptions = teachers.map((t) => ({ value: t.id, label: `${t.name}${t.duties.filter((d) => d !== `${className} ${section?.name}`).length ? `: class teacher of ${t.duties.filter((d) => d !== `${className} ${section?.name}`).join(", ")}` : ""}` }));
  return (
    <FormDialog trigger={mode === "add" ? "Add section" : "Edit"} triggerSize="sm" triggerVariant="ghost" triggerLabel={mode === "add" ? `Add a section to ${className}` : `Edit ${className} ${section?.name}`}
      title={mode === "add" ? `Add a section to ${className}` : `Edit ${className} ${section?.name}`} action={saveSectionAction} submitLabel={mode === "add" ? "Add section" : "Save section"}
      hidden={{ yearId, classId, ...(section ? { sectionId: section.id } : {}) }}>
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Section name" name="name" required={mode === "edit"} defaultValue={v(state, "name", section?.name)} error={err(state, "name")} help={mode === "add" ? "Leave empty for the next letter." : undefined} />
            <TextField label="Seats" name="seats" inputMode="numeric" defaultValue={v(state, "seats", section?.seats ?? defaultSeats)} error={err(state, "seats")}
              help={section && section.students > 0 ? `${section.students} students now.` : undefined} />
          </div>
          <SelectField label="Class teacher" name="classTeacherId" defaultValue={v(state, "classTeacherId", section?.classTeacherId)} error={err(state, "classTeacherId")} placeholder="Not set yet" options={teacherOptions}
            help="Each teacher's current class-teacher duties are shown next to their name." />
          {streamsOn && <SelectField label="Stream" name="streamId" defaultValue={v(state, "streamId", section?.streamId)} placeholder="No stream" options={streams.map((s) => ({ value: s.id, label: s.name }))} />}
          <TextField label="Room" name="room" defaultValue={v(state, "room", section?.room)} error={err(state, "room")} help="Used by the Time Table room view." />
        </>
      )}
    </FormDialog>
  );
}

/** `yearId`: the page's year, so the stream is added on that year's campus. */
export function StreamsButton({ yearId, streams }: { yearId: string; streams: Option[] }) {
  const router = useRouter();
  return (
    <FormDialog trigger="Streams" title="Streams" action={addStreamAction} submitLabel="Add stream" hidden={{ yearId }}>
      {(state) => (
        <>
          {streams.length === 0 ? <p className="text-ink-2">No streams yet. Add Science, Commerce or Arts, then attach sections to them.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {streams.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-1">
                  <span>{s.name}</span>
                  <ConfirmButton trigger="Archive" triggerVariant="ghost" triggerClassName="min-h-11 text-danger" title={`Archive ${s.name}?`} confirmLabel={`Archive ${s.name}`} confirmVariant="danger"
                    onConfirm={async () => { const p = await archiveStreamAction(s.id); if (!p) router.refresh(); return p; }}>
                    Sections using it must be moved to another stream first.
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
          <TextField label="New stream" name="name" required defaultValue={v(state, "name")} error={err(state, "name")} placeholder="For example Science" />
        </>
      )}
    </FormDialog>
  );
}
