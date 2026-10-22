"use client";

// The Events sheets (mod-events.jsx EventForm, the cancel sheet, the reminder
// confirmation): create or change an event, register students, volunteers,
// seats, attendance.

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SChips, SDate, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { useActionState } from "react";
import type { FormState } from "@/lib/forms";
import { attendanceAction, cancelEventAction, officeConsentAction, registerAction, remindAction, saveEventAction, seatsAction, volunteerAction } from "../actions";
import { StudentPicker, type PickStudent } from "./co-sheets";
import { WarningConfirm } from "./bits";
import { KeepSelect } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

type Opt = { value: string; label: string };

export type EventStart = {
  id?: string; name?: string; type?: string; date?: string; startTime?: string; endTime?: string; venue?: string; audienceKind?: string; classIds?: string[];
  registrationOn?: boolean; seats?: string; fee?: string; reminder?: string; description?: string; feeLocked?: boolean; consentOn?: boolean; consentBy?: string;
  campusId?: string;
};

/** campuses: only when the school has more than one; an event is for every campus or for one. */
export function EventSheet({ closeHref, start, types, venues, classes, reminders, audiences, campuses = [] }: { closeHref: string; start: EventStart; types: string[]; venues: string[]; classes: Opt[]; reminders: Opt[]; audiences: Opt[]; campuses?: Opt[] }) {
  const aud = useTyped("audienceKind", start.audienceKind ?? "school");
  const [audience, setAudience] = useState(aud.value || "school");
  const regT = useTyped("registrationOn", start.registrationOn ? "on" : "");
  const [reg, setReg] = useState(regT.value === "on");
  const conT = useTyped("consentOn", start.consentOn ? "on" : "");
  const [consent, setConsent] = useState(conT.value === "on");
  const editing = Boolean(start.id);
  const typeOptions = [...new Set([...(start.type ? [start.type] : []), ...types])].map((t) => ({ value: t, label: t }));
  const venueOptions = [{ value: "", label: "No venue" }, ...[...new Set([...(start.venue ? [start.venue] : []), ...venues])].map((v) => ({ value: v, label: v }))];
  return (
    <SheetForm wide title={editing ? "Change event" : "Create event"} sub={editing ? "Changes to date, time or venue can be sent to the audience." : "It appears on the School Calendar. Reminders go through Communication."}
      closeHref={closeHref} action={saveEventAction} submitLabel={editing ? "Save" : "Create event"} hidden={start.id ? { eventId: start.id } : undefined}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SText name="name" label="Name" required start={start.name} placeholder="For example: Annual Day 2027" maxLength={80} />
        <SSelect name="type" label="Type" required help="From Events Settings" options={typeOptions} start={start.type ?? types[0]} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-2 sm:col-span-1"><SDate name="date" label="Date" required start={start.date} /></div>
        <SText name="startTime" label="From" required type="time" start={start.startTime ?? "10:00"} className="tnum" />
        <SText name="endTime" label="To" type="time" start={start.endTime} className="tnum" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SSelect name="venue" label="Venue" options={venueOptions} start={start.venue ?? ""} />
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink2"><Words k="Audience" /><span className="text-bad" aria-hidden="true"> *</span></span>
          <KeepSelect name="audienceKind" value={audience} onChange={(e) => setAudience(e.target.value)} className={cx(inputCls(false), "h-11")}>
            {audiences.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </KeepSelect>
        </label>
      </div>
      {campuses.length > 1 && <SSelect name="campusId" label="Campus" help="An event of one campus is shown and sent only to that campus" options={[{ value: "", label: "All campuses" }, ...campuses]} start={start.campusId ?? ""} />}
      {audience === "classes" && <SChips name="classIds" label="Classes" options={classes} start={start.classIds} required />}
      <WarningConfirm keyName="venue-clash" />
      <div className="rounded-xl bg-sunken/70 p-3.5 flex flex-col gap-3">
        <label className="flex items-center gap-3">
          <Checkbox checked={reg} onChange={setReg} label="Registration" />
          <span className="text-[14px] flex-1"><b className="font-semibold"><Words k="Registration" /></b><span className="block text-[12.5px] text-ink3"><Words k="Staff record who joins. Limit seats if needed." /></span></span>
        </label>
        {reg && <input type="hidden" name="registrationOn" value="on" />}
        {reg && <SText name="seats" label="Seats" help="Leave empty for no limit" inputMode="numeric" start={start.seats} className="tnum" />}
        {reg && (audience === "school" || audience === "classes") && (
          <label className="flex items-center gap-3">
            <Checkbox checked={consent} onChange={setConsent} label="Parent consent on Parent Link" />
            <span className="text-[14px] flex-1"><b className="font-semibold"><Words k="Parent consent on Parent Link" /></b><span className="block text-[12.5px] text-ink3"><Words k="For trips and outings. A yes registers the child and adds any fee; a no is recorded." /></span></span>
          </label>
        )}
        {reg && consent && (audience === "school" || audience === "classes") && <input type="hidden" name="consentOn" value="on" />}
        {reg && consent && (audience === "school" || audience === "classes") && <SDate name="consentBy" label="Reply by" help="Parents who have not answered get one reminder" start={start.consentBy} />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SText name="fee" label="Fee per student" help={start.feeLocked ? "Students already have this fee; it cannot change now" : "Added to the student’s fees"} placeholder="None" inputMode="decimal" start={start.fee} className="tnum" readOnly={start.feeLocked} />
        <SSelect name="reminder" label="Reminder" options={reminders} start={start.reminder ?? "1d"} />
      </div>
      <SArea name="description" label="Description" rows={2} start={start.description} maxLength={1000} />
      {editing && <SSwitch name="tell" title="Tell the audience if the date, time or venue changes" sub="A message goes to the registered students’ parents, or the audience." start />}
    </SheetForm>
  );
}

export function CancelEventSheet({ closeHref, eventId, name, fee }: { closeHref: string; eventId: string; name: string; fee: string | null }) {
  return (
    <SheetForm title={`Cancel ${name}?`} sub={`The audience is told.${fee ? ` ${fee}` : ""}`} closeHref={closeHref} action={cancelEventAction} submitLabel="Cancel the event" submitVariant="danger" hidden={{ eventId }}>
      <SArea name="reason" label="Reason" required rows={3} placeholder="For example: heavy rain warning for Saturday" maxLength={300} />
      <SSwitch name="tell" title="Tell the audience" sub="By message, with the reason." start />
    </SheetForm>
  );
}

export function RemindSheet({ closeHref, eventId, people, preview }: { closeHref: string; eventId: string; people: string; preview: string }) {
  return (
    <SheetForm title={`Send a reminder to ${people}?`} sub="Through Communication. Track it in Message History." closeHref={closeHref} action={remindAction} submitLabel="Send reminder" hidden={{ eventId }}>
      <p className="text-[14px] text-ink2 rounded-xl bg-sunken/70 p-3.5 leading-relaxed">{preview}</p>
    </SheetForm>
  );
}

export type Pickable = { id: string; name: string; place: string; registered: boolean };

export function RegisterSheet({ closeHref, eventId, students, seatsLeft, fee }: { closeHref: string; eventId: string; students: Pickable[]; seatsLeft: number | null; fee: string | null }) {
  const [q, setQ] = useState("");
  const [on, setOn] = useState<Set<string>>(new Set());
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return students.filter((s) => !t || s.name.toLowerCase().includes(t) || s.place.toLowerCase().includes(t)).slice(0, 200);
  }, [q, students]);
  const free = list.filter((s) => !s.registered);
  const allOn = free.length > 0 && free.every((s) => on.has(s.id));
  return (
    <SheetForm wide title="Register students" sub={`${seatsLeft != null ? `${seatsLeft} seats left. ` : ""}${fee ? `The fee of ${fee} is added to each student’s fees.` : "Staff record who joins."}`}
      closeHref={closeHref} action={registerAction} submitLabel={`Register ${on.size || ""} students`.replace("  ", " ")} hidden={{ eventId }} submitDisabled={!on.size}>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student name or class" aria-label="Search students" className={cx(inputCls(false), "h-11 pl-10")} />
      </div>
      <label className="flex items-center gap-3 px-2 text-[13.5px] font-semibold text-ink2">
        <Checkbox checked={allOn} onChange={(v) => setOn((x) => { const n = new Set(x); for (const s of free) { if (v) n.add(s.id); else n.delete(s.id); } return n; })} label="Tick everyone shown" />
        <Words k="Tick everyone shown (" />{free.length})
      </label>
      <ul className="flex flex-col max-h-[46vh] overflow-y-auto scroll-thin">
        {list.map((s) => (
          <li key={s.id}>
            <label className={cx("flex items-center gap-3 px-2 py-2 rounded-xl", s.registered ? "opacity-60" : "hover:bg-sunken/60 cursor-pointer")}>
              <Checkbox checked={s.registered || on.has(s.id)} onChange={(v) => { if (s.registered) return; setOn((x) => { const n = new Set(x); if (v) n.add(s.id); else n.delete(s.id); return n; }); }} label={s.name} />
              <Avatar name={s.name} size={32} />
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold truncate">{s.name}</span><span className="block text-[12.5px] text-ink3">{s.place}</span></span>
              {s.registered && <Pill tone="ok" className="!h-[22px] !text-[11px]"><Words k="Registered" /></Pill>}
            </label>
          </li>
        ))}
        {!list.length && <li className="px-2 py-4 text-[14px] text-ink3"><Words k="No students match." /></li>}
      </ul>
      {[...on].map((v) => <input key={v} type="hidden" name="studentIds" value={v} />)}
    </SheetForm>
  );
}

export function VolunteerSheet({ closeHref, eventId, staff, students }: { closeHref: string; eventId: string; staff: Opt[]; students: Opt[] }) {
  const k = useTyped("kind", "staff");
  const [kind, setKind] = useState(k.value || "staff");
  return (
    <SheetForm title="Add a volunteer" sub="Staff, students or parents helping, with their duty." closeHref={closeHref} action={volunteerAction} submitLabel="Add volunteer" hidden={{ eventId, kind }}>
      <Segmented label="Who" value={kind} onChange={setKind} className="w-full" options={[{ value: "staff", label: "Staff" }, { value: "student", label: "Student" }, { value: "parent", label: "Parent" }, { value: "other", label: "Other" }]} />
      {kind === "staff" && <SSelect name="personId" label="Staff member" required options={staff} placeholder="Choose" />}
      {kind === "student" && <SSelect name="personId" label="Student" required options={students} placeholder="Choose" help="Registered students of this event" />}
      {(kind === "parent" || kind === "other") && <SText name="name" label="Name" required placeholder={kind === "parent" ? "For example: Sunil Reddy (parent of Aarav, 7 B)" : "Name"} maxLength={120} />}
      <SText name="duty" label="Duty" required placeholder="For example: First aid, Bus 2 group leader" maxLength={120} />
    </SheetForm>
  );
}

export function SeatsSheet({ closeHref, eventId, count }: { closeHref: string; eventId: string; count: number }) {
  return (
    <SheetForm title="Assign seats" sub={`${count} registered students get seats in rows (A-1, A-2...), in class and roll order. Seats given before are replaced.`} closeHref={closeHref} action={seatsAction} submitLabel="Assign seats" hidden={{ eventId }}>
      <SText name="perRow" label="Seats in a row" required inputMode="numeric" start="20" className="tnum" />
    </SheetForm>
  );
}

/** Tick who came (mod-events.jsx EventAttendance). */
export function AttendanceForm({ eventId, rows, canMark, marked }: { eventId: string; rows: { id: string; name: string; place: string; attended: boolean | null }[]; canMark: boolean; marked: boolean }) {
  const [marks, setMarks] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.id, r.attended ?? true])));
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(attendanceAction, null);
  const n = Object.values(marks).filter(Boolean).length;
  return (
    <form action={run} className="p-4 flex flex-col gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <p className="text-[13.5px] text-ink2">{marked ? "Marked on the day." : "Tick who came."} <b className="font-semibold tnum">{n} <Words k="of" /> {rows.length}</b> <Words k="present." /></p>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {rows.map((k) => (
          <li key={k.id} className={cx("flex items-center gap-3 rounded-xl border px-3 py-2", marks[k.id] ? "border-line" : "border-bad/30 bg-bad/[.04]")}>
            <Checkbox checked={marks[k.id]} onChange={(v) => canMark && setMarks({ ...marks, [k.id]: v })} label={k.name} />
            <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium truncate">{k.name}</span><span className="block text-[12px] text-ink3">{k.place}</span></span>
            {!marks[k.id] && <span className="text-[12px] text-bad font-semibold"><Words k="Absent" /></span>}
            {marks[k.id] && <input type="hidden" name="present" value={k.id} />}
          </li>
        ))}
      </ul>
      {canMark && <Button type="submit" variant="primary" loading={pending} className="self-start"><Check size={16} aria-hidden="true" />{marked ? "Saved · save again" : `Save attendance: ${n} present`}</Button>}
      {state && !state.ok && <p className="text-[12.5px] text-bad" role="alert">{state.message}</p>}
    </form>
  );
}

/** The office records an answer a parent gave in person or on the phone. */
export function OfficeConsentSheet({ closeHref, eventId, students, fee }: { closeHref: string; eventId: string; students: PickStudent[]; fee: string | null }) {
  const a = useTyped("answer", "GIVEN");
  const [answer, setAnswer] = useState(a.value || "GIVEN");
  return (
    <SheetForm title="Record consent" sub="For a parent who answered in person or on the phone. Parent Link answers come in by themselves." closeHref={closeHref}
      action={officeConsentAction} submitLabel="Save" hidden={{ eventId, answer }}>
      <Segmented label="Answer" value={answer} onChange={setAnswer} options={[{ value: "GIVEN", label: "Consent given" }, { value: "DECLINED", label: "Not this time" }]} className="w-full" />
      <p className="text-[13px] text-ink3">{answer === "GIVEN" ? `The students are registered${fee ? ` and the fee of ${fee} is added to their fees` : ""}.` : "Nothing is charged. Registered students are withdrawn."}</p>
      <StudentPicker students={students} />
    </SheetForm>
  );
}
