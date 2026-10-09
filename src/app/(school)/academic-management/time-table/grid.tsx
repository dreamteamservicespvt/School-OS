"use client";

// The weekly Time Table grid (04 §2): periods down the side with times, days
// across. Breaks and lunch span the row. On a phone the week becomes one day
// at a time. In a draft, clicking a cell opens Edit period.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { FormDialog, err, v } from "../_components/form-dialog";
import { checkClashAction, removePeriodAction, savePeriodAction } from "./actions";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type Slot = { number: number; label: string; startTime: string; endTime: string; isBreak: boolean; days: number[] };
export type Cell = {
  id: string; sectionId: string; sectionLabel: string; dayOfWeek: number; periodNo: number; startTime: string; endTime: string;
  subjectId: string | null; subjectName: string | null; subjectCode: string | null; staffId: string | null; staffName: string | null;
  room: string | null; isBreak: boolean; label: string | null;
};
export type EditContext = {
  versionId: string;
  sectionId: string;
  sectionLabel: string;
  sectionRoom: string | null;
  subjects: { id: string; name: string }[];
  /** Teachers assigned to each subject in this section, main teacher first. */
  assigned: Record<string, { id: string; name: string }[]>;
  teachers: { id: string; name: string }[];
};

const t12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? " am" : " pm"}`;
};

export function TimetableGrid({ slots, days, cells, mode, edit, highlight, clashKeys = [], linkFor, today }: {
  slots: Slot[];
  days: number[];
  cells: Cell[];
  /** What each cell shows besides the subject: the teacher (class view) or the class (teacher and room views). */
  mode: "class" | "teacher" | "room";
  edit?: EditContext | null;
  highlight?: string | null;
  clashKeys?: string[];
  /** Where a cell links to when it cannot be edited here (teacher view → the class). */
  linkFor?: Record<string, string>;
  today?: number;
}) {
  const [editing, setEditing] = useState<{ day: number; slot: Slot; cell: Cell | null } | null>(null);
  const [phoneDay, setPhoneDay] = useState(() => (today && days.includes(today) ? today : days[0]));
  const at = useMemo(() => {
    const m = new Map<string, Cell[]>();
    for (const c of cells) m.set(`${c.dayOfWeek}:${c.periodNo}`, [...(m.get(`${c.dayOfWeek}:${c.periodNo}`) ?? []), c]);
    return m;
  }, [cells]);
  const clash = new Set(clashKeys);

  useEffect(() => {
    if (!highlight) return;
    document.getElementById(`cell-${highlight}`)?.scrollIntoView({ block: "center", inline: "center" });
  }, [highlight]);

  const body = (day: number, slot: Slot, list: Cell[] | undefined) => {
    if (!slot.days.includes(day)) return <span className="text-xs text-ink-2">No period</span>;
    if (!list?.length) return edit ? <span className="text-sm text-ink-2">+ Add</span> : <span className="text-sm text-ink-2">Free</span>;
    return list.map((c) => (
      <span key={c.id} className="block">
        {c.isBreak ? <span className="font-medium text-ink-2">{c.label ?? "Break"}</span> : (
          <>
            <span className="block font-medium">{c.subjectName ?? c.label}</span>
            <span className="block text-xs text-ink-2">{mode === "class" ? c.staffName ?? "" : c.sectionLabel}{c.room && (mode !== "room") ? ` · ${c.room}` : ""}</span>
          </>
        )}
      </span>
    ));
  };

  const cellClass = (list: Cell[] | undefined, key: string) => {
    const c = list?.[0];
    const base = "block min-h-16 w-full rounded-lg px-2 py-1.5 text-left text-sm";
    if (clash.has(key)) return `${base} bg-danger-soft ring-2 ring-danger`;
    if (highlight === key) return `${base} ring-2 ring-brand`;
    if (!c) return `${base}`;
    if (c.isBreak) return `${base} bg-surface-3`;
    if (!c.subjectId) return `${base} bg-warn-bg`;
    return `${base} bg-brand-soft`;
  };

  const open = (day: number, slot: Slot, list: Cell[] | undefined) => setEditing({ day, slot, cell: list?.[0] ?? null });

  const renderCell = (day: number, slot: Slot) => {
    const key = `${day}:${slot.number}`;
    const list = at.get(key);
    const label = `${DAY_NAMES[day]}, ${slot.label}: ${list?.length ? list.map((c) => c.subjectName ?? c.label ?? "Break").join(", ") : "free"}`;
    if (edit && slot.days.includes(day)) {
      return <button type="button" id={`cell-${key}`} onClick={() => open(day, slot, list)} className={`${cellClass(list, key)} hover:ring-2 hover:ring-brand`} aria-label={`${label}. Edit`}>{body(day, slot, list)}</button>;
    }
    const href = list?.[0] && linkFor?.[list[0].sectionId];
    if (href) return <Link id={`cell-${key}`} href={href} className={`${cellClass(list, key)} hover:underline`} aria-label={label}>{body(day, slot, list)}</Link>;
    return <div id={`cell-${key}`} className={cellClass(list, key)}>{body(day, slot, list)}</div>;
  };

  return (
    <>
      {/* Week grid on wider screens and in print. */}
      <div className="tt-grid hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block print:block print:overflow-visible print:border-0">
        <table className="w-full table-fixed border-separate border-spacing-1 text-left">
          <caption className="sr-only">Periods down the side, days across</caption>
          <thead>
            <tr>
              <th scope="col" className="w-32 px-2 py-2 text-sm font-medium text-ink-2">Period</th>
              {days.map((d) => <th key={d} scope="col" className={`px-2 py-2 text-sm font-medium ${today === d ? "text-brand-text" : ""}`}>{DAY_NAMES[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.number}>
                <th scope="row" className="px-2 py-1 align-top text-sm">
                  <span className="block font-medium">{slot.label}</span>
                  <span className="block text-xs font-normal text-ink-2">{t12(slot.startTime)} to {t12(slot.endTime)}</span>
                </th>
                {slot.isBreak && mode !== "room" && !days.some((d) => at.get(`${d}:${slot.number}`)?.some((c) => !c.isBreak)) ? (
                  <td colSpan={days.length} className="rounded-lg bg-surface-3 px-3 py-2 text-center text-sm font-medium text-ink-2">{slot.label}</td>
                ) : days.map((d) => <td key={d} className="align-top">{renderCell(d, slot)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* One day at a time on a phone. */}
      <div className="md:hidden print:hidden">
        <div role="tablist" aria-label="Day" className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
          {days.map((d) => (
            <button key={d} role="tab" type="button" aria-selected={phoneDay === d} onClick={() => setPhoneDay(d)}
              className={`min-h-10 flex-1 rounded-lg px-3 text-[15px] ${phoneDay === d ? "bg-surface font-medium shadow-card" : "text-ink-2"}`}>{DAY_SHORT[d]}</button>
          ))}
        </div>
        <ol className="space-y-2">
          {slots.filter((s) => s.days.includes(phoneDay)).map((slot) => (
            <li key={slot.number} className="flex gap-3">
              <div className="w-20 shrink-0 pt-1.5 text-sm">
                <span className="block font-medium">{slot.label}</span>
                <span className="block text-xs text-ink-2">{t12(slot.startTime)}</span>
              </div>
              <div className="min-w-0 flex-1">
                {slot.isBreak && mode !== "room" && !at.get(`${phoneDay}:${slot.number}`)?.some((c) => !c.isBreak)
                  ? <div className="rounded-lg bg-surface-3 px-3 py-2 text-sm font-medium text-ink-2">{slot.label}</div>
                  : renderCell(phoneDay, slot)}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {edit && editing && (
        <EditPeriodDialog key={`${editing.day}:${editing.slot.number}`} edit={edit} day={editing.day} slot={editing.slot} cell={editing.cell} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

export function Legend() {
  return (
    <ul className="flex flex-wrap gap-3 text-sm text-ink-2" aria-label="Legend">
      <li className="flex items-center gap-1.5"><span className="inline-block size-3 rounded bg-brand-soft ring-1 ring-line" />Teaching</li>
      <li className="flex items-center gap-1.5"><span className="inline-block size-3 rounded bg-surface-3 ring-1 ring-line" />Lunch or break</li>
      <li className="flex items-center gap-1.5"><span className="inline-block size-3 rounded bg-warn-bg ring-1 ring-line" />Fixed or assembly</li>
    </ul>
  );
}

function EditPeriodDialog({ edit, day, slot, cell, onClose }: { edit: EditContext; day: number; slot: Slot; cell: Cell | null; onClose: () => void }) {
  const router = useRouter();
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const remove = () => startRemove(async () => {
    if (!cell) return;
    const problem = await removePeriodAction(cell.id);
    if (problem) setRemoveError(problem);
    else { onClose(); router.refresh(); }
  });
  return (
    <FormDialog open onClose={onClose} title={`${edit.sectionLabel}, ${DAY_NAMES[day]}, ${slot.label}`} action={savePeriodAction} submitLabel="Save period"
      hidden={{ versionId: edit.versionId, sectionId: edit.sectionId, dayOfWeek: String(day), periodNo: String(slot.number) }}>
      {(state) => (
        <>
          <PeriodFields edit={edit} day={day} slot={slot} cell={cell} state={state} />
          {cell && (
            <div className="border-t border-line pt-3">
              {removeError && <p className="mb-2 text-sm text-danger" role="alert">{removeError}</p>}
              <Button variant="danger-outline" onClick={remove} loading={removing} loadingText="Removing…">Remove this period</Button>
              <p className="mt-1 text-xs text-ink-2">You can undo it for 10 seconds.</p>
            </div>
          )}
        </>
      )}
    </FormDialog>
  );
}

function PeriodFields({ edit, day, slot, cell, state }: { edit: EditContext; day: number; slot: Slot; cell: Cell | null; state: Parameters<typeof v>[0] }) {
  const [isBreak, setIsBreak] = useState(v(state, "isBreak", cell?.isBreak || slot.isBreak ? "on" : "") === "on");
  const [subjectId, setSubjectId] = useState(v(state, "subjectId", cell?.subjectId));
  const [showAll, setShowAll] = useState(false);
  const assigned = edit.assigned[subjectId] ?? [];
  const [staffId, setStaffId] = useState(v(state, "staffId", cell?.staffId ?? assigned[0]?.id));
  const [room, setRoom] = useState(v(state, "room", cell?.room && cell.room !== edit.sectionRoom ? cell.room : ""));
  const [wholeWeek, setWholeWeek] = useState(v(state, "wholeWeek") === "on");
  const [label, setLabel] = useState(v(state, "label", cell && !cell.isBreak ? cell.label : ""));
  const [problems, setProblems] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  // Live clash check (rule 26): a teacher or room in two places at once.
  useEffect(() => {
    if (isBreak || (!staffId && !room)) { setProblems([]); return; }
    let live = true;
    setChecking(true);
    const t = setTimeout(async () => {
      const r = await checkClashAction({ versionId: edit.versionId, sectionId: edit.sectionId, dayOfWeek: day, periodNo: slot.number, staffId: staffId || null, room: room || null, wholeWeek });
      if (live) { setProblems(r); setChecking(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [staffId, room, wholeWeek, isBreak, edit.versionId, edit.sectionId, day, slot.number]);

  const teacherOptions = showAll || assigned.length === 0
    ? edit.teachers.map((t) => ({ value: t.id, label: assigned.some((a) => a.id === t.id) ? `${t.name} (assigned)` : t.name }))
    : assigned.map((t) => ({ value: t.id, label: t.name }));
  // Keep the current teacher in the list even when narrowed.
  if (staffId && !teacherOptions.some((o) => o.value === staffId)) {
    const t = edit.teachers.find((x) => x.id === staffId);
    if (t) teacherOptions.unshift({ value: t.id, label: `${t.name} (not assigned)` });
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Start time" name="startTime" type="time" required defaultValue={v(state, "startTime", cell?.startTime ?? slot.startTime)} error={err(state, "startTime")} />
        <TextField label="End time" name="endTime" type="time" required defaultValue={v(state, "endTime", cell?.endTime ?? slot.endTime)} error={err(state, "endTime")} />
      </div>
      <CheckboxField label="Lunch or break" name="isBreak" checked={isBreak} onChange={(e) => setIsBreak(e.target.checked)} />
      {!isBreak && (
        <>
          <SelectField label="Subject" name="subjectId" required={!label} value={subjectId} placeholder={edit.subjects.length ? "Choose a subject" : "No subjects mapped to this class"}
            onChange={(e) => { setSubjectId(e.target.value); setStaffId(edit.assigned[e.target.value]?.[0]?.id ?? ""); setShowAll(false); }}
            options={edit.subjects.map((s) => ({ value: s.id, label: s.name }))} error={err(state, "subjectId")} help="Only subjects mapped to this class." />
          <div>
            <SelectField label="Teacher" name="staffId" required={!label} value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="Choose a teacher"
              options={teacherOptions} error={err(state, "staffId")}
              help={subjectId && assigned.length === 0 ? "Nobody is assigned to this subject here yet, so everyone is listed." : subjectId && !showAll ? "Teachers assigned to this subject and class." : undefined} />
            {subjectId && assigned.length > 0 && (
              <label className="mt-2 flex min-h-11 items-center gap-2 text-[15px]">
                <input type="checkbox" className="size-5" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                Show all teachers
              </label>
            )}
          </div>
          <TextField label="Room" name="room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={edit.sectionRoom ?? "The section's room"} error={err(state, "room")} help={edit.sectionRoom ? `Leave empty for the section's room (${edit.sectionRoom}).` : undefined} />
          <TextField label="Fixed period name" name="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Assembly, Library, Games…" error={err(state, "label")} help="For a fixed period with no subject. Leave empty for a normal period." />
        </>
      )}
      {isBreak && <TextField label="Name" name="label" defaultValue={v(state, "label", cell?.label ?? slot.label)} placeholder="Lunch" />}
      <CheckboxField label="Whole week" name="wholeWeek" checked={wholeWeek} onChange={(e) => setWholeWeek(e.target.checked)} help="Changes this period on every day of the week." />
      <div aria-live="polite">
        {checking && <p className="text-sm text-ink-2">Checking for clashes…</p>}
        {!checking && problems.length > 0 && <Alert tone="danger" title="This would clash">{problems.map((p) => <p key={p}>{p}</p>)}<p className="mt-1">Pick another teacher, room or period.</p></Alert>}
      </div>
    </>
  );
}
