"use client";

import { useState } from "react";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { FormDialog, err, v } from "../_components/form-dialog";
import { assignAction, endAllocationAction } from "./actions";

type Cell = { allocationId: string; staffId: string; staffName: string; isMain: boolean; fromDate: string | null; toDate: string | null; upcoming: boolean };
type Row = { sectionId: string; classId: string; label: string; cells: Record<string, Cell[] | null> };
type Subject = { id: string; name: string; code: string };
export type TeacherLoad = { id: string; name: string; periods: number; limit: number; subjectIds: string[] };

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "");

export function AllocationGrid({ rows, subjects, teachers, canEdit, yearId, today, gapsOnly, ppw }: {
  rows: Row[]; subjects: Subject[]; teachers: TeacherLoad[]; canEdit: boolean; yearId: string; today: string; gapsOnly: boolean;
  /** Periods per week of each subject in each class, "classId:subjectId". */
  ppw: Record<string, number>;
}) {
  const [open, setOpen] = useState<{ row: Row; subject: Subject; cells: Cell[] } | null>(null);
  const shownRows = gapsOnly ? rows.filter((r) => subjects.some((s) => r.cells[s.id] && !r.cells[s.id]!.some((c) => c.isMain && !c.upcoming))) : rows;
  if (shownRows.length === 0) return <p className="rounded-xl border border-dashed border-line p-6 text-center text-ink-2">{gapsOnly ? "No gaps: every subject in these classes has a teacher." : "No sections to show."}</p>;
  return (
    <>
      <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line bg-surface">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Teachers for each subject in each section</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 border-b border-r border-line bg-surface-2 px-3 py-2 font-medium">Section</th>
              {subjects.map((s) => <th key={s.id} scope="col" title={s.name} className="sticky top-0 z-10 min-w-36 border-b border-line bg-surface-2 px-3 py-2 font-medium">{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={r.sectionId}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-line bg-surface px-3 py-2 font-medium">{r.label}</th>
                {subjects.map((s) => {
                  const cells = r.cells[s.id];
                  if (cells === null) return <td key={s.id} className="border-b border-line bg-surface-2/50 px-3 py-2 text-ink-2"><span className="sr-only">Not taught</span><span aria-hidden="true">·</span></td>;
                  const main = cells.find((c) => c.isMain && !c.upcoming);
                  const gap = !main;
                  const content = (
                    <>
                      {main ? <span className="block font-medium">{main.staffName}</span> : <span className="block font-medium text-danger">No teacher</span>}
                      {cells.filter((c) => !c.isMain).map((c) => <span key={c.allocationId} className="block text-xs text-ink-2">Second: {c.staffName}</span>)}
                      {cells.filter((c) => c.isMain && c.upcoming).map((c) => <span key={c.allocationId} className="block text-xs text-brand-text">From {fmt(c.fromDate)}: {c.staffName}</span>)}
                      {main?.toDate && <span className="block text-xs text-warn-text">Until {fmt(main.toDate)}</span>}
                    </>
                  );
                  return (
                    <td key={s.id} className={`border-b border-line p-0 align-top ${gap ? "bg-danger-soft" : ""}`}>
                      {canEdit ? (
                        <button type="button" onClick={() => setOpen({ row: r, subject: s, cells })} className="block min-h-11 w-full px-3 py-2 text-left hover:bg-surface-2"
                          aria-label={`${s.name} in ${r.label}: ${main ? main.staffName : "no teacher"}. Change`}>{content}</button>
                      ) : <div className="px-3 py-2">{content}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <AssignDialog open onClose={() => setOpen(null)} yearId={yearId} today={today} sectionId={open.row.sectionId} sectionLabel={open.row.label}
          subject={open.subject} cells={open.cells} teachers={teachers} defaultPpw={ppw[`${open.row.classId}:${open.subject.id}`] ?? null} />
      )}
    </>
  );
}

function AssignDialog({ open, onClose, yearId, today, sectionId, sectionLabel, subject, cells, teachers, defaultPpw }: {
  open: boolean; onClose: () => void; yearId: string; today: string; sectionId: string; sectionLabel: string; subject: Subject; cells: Cell[]; teachers: TeacherLoad[]; defaultPpw: number | null;
}) {
  const [ending, setEnding] = useState<Cell | null>(null);
  const teaches = teachers.filter((t) => t.subjectIds.includes(subject.id));
  const others = teachers.filter((t) => !t.subjectIds.includes(subject.id));
  const label = (t: TeacherLoad) => `${t.name} (${t.periods} of ${t.limit} periods)${t.periods >= t.limit ? ", full" : ""}`;
  if (ending) {
    return (
      <FormDialog open={open} onClose={onClose} title={`End ${ending.staffName}'s assignment`} action={endAllocationAction} submitLabel="End assignment" danger hidden={{ allocationId: ending.allocationId }}>
        {(state) => (
          <>
            <p className="text-ink-2">{ending.staffName} stops teaching {subject.name} in {sectionLabel} from this date. The history is kept.</p>
            <TextField label="Ends from" name="from" type="date" required defaultValue={v(state, "from", today)} error={err(state, "from")} />
          </>
        )}
      </FormDialog>
    );
  }
  return (
    <FormDialog open={open} onClose={onClose} title={`${subject.name} in ${sectionLabel}`} action={assignAction} submitLabel="Assign teacher" hidden={{ yearId, sectionId, subjectId: subject.id }}>
      {(state) => (
        <>
          {cells.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line text-sm">
              {cells.map((c) => (
                <li key={c.allocationId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1">
                  <span><strong>{c.staffName}</strong>, {c.isMain ? "primary" : "secondary"}{c.fromDate ? `, from ${fmt(c.fromDate)}` : ""}{c.toDate ? ` until ${fmt(c.toDate)}` : ""}</span>
                  <button type="button" className="min-h-11 rounded-lg px-2 font-medium text-danger hover:bg-surface-2" onClick={() => setEnding(c)}>End</button>
                </li>
              ))}
            </ul>
          )}
          <SelectField label="Teacher" name="staffId" required defaultValue={v(state, "staffId")} placeholder="Choose a teacher" error={err(state, "staffId")}
            options={[...teaches.map((t) => ({ value: t.id, label: label(t) })), ...others.map((t) => ({ value: t.id, label: label(t) }))]}
            help={teaches.length ? `The first ${teaches.length} already teach ${subject.name}. Each shows their current load.` : "Each teacher shows their current load."} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Role" name="role" required defaultValue={v(state, "role", "primary")} options={[{ value: "primary", label: "Primary teacher" }, { value: "secondary", label: "Secondary teacher" }]}
              help="A new primary teacher takes over from the date below." />
            <TextField label="Periods per week" name="periodsPerWeek" inputMode="numeric" defaultValue={v(state, "periodsPerWeek")} placeholder={defaultPpw !== null ? `${defaultPpw} (the subject's periods)` : ""} error={err(state, "periodsPerWeek")} />
          </div>
          <TextField label="From date" name="fromDate" type="date" required defaultValue={v(state, "fromDate", today)} error={err(state, "fromDate")} />
          <CheckboxField label={`All sections of ${sectionLabel.replace(/\s+\S+$/, "")}`} name="allSections" defaultChecked={v(state, "allSections") === "on"} help="The same teacher for this subject in every section of the class." />
          {(err(state, "overLimitReason") || v(state, "overLimitReason")) && (
            <TextField label="Reason to go over the limit" name="overLimitReason" defaultValue={v(state, "overLimitReason")} error={err(state, "overLimitReason")} help="Kept in the Audit Log. Or choose another teacher." />
          )}
        </>
      )}
    </FormDialog>
  );
}
