"use client";

// The PTM sheets (mod-events.jsx PlanPTM, BookSlot, MeetingSheet): plan a PTM
// day, book a slot for a parent who called or came to the office, and the
// meeting itself with the student's performance and the notes.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SheetForm, UrlSheet, useTyped } from "@/components/ui/url-sheet";
import { SArea, SChips, SDate, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Segmented, Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { bookSlotAction, cancelPtmAction, notesAction, planPtmAction } from "../actions";

type Opt = { value: string; label: string };

export function PlanPtmSheet({ closeHref, classes, groups, slotMinutes, venues, start }: { closeHref: string; classes: Opt[]; groups: { label: string; ids: string[] }[]; slotMinutes: number; venues: string[]; start: string }) {
  const s = useTyped("slotMinutes", String(slotMinutes));
  const [slot, setSlot] = useState(s.value || String(slotMinutes));
  const [pick, setPick] = useState<string[] | null>(null);
  const b = useTyped("breakOn", "");
  const [brk, setBrk] = useState(b.value === "on");
  return (
    <SheetForm title="Plan a PTM" sub="Teachers’ slots are made from their classes. The office books for parents who call; parents get a confirmation and a reminder." closeHref={closeHref} action={planPtmAction} submitLabel="Create slots" hidden={{ slotMinutes: slot }}>
      <SDate name="date" label="Date" required help="Must be a working day" start={start} />
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Quick choice of classes">
          {groups.map((g) => (
            <button key={g.label} type="button" onClick={() => setPick(g.ids)} className="h-8 px-3 rounded-full border border-line text-[13px] font-medium text-ink2 hover:border-brand hover:text-brand transition">{g.label}</button>
          ))}
        </div>
      )}
      <SChips key={pick ? pick.join() : "none"} name="classIds" label="Classes" options={classes} start={pick ?? []} required />
      <div className="grid grid-cols-2 gap-3">
        <SText name="startTime" label="From" required type="time" start="09:30" className="tnum" />
        <SText name="endTime" label="To" required type="time" start="11:30" className="tnum" />
      </div>
      <div className="rounded-xl bg-sunken/70 p-3.5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Switch on={brk} onChange={setBrk} label="A break in the middle" />
          <span className="text-[14px] flex-1"><b className="font-semibold">A break in the middle</b><span className="block text-[12.5px] text-ink3">No slots are made in the break, for every teacher</span></span>
        </div>
        {brk && <input type="hidden" name="breakOn" value="on" />}
        {brk && (
          <div className="grid grid-cols-2 gap-3">
            <SText name="breakStart" label="Break from" required type="time" start="10:30" className="tnum" />
            <SText name="breakEnd" label="Break to" required type="time" start="10:40" className="tnum" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Slot length<span className="text-bad" aria-hidden="true"> *</span></span>
        <Segmented label="Slot length" value={slot} onChange={setSlot} className="w-full" options={[5, 10, 15, 20].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
      </div>
      <SSelect name="venue" label="Venue" options={[{ value: "", label: "Each teacher’s classroom" }, ...venues.map((v) => ({ value: v, label: v }))]} start="" />
      <SSwitch name="subjectTeachers" title="Add subject teachers too" sub="Class teachers are added by themselves." />
    </SheetForm>
  );
}

export function CancelPtmSheet({ closeHref, ptmId, name, booked }: { closeHref: string; ptmId: string; name: string; booked: number }) {
  return (
    <SheetForm title={`Cancel the PTM on ${name}?`} sub={booked ? `${booked} booked parents are told, with the reason.` : "No parent has booked yet."} closeHref={closeHref} action={cancelPtmAction} submitLabel="Cancel the PTM" submitVariant="danger" hidden={{ ptmId }}>
      <SArea name="reason" label="Reason" required rows={3} placeholder="For example: moved to next Saturday because of the election" maxLength={300} />
    </SheetForm>
  );
}

export type BookPick = { id: string; name: string; place: string; parent: string; hasSlot: string | null; own: boolean };

export function BookSlotSheet({ closeHref, slotId, title, sub, students }: { closeHref: string; slotId: string; title: string; sub: string; students: BookPick[] }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? students.filter((s) => s.name.toLowerCase().includes(t) || s.place.toLowerCase().includes(t) || s.parent.toLowerCase().includes(t)) : students.filter((s) => s.own && !s.hasSlot);
    return base.slice(0, 40);
  }, [q, students]);
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} action={bookSlotAction} submitLabel="Book this slot" hidden={{ slotId, ...(pick ? { studentId: pick } : {}) }} submitDisabled={!pick}>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student name" aria-label="Search students" id="ptm-book-search" className={cx(inputCls(false), "h-11 pl-10")} />
      </div>
      <ul className="flex flex-col max-h-[46vh] overflow-y-auto scroll-thin">
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setPick(s.id)} aria-pressed={pick === s.id}
              className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition", pick === s.id ? "bg-brand/8 ring-1 ring-brand" : "hover:bg-sunken/70")}>
              <Avatar name={s.name} size={36} />
              <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{s.name}</span><span className="block text-[12.5px] text-ink3 truncate">{s.place} · {s.parent}</span></span>
              {s.hasSlot && <Pill tone="warn">Has a slot · {s.hasSlot}</Pill>}
            </button>
          </li>
        ))}
        {!list.length && <li className="px-3 py-4 text-[14px] text-ink3">{q ? "No students match." : "Every student of this teacher’s classes has a slot. Search to find another student."}</li>}
      </ul>
    </SheetForm>
  );
}

export type MeetingView = {
  slotId: string; title: string; sub: string;
  stats: { label: string; value: string; tone?: "ok" | "warn" }[];
  marks: { heading: string; rows: { name: string; before: string | null; now: string; low: boolean }[] } | null;
  behaviour: string;
  canNotes: boolean; notesWhen: string | null;
  notes: { remarks: string; feedback: string; followUp: string; saved: boolean; arrived: boolean; arrivedAt: string | null };
};

export function MeetingSheet({ closeHref, m, extra }: { closeHref: string; m: MeetingView; extra?: React.ReactNode }) {
  const body = (
    <>
      <div className="grid grid-cols-3 gap-2">
        {m.stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-sunken/70 px-3 py-2.5"><p className="text-[12px] text-ink3 font-semibold">{s.label}</p><p className={cx("font-display text-[20px] font-semibold tnum", s.tone === "warn" ? "text-warn" : s.tone === "ok" ? "text-ok" : "")}>{s.value}</p></div>
        ))}
      </div>
      {m.marks ? (
        <div>
          <p className="eyebrow text-ink3 mb-2">{m.marks.heading}</p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-[13.5px]">
            {m.marks.rows.map((e) => <li key={e.name} className="flex justify-between gap-3"><span>{e.name}</span><span className="tnum">{e.before != null && <span className="text-ink3">{e.before} → </span>}<b className={cx("font-semibold", e.low && "text-warn")}>{e.now}</b></span></li>)}
          </ul>
        </div>
      ) : <p className="text-[13.5px] text-ink3">No exam results yet this year.</p>}
      <div className="rounded-xl border border-line p-3 text-[13.5px]"><p className="font-semibold mb-0.5">Behaviour notes</p><p className="text-ink2">{m.behaviour}</p></div>
    </>
  );
  if (!m.canNotes) {
    return (
      <UrlSheet wide title={m.title} sub={m.sub} closeHref={closeHref}>
        <div className="flex flex-col gap-4">
          {body}
          {extra}
          {m.notes.saved ? <NotesRead n={m.notes} /> : m.notesWhen && <p className="text-[13px] text-ink3">{m.notesWhen}</p>}
        </div>
      </UrlSheet>
    );
  }
  return (
    <SheetForm wide title={m.title} sub={m.sub} closeHref={closeHref} action={notesAction} submitLabel="Save notes" hidden={{ slotId: m.slotId }}>
      {body}
      <SSwitch name="arrived" title="Parent arrived" sub={m.notes.arrivedAt ? `Marked at ${m.notes.arrivedAt}` : undefined} start={m.notes.arrived} />
      <SArea name="remarks" label="Teacher remarks" rows={2} start={m.notes.remarks} placeholder="What you told the parent" maxLength={1000} />
      <SArea name="feedback" label="Parent feedback" rows={2} start={m.notes.feedback} placeholder="What the parent said" maxLength={1000} />
      <SText name="followUp" label="Follow-up actions" start={m.notes.followUp} placeholder="For example: check the Science diary every Friday" maxLength={300} />
      {m.notes.saved && <Pill tone="ok" className="self-start">Notes saved</Pill>}
    </SheetForm>
  );
}

function NotesRead({ n }: { n: MeetingView["notes"] }) {
  return (
    <dl className="rounded-xl bg-sunken/70 p-3.5 grid gap-2 text-[13.5px]">
      {([["Teacher remarks", n.remarks], ["Parent feedback", n.feedback], ["Follow-up actions", n.followUp]] as const).filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt className="text-[12px] text-ink3 font-semibold">{k}</dt><dd className="text-ink2">{v}</dd></div>
      ))}
    </dl>
  );
}
