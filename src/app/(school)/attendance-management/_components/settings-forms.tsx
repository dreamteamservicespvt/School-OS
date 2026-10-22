"use client";

// Attendance Settings forms (05 §6). Each tab saves on its own.

import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { ActionButton, ActionForm, FormDialog, type Action } from "../../staff-hr-management/_components/forms";
import { toneClass } from "./status";

type Option = { value: string; label: string };

function Checks({ name, label, options, values, help, error }: { name: string; label: string; options: Option[]; values: string[]; help?: string; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="checkbox" name={name} value={o.value} defaultChecked={values.includes(o.value)} className="size-5 accent-[var(--brand)]" />
            {o.label}
          </label>
        ))}
      </div>
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : help ? <p className="mt-1 text-sm text-ink-2">{help}</p> : null}
    </fieldset>
  );
}

const METHODS: Option[] = [
  { value: "register", label: "Register (by hand)" }, { value: "mobile", label: "Mobile" }, { value: "qr", label: "QR" },
  { value: "device", label: "Device" }, { value: "geo", label: "Campus area" },
];

export type SettingsValues = {
  studentMethods: string[]; staffMethods: string[]; periodWise: boolean; offline: boolean;
  punchWindowStart: string; punchWindowEnd: string; repeatPunchMinutes: number; maxClockSkewMinutes: number;
  defaultStatus: string; periodDayRule: string; registerOrder: string; showPhotos: boolean;
  studentStartTime: string; studentLateAfterMin: number; staffStartTime: string; staffLateAfterMin: number; staffHalfDayAfter: string; lockTime: string; lockOverrideRoles: string[];
  absenceAlertOn: boolean; absenceDelayMinutes: number; absenceChannels: string[]; absenceTemplate: string; lateAlertOn: boolean;
  thresholdOn: boolean; thresholdPercent: number; thresholdNotify: string[]; chronicOn: boolean; chronicDays: number; chronicNotify: string[];
  classTeacherLeaveDays: number; quotaOverNeedsApproval: boolean; quotasOn: boolean;
};

export function PunchMethodsForm({ action, v }: { action: Action; v: SettingsValues }) {
  return (
    <ActionForm action={action} submitLabel="Save punch methods" keep>
      {(f) => (
        <div className="space-y-5">
          <SelectField label="Attendance method" name="method" defaultValue={f.val("method", v.periodWise ? "period" : "day")} error={f.err("method")}
            options={[{ value: "day", label: "Once a day (class teacher)" }, { value: "period", label: "Every period (period-wise, from the Time Table)" }]} />
          <Checks name="studentMethods" label="Ways to mark students" options={METHODS} values={v.studentMethods} error={f.err("studentMethods")} />
          <Checks name="staffMethods" label="Ways to mark staff" options={METHODS} values={v.staffMethods} error={f.err("staffMethods")}
            help="Device, QR and Mobile switch on Devices & QR. Campus area makes check-ins count only inside the school." />
          <CheckboxField label="Offline mode for Take Attendance" name="offline" defaultChecked={v.offline} help="For schools with poor internet: attendance is kept on the teacher's phone and sent when online. The first save to arrive wins; a second one becomes a correction request." />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Punches count from" name="punchWindowStart" type="time" required defaultValue={f.val("punchWindowStart", v.punchWindowStart)} error={f.err("punchWindowStart")} />
            <TextField label="Punches count until" name="punchWindowEnd" type="time" required defaultValue={f.val("punchWindowEnd", v.punchWindowEnd)} error={f.err("punchWindowEnd")} />
            <TextField label="A repeat punch within (minutes)" name="repeatPunchMinutes" type="number" min={1} max={120} required defaultValue={f.val("repeatPunchMinutes", String(v.repeatPunchMinutes))} error={f.err("repeatPunchMinutes")} />
            <TextField label="Flag phone clocks wrong by more than (minutes)" name="maxClockSkewMinutes" type="number" min={1} max={240} required defaultValue={f.val("maxClockSkewMinutes", String(v.maxClockSkewMinutes))} error={f.err("maxClockSkewMinutes")} help="For offline saves. The school's time is used instead." />
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function DisplayForm({ action, v }: { action: Action; v: SettingsValues }) {
  return (
    <ActionForm action={action} submitLabel="Save display settings" keep>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Take Attendance starts with" name="defaultStatus" defaultValue={f.val("defaultStatus", v.defaultStatus)}
            options={[{ value: "present", label: "Everyone Present" }, { value: "none", label: "Nobody marked" }]} />
          <SelectField label="Register order" name="registerOrder" defaultValue={f.val("registerOrder", v.registerOrder)}
            options={[{ value: "roll", label: "Roll number" }, { value: "name", label: "Name" }]} />
          <SelectField label="Period-wise: a day counts as present when" name="periodDayRule" defaultValue={f.val("periodDayRule", v.periodDayRule)}
            options={[{ value: "any", label: "Present in any period" }, { value: "most", label: "Present in most periods" }]} help="Only for period-wise attendance. The first period decides the absence message." />
          <CheckboxField label="Show student photos" name="showPhotos" defaultChecked={v.showPhotos} className="self-end" />
        </div>
      )}
    </ActionForm>
  );
}

export function LateRulesForm({ action, v, roles }: { action: Action; v: SettingsValues; roles: Option[] }) {
  return (
    <ActionForm action={action} submitLabel="Save late rules" keep>
      {(f) => (
        <div className="space-y-5">
          <p className="text-sm text-ink-2">One rule is used for devices, QR, mobile and marking by hand.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Students start at" name="studentStartTime" type="time" required defaultValue={f.val("studentStartTime", v.studentStartTime)} error={f.err("studentStartTime")} />
            <TextField label="Students are late after (minutes)" name="studentLateAfterMin" type="number" min={0} max={240} required defaultValue={f.val("studentLateAfterMin", String(v.studentLateAfterMin))} error={f.err("studentLateAfterMin")} />
            <TextField label="Staff start at" name="staffStartTime" type="time" required defaultValue={f.val("staffStartTime", v.staffStartTime)} error={f.err("staffStartTime")} help="Staff on a shift follow their shift." />
            <TextField label="Staff are late after (minutes)" name="staffLateAfterMin" type="number" min={0} max={240} required defaultValue={f.val("staffLateAfterMin", String(v.staffLateAfterMin))} error={f.err("staffLateAfterMin")} />
            <TextField label="Staff coming in after this are half-day" name="staffHalfDayAfter" type="time" defaultValue={f.val("staffHalfDayAfter", v.staffHalfDayAfter)} error={f.err("staffHalfDayAfter")} help="Empty means no half-day rule." />
            <TextField label="Attendance locks at" name="lockTime" type="time" required defaultValue={f.val("lockTime", v.lockTime)} error={f.err("lockTime")} help="After this, a change needs a correction request through Approvals." />
          </div>
          <Checks name="lockOverrideRoles" label="Who may still change attendance after the lock (audited)" options={roles} values={v.lockOverrideRoles} error={f.err("lockOverrideRoles")} />
        </div>
      )}
    </ActionForm>
  );
}

const NOTIFY: Option[] = [{ value: "parent", label: "Parent" }, { value: "class-teacher", label: "Class teacher" }, { value: "principal", label: "Principal" }];

export function NotificationsForm({ action, v }: { action: Action; v: SettingsValues }) {
  return (
    <ActionForm action={action} submitLabel="Save alerts" keep>
      {(f) => (
        <div className="space-y-6">
          <section className="space-y-3">
            <CheckboxField label="Absence message to parents" name="absenceAlertOn" defaultChecked={v.absenceAlertOn} help="One message per student per day, never for students on approved leave. Its text and channels are set in Communication." />
            <TextField label="Wait before sending (minutes)" name="absenceDelayMinutes" type="number" min={0} max={240} required defaultValue={f.val("absenceDelayMinutes", String(v.absenceDelayMinutes))} error={f.err("absenceDelayMinutes")} help="A mistake can be fixed before the message goes." className="sm:max-w-xs" />
          </section>
          <CheckboxField label="Late-arrival message to parents" name="lateAlertOn" defaultChecked={v.lateAlertOn} />
          <section className="space-y-3 border-t border-line pt-5">
            <CheckboxField label="Attendance % threshold alert" name="thresholdOn" defaultChecked={v.thresholdOn} help="Flagged once when a student falls below; cleared when they recover." />
            <TextField label="Threshold %" name="thresholdPercent" type="number" min={1} max={100} required defaultValue={f.val("thresholdPercent", String(v.thresholdPercent))} error={f.err("thresholdPercent")} className="sm:max-w-xs" />
            <Checks name="thresholdNotify" label="Who is told" options={NOTIFY} values={v.thresholdNotify} />
          </section>
          <section className="space-y-3 border-t border-line pt-5">
            <CheckboxField label="Chronic absence alert" name="chronicOn" defaultChecked={v.chronicOn} />
            <TextField label="Absent this many school days in a row" name="chronicDays" type="number" min={2} max={30} required defaultValue={f.val("chronicDays", String(v.chronicDays))} error={f.err("chronicDays")} className="sm:max-w-xs" />
            <Checks name="chronicNotify" label="Who is told" options={NOTIFY} values={v.chronicNotify} />
          </section>
        </div>
      )}
    </ActionForm>
  );
}

export type StatusRow = { id: string; key: string; name: string; letter: string; tone: string; counts: string; forWhom: string; system: boolean; archived: boolean };

export function StatusForm({ action, tones, counts, status }: { action: Action; tones: Option[]; counts: Option[]; status?: StatusRow }) {
  return (
    <FormDialog trigger={status ? "Edit" : "Add status"} triggerVariant={status ? "ghost" : "primary"} triggerSize="sm" title={status ? `Edit ${status.name}` : "Add a status"} action={action} submitLabel="Save status" hidden={status ? { statusId: status.id } : undefined}>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" required maxLength={30} placeholder="On duty" defaultValue={f.val("name", status?.name)} error={f.err("name")} />
          <TextField label="Letter" name="letter" required maxLength={3} placeholder="OD" defaultValue={f.val("letter", status?.letter)} error={f.err("letter")} help="Shown in the register." />
          <SelectField label="Colour" name="tone" options={tones} defaultValue={f.val("tone", status?.tone ?? "neutral")} error={f.err("tone")} />
          {status?.system ? (
            <p className="text-sm text-ink-2 sm:col-span-2">This is a standard status: how it counts and who it is for stay fixed.</p>
          ) : (
            <>
              <SelectField label="How it counts" name="counts" options={counts} defaultValue={f.val("counts", status?.counts ?? "present")} error={f.err("counts")} />
              <SelectField label="For" name="forWhom" options={[{ value: "both", label: "Students and staff" }, { value: "students", label: "Students" }, { value: "staff", label: "Staff" }]} defaultValue={f.val("forWhom", status?.forWhom ?? "both")} error={f.err("forWhom")} className="sm:col-span-2" />
            </>
          )}
          {status?.system && <><input type="hidden" name="counts" value={status.counts} /><input type="hidden" name="forWhom" value={status.forWhom} /></>}
        </div>
      )}
    </FormDialog>
  );
}

export function StatusList({ rows, save, archive, tones, counts }: { rows: StatusRow[]; save: Action; archive: Action; tones: Option[]; counts: Option[] }) {
  const countLabel = new Map(counts.map((c) => [c.value, c.label]));
  const forLabel: Record<string, string> = { both: "Students and staff", students: "Students", staff: "Staff" };
  return (
    <ul className="divide-y divide-line">
      {rows.map((s) => (
        <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${s.archived ? "opacity-70" : ""}`}>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className={`inline-grid h-8 min-w-8 place-items-center rounded border px-1 text-sm font-semibold ${toneClass(s.tone)}`}>{s.letter}</span>
            <div>
              <p className="font-medium">{s.name}{s.archived ? " (archived)" : ""}{s.system ? <span className="ml-1 text-sm font-normal text-ink-2">· standard</span> : null}</p>
              <p className="text-sm text-ink-2">{countLabel.get(s.counts)} · {forLabel[s.forWhom] ?? s.forWhom}</p>
            </div>
          </div>
          <div className="flex gap-1">
            {!s.archived && <StatusForm action={save} tones={tones} counts={counts} status={s} />}
            {!s.system && <ActionButton action={archive} hidden={{ statusId: s.id, ...(s.archived ? { restore: "1" } : {}) }} variant="ghost">{s.archived ? "Restore" : "Archive"}</ActionButton>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export type LeaveTypeRow = { id: string; name: string; code: string; quotaDays: number | null; quotaPeriod: string };

export function LeaveTypeForm({ action, type, quotasOn }: { action: Action; type?: LeaveTypeRow; quotasOn: boolean }) {
  return (
    <FormDialog trigger={type ? "Edit" : "Add leave type"} triggerVariant={type ? "ghost" : "secondary"} triggerSize="sm" title={type ? `Edit ${type.name}` : "Add a student leave type"} action={action} submitLabel="Save leave type" hidden={type ? { typeId: type.id } : undefined}>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" required maxLength={40} placeholder="Sports event" defaultValue={f.val("name", type?.name)} error={f.err("name")} className="sm:col-span-2" />
          <TextField label="Days allowed" name="quotaDays" inputMode="decimal" defaultValue={f.val("quotaDays", type?.quotaDays?.toString() ?? "")} error={f.err("quotaDays")} help={quotasOn ? "Empty means no limit." : "Used when student leave balances are on."} />
          <SelectField label="Per" name="quotaPeriod" options={[{ value: "term", label: "Term" }, { value: "year", label: "Academic year" }]} defaultValue={f.val("quotaPeriod", type?.quotaPeriod ?? "term")} />
        </div>
      )}
    </FormDialog>
  );
}

export function LeaveRulesForm({ action, v }: { action: Action; v: SettingsValues }) {
  return (
    <ActionForm action={action} submitLabel="Save leave rules" keep>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Class teachers decide leave up to (days)" name="classTeacherLeaveDays" type="number" min={0} max={30} required defaultValue={f.val("classTeacherLeaveDays", String(v.classTeacherLeaveDays))} error={f.err("classTeacherLeaveDays")} help="Longer leave goes to the principal. Approvers are set in Settings, Forms & Approvals." />
          <div className="space-y-3">
            <CheckboxField label="Student leave balances and quotas" name="quotasOn" defaultChecked={v.quotasOn} help={'Shows "Medical: 2 of 6 days left this term" while recording leave.'} />
            <CheckboxField label="Going over the quota needs approval" name="quotaOverNeedsApproval" defaultChecked={v.quotaOverNeedsApproval} />
          </div>
        </div>
      )}
    </ActionForm>
  );
}
