"use client";

// Forms on Test & Interview: schedule a test for many applicants, add more,
// the score sheet, book an interview slot, record the outcome, cancel.

import { useRouter } from "next/navigation";
import { ActionForm, FormDialog } from "../_components/forms";
import { SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { addToTestAction, cancelInterviewAction, outcomeAction, scheduleInterviewAction, scheduleTestAction, scoresAction } from "./actions";

export type Applicant = { id: string; name: string; meta: string };

function ApplicantPicker({ applicants, chosen, error }: { applicants: Applicant[]; chosen: string[]; error?: string }) {
  if (applicants.length === 0) return <p className="text-ink-2">No applicant is waiting for a test.</p>;
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Applicants <span className="text-danger" aria-hidden="true">*</span></legend>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
        {applicants.map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
            <input type="checkbox" name="applicationIds" value={a.id} defaultChecked={chosen.includes(a.id)} className="size-5" />
            <span>{a.name}<span className="block text-sm text-ink-2">{a.meta}</span></span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </fieldset>
  );
}

export function ScheduleTest({ applicants, classes, chosen = [], open }: { applicants: Applicant[]; classes: Option[]; chosen?: string[]; open?: boolean }) {
  return (
    <FormDialog trigger="Schedule test" triggerVariant="primary" title="Schedule an entrance test" action={scheduleTestAction} submitLabel="Schedule and tell parents" wide defaultOpen={open}>
      {(f) => (
        <>
          <TextField label="Test name" name="title" required maxLength={120} placeholder="Class 6 entrance test" defaultValue={f.val("title")} error={f.err("title")} />
          <SelectField label="Class" name="classId" options={classes} placeholder="Any class" defaultValue={f.val("classId")} error={f.err("classId")} />
          <TextField label="Date and time" name="startsAt" type="datetime-local" required defaultValue={f.val("startsAt")} error={f.err("startsAt")} />
          <TextField label="Venue" name="venue" maxLength={120} placeholder="Room 12, main building" defaultValue={f.val("venue")} error={f.err("venue")} />
          <TextField label="Maximum marks" name="maxMarks" inputMode="numeric" defaultValue={f.val("maxMarks", "100")} error={f.err("maxMarks")} />
          <ApplicantPicker applicants={applicants} chosen={chosen} error={f.err("applicationIds")} />
          <p className="text-sm text-ink-2">Each parent gets a message with the date, time and venue. The test goes on the School Calendar.</p>
        </>
      )}
    </FormDialog>
  );
}

export function AddToTest({ testId, applicants }: { testId: string; applicants: Applicant[] }) {
  return (
    <FormDialog trigger="Add applicants" title="Add applicants to this test" action={addToTestAction} hidden={{ testId }} submitLabel="Add and tell parents" wide>
      {(f) => <ApplicantPicker applicants={applicants} chosen={[]} error={f.err("applicationIds")} />}
    </FormDialog>
  );
}

export type ScoreLine = { applicationId: string; name: string; number: string; marks: string; absent: boolean; remarks: string };

export function ScoreSheet({ testId, maxMarks, lines }: { testId: string; maxMarks: number; lines: ScoreLine[] }) {
  return (
    <ActionForm action={scoresAction} hidden={{ testId }} submitLabel="Save scores" pendingText="Saving…" keep>
      {(f) => (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Scores out of {maxMarks}</caption>
            <thead className="text-sm text-ink-2">
              <tr><th scope="col" className="py-2 pr-3 font-medium">Applicant</th><th scope="col" className="py-2 pr-3 font-medium">Marks (of {maxMarks})</th><th scope="col" className="py-2 pr-3 font-medium">Absent</th><th scope="col" className="py-2 font-medium">Remarks</th></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.applicationId} className="border-t border-line align-top">
                  <th scope="row" className="py-2 pr-3 font-normal">
                    <input type="hidden" name="row" value={l.applicationId} />
                    {l.name}<span className="block text-sm text-ink-2">{l.number}</span>
                  </th>
                  <td className="py-2 pr-3">
                    <input aria-label={`Marks for ${l.name}`} name={`marks_${l.applicationId}`} inputMode="decimal" defaultValue={f.val(`marks_${l.applicationId}`, l.marks)} className="h-11 w-24 rounded-lg border border-line-strong bg-surface px-3" />
                    {f.err(`marks_${l.applicationId}`) && <p className="mt-1 text-sm text-danger">{f.err(`marks_${l.applicationId}`)}</p>}
                  </td>
                  <td className="py-2 pr-3"><input type="checkbox" aria-label={`${l.name} was absent`} name={`absent_${l.applicationId}`} defaultChecked={l.absent} className="mt-3 size-5" /></td>
                  <td className="py-2"><input aria-label={`Remarks for ${l.name}`} name={`remarks_${l.applicationId}`} maxLength={300} defaultValue={f.val(`remarks_${l.applicationId}`, l.remarks)} className="h-11 w-full min-w-40 rounded-lg border border-line-strong bg-surface px-3" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ActionForm>
  );
}

export function BookInterview({ applicationId, interviewerStaffId, slots, done }: { applicationId: string; interviewerStaffId: string; slots: Option[]; done: string }) {
  const router = useRouter();
  return (
    <ActionForm action={scheduleInterviewAction} hidden={{ applicationId, interviewerStaffId }} submitLabel="Book interview" pendingText="Booking…" onSaved={() => router.push(done)}>
      {(f) => <SelectField label="Slot" name="slot" required options={slots} defaultValue={f.val("slot", slots[0]?.value)} error={f.err("slot")} help="15 minutes each. Booked slots are not shown." />}
    </ActionForm>
  );
}

export function OutcomeForm({ slotId, outcomes, outcome, notes }: { slotId: string; outcomes: Option[]; outcome: string | null; notes: string | null }) {
  return (
    <FormDialog trigger={outcome ? "Change outcome" : "Record outcome"} triggerSize="sm" triggerVariant={outcome ? "secondary" : "primary"} title="Interview outcome" action={outcomeAction} hidden={{ slotId }} submitLabel="Save outcome">
      {(f) => (
        <>
          <SelectField label="Outcome" name="outcome" required options={outcomes} defaultValue={f.val("outcome", outcome)} error={f.err("outcome")} />
          <TextArea label="Notes" name="notes" maxLength={1000} rows={4} defaultValue={f.val("notes", notes)} error={f.err("notes")} />
          {outcome && <p className="text-sm text-ink-2">The earlier outcome stays in the decision history.</p>}
        </>
      )}
    </FormDialog>
  );
}

export function CancelInterview({ slotId }: { slotId: string }) {
  return (
    <FormDialog trigger="Cancel" triggerSize="sm" triggerVariant="ghost" title="Cancel this interview" action={cancelInterviewAction} hidden={{ slotId }} submitLabel="Cancel interview" submitVariant="danger">
      {(f) => <TextArea label="Reason" name="reason" required maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />}
    </FormDialog>
  );
}
