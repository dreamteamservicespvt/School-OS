"use client";

import { CheckboxField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { ActionButton, FormDialog, type Action } from "../_components/forms";
import { Plus } from "lucide-react";

type Option = { value: string; label: string };

export function VacancyForm({ action, designations, departments }: { action: Action; designations: Option[]; departments: Option[] }) {
  return (
    <FormDialog trigger={<><Plus size={17} aria-hidden="true" />Open a vacancy</>} triggerVariant="primary" title="Open a vacancy" action={action} submitLabel="Open vacancy">
      {(f) => (
        <>
          <SelectField label="Post" name="designation" required options={designations} placeholder="Choose" defaultValue={f.val("designation")} error={f.err("designation")} />
          <SelectField label="Department" name="departmentId" options={departments} placeholder="None" defaultValue={f.val("departmentId")} error={f.err("departmentId")} />
          <TextField label="Openings" name="openings" inputMode="numeric" defaultValue={f.val("openings", "1")} error={f.err("openings")} />
          <TextField label="Last date to apply" name="closingDate" type="date" defaultValue={f.val("closingDate")} error={f.err("closingDate")} />
          <TextArea label="Details" name="details" rows={3} defaultValue={f.val("details")} error={f.err("details")} help="Qualifications, subjects and experience wanted." />
        </>
      )}
    </FormDialog>
  );
}

export function StatusSelectForm({ trigger, title, hidden, options, current, action }: { trigger: string; title: string; hidden: Record<string, string>; options: Option[]; current: string; action: Action }) {
  return (
    <FormDialog trigger={trigger} triggerSize="sm" title={title} action={action} submitLabel="Save" hidden={hidden}>
      {(f) => <SelectField label="Status" name="status" required options={options} defaultValue={f.val("status", current)} error={f.err("status")} />}
    </FormDialog>
  );
}

export function ApplicationForm({ action, vacancyId, vacancy }: { action: Action; vacancyId: string; vacancy: string }) {
  return (
    <FormDialog trigger={<><Plus size={15} aria-hidden="true" />Add application</>} triggerSize="sm" title={`Application for ${vacancy}`} action={action} submitLabel="Add application" hidden={{ vacancyId }} multipart wide>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" required defaultValue={f.val("name")} error={f.err("name")} />
          <TextField label="Phone" name="phone" required inputMode="tel" defaultValue={f.val("phone")} error={f.err("phone")} />
          <TextField label="Email" name="email" type="email" defaultValue={f.val("email")} error={f.err("email")} />
          <TextField label="Experience (years)" name="experienceYears" inputMode="numeric" defaultValue={f.val("experienceYears")} error={f.err("experienceYears")} />
          <TextField label="Qualifications" name="qualification" defaultValue={f.val("qualification")} error={f.err("qualification")} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <label htmlFor="resume" className="mb-1 block text-sm font-medium">Resume</label>
            <input id="resume" name="resume" type="file" accept="image/jpeg,image/png,application/pdf" className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-sm" />
            {f.err("resume") && <p className="mt-1 text-sm text-danger">{f.err("resume")}</p>}
          </div>
          <TextArea label="Notes" name="notes" rows={2} defaultValue={f.val("notes")} error={f.err("notes")} className="sm:col-span-2" />
        </div>
      )}
    </FormDialog>
  );
}

export function InterviewForm({ action, applicationId, name, staff }: { action: Action; applicationId: string; name: string; staff: Option[] }) {
  return (
    <FormDialog trigger="Schedule interview" triggerSize="sm" title={`Interview: ${name}`} action={action} submitLabel="Schedule" hidden={{ applicationId }} wide>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Date and time" name="startsAt" type="datetime-local" required defaultValue={f.val("startsAt")} error={f.err("startsAt")} />
          <TextField label="Length (minutes)" name="minutes" inputMode="numeric" defaultValue={f.val("minutes", "30")} error={f.err("minutes")} />
          <TextField label="Place" name="place" defaultValue={f.val("place")} error={f.err("place")} placeholder="Principal's office" className="sm:col-span-2" />
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Interviewers <span className="text-danger" aria-hidden="true">*</span></legend>
            {f.err("interviewerIds") && <p className="mb-1 text-sm text-danger">{f.err("interviewerIds")}</p>}
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
              {staff.map((s) => <CheckboxField key={s.value} label={s.label} name="interviewerIds" value={s.value} />)}
            </div>
          </fieldset>
        </div>
      )}
    </FormDialog>
  );
}

export function OutcomeForm({ action, interviewId, options }: { action: Action; interviewId: string; options: Option[] }) {
  return (
    <FormDialog trigger="Outcome" triggerSize="sm" title="Interview outcome" action={action} submitLabel="Save" hidden={{ interviewId }}>
      {(f) => (
        <>
          <SelectField label="Outcome" name="outcome" required options={options} defaultValue={f.val("outcome", "PASSED")} error={f.err("outcome")} />
          <TextArea label="Notes" name="notes" rows={3} defaultValue={f.val("notes")} error={f.err("notes")} />
        </>
      )}
    </FormDialog>
  );
}

export function OfferForm({ action, applicationId, name, designation, designations, departments }: { action: Action; applicationId: string; name: string; designation: string; designations: Option[]; departments: Option[] }) {
  return (
    <FormDialog trigger="Make offer" triggerSize="sm" triggerVariant="primary" title={`Offer to ${name}`} action={action} submitLabel="Make offer" hidden={{ applicationId }}>
      {(f) => (
        <>
          <SelectField label="Post" name="designation" required options={designations} defaultValue={f.val("designation", designation)} error={f.err("designation")} />
          <SelectField label="Department" name="departmentId" options={departments} placeholder="None" defaultValue={f.val("departmentId")} error={f.err("departmentId")} />
          <TextField label="Joining date" name="joiningDate" type="date" required defaultValue={f.val("joiningDate")} error={f.err("joiningDate")} />
          <TextField label="Monthly salary (₹)" name="monthly" inputMode="decimal" defaultValue={f.val("monthly")} error={f.err("monthly")} help="Optional. Shown on the offer letter." />
          <TextField label="Reply by" name="respondBy" type="date" defaultValue={f.val("respondBy")} error={f.err("respondBy")} />
        </>
      )}
    </FormDialog>
  );
}

export function CycleForm({ action, years, today }: { action: Action; years: Option[]; today: string }) {
  return (
    <FormDialog trigger={<><Plus size={17} aria-hidden="true" />Start appraisal</>} triggerVariant="primary" title="Start an appraisal cycle" action={action} submitLabel="Start" wide>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" required defaultValue={f.val("name")} error={f.err("name")} placeholder="Appraisal 2026-27" />
          <SelectField label="Academic year" name="academicYearId" required options={years} defaultValue={f.val("academicYearId", years[0]?.value)} error={f.err("academicYearId")} />
          <TextField label="Start date" name="startDate" type="date" required defaultValue={f.val("startDate", today)} error={f.err("startDate")} />
          <TextField label="End date" name="endDate" type="date" required defaultValue={f.val("endDate")} error={f.err("endDate")} />
          <TextArea label="What to rate, one per line" name="criteria" required rows={5} className="sm:col-span-2" error={f.err("criteria")}
            defaultValue={f.val("criteria", "Subject knowledge\nClassroom teaching\nStudent results\nPunctuality\nWorking with parents")} help="Each is rated 1 to 5." />
        </div>
      )}
    </FormDialog>
  );
}

const RATING = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} – ${["Poor", "Needs work", "Good", "Very good", "Excellent"][n - 1]}` }));

export function ReviewForm({ action, appraisalId, by, name, criteria, earlier }: { action: Action; appraisalId: string; by: "self" | "manager"; name: string; criteria: string[]; earlier?: Record<string, number> }) {
  return (
    <FormDialog trigger={by === "self" ? "Fill self review" : "Review"} triggerSize="sm" triggerVariant="primary" title={by === "self" ? "Self review" : `Review: ${name}`} action={action} submitLabel="Send" hidden={{ appraisalId, by }}>
      {(f) => (
        <>
          {f.err("ratings") && <p className="text-sm text-danger">{f.err("ratings")}</p>}
          {criteria.map((c, i) => (
            <SelectField key={c} label={c} name={`r${i}`} required options={RATING} placeholder="Choose" defaultValue={f.val(`r${i}`)}
              help={earlier?.[c] ? `Self rating: ${earlier[c]}` : undefined} />
          ))}
          <TextArea label="Comment" name="comment" rows={3} defaultValue={f.val("comment")} error={f.err("comment")} />
        </>
      )}
    </FormDialog>
  );
}

export function CloseCycleButton({ action, cycleId }: { action: Action; cycleId: string }) {
  return <ActionButton action={action} hidden={{ cycleId }}>Close cycle</ActionButton>;
}

export function TrainingForm({ action, staff, today }: { action: Action; staff: Option[]; today: string }) {
  return (
    <FormDialog trigger={<><Plus size={17} aria-hidden="true" />Add training</>} triggerVariant="primary" title="Add training" action={action} submitLabel="Add" multipart wide>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Staff member" name="staffId" required options={staff} placeholder="Choose" defaultValue={f.val("staffId")} error={f.err("staffId")} className="sm:col-span-2" />
          <TextField label="Course" name="course" required defaultValue={f.val("course")} error={f.err("course")} />
          <TextField label="Given by" name="provider" defaultValue={f.val("provider")} error={f.err("provider")} placeholder="CBSE COE" />
          <TextField label="From date" name="fromDate" type="date" required defaultValue={f.val("fromDate", today)} error={f.err("fromDate")} />
          <TextField label="To date" name="toDate" type="date" required defaultValue={f.val("toDate", today)} error={f.err("toDate")} />
          <TextField label="Hours" name="hours" inputMode="decimal" required defaultValue={f.val("hours")} error={f.err("hours")} />
          <div>
            <label htmlFor="cert" className="mb-1 block text-sm font-medium">Certificate</label>
            <input id="cert" name="certificate" type="file" accept="image/jpeg,image/png,application/pdf" className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-sm" />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

export function PromotionForm({ action, staff, designations, departments, today }: { action: Action; staff: Option[]; designations: Option[]; departments: Option[]; today: string }) {
  return (
    <FormDialog trigger={<><Plus size={17} aria-hidden="true" />Record promotion</>} triggerVariant="primary" title="Record promotion" action={action} submitLabel="Save">
      {(f) => (
        <>
          <SelectField label="Staff member" name="staffId" required options={staff} placeholder="Choose" defaultValue={f.val("staffId")} error={f.err("staffId")} />
          <SelectField label="New designation" name="toDesignation" required options={designations} placeholder="Choose" defaultValue={f.val("toDesignation")} error={f.err("toDesignation")} />
          <SelectField label="New department" name="toDepartmentId" options={departments} placeholder="Keep the same" defaultValue={f.val("toDepartmentId")} error={f.err("toDepartmentId")} />
          <TextField label="From date" name="effectiveFrom" type="date" required defaultValue={f.val("effectiveFrom", today)} error={f.err("effectiveFrom")} />
          <TextArea label="Reason" name="reason" required rows={2} defaultValue={f.val("reason")} error={f.err("reason")} />
        </>
      )}
    </FormDialog>
  );
}
