"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { FormDialog, err, v } from "../_components/form-dialog";
import {
  addSubjectAction, archiveSubjectAction, copyMapAction, endMapAction, mapSubjectAction, recordChoicesAction, removeChoiceAction,
  reopenMapAction, restoreSubjectAction, saveOptionAction, updateMapAction, updateSubjectAction,
} from "./actions";
import { KeepCheck } from "@/components/ui/keep-select";

type Opt = { id: string; name: string };
const TYPES = [{ value: "CORE", label: "Core" }, { value: "OPTIONAL", label: "Optional" }, { value: "ELECTIVE", label: "Elective" }, { value: "LANGUAGE", label: "Language" }];

function codeFrom(name: string) {
  const words = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join("").slice(0, 4);
}

export function AddSubjectButton({ classes, today }: { classes: Opt[]; today: string }) {
  return (
    <FormDialog trigger="Add subject" triggerVariant="primary" title="Add a subject" action={addSubjectAction} submitLabel="Add subject" wide>
      {(state) => <SubjectFields state={state} classes={classes} today={today} />}
    </FormDialog>
  );
}

function SubjectFields({ state, classes, today }: { state: Parameters<typeof v>[0]; classes: Opt[]; today: string }) {
  const [name, setName] = useState(v(state, "name"));
  const [all, setAll] = useState(false);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Subject name" name="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} error={err(state, "name")} />
        <TextField label="Code" name="code" defaultValue={v(state, "code")} placeholder={codeFrom(name) || "Made from the name"} error={err(state, "code")} help="Leave empty to make one from the name. Codes are unique." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" name="type" required defaultValue={v(state, "type", "CORE")} options={TYPES} error={err(state, "type")} />
        <div className="pt-7"><CheckboxField label="Grade only" name="gradeOnly" defaultChecked={v(state, "gradeOnly") === "on"} help="Graded, not marked, such as Art or PE." /></div>
      </div>
      {classes.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Classes <span className="font-normal text-ink-2">(can be mapped later)</span></legend>
          <label className="mb-2 flex min-h-11 items-center gap-2 text-sm"><KeepCheck type="checkbox" className="size-5 accent-brand" checked={all} onChange={(e) => setAll(e.target.checked)} /> All classes</label>
          <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-3">
            {classes.map((c) => (
              <label key={c.id} className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" name="classIds" value={c.id} className="size-5 accent-brand" {...(all ? { checked: true, readOnly: true } : {})} /> {c.name}
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TextField label="Periods per week" name="periodsPerWeek" inputMode="numeric" defaultValue={v(state, "periodsPerWeek", "5")} error={err(state, "periodsPerWeek")} />
            <TextField label="From date" name="fromDate" type="date" defaultValue={v(state, "fromDate", today)} error={err(state, "fromDate")} />
          </div>
        </fieldset>
      )}
    </>
  );
}

export function SubjectRowActions({ s }: { s: { id: string; name: string; code: string; type: string; gradeOnly: boolean; archived: boolean } }) {
  const router = useRouter();
  if (s.archived) {
    return <ConfirmButton trigger="Restore" triggerVariant="ghost" title={`Restore ${s.name}?`} confirmLabel={`Restore ${s.name}`} onConfirm={async () => { const p = await restoreSubjectAction(s.id); if (!p) router.refresh(); return p; }}>It comes back in the subject list. Map it to classes again.</ConfirmButton>;
  }
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <FormDialog trigger="Edit" triggerSize="sm" triggerVariant="ghost" triggerLabel={`Edit ${s.name}`} title={`Edit ${s.name}`} action={updateSubjectAction} submitLabel="Save subject" hidden={{ id: s.id, periodsPerWeek: "0", fromDate: "" }}>
        {(state) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Subject name" name="name" required defaultValue={v(state, "name", s.name)} error={err(state, "name")} />
              <TextField label="Code" name="code" required defaultValue={v(state, "code", s.code)} error={err(state, "code")} />
            </div>
            <SelectField label="Type" name="type" required defaultValue={v(state, "type", s.type)} options={TYPES} />
            <CheckboxField label="Grade only" name="gradeOnly" defaultChecked={state?.values ? state.values.gradeOnly === "on" : s.gradeOnly} help="Graded, not marked, such as Art or PE." />
          </>
        )}
      </FormDialog>
      <ConfirmButton trigger="Archive" triggerVariant="ghost" triggerClassName="min-h-11 text-danger" title={`Archive ${s.name}?`} confirmLabel={`Archive ${s.name}`} confirmVariant="danger"
        onConfirm={async () => { const p = await archiveSubjectAction(s.id); if (!p) router.refresh(); return p; }}>
        It stops in every class from today. Past marks, homework and Time Tables stay linked to it.
      </ConfirmButton>
    </div>
  );
}

export function MapSubjectButton({ classId, className, subjects, today }: { classId: string; className: string; subjects: Opt[]; today: string }) {
  return (
    <FormDialog trigger="Add subject to class" triggerVariant="primary" title={`Add a subject to ${className}`} action={mapSubjectAction} submitLabel="Add to class" hidden={{ classId }}>
      {(state) => (
        <>
          <SelectField label="Subject" name="subjectId" required defaultValue={v(state, "subjectId")} placeholder="Choose a subject" options={subjects.map((s) => ({ value: s.id, label: s.name }))} error={err(state, "subjectId")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Periods per week" name="periodsPerWeek" inputMode="numeric" defaultValue={v(state, "periodsPerWeek", "5")} error={err(state, "periodsPerWeek")} />
            <TextField label="From date" name="fromDate" type="date" defaultValue={v(state, "fromDate", today)} error={err(state, "fromDate")} help="Mid-year changes keep history." />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function MapRowActions({ m, className, today }: { m: { id: string; subject: string; periodsPerWeek: number; ended: boolean }; className: string; today: string }) {
  const router = useRouter();
  if (m.ended) {
    return <ConfirmButton trigger="Extend" triggerVariant="ghost" title={`Run ${m.subject} again in ${className}?`} confirmLabel={`Extend ${m.subject}`} onConfirm={async () => { const p = await reopenMapAction(m.id); if (!p) router.refresh(); return p; }}>The end date is removed, so it runs again with no end.</ConfirmButton>;
  }
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <FormDialog trigger="Periods" triggerSize="sm" triggerVariant="ghost" triggerLabel={`Change periods of ${m.subject}`} title={`${m.subject} in ${className}`} action={updateMapAction} submitLabel="Save periods" hidden={{ mapId: m.id }}>
        {(state) => <TextField label="Periods per week" name="periodsPerWeek" inputMode="numeric" required defaultValue={v(state, "periodsPerWeek", m.periodsPerWeek)} error={err(state, "periodsPerWeek")} help="Used for teacher workload and making the Time Table." />}
      </FormDialog>
      <FormDialog trigger="End" triggerSize="sm" triggerVariant="ghost" triggerLabel={`End ${m.subject} for ${className}`} title={`End ${m.subject} for ${className}`} action={endMapAction} submitLabel="End from this date" danger hidden={{ mapId: m.id }}>
        {(state) => (
          <>
            <p className="text-ink-2">The subject stops from this date. Past marks and homework stay linked. You can extend it again later.</p>
            <TextField label="Stops from" name="endsFrom" type="date" required defaultValue={v(state, "endsFrom", today)} error={err(state, "endsFrom")} />
          </>
        )}
      </FormDialog>
    </div>
  );
}

export function CopyMapButton({ fromClassId, fromName, classes }: { fromClassId: string; fromName: string; classes: Opt[] }) {
  return (
    <FormDialog trigger="Copy to other classes" title={`Copy ${fromName}'s subjects`} action={copyMapAction} submitLabel="Copy subjects" hidden={{ fromClassId }}>
      {(state) => (
        <fieldset>
          <legend className="mb-2 text-ink-2">Subjects already in a class are kept. Periods per week are copied too.</legend>
          {err(state, "toClassIds") && <p className="mb-2 text-sm text-danger">{err(state, "toClassIds")}</p>}
          <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-line p-2">
            {classes.filter((c) => c.id !== fromClassId).map((c) => (
              <label key={c.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="toClassIds" value={c.id} className="size-5 accent-brand" /> {c.name}</label>
            ))}
          </div>
        </fieldset>
      )}
    </FormDialog>
  );
}

export function OptionButton({ yearId, classId, subjects, option }: { yearId: string; classId: string; subjects: Opt[]; option?: { id: string; subjectId: string; groupName: string; seats: number | null; prerequisite: string | null } }) {
  return (
    <FormDialog trigger={option ? "Edit" : "Add a choice"} triggerVariant={option ? "ghost" : "primary"} triggerSize={option ? "sm" : "md"} title={option ? "Edit the choice" : "Add an elective or language choice"} action={saveOptionAction} submitLabel="Save choice"
      hidden={{ yearId, classId, ...(option ? { id: option.id, subjectId: option.subjectId } : {}) }}>
      {(state) => (
        <>
          {!option && <SelectField label="Subject" name="subjectId" required defaultValue={v(state, "subjectId")} placeholder="Choose a subject" options={subjects.map((s) => ({ value: s.id, label: s.name }))} error={err(state, "subjectId")} />}
          <TextField label="Choice group" name="groupName" required defaultValue={v(state, "groupName", option?.groupName ?? "Second language")} error={err(state, "groupName")} help="Students pick one subject in each group, for example Second language or Elective." />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Seats" name="seats" inputMode="numeric" defaultValue={v(state, "seats", option?.seats ?? "")} error={err(state, "seats")} help="Empty for no limit." />
            <TextField label="Prerequisite" name="prerequisite" defaultValue={v(state, "prerequisite", option?.prerequisite ?? "")} error={err(state, "prerequisite")} help="Optional, for example 60% in Mathematics." />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function RecordChoicesButton({ options, students }: { options: { id: string; label: string; left: number | null }[]; students: { id: string; name: string; rollNo: number | null; section: string }[] }) {
  return (
    <FormDialog trigger="Record choices" triggerVariant="primary" title="Record students' choices" action={recordChoicesAction} submitLabel="Record choices" wide>
      {(state) => (
        <>
          <SelectField label="Subject chosen" name="optionId" required defaultValue={v(state, "optionId")} placeholder="Choose the subject" error={err(state, "optionId")}
            options={options.map((o) => ({ value: o.id, label: `${o.label}${o.left !== null ? ` (${o.left} seats left)` : ""}` }))} />
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Students who have not chosen yet</legend>
            {err(state, "studentIds") && <p className="mb-1 text-sm text-danger">{err(state, "studentIds")}</p>}
            {students.length === 0 ? <p className="text-ink-2">Everyone has chosen.</p> : (
              <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
                {students.map((s) => (
                  <label key={s.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="studentIds" value={s.id} className="size-5 accent-brand" /> {s.name} <span className="text-ink-2">{s.section}{s.rollNo ? `, roll ${s.rollNo}` : ""}</span></label>
                ))}
              </div>
            )}
          </fieldset>
        </>
      )}
    </FormDialog>
  );
}

export function RemoveChoiceButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Remove" triggerVariant="ghost" triggerClassName="min-h-11 text-danger" title={`Remove ${name}'s choice?`} confirmLabel="Remove choice" confirmVariant="danger"
      onConfirm={async () => { const p = await removeChoiceAction(id); if (!p) router.refresh(); return p; }}>
      The seat becomes free and {name} shows under “not chosen yet”.
    </ConfirmButton>
  );
}
