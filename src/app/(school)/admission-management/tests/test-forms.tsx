"use client";

// Test & Interview sheets (design: mod-admissions.jsx ScoreSheet,
// ScheduleTestSheet, ScheduleInterviewSheet, OutcomeSheet).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Plus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, inputCls, SelectField, TextArea, TextField } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { FormSheet, WhenField } from "../_components/forms";
import { addToTestAction, cancelInterviewAction, freeSlotsAction, outcomeAction, scheduleInterviewAction, scheduleTestAction, scoresAction } from "./actions";

export type Applicant = { id: string; name: string; meta: string };

function Picker({ applicants, chosen, onChange, error }: { applicants: Applicant[]; chosen: Set<string>; onChange: (s: Set<string>) => void; error?: string }) {
  return (
    <FieldShell label="Applicants" id="st-apps" required error={error} help={applicants.length ? "Applications not yet decided. Tap to pick." : "No applications are waiting."}>
      <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
        {applicants.map((a) => {
          const on = chosen.has(a.id);
          return (
            <button type="button" key={a.id} aria-pressed={on} onClick={() => { const x = new Set(chosen); if (on) x.delete(a.id); else x.add(a.id); onChange(x); }}
              className={cx("h-9 px-3 rounded-xl border text-[13px] font-semibold inline-flex items-center gap-1.5 transition", on ? "bg-brand/10 border-brand text-brand" : "border-line text-ink2 hover:border-ink3/50")}>
              {on && <Check size={14} aria-hidden="true" />}{a.name} <span className="font-normal text-ink3">· {a.meta}</span>
            </button>
          );
        })}
      </div>
      {[...chosen].map((id) => <input key={id} type="hidden" name="applicationIds" value={id} />)}
    </FieldShell>
  );
}

/** The day after "YYYY-MM-DD": a test is booked ahead, and today's 9:30 may already have passed. */
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function ScheduleTestButton({ applicants, classes, chosen: first = [], open: startOpen = false, minDay }: { applicants: Applicant[]; classes: { value: string; label: string }[]; chosen?: string[]; open?: boolean; minDay: string }) {
  const [open, setOpen] = useState(startOpen);
  const [chosen, setChosen] = useState(new Set(first));
  return (
    <>
      <Button variant="primary" icon={CalendarPlus} onClick={() => setOpen(true)}>Schedule test</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Schedule test" sub="Parents get a message with the date, time and venue" action={scheduleTestAction}
        submitLabel={chosen.size ? `Book ${chosen.size} ${chosen.size === 1 ? "applicant" : "applicants"}` : "Schedule test"} submitIcon={CalendarPlus}>
        {(f) => (
          <>
            <TextField label="Test name" name="title" required maxLength={120} defaultValue={f.val("title", "Entrance test")} error={f.err("title")} />
            <Picker applicants={applicants} chosen={chosen} onChange={setChosen} error={f.err("applicationIds")} />
            <WhenField name="startsAt" label="Date" required defaultValue={f.val("startsAt", `${nextDay(minDay)}T09:30`)} error={f.err("startsAt")} min={minDay} />
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <TextField label="Venue" name="venue" maxLength={120} placeholder="Exam hall, Block B" defaultValue={f.val("venue")} error={f.err("venue")} />
              <TextField label="Maximum marks" name="maxMarks" inputMode="numeric" defaultValue={f.val("maxMarks", "100")} error={f.err("maxMarks")} className="tnum" />
            </div>
            <SelectField label="Class (optional)" name="classId" options={classes} placeholder="Mixed classes" defaultValue={f.val("classId")} error={f.err("classId")} />
          </>
        )}
      </FormSheet>
    </>
  );
}

export function ScheduleInterviewButton({ applicants, staff, defaultInterviewer, today, startFor, open: startOpen = false }: {
  applicants: Applicant[]; staff: { value: string; label: string }[]; defaultInterviewer: string; today: string; startFor?: string | null; open?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [who, setWho] = useState(defaultInterviewer);
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState<{ value: string; label: string }[] | null>(null);
  const [slot, setSlot] = useState("");
  const [loading, start] = useTransition();
  useEffect(() => {
    if (!open || !who || !day) return;
    start(async () => { const s = await freeSlotsAction(who, day); setSlots(s); setSlot((cur) => (s.some((x) => x.value === cur) ? cur : s[0]?.value ?? "")); });
  }, [open, who, day]);
  const label = slots?.find((s) => s.value === slot)?.label;
  return (
    <>
      <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Schedule interview</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Schedule interview" sub="15-minute slots. An interviewer is never booked twice for the same time." action={scheduleInterviewAction}
        hidden={{ slot }} submitLabel={label ? `Book ${label}` : "Book slot"} submitIcon={Check}>
        {(f) => (
          <>
            <SelectField label="Applicant" name="applicationId" required options={applicants.map((a) => ({ value: a.id, label: `${a.name} · ${a.meta}` }))} placeholder="Choose" defaultValue={f.val("applicationId", startFor ?? undefined)} error={f.err("applicationId")} />
            <div className="grid grid-cols-2 gap-3">
              <FieldShell label="Interviewer" id="si-w" required>
                <select id="si-w" name="interviewerStaffId" value={who} onChange={(e) => setWho(e.target.value)} className={cx(inputCls(false), "h-11 pr-9")}>
                  {staff.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </FieldShell>
              <FieldShell label="Day" id="si-d" required>
                <input id="si-d" type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} className={cx(inputCls(false), "h-11 tnum")} />
              </FieldShell>
            </div>
            <FieldShell label="Slot" id="si-s" required error={f.err("slot")} help={loading ? "Finding free slots…" : slots && slots.length === 0 ? "No free slot that day. Choose another day or interviewer." : "Booked slots are not shown"}>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Slot">
                {(slots ?? []).map((s) => (
                  <button type="button" role="radio" aria-checked={slot === s.value} key={s.value} onClick={() => setSlot(s.value)}
                    className={cx("h-11 rounded-xl border text-[13px] font-semibold tnum transition", slot === s.value ? "border-brand bg-brand/8 text-brand ring-1 ring-brand" : "border-line text-ink2 hover:border-ink3/50")}>
                    {s.label}
                  </button>
                ))}
              </div>
            </FieldShell>
          </>
        )}
      </FormSheet>
    </>
  );
}

export type ScoreLine = { applicationId: string; name: string; meta: string; marks: string; absent: boolean; remarks: string };

/** Opened from the address (?score=), so a test link can be shared; closing goes back to the list. */
export function ScoreDialog({ testId, title, sub, maxMarks, lines, canChange, closeHref, more }: { testId: string; title: string; sub: string; maxMarks: number; lines: ScoreLine[]; canChange: boolean; closeHref: string; more: Applicant[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState(lines);
  const [adding, setAdding] = useState(new Set<string>());
  const close = () => { setOpen(false); router.replace(closeHref, { scroll: false }); };
  const bad = rows.some((x) => !x.absent && x.marks !== "" && (Number.isNaN(Number(x.marks)) || Number(x.marks) < 0 || Number(x.marks) > maxMarks));
  return (
    <>
      <FormSheet open={open} onClose={close} wide title={title} sub={sub} action={scoresAction} hidden={{ testId }} submitLabel="Save scores" onSaved={() => router.replace(closeHref, { scroll: false })}>
        {(f) => (
          <>
            {rows.length === 0 && <p className="text-[14px] text-ink3">No applicant is booked for this test yet.</p>}
            <ul className="flex flex-col divide-y divide-line/70 -mt-2">
              {rows.map((x, i) => {
                const err = !x.absent && x.marks !== "" && (Number.isNaN(Number(x.marks)) || Number(x.marks) < 0 || Number(x.marks) > maxMarks);
                return (
                  <li key={x.applicationId} className="py-2.5 grid grid-cols-[1fr_84px] md:grid-cols-[1fr_96px_86px_1fr] gap-x-3 gap-y-2 items-center">
                    <input type="hidden" name="row" value={x.applicationId} />
                    <div className="min-w-0 flex items-center gap-2.5"><Avatar name={x.name} size={32} /><div className="min-w-0"><p className="font-semibold text-[14px] truncate">{x.name}</p><p className="text-[12px] text-ink3">{x.meta}</p></div></div>
                    <div>
                      <input name={`marks_${x.applicationId}`} aria-label={`Score for ${x.name}`} value={x.absent ? "" : x.marks} disabled={!canChange || x.absent} inputMode="decimal" placeholder={`/ ${maxMarks}`}
                        onChange={(e) => setRows((l) => l.map((y, j) => (j === i ? { ...y, marks: e.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : y)))}
                        aria-invalid={err || undefined} className={cx(inputCls(err), "h-10 text-center tnum")} />
                      {err && <p className="text-[11.5px] text-bad mt-1">0 to {maxMarks}</p>}
                    </div>
                    <label className="flex items-center gap-2 text-[13px] text-ink2 col-span-2 md:col-span-1">
                      <input type="checkbox" name={`absent_${x.applicationId}`} checked={x.absent} disabled={!canChange} onChange={(e) => setRows((l) => l.map((y, j) => (j === i ? { ...y, absent: e.target.checked } : y)))} className="size-4 accent-brand" />Absent
                    </label>
                    <input name={`remarks_${x.applicationId}`} aria-label={`Remarks for ${x.name}`} value={x.remarks} disabled={!canChange} maxLength={300} placeholder="Remarks"
                      onChange={(e) => setRows((l) => l.map((y, j) => (j === i ? { ...y, remarks: e.target.value } : y)))} className={cx(inputCls(false), "h-10 col-span-2 md:col-span-1 text-[14px]")} />
                  </li>
                );
              })}
            </ul>
            {bad && <p className="text-[13px] text-bad">Fix the scores marked in red. Each is 0 to {maxMarks}.</p>}
            {f.err("marks") && <p className="text-[13px] text-bad">{f.err("marks")}</p>}
          </>
        )}
      </FormSheet>
      {open && canChange && more.length > 0 && (
        <AddApplicants testId={testId} more={more} chosen={adding} onChange={setAdding} />
      )}
    </>
  );
}

function AddApplicants({ testId, more, chosen, onChange }: { testId: string; more: Applicant[]; chosen: Set<string>; onChange: (s: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 right-4 z-[70] print:hidden">
      <Button variant="secondary" icon={UserPlus} onClick={() => setOpen(true)} className="shadow-pop">Add applicants</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Add applicants to this test" sub="Parents get the date, time and venue" action={addToTestAction} hidden={{ testId }} submitLabel={`Add ${chosen.size}`} submitIcon={UserPlus}>
        {(f) => <Picker applicants={more} chosen={chosen} onChange={onChange} error={f.err("applicationIds")} />}
      </FormSheet>
    </div>
  );
}

const OUTCOME_OPTIONS = [{ value: "RECOMMENDED", label: "Recommended" }, { value: "HOLD", label: "Hold" }, { value: "NOT_RECOMMENDED", label: "Not recommended" }];

export function OutcomeDialog({ slotId, title, sub, outcome, notes, closeHref, canCancel }: { slotId: string; title: string; sub: string; outcome: string | null; notes: string | null; closeHref: string; canCancel: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [o, setO] = useState(outcome ?? "RECOMMENDED");
  const [cancel, setCancel] = useState(false);
  const back = () => router.replace(closeHref, { scroll: false });
  return (
    <>
      <FormSheet open={open && !cancel} onClose={() => { setOpen(false); back(); }} title={title} sub={sub} action={outcomeAction} hidden={{ slotId, outcome: o }} submitLabel="Save outcome" onSaved={back}>
        {(f) => (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="text-[13px] font-semibold text-ink2">Outcome <span className="text-bad" aria-hidden="true">*</span></p>
              <Segmented label="Outcome" value={o} onChange={setO} options={OUTCOME_OPTIONS} className="w-full" size="sm" />
            </div>
            <TextArea label="Notes" name="notes" rows={3} maxLength={1000} placeholder="How did the child and parents come across?" defaultValue={f.val("notes", notes)} error={f.err("notes")} />
            {outcome && <p className="text-[12.5px] text-ink3">Was {OUTCOME_OPTIONS.find((x) => x.value === outcome)?.label}. Every change of outcome is kept in the decision history.</p>}
            {canCancel && <Button variant="ghost" size="sm" icon={X} className="self-start" onClick={() => setCancel(true)}>Cancel this interview</Button>}
          </>
        )}
      </FormSheet>
      <FormSheet open={cancel} onClose={() => setCancel(false)} title="Cancel this interview" sub={sub} action={cancelInterviewAction} hidden={{ slotId }} submitLabel="Cancel interview" submitVariant="danger" onSaved={back}>
        {(f) => <TextArea label="Reason" name="reason" required rows={2} maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} help="The slot becomes free for others." />}
      </FormSheet>
    </>
  );
}

