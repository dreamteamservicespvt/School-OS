"use client";

// Desk sheets (mod-frontoffice.jsx EnquirySheet, CallSheet, WalkInSheet,
// FollowUpSheet) and the front-office notes.

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, PhoneIncoming, PhoneOutgoing, Plus, Search, UserCheck, X } from "lucide-react";
import { SheetForm, useSheetResult, useTyped } from "@/components/ui/url-sheet";
import { SArea, SSelect, SText } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Switch } from "@/components/ui/controls";
import { Button, IconButton, buttonClass } from "@/components/ui/button";
import { Banner } from "@/components/money/kit";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import type { Match } from "@/lib/admission/enquiries";
import type { KnownPhone } from "@/lib/front-office/calls";
import { mobileDigits } from "@/lib/front-office/words";
import { addNoteAction, callFollowUpAction, clearNoteAction, enquiryAction, logCallAction, lookupPhone, searchFrom, walkInAction } from "../actions";
import { PhoneBox, SegField } from "./fields";

type Opt = { value: string; label: string };

function Duplicates({ admissions }: { admissions: boolean }) {
  const state = useSheetResult() as FormState<{ matches?: Match[] }>;
  const matches = state && !state.ok ? state.data?.matches ?? [] : [];
  if (!matches.length) return null;
  const m = matches[0];
  return (
    <div className="flex flex-col gap-2">
      <Banner tone="warn" title="This family may already be with Admissions:" action={admissions ? <Link href={m.href} className={buttonClass("secondary", "sm")}><ExternalLink size={15} aria-hidden="true" />Open in Admissions</Link> : undefined}>
        {m.text}
      </Banner>
      <label className="flex items-center gap-3 rounded-xl bg-sunken/70 px-3.5 py-3 text-[14px]">
        <input type="checkbox" name="force" className="w-5 h-5 accent-[var(--color-brand)]" />
        <span><b className="font-semibold">Save anyway</b><span className="block text-[12.5px] text-ink3">For example a brother or sister, or a different family with the same phone</span></span>
      </label>
    </div>
  );
}

/** New enquiry: the short form from Admission Management (A3). */
export function EnquirySheet({ closeHref, classes, preset, source, admissions }: { closeHref: string; classes: Opt[]; preset?: { name: string; phone: string; visitorId: string } | null; source: "walk-in" | "phone"; admissions: boolean }) {
  return (
    <SheetForm title="New enquiry" sub="Goes straight to Admission Management with an owner and a follow-up reminder." closeHref={closeHref} action={enquiryAction}
      submitLabel="Send to Admissions" pendingText="Sending…" hidden={preset ? { visitorId: preset.visitorId } : undefined}>
      <Duplicates admissions={admissions} />
      <SText name="childName" label="Child’s name" required placeholder="Full name" maxLength={120} autoComplete="off" />
      <SText name="parentName" label="Parent’s name" required start={preset?.name} maxLength={120} autoComplete="off" />
      <div className="grid sm:grid-cols-2 gap-3">
        <PhoneBox id="en-phone" name="phone" label="Phone" required start={preset?.phone} />
        <SSelect name="classId" label="Class wanted" required options={classes} placeholder="Choose" />
      </div>
      <SegField name="source" label="Source" start={source} options={[{ value: "walk-in", label: "Walk-in" }, { value: "phone", label: "Phone" }]} help="Set from how they reached us" />
      <SText name="note" label="Note" placeholder="For example: wants transport from Nizampet" maxLength={500} />
    </SheetForm>
  );
}

/** Log a call: incoming or outgoing; admission enquiries and complaints go on in the same step. */
export function CallSheet({ closeHref, purposes, classes, staff, defaultWho, today, admissions }: { closeHref: string; purposes: string[]; classes: Opt[]; staff: Opt[]; defaultWho: string; today: string; admissions: boolean }) {
  return (
    <SheetForm title="Log a call" sub="Known parents and enquiries are recognised from the number." closeHref={closeHref} action={logCallAction} submitLabel={<CallSubmit />} pendingText="Saving…">
      <CallFields purposes={purposes} classes={classes} staff={staff} defaultWho={defaultWho} today={today} admissions={admissions} />
    </SheetForm>
  );
}

let purposeNow = "";
const purposeListeners = new Set<(v: string) => void>();
function CallSubmit() {
  const [p, setP] = useState(purposeNow);
  useEffect(() => { purposeListeners.add(setP); return () => { purposeListeners.delete(setP); }; }, []);
  return <>{p === "Admission enquiry" ? "Save call and enquiry" : p === "Complaint" ? "Save and send as a query" : "Save call"}</>;
}

function CallFields({ purposes, classes, staff, defaultWho, today, admissions }: { purposes: string[]; classes: Opt[]; staff: Opt[]; defaultWho: string; today: string; admissions: boolean }) {
  const purpose = useTyped("purpose", purposes.includes("Fee") ? "Fee" : purposes[0]);
  const name = useTyped("name", "");
  const fu = useTyped("followUp", "");
  const [why, setWhy] = useState(purpose.value);
  const [known, setKnown] = useState<KnownPhone | null>(null);
  const [follow, setFollow] = useState(fu.value === "on");
  const [, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const asked = useRef("");
  useEffect(() => { purposeNow = why; purposeListeners.forEach((l) => l(why)); }, [why]);
  const onPhone = (v: string) => {
    const d = mobileDigits(v);
    if (d.length !== 10) { setKnown(null); return; }
    if (d === asked.current) return;
    asked.current = d;
    start(async () => {
      const k = await lookupPhone(d);
      setKnown(k);
      if (k && nameRef.current && !nameRef.current.value.trim()) nameRef.current.value = k.name;
    });
  };
  return (
    <>
      <Duplicates admissions={admissions} />
      <SegField name="direction" label="Direction" required start="IN" options={[{ value: "IN", label: "Incoming", icon: PhoneIncoming }, { value: "OUT", label: "Outgoing", icon: PhoneOutgoing }]} />
      <PhoneBox id="cl-phone" name="phone" label="Phone" required onPhone={onPhone} />
      {known && (
        <div className="rounded-xl bg-ok/10 px-3.5 py-2.5 text-[13.5px] flex items-center gap-2 -mt-2 animate-fade" role="status">
          <UserCheck size={16} className="text-ok shrink-0" aria-hidden="true" /><span className="text-ink2"><b className="text-ink font-semibold">{known.name}.</b> {known.who}</span>
        </div>
      )}
      <FieldShell label="Name" id="cl-name" required error={name.error}>
        <input key={name.key} ref={nameRef} id="cl-name" name="name" defaultValue={name.value} maxLength={120} autoComplete="off" aria-invalid={name.error ? true : undefined} className={cx(inputCls(name.error), "h-11")} />
      </FieldShell>
      <FieldShell label="Purpose" id="cl-purpose" required error={purpose.error}>
        <select id="cl-purpose" name="purpose" value={why} onChange={(e) => setWhy(e.target.value)} className={cx(inputCls(purpose.error), "h-11")}>
          {purposes.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </FieldShell>
      {why === "Admission enquiry" && (
        <div className="grid sm:grid-cols-2 gap-3 rounded-xl bg-sunken/70 p-3.5">
          <p className="sm:col-span-2 text-[13px] text-ink2">The enquiry is made in the same step and goes to Admissions.</p>
          <SText name="childName" label="Child’s name" required maxLength={120} autoComplete="off" />
          <SSelect name="classId" label="Class wanted" required options={classes} placeholder="Choose" />
        </div>
      )}
      {why === "Complaint" && <Banner tone="info" title="Becomes a query">in Communication, Feedback & Queries, with a number the caller can ask about.</Banner>}
      <SArea name="note" label="Note" rows={2} placeholder={why === "Complaint" ? "What is the complaint about?" : "What was asked or told"} maxLength={1000} required={why === "Complaint"} />
      <div className="rounded-xl border border-line">
        <div className="flex items-center gap-3 px-4 py-3">
          <Switch id="cl-fu" on={follow} onChange={setFollow} label="Set a follow-up" name="followUp" />
          <label htmlFor="cl-fu" className="text-[14px] font-semibold flex-1">Set a follow-up</label>
        </div>
        {follow && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4 pb-4 animate-fade">
            <SText name="followDate" label="Date" type="date" start={today} min={today} />
            <SText name="followTime" label="Time" type="time" start="11:00" />
            <SSelect name="followWho" label="Who" options={staff} start={defaultWho} className="col-span-2 sm:col-span-1" />
          </div>
        )}
      </div>
    </>
  );
}

export function FollowUpSheet({ closeHref, call, staff, start }: { closeHref: string; call: { id: string; name: string; note: string | null }; staff: Opt[]; start: { date: string; time: string; who: string } }) {
  return (
    <SheetForm title={`Follow-up: ${call.name}`} sub={call.note ?? undefined} closeHref={closeHref} action={callFollowUpAction} hidden={{ callId: call.id }} submitLabel="Set reminder" pendingText="Saving…">
      <div className="grid grid-cols-2 gap-3">
        <SText name="followDate" label="Date" type="date" required start={start.date} min={start.date} />
        <SText name="followTime" label="Time" type="time" required start={start.time} />
      </div>
      <SSelect name="followWho" label="Who follows up" required options={staff} start={start.who} />
    </SheetForm>
  );
}

type FromHit = { guardianId: string; studentId: string; label: string; student: string; admissionNo: string };

/** Walk-in request: routed to a department with a request number. */
export function WalkInSheet({ closeHref, departments, nextNo }: { closeHref: string; departments: string[]; nextNo: string }) {
  return (
    <SheetForm title="Walk-in request" sub="For example a bonafide certificate or a fee statement. The person gets a request number." closeHref={closeHref} action={walkInAction}
      submitLabel="Send to department" pendingText="Sending…">
      <WalkInFields departments={departments} nextNo={nextNo} />
    </SheetForm>
  );
}

function WalkInFields({ departments, nextNo }: { departments: string[]; nextNo: string }) {
  const from = useTyped("fromName", "");
  const [q, setQ] = useState(from.value);
  const [hits, setHits] = useState<FromHit[]>([]);
  const [chosen, setChosen] = useState<FromHit | null>(null);
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onType = (v: string) => {
    setQ(v);
    setChosen(null);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 3) { setHits([]); return; }
    timer.current = setTimeout(() => start(async () => setHits(await searchFrom(v))), 250);
  };
  return (
    <>
      <FieldShell label="From" id="wi-from" required error={from.error} help="Search a parent or student, or type a name and phone">
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <input id="wi-from" name="fromName" value={q} onChange={(e) => onType(e.target.value)} placeholder="Parent or student name" autoComplete="off" maxLength={120}
            aria-invalid={from.error ? true : undefined} className={cx(inputCls(from.error), "h-11 pl-10")} />
        </div>
      </FieldShell>
      {chosen && <><input type="hidden" name="guardianId" value={chosen.guardianId} /><input type="hidden" name="studentId" value={chosen.studentId} /></>}
      {!chosen && hits.length > 0 && (
        <ul className="-mt-2 rounded-xl border border-line divide-y divide-line/70 animate-fade">
          {hits.map((h) => (
            <li key={h.guardianId + h.studentId}>
              <button type="button" onClick={() => { setChosen(h); setQ(h.label); setHits([]); }} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-sunken/60">
                <Avatar name={h.student} size={30} /><span className="text-[13.5px] min-w-0 flex-1 truncate"><b className="font-semibold">{h.label}</b> · <span className="font-mono text-[12px]">{h.admissionNo}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!chosen && <PhoneBox id="wi-phone" name="fromPhone" label="Phone" help="To send the request number on WhatsApp" />}
      <SArea name="request" label="Request" required rows={2} maxLength={300} placeholder="For example: bonafide certificate for passport" />
      <SSelect name="department" label="Department" required options={departments.map((d) => ({ value: d, label: d }))} placeholder="Choose" />
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Request number" id="wi-no" help="Made automatically">
          <input id="wi-no" value={nextNo} readOnly className={cx(inputCls(false), "h-11 font-mono bg-sunken/60")} />
        </FieldShell>
        <SegField name="givenBy" label="Give the number by" start="whatsapp" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "slip", label: "Slip" }]} />
      </div>
      <SText name="note" label="Note" maxLength={500} placeholder="Optional" />
      <p className="text-[12.5px] text-ink3">Complaints go to Communication, Feedback & Queries instead: log them as a call with the purpose Complaint.</p>
    </>
  );
}

/* ---------- Front-office notes ---------- */

export function NoteAdd() {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(addNoteAction, null);
  const ref = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setText(""); } }, [state]);
  return (
    <form ref={ref} action={run} className="flex flex-col gap-1.5 p-5 pt-3">
      <div className="flex gap-2">
        <input name="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note" aria-label="New front-office note" maxLength={200} className={cx(inputCls(state && !state.ok), "h-10 text-[14px]")} />
        <Button type="submit" variant="secondary" icon={Plus} loading={pending} disabled={!text.trim()}>Add</Button>
      </div>
      {state && !state.ok && <p className="text-[12.5px] text-bad" role="alert">{state.message}</p>}
    </form>
  );
}

export function NoteClear({ id }: { id: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(clearNoteAction, null);
  return (
    <form action={run} className="shrink-0">
      <input type="hidden" name="noteId" value={id} />
      <IconButton type="submit" icon={X} label="Clear note" size={30} disabled={pending} />
      {state && !state.ok && <span className="sr-only" role="alert">{state.message}</span>}
    </form>
  );
}
