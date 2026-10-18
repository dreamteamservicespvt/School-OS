"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormDialog, err, v } from "../_components/form-dialog";
import {
  addConditionAction, addFinancialYearAction, addRoomAction, archiveConditionAction, archiveRoomAction, archiveSlotAction, archiveTermAction,
  closeYearAction, createYearAction, openYearAction, removeYearAction, saveSlotAction, saveTermAction, saveTimingsAction, savePreferenceAction,
  setFeatureAction, updateYearAction,
} from "./actions";

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Opt = { value: string; label: string };

function DayChecks({ name, label, chosen, help, error, only }: { name: string; label: string; chosen: number[]; help?: string; error?: string; only?: number[] }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {(only ?? DAYS).map((d) => (
          <label key={d} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="checkbox" name={name} value={d} defaultChecked={chosen.includes(d)} className="size-5" />{DAY_SHORT[d]}
          </label>
        ))}
      </div>
      {help && <p className="mt-1 text-xs text-ink-2">{help}</p>}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </fieldset>
  );
}

// ---------------------------------------------------------------- years

/** `pageYearId` (on the forms below): the page's year, so the change is made on that year's campus. */
export function NewYearButton({ years, suggested, presets, pageYearId }: { years: Opt[]; suggested: { name: string; start: string; end: string }; presets: readonly Opt[]; pageYearId: string }) {
  const [copy, setCopy] = useState(years[0]?.value ?? "");
  return (
    <FormDialog trigger="Start a new year" triggerVariant="primary" title="Start a new academic year" action={createYearAction} submitLabel="Create year" hidden={{ pageYearId }}>
      {(state) => (
        <>
          <TextField label="Name" name="name" required defaultValue={v(state, "name", suggested.name)} error={err(state, "name")} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Starts" name="startDate" type="date" required defaultValue={v(state, "startDate", suggested.start)} error={err(state, "startDate")} />
            <TextField label="Ends" name="endDate" type="date" required defaultValue={v(state, "endDate", suggested.end)} error={err(state, "endDate")} />
          </div>
          <SelectField label="Copy classes, sections, allocations and terms from" name="copyFrom" value={copy} onChange={(e) => setCopy(e.target.value)} placeholder="Nothing, start empty" options={years}
            help="The old year stays exactly as it is. Everything is copied into new records." />
          {!copy && <SelectField label="Terms" name="termPreset" defaultValue={v(state, "termPreset", "two-terms")} options={[...presets]} help="Change term dates later in the Terms tab." />}
          <p className="text-sm text-ink-2">The new year is Upcoming. Open it when it starts; the current year stays active until then.</p>
        </>
      )}
    </FormDialog>
  );
}

export function EditYear({ year }: { year: { id: string; name: string; start: string; end: string } }) {
  return (
    <FormDialog trigger="Edit" triggerVariant="ghost" triggerSize="sm" title={`Edit ${year.name}`} action={updateYearAction} submitLabel="Save" hidden={{ yearId: year.id }}>
      {(state) => (
        <>
          <TextField label="Name" name="name" required defaultValue={v(state, "name", year.name)} error={err(state, "name")} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Starts" name="startDate" type="date" required defaultValue={v(state, "startDate", year.start)} error={err(state, "startDate")} />
            <TextField label="Ends" name="endDate" type="date" required defaultValue={v(state, "endDate", year.end)} error={err(state, "endDate")} />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function OpenYear({ yearId, yearName, message, activeName }: { yearId: string; yearName: string; message: string; activeName: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [old, setOld] = useState<"close" | "keep">("keep");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () => start(async () => {
    const p = await openYearAction(yearId, old);
    if (p) setError(p); else { setOpen(false); router.refresh(); }
  });
  return (
    <>
      <Button size="sm" onClick={() => { setError(null); setOpen(true); }}>Open {yearName}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Open ${yearName}?`}>
        <p>{message}</p>
        {activeName && (
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-1 text-sm font-medium">What happens to {activeName}</legend>
            <label className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand">
              <input type="radio" name="old" className="mt-0.5 size-5" checked={old === "keep"} onChange={() => setOld("keep")} />
              <span><span className="font-medium">Keep it open</span><span className="block text-sm text-ink-2">For late marks, fees and report cards. Close it later.</span></span>
            </label>
            <label className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand">
              <input type="radio" name="old" className="mt-0.5 size-5" checked={old === "close"} onChange={() => setOld("close")} />
              <span><span className="font-medium">Close it now</span><span className="block text-sm text-ink-2">It becomes read-only. Corrections need a reason and are logged.</span></span>
            </label>
          </fieldset>
        )}
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={go} loading={busy} loadingText="Opening…">Open {yearName}</Button>
        </div>
      </Dialog>
    </>
  );
}

export function CloseYear({ yearId, yearName, notes }: { yearId: string; yearName: string; notes: string[] }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Close year" triggerVariant="ghost" triggerClassName="text-danger" title={`Close ${yearName}?`} confirmLabel={`Close ${yearName}`} confirmVariant="danger" typeToConfirm={yearName}
      onConfirm={async () => { const p = await closeYearAction(yearId); if (!p) router.refresh(); return p; }}>
      <p>{yearName} becomes read-only. Only the Principal or School Admin can make a correction, with a reason that is logged.</p>
      {notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </ConfirmButton>
  );
}

export function RemoveYear({ yearId, yearName, canRemove, message }: { yearId: string; yearName: string; canRemove: boolean; message: string }) {
  const router = useRouter();
  if (!canRemove) return null;
  return (
    <ConfirmButton trigger="Remove year" triggerVariant="ghost" triggerClassName="text-danger" title={`Remove ${yearName}?`} confirmLabel={`Remove ${yearName}`} confirmVariant="danger" typeToConfirm={yearName}
      onConfirm={async () => { const p = await removeYearAction(yearId); if (!p) router.refresh(); return p; }}>
      {message}
    </ConfirmButton>
  );
}

// ---------------------------------------------------------------- terms, financial years

export function TermButton({ yearId, term, suggested }: { yearId: string; term?: { id: string; name: string; start: string; end: string }; suggested?: { name: string; start: string; end: string } }) {
  return (
    <FormDialog trigger={term ? "Edit" : "Add term"} triggerVariant={term ? "ghost" : "secondary"} triggerSize={term ? "sm" : "md"} title={term ? `Edit ${term.name}` : "Add a term"} action={saveTermAction} submitLabel="Save term" hidden={{ yearId, id: term?.id ?? "" }}>
      {(state) => (
        <>
          <TextField label="Name" name="name" required defaultValue={v(state, "name", term?.name ?? suggested?.name)} error={err(state, "name")} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Starts" name="startDate" type="date" required defaultValue={v(state, "startDate", term?.start ?? suggested?.start)} error={err(state, "startDate")} />
            <TextField label="Ends" name="endDate" type="date" required defaultValue={v(state, "endDate", term?.end ?? suggested?.end)} error={err(state, "endDate")} />
          </div>
          <p className="text-sm text-ink-2">Terms sit inside the year and cannot overlap. A gap between terms is allowed; you are told about it.</p>
        </>
      )}
    </FormDialog>
  );
}

export function ArchiveTerm({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Remove" triggerVariant="ghost" triggerClassName="text-danger" title={`Remove ${name}?`} confirmLabel={`Remove ${name}`} confirmVariant="danger"
      onConfirm={async () => { const p = await archiveTermAction(id); if (!p) router.refresh(); return p; }}>
      It leaves the term lists. Blocked if exams already belong to it.
    </ConfirmButton>
  );
}

export function FinancialYearButton({ suggested }: { suggested: { name: string; start: string; end: string } }) {
  return (
    <FormDialog trigger="Add financial year" title="Add a financial year" action={addFinancialYearAction} submitLabel="Add">
      {(state) => (
        <>
          <TextField label="Name" name="name" required defaultValue={v(state, "name", suggested.name)} error={err(state, "name")} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Starts" name="startDate" type="date" required defaultValue={v(state, "startDate", suggested.start)} error={err(state, "startDate")} />
            <TextField label="Ends" name="endDate" type="date" required defaultValue={v(state, "endDate", suggested.end)} error={err(state, "endDate")} />
          </div>
          <p className="text-sm text-ink-2">Fee receipts and accounts are numbered by financial year (1 April to 31 March).</p>
        </>
      )}
    </FormDialog>
  );
}

// ---------------------------------------------------------------- timings and rules

export function TimingsForm({ s, pageYearId }: { s: { dayStart: string; dayEnd: string; workingDays: number[]; halfDays: number[]; halfDayEnd: string | null; maxPeriodsPerDay: number; maxPeriodsPerWeek: number; maxConsecutive: number; autoSubstitutions: boolean }; pageYearId: string }) {
  const [state, action] = useActionState(saveTimingsAction, null);
  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="pageYearId" value={pageYearId} />
      <FormMessage state={state} />
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">School timings and working days</h2>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <TextField label="School starts" name="dayStart" type="time" required defaultValue={v(state, "dayStart", s.dayStart)} error={err(state, "dayStart")} />
          <TextField label="School ends" name="dayEnd" type="time" required defaultValue={v(state, "dayEnd", s.dayEnd)} error={err(state, "dayEnd")} />
        </div>
        <DayChecks name="workingDays" label="Working days" chosen={s.workingDays} error={err(state, "workingDays")} help="The Time Table has a column for each working day." />
        <DayChecks name="halfDays" label="Half days" chosen={s.halfDays} error={err(state, "halfDays")} help="For example, Saturday until 12:30." />
        <TextField label="Half days end at" name="halfDayEnd" type="time" defaultValue={v(state, "halfDayEnd", s.halfDayEnd)} error={err(state, "halfDayEnd")} className="max-w-[12rem]" />
      </section>
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Teacher workload limits</h2>
        <div className="grid max-w-xl gap-3 sm:grid-cols-3">
          <TextField label="Periods a day, at most" name="maxPeriodsPerDay" inputMode="numeric" required defaultValue={v(state, "maxPeriodsPerDay", s.maxPeriodsPerDay)} error={err(state, "maxPeriodsPerDay")} />
          <TextField label="Periods a week, at most" name="maxPeriodsPerWeek" inputMode="numeric" required defaultValue={v(state, "maxPeriodsPerWeek", s.maxPeriodsPerWeek)} error={err(state, "maxPeriodsPerWeek")} />
          <TextField label="Periods in a row, at most" name="maxConsecutive" inputMode="numeric" required defaultValue={v(state, "maxConsecutive", s.maxConsecutive)} error={err(state, "maxConsecutive")} />
        </div>
        <p className="text-sm text-ink-2">Shown as a warning when assigning teachers and in the Time Table clash check. A teacher&apos;s own preferences can set lower limits.</p>
      </section>
      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Substitution rule</h2>
        <CheckboxField label="Raise substitutions automatically when a teacher's leave is approved" name="autoSubstitutions" defaultChecked={(v(state, "autoSubstitutions", s.autoSubstitutions ? "on" : "")) === "on"}
          help="Their periods are listed as Needed in Substitutions. Teachers marked absent by hand are always listed." />
      </section>
      <SubmitButton pendingText="Saving…">Save timings and rules</SubmitButton>
    </form>
  );
}

export function SlotButton({ slot, workingDays, nextNumber, pageYearId }: { slot?: { id: string; label: string; number: number; startTime: string; endTime: string; isBreak: boolean; days: number[] }; workingDays: number[]; nextNumber: number; pageYearId: string }) {
  const [isBreak, setIsBreak] = useState(slot?.isBreak ?? false);
  return (
    <FormDialog trigger={slot ? "Edit" : "Add period or break"} triggerVariant={slot ? "ghost" : "primary"} triggerSize={slot ? "sm" : "md"} title={slot ? `Edit ${slot.label}` : "Add a period or break"} action={saveSlotAction} submitLabel="Save" hidden={{ id: slot?.id ?? "", pageYearId }}>
      {(state) => (
        <>
          <CheckboxField label="Lunch or break" name="isBreak" checked={isBreak} onChange={(e) => setIsBreak(e.target.checked)} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Name" name="label" required defaultValue={v(state, "label", slot?.label ?? (isBreak ? "Lunch" : `Period ${nextNumber}`))} error={err(state, "label")} />
            {!isBreak && <TextField label="Period number" name="number" inputMode="numeric" required defaultValue={v(state, "number", slot?.number ?? nextNumber)} error={err(state, "number")} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Starts" name="startTime" type="time" required defaultValue={v(state, "startTime", slot?.startTime)} error={err(state, "startTime")} />
            <TextField label="Ends" name="endTime" type="time" required defaultValue={v(state, "endTime", slot?.endTime)} error={err(state, "endTime")} />
          </div>
          <DayChecks name="days" label="Runs on" chosen={slot?.days ?? workingDays} error={err(state, "days")} help="Untick a day when this period does not run, like periods 6 to 8 on a Saturday half day." />
        </>
      )}
    </FormDialog>
  );
}

export function ArchiveSlot({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Remove" triggerVariant="ghost" triggerClassName="text-danger" title={`Remove ${label}?`} confirmLabel={`Remove ${label}`} confirmVariant="danger"
      onConfirm={async () => { const p = await archiveSlotAction(id); if (!p) router.refresh(); return p; }}>
      It leaves the period master. Periods already placed in Time Tables stay until you change them.
    </ConfirmButton>
  );
}

// ---------------------------------------------------------------- teacher preferences, subject conditions

export function PreferenceButton({ teacher, pref, days, slots }: { teacher: { id: string; name: string }; pref: { maxPerDay: number | null; maxPerWeek: number | null; unavailable: string[]; note: string | null } | null; days: number[]; slots: { number: number; label: string }[] }) {
  return (
    <FormDialog trigger={pref ? "Edit" : "Set"} triggerVariant="ghost" triggerSize="sm" triggerLabel={`Preferences for ${teacher.name}`} title={`Preferences: ${teacher.name}`} action={savePreferenceAction} submitLabel="Save preferences" hidden={{ staffId: teacher.id }} wide>
      {(state) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Periods a day, at most" name="maxPerDay" inputMode="numeric" defaultValue={v(state, "maxPerDay", pref?.maxPerDay)} placeholder="School limit" error={err(state, "maxPerDay")} />
            <TextField label="Periods a week, at most" name="maxPerWeek" inputMode="numeric" defaultValue={v(state, "maxPerWeek", pref?.maxPerWeek)} placeholder="School limit" error={err(state, "maxPerWeek")} />
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Not available (rest times)</legend>
            <p className="mb-2 text-xs text-ink-2">Tick the periods this teacher should not get when the Time Table is made automatically.</p>
            <div className="relative overflow-x-auto">
              <table className="text-sm">
                <thead><tr><th className="px-2 text-left font-medium">Period</th>{days.map((d) => <th key={d} className="px-2 font-medium">{DAY_SHORT[d]}</th>)}</tr></thead>
                <tbody>
                  {slots.map((s) => (
                    <tr key={s.number}>
                      <th scope="row" className="whitespace-nowrap px-2 text-left font-normal">{s.label}</th>
                      {days.map((d) => (
                        <td key={d} className="px-2 text-center">
                          <input type="checkbox" name="unavailable" value={`${d}:${s.number}`} defaultChecked={pref?.unavailable.includes(`${d}:${s.number}`)} className="size-5" aria-label={`${DAY_SHORT[d]}, ${s.label}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>
          <TextField label="Note" name="note" defaultValue={v(state, "note", pref?.note)} placeholder="Leaves at 2 pm on Fridays" error={err(state, "note")} />
        </>
      )}
    </FormDialog>
  );
}

export function ConditionButton({ subjects, classes, days, slots }: { subjects: Opt[]; classes: Opt[]; days: number[]; slots: Opt[] }) {
  return (
    <FormDialog trigger="Add condition" triggerVariant="primary" title="Keep a subject out of a period" action={addConditionAction} submitLabel="Add condition">
      {(state) => (
        <>
          <SelectField label="Subject" name="subjectId" required defaultValue={v(state, "subjectId")} placeholder="Choose a subject" options={subjects} error={err(state, "subjectId")} />
          <SelectField label="Period" name="periodNo" required defaultValue={v(state, "periodNo")} placeholder="Choose a period" options={slots} error={err(state, "periodNo")} />
          <SelectField label="Day" name="dayOfWeek" defaultValue={v(state, "dayOfWeek")} placeholder="Every day" options={days.map((d) => ({ value: String(d), label: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][d] }))} error={err(state, "dayOfWeek")} />
          <SelectField label="Class" name="classId" defaultValue={v(state, "classId")} placeholder="All classes" options={classes} error={err(state, "classId")} />
          <p className="text-sm text-ink-2">For example, no Maths in period 8. Used when making the Time Table automatically, and warned about in the clash check.</p>
        </>
      )}
    </FormDialog>
  );
}

export function ArchiveCondition({ id, words }: { id: string; words: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-sm text-danger" role="alert">{error}</span>}
      <Button size="sm" variant="ghost" className="text-danger" loading={busy} aria-label={`Remove: ${words}`}
        onClick={() => start(async () => { const p = await archiveConditionAction(id); if (p) setError(p); else router.refresh(); })}>Remove</Button>
    </span>
  );
}

// ---------------------------------------------------------------- optional parts and rooms

export function FeatureToggle({ featureKey, label, help, on }: { featureKey: string; label: string; help: string; on: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const flip = () => start(async () => { const p = await setFeatureAction(featureKey, !on); if (p) setError(p); else router.refresh(); });
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-ink-2">{help}</p>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={flip} disabled={busy}
        className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${on ? "bg-brand" : "bg-line-strong"} disabled:opacity-60`}>
        <span className={`inline-block size-5 rounded-full bg-surface shadow transition ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

export function RoomButton({ pageYearId }: { pageYearId: string }) {
  return (
    <FormDialog trigger="Add room or lab" triggerVariant="primary" title="Add a room or lab" action={addRoomAction} submitLabel="Add" hidden={{ pageYearId }}>
      {(state) => (
        <>
          <TextField label="Name" name="name" required defaultValue={v(state, "name")} placeholder="Chemistry lab" error={err(state, "name")} />
          <SelectField label="Kind" name="kind" required defaultValue={v(state, "kind", "lab")} options={[{ value: "classroom", label: "Classroom" }, { value: "lab", label: "Lab" }, { value: "activity", label: "Activity room or ground" }]} error={err(state, "kind")} />
          <TextField label="Capacity" name="capacity" inputMode="numeric" defaultValue={v(state, "capacity")} placeholder="40" error={err(state, "capacity")} />
        </>
      )}
    </FormDialog>
  );
}

export function ArchiveRoom({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Remove" triggerVariant="ghost" triggerClassName="text-danger" title={`Remove ${name}?`} confirmLabel={`Remove ${name}`} confirmVariant="danger"
      onConfirm={async () => { const p = await archiveRoomAction(id); if (!p) router.refresh(); return p; }}>
      It leaves the room list. Bookings already made stay in the history.
    </ConfirmButton>
  );
}
