"use client";

// Admission Decision sheets (design: mod-admissions.jsx ApproveSheet,
// RejectSheet, MoveSheet, the confirm and undo sheets). Each one is bound to
// a server action that checks the role again.
import { useState } from "react";
import { ArrowDown, ArrowUp, BadgeCheck, CircleCheck, FileSignature, ListOrdered, RefreshCw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { ActionButton, FormSheet, SubHead } from "../_components/forms";
import { confirmAction, decideAction, moveWaitAction, offerAcceptedAction, offerSeatAction, offerSentAction, rerankAction, undoAction, waitAction } from "./actions";

export function DecideButtons({ id, name, sub, canDecide, full, waitingList, seatsNote }: { id: string; name: string; sub: string; canDecide: boolean; full: boolean; waitingList: boolean; seatsNote: string }) {
  const [open, setOpen] = useState<null | "approve" | "reject" | "wait">(null);
  const close = () => setOpen(null);
  return (
    <>
      {full && waitingList ? <Button variant="primary" icon={ListOrdered} onClick={() => setOpen("wait")}>Add to waiting list</Button>
        : canDecide ? <Button variant="primary" icon={CircleCheck} onClick={() => setOpen("approve")}>Approve</Button> : null}
      {canDecide && <Button variant="danger-soft" icon={X} onClick={() => setOpen("reject")}>Reject</Button>}
      {!full && waitingList && <Button variant="ghost" icon={ListOrdered} onClick={() => setOpen("wait")}>Waiting list</Button>}

      <FormSheet open={open === "approve"} onClose={close} title={`Approve ${name}`} sub={sub} action={decideAction} hidden={{ id, decision: "approve" }} submitLabel="Approve" submitIcon={CircleCheck}>
        {(f) => (
          <>
            <p className="rounded-xl bg-sunken px-3.5 py-3 text-[13.5px] text-ink2">{seatsNote}</p>
            <TextArea label="Remarks" name="remarks" rows={2} maxLength={1000} placeholder="For example: good test score, sister in 5 A" defaultValue={f.val("remarks")} error={f.err("remarks")} help="Optional. Kept with the decision." />
            <p className="text-[12.5px] text-ink3">The parent gets a message that the admission is approved. Confirm the admission when the family accepts.</p>
          </>
        )}
      </FormSheet>
      <FormSheet open={open === "reject"} onClose={close} title={`Reject ${name}’s application`} sub={sub} action={decideAction} hidden={{ id, decision: "reject" }} submitLabel="Reject application" submitVariant="danger" submitIcon={X}>
        {(f) => <TextArea label="Remarks" name="remarks" required rows={3} maxLength={1000} placeholder="For example: test 18 of 100, advised to apply for Class 5" defaultValue={f.val("remarks")} error={f.err("remarks")} help="Required. Kept with the decision and sent to the parent." />}
      </FormSheet>
      <FormSheet open={open === "wait"} onClose={close} title={`Put ${name} on the waiting list`} sub="Ranked by the school’s rules: sibling, category, test score, then date applied" action={waitAction} hidden={{ id }} submitLabel="Add to waiting list" submitIcon={ListOrdered}>
        {(f) => <TextArea label="Note" name="note" rows={2} maxLength={500} placeholder="Optional" defaultValue={f.val("note")} error={f.err("note")} />}
      </FormSheet>
    </>
  );
}

export function ConfirmButton({ id, name, sub, sections, defaultSection, today }: { id: string; name: string; sub: string; sections: Option[]; defaultSection: string | null; today: string }) {
  const [open, setOpen] = useState(false);
  const [sec, setSec] = useState(defaultSection ?? sections[0]?.value ?? "");
  return (
    <>
      <Button variant="primary" icon={BadgeCheck} onClick={() => setOpen(true)}>Confirm admission</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} wide title={`Confirm admission: ${name}`} sub={sub} action={confirmAction} hidden={{ id, sectionId: sec }} submitLabel="Confirm admission" busyLabel="Making the student record…" submitIcon={BadgeCheck}>
        {(f) => (
          <>
            <SubHead>Class place</SubHead>
            <div className="flex flex-col gap-1.5">
              <p className="text-[13px] font-semibold text-ink2">Section <span className="text-bad" aria-hidden="true">*</span></p>
              {sections.length <= 4
                ? <Segmented label="Section" value={sec} onChange={setSec} options={sections} className="w-full" size="sm" />
                : <select aria-label="Section" value={sec} onChange={(e) => setSec(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3">{sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}
              <p className="text-[12.5px] text-ink3">The section with most free seats is picked for you.</p>
              {f.err("sectionId") && <p className="text-[12.5px] text-bad">{f.err("sectionId")}</p>}
            </div>
            <TextField label="Admission date" name="admissionDate" type="date" required defaultValue={f.val("admissionDate", today)} error={f.err("admissionDate")} className="tnum" />
            <p className="text-[12.5px] text-ink3">Makes the student with an admission number, links the parents, sends Parent Link, sets up the fee plan and queues the ID card. Runs once per application.</p>
          </>
        )}
      </FormSheet>
    </>
  );
}

export function OfferButtons({ id, sent, accepted, hasEmail }: { id: string; sent: boolean; accepted: boolean; hasEmail: boolean }) {
  const [open, setOpen] = useState(false);
  const channels: Option[] = [{ value: "whatsapp", label: "WhatsApp or SMS" }, ...(hasEmail ? [{ value: "email", label: "Email" }] : []), { value: "printed", label: "Printed and handed over" }];
  return (
    <>
      {!accepted && <Button variant="secondary" icon={FileSignature} onClick={() => setOpen(true)}>{sent ? "Send offer again" : "Send offer letter"}</Button>}
      {sent && !accepted && <ActionButton action={offerAcceptedAction} hidden={{ id }} size="md" icon={CircleCheck} className="inline-flex">Mark accepted</ActionButton>}
      <FormSheet open={open} onClose={() => setOpen(false)} title="Send the offer letter" sub="Made from the offer-letter design in Settings" action={offerSentAction} hidden={{ id }} submitLabel="Record as sent" submitIcon={FileSignature}>
        {(f) => <SelectField label="How" name="channel" required options={channels} defaultValue={f.val("channel", "whatsapp")} error={f.err("channel")} />}
      </FormSheet>
    </>
  );
}

export function WaitMove({ id, name, rank, above, below }: { id: string; name: string; rank: number; above: string | null; below: string | null }) {
  const [dir, setDir] = useState<-1 | 1 | 0>(0);
  const other = dir < 0 ? above : below;
  return (
    <div className="flex gap-1 shrink-0">
      <button type="button" aria-label={`Move ${name} up`} disabled={!above} onClick={() => setDir(-1)} className="w-[34px] h-[34px] grid place-items-center rounded-xl text-ink2 hover:bg-sunken disabled:opacity-30"><ArrowUp size={17} aria-hidden="true" /></button>
      <button type="button" aria-label={`Move ${name} down`} disabled={!below} onClick={() => setDir(1)} className="w-[34px] h-[34px] grid place-items-center rounded-xl text-ink2 hover:bg-sunken disabled:opacity-30"><ArrowDown size={17} aria-hidden="true" /></button>
      <FormSheet open={dir !== 0} onClose={() => setDir(0)} title={`Move ${name} ${dir < 0 ? "up" : "down"}`} sub={`${dir < 0 ? "Above" : "Below"} ${other ?? ""}. The rank by the rules is changed by hand.`}
        action={moveWaitAction} hidden={{ id, toRank: String(rank + dir) }} submitLabel="Move and save reason">
        {(f) => <TextField label="Reason" name="reason" required maxLength={300} placeholder="Written to the history" defaultValue={f.val("reason")} error={f.err("reason")} />}
      </FormSheet>
    </div>
  );
}

export function OfferSeat({ id }: { id: string }) {
  return <ActionButton action={offerSeatAction} hidden={{ id }} variant="soft" busyLabel="Sending…" className="inline-flex">Offer seat</ActionButton>;
}

export function Rerank({ yearId, classId, className }: { yearId: string; classId: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="soft" icon={RefreshCw} onClick={() => setOpen(true)}>Re-rank by the rules</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={`Re-rank the ${className} waiting list`} sub="Every position is worked out again from the rules. Moves made by hand are replaced." action={rerankAction} hidden={{ yearId, classId }} submitLabel="Re-rank" submitIcon={RefreshCw}>
        {(f) => <TextArea label="Reason" name="reason" required rows={2} maxLength={300} defaultValue={f.val("reason")} error={f.err("reason")} />}
      </FormSheet>
    </>
  );
}

export function UndoAdmission({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" icon={Undo2} onClick={() => setOpen(true)}>Undo admission (10 min)</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Undo admission?" sub="The student, the new parent records, their Parent Links and the class place are archived. Allowed only while nothing else has happened to the student."
        action={undoAction} hidden={{ id }} submitLabel="Undo admission" submitVariant="danger" submitIcon={Undo2}>
        {() => <p className="text-[14px] text-ink2">The application goes back to approved. Nothing is deleted; the history keeps both steps.</p>}
      </FormSheet>
    </>
  );
}
