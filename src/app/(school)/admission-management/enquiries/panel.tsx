"use client";

// One enquiry beside the list (design: mod-admissions.jsx EnquiryPanel): the
// four quick actions, the details, Convert to application, the "…" menu,
// messages and the activity history, which is never deleted.

import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock, Archive, ArrowLeft, CircleX, FilePlus2, FileText, GraduationCap, ListChecks, Lock, Megaphone, PhoneCall, Plus,
  RotateCcw, Send, StickyNote, Tag, UserCog, X, Circle, Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill, type PillTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { MoreMenu, type MenuItem } from "@/app/(school)/admission-management/_components/more-menu";
import { Banner } from "@/components/ui/chips";
import { Timeline } from "@/components/ui/rows";
import { SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { STATUS_TONE } from "@/lib/admission/tones";
import { FormSheet, SegField, WhenField } from "../_components/forms";
import { EditEnquiryButton, type EnquiryChoices, type SavedEnquiry } from "./enquiry-forms";
import {
  archiveAction, callAction, changeSourceAction, changeStatusAction, closeLostAction, followUpAction, messageAction, noteAction, reassignAction, reopenAction,
} from "./actions";


export type PanelActivity = { id: string; kind: string; text: string; when: string; by: string | null; direction: string | null };
export type PanelEnquiry = {
  id: string; enquiryNo: string | null; childName: string; parentName: string; phone: string; email: string | null; className: string | null; yearLabel: string;
  status: string; statusLabel: string; source: string; sourceLabel: string; firstSourceLabel: string | null; ownerStaffId: string | null; ownerName: string | null;
  nextFollowUp: string | null; nextFollowUpLocal: string | null; due: "overdue" | "today" | "later" | null; nextAction: string | null;
  campaign: string | null; created: string; addedBy: string | null; seats: string | null; lostReason: string | null; lostNote: string | null;
  referredBy: string | null; currentSchool: string | null; childDob: string | null; applicationId: string | null; archived: boolean;
  activities: PanelActivity[]; saved: SavedEnquiry;
};

const KIND: Record<string, [LucideIcon, PillTone | undefined]> = {
  created: [Plus, "brand"], note: [StickyNote, undefined], call: [PhoneCall, undefined], "follow-up": [AlarmClock, "info"], edited: [Pencil, undefined], reassigned: [UserCog, "info"],
  status: [ListChecks, "brand"], source: [Tag, "warn"], message: [Send, "brand"], lost: [CircleX, undefined], reopened: [RotateCcw, "brand"],
  application: [FileText, "ok"], campaign: [Megaphone, "info"], admitted: [GraduationCap, "ok"],
};

const CALL_OUTCOMES = ["Talked", "No answer", "Busy", "Switched off", "Wrong number", "Call back later"];

function DItem({ k, v, sub, act }: { k: string; v: React.ReactNode; sub?: React.ReactNode; act?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink3 font-semibold flex items-center gap-2">{k}{act}</dt>
      <dd className="text-[14px] mt-0.5 break-words">{v}</dd>
      {sub && <dd className="text-[12.5px] text-ink3">{sub}</dd>}
    </div>
  );
}

type Sheet = "call" | "note" | "msg" | "follow" | "reassign" | "source" | "status" | "lost" | "reopen" | "archive" | null;

export function EnquiryPanel({ e, closeHref, canWork, full, canArchive, c, statuses, lossReasons, templates }: {
  e: PanelEnquiry; closeHref: string; canWork: boolean; full: boolean; canArchive: boolean; c: EnquiryChoices;
  statuses: Option[]; lossReasons: Option[]; templates: { key: string; label: string; text: string }[];
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const messages = e.activities.filter((a) => a.kind === "message");
  const [tab, setTab] = useState<"chat" | "activity">("activity");
  const closed = ["applied", "admitted", "lost"].includes(e.status);
  const close = () => setSheet(null);
  const hidden = { id: e.id };
  const link = (label: string, s: Sheet) => <button type="button" onClick={() => setSheet(s)} className="text-brand hover:underline">{label}</button>;
  const menu: MenuItem[] = [
    ...(full ? [{ icon: ListChecks, label: "Change status", onClick: () => setSheet("status") }, { icon: UserCog, label: "Reassign owner", onClick: () => setSheet("reassign") }, { icon: Tag, label: "Change source", onClick: () => setSheet("source") }] : []),
    { icon: CircleX, label: "Close as lost", onClick: () => setSheet("lost"), tone: "bad" as const },
    ...(canArchive ? [{ icon: Archive, label: "Archive enquiry", onClick: () => setSheet("archive"), tone: "bad" as const }] : []),
  ];
  const [tpl, setTpl] = useState(templates[0]?.key ?? "");
  const [text, setText] = useState(templates[0]?.text ?? "");
  const [channel, setChannel] = useState("whatsapp");

  return (
    <Card className="min-w-0 animate-rise">
      <div className="flex items-center justify-between px-3 pt-2.5">
        <Link href={closeHref} scroll={false} className="xl:invisible inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink h-8 px-1 rounded-lg"><ArrowLeft size={17} aria-hidden="true" />All enquiries</Link>
        <Link href={closeHref} scroll={false} aria-label="Close" title="Close" className="hidden xl:inline-flex size-9 items-center justify-center rounded-xl text-ink2 hover:bg-sunken hover:text-ink"><X size={19} aria-hidden="true" /></Link>
      </div>
      <div className="px-5 pb-4 flex items-start gap-3.5">
        <Avatar name={e.childName} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-semibold text-[20px] leading-tight">{e.childName}</h2>
          <p className="text-[13px] text-ink3 mt-0.5">{e.className ?? "Class not decided"} · {e.yearLabel}{e.enquiryNo && <> · <span className="font-mono text-[12px]">{e.enquiryNo}</span></>}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <Pill tone={STATUS_TONE[e.status] ?? "neutral"} dot>{e.statusLabel}</Pill>
            {e.campaign && <Pill tone="info">{e.campaign}</Pill>}
            {e.lostReason && <Pill tone="neutral">{e.lostReason}</Pill>}
            {e.archived && <Pill tone="warn">Archived</Pill>}
          </div>
        </div>
      </div>
      {canWork && !closed && (
        <div className="grid grid-cols-4 gap-2 px-4 pb-4">
          {([[PhoneCall, "Log call", "call"], [StickyNote, "Add note", "note"], [Send, "Message", "msg"], [AlarmClock, "Follow-up", "follow"]] as const).map(([Ic, l, k]) => (
            <button key={k} type="button" onClick={() => setSheet(k)} className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-sunken/70 hover:bg-brand/8 hover:text-brand transition text-[12.5px] font-semibold">
              <Ic size={18} className="text-brand" aria-hidden="true" />{l}
            </button>
          ))}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-5 py-4 border-t border-line/70">
        <DItem k="Parent" v={e.parentName} sub={e.email} act={canWork && !e.archived ? <EditEnquiryButton c={c} saved={e.saved} /> : undefined} />
        <DItem k="Phone" v={<a href={`tel:+91${e.phone}`} className="tnum select-all hover:underline">+91 {e.phone.replace(/^(\d{5})(\d{5})$/, "$1 $2")}</a>} />
        <DItem k="Source" v={e.sourceLabel} sub={e.firstSourceLabel ? `First recorded: ${e.firstSourceLabel}` : e.referredBy ? `By ${e.referredBy}` : null} act={canWork && full && !closed ? link("Change", "source") : undefined} />
        <DItem k="Owner" v={e.ownerName ?? "No owner"} act={canWork && full && !closed ? link("Reassign", "reassign") : undefined} />
        <DItem k="Next follow-up" v={e.nextFollowUp ? <span className={cx("tnum", e.due === "overdue" && "text-bad font-semibold", e.due === "today" && "text-warn font-semibold")}>{e.nextFollowUp}</span> : "None"} sub={e.nextAction} />
        <DItem k="Campaign" v={e.campaign ?? "None"} />
        <DItem k="Added" v={e.created} sub={e.addedBy ? `By ${e.addedBy}` : null} />
        <DItem k="Class wanted" v={e.className ?? "Not decided"} sub={e.seats} />
        {e.currentSchool && <DItem k="Current school" v={e.currentSchool} />}
        {e.childDob && <DItem k="Date of birth" v={e.childDob} />}
        {e.lostNote && <DItem k="Why lost" v={e.lostNote} />}
      </dl>
      {canWork && !closed && !e.archived && (
        <div className="flex gap-2 px-5 pb-4">
          {full ? <ButtonLink href={`/admission-management/applications/new?enquiry=${e.id}`} variant="primary" icon={FilePlus2} className="flex-1">Convert to application</ButtonLink>
            : <Button variant="secondary" icon={ListChecks} className="flex-1" onClick={() => setSheet("status")}>Change status</Button>}
          <MoreMenu items={menu} />
        </div>
      )}
      {e.applicationId && full && (
        <div className="px-5 pb-4"><ButtonLink href={`/admission-management/applications/${e.applicationId}`} variant="secondary" icon={FileText} className="w-full">Open the application</ButtonLink></div>
      )}
      {canWork && e.status === "lost" && !e.archived && (
        <div className="px-5 pb-4"><Button variant="secondary" icon={RotateCcw} className="w-full" onClick={() => setSheet("reopen")}>Reopen enquiry</Button></div>
      )}

      <div className="px-3 border-b border-line flex gap-1" role="tablist" aria-label="Enquiry history">
        {([["chat", "Messages", messages.length], ["activity", "Activity", e.activities.length]] as const).map(([id, l, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cx("relative h-11 px-3.5 text-sm font-semibold transition", tab === id ? "text-brand" : "text-ink2 hover:text-ink")}>
            {l}<span className="ml-1.5 text-xs text-ink3 tnum">{n}</span>
            {tab === id && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-brand" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {tab === "chat" ? (
        <div className="p-4 flex flex-col gap-3" role="tabpanel">
          {messages.length === 0 ? <p className="text-[13.5px] text-ink3 text-center py-6">No messages yet.{canWork && !closed ? " Use Message to send the first one." : ""}</p> : (
            <ol className="flex flex-col gap-2.5">
              {[...messages].reverse().map((m) => (
                <li key={m.id} className={cx("max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug", m.direction === "incoming" ? "bg-sunken self-start rounded-bl-md" : "bg-brand/10 self-end rounded-br-md")}>
                  <p>{m.text}</p>
                  <p className="text-[11.5px] text-ink3 mt-1">{m.direction === "incoming" ? e.parentName : m.by ?? "School"} · {m.when}</p>
                </li>
              ))}
            </ol>
          )}
          {canWork && !closed && <Button variant="secondary" icon={Send} onClick={() => setSheet("msg")}>Send a message</Button>}
        </div>
      ) : (
        <div className="px-5 pt-5" role="tabpanel">
          <Timeline items={e.activities.map((a) => {
            const [Ic, tone] = KIND[a.kind] ?? [Circle, undefined];
            return { what: a.text, when: `${a.when}${a.by ? ` · ${a.by}` : ""}`, icon: Ic, tone };
          })} />
          <p className="text-[12px] text-ink3 pb-4 -mt-2 flex items-center gap-1.5"><Lock size={13} aria-hidden="true" />Full history is kept. Notes, calls and changes are never deleted.</p>
        </div>
      )}

      <FormSheet open={sheet === "call"} onClose={close} title="Log a call" sub={`${e.parentName} · +91 ${e.phone}`} action={callAction} hidden={hidden} submitLabel="Save call">
        {(f) => <>
          <SegField name="direction" label="Call" options={[{ value: "outgoing", label: "Outgoing" }, { value: "incoming", label: "Incoming" }]} defaultValue={f.val("direction", "outgoing")!} />
          <SelectField label="What happened" name="outcome" required options={CALL_OUTCOMES.map((o) => ({ value: o, label: o }))} defaultValue={f.val("outcome", "Talked")} error={f.err("outcome")} />
          <TextArea label="Note" name="note" placeholder="What did they ask? What did you promise?" defaultValue={f.val("note")} error={f.err("note")} />
          <WhenField label="Next follow-up" name="nextFollowUpAt" defaultValue={f.val("nextFollowUpAt", e.nextFollowUpLocal ?? c.defaultFollowUp)} error={f.err("nextFollowUpAt")} />
        </>}
      </FormSheet>
      <FormSheet open={sheet === "note"} onClose={close} title="Add note" sub={`On ${e.childName}’s enquiry. Only staff can see it.`} action={noteAction} hidden={hidden} submitLabel="Add note">
        {(f) => <TextArea label="Note" name="text" required rows={4} placeholder="For example: wants hostel from Class 6. Grandfather will decide." defaultValue={f.val("text")} error={f.err("text")} />}
      </FormSheet>
      <FormSheet open={sheet === "msg"} onClose={close} title={`Message ${e.parentName}`} sub={`+91 ${e.phone} · saved in this enquiry`} action={messageAction} hidden={{ ...hidden, template: tpl }} submitLabel={`Send to ${e.parentName}`} busyLabel="Sending…" submitIcon={Send}>
        {(f) => <>
          <SegField name="channel" label="Send by" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }]} defaultValue={channel} onChange={setChannel} />
          <SelectField label="Template" name="_template" required options={templates.map((t) => ({ value: t.key, label: t.label }))} value={tpl}
            onChange={(x) => { setTpl(x.target.value); setText(templates.find((t) => t.key === x.target.value)?.text ?? ""); }} />
          <TextArea label="Message" name="text" required rows={5} value={text} onChange={(x) => setText(x.target.value)} error={f.err("text")} help="You can change the words before sending." />
          {channel === "email" && !e.email && <Banner tone="warn">No email on this enquiry yet. Add one with Edit, or send on WhatsApp.</Banner>}
          {f.err("channel") && <p className="text-[12.5px] text-bad">{f.err("channel")}</p>}
        </>}
      </FormSheet>
      <FormSheet open={sheet === "follow"} onClose={close} title="Set next follow-up" sub="The owner gets a reminder at this time" action={followUpAction} hidden={hidden} submitLabel="Set follow-up">
        {(f) => <>
          <WhenField label="Date" name="nextFollowUpAt" required defaultValue={f.val("nextFollowUpAt", e.nextFollowUpLocal ?? c.defaultFollowUp)} error={f.err("nextFollowUpAt")} />
          <TextField label="Next action" name="nextAction" maxLength={200} defaultValue={f.val("nextAction", e.nextAction ?? "Call the parent")} error={f.err("nextAction")} />
        </>}
      </FormSheet>
      <FormSheet open={sheet === "reassign"} onClose={close} title="Reassign owner" sub={e.ownerName ? `Now owned by ${e.ownerName}. The history keeps both names.` : "The history keeps the old and new owner."} action={reassignAction} hidden={hidden} submitLabel="Reassign">
        {(f) => <>
          <SelectField label="New owner" name="ownerStaffId" required options={c.owners.filter((o) => o.value !== e.ownerStaffId)} placeholder="Choose" defaultValue={f.val("ownerStaffId")} error={f.err("ownerStaffId")} />
          <TextField label="Reason" name="reason" required maxLength={300} placeholder="Why is the owner changing?" defaultValue={f.val("reason")} error={f.err("reason")} />
        </>}
      </FormSheet>
      <FormSheet open={sheet === "source"} onClose={close} title="Change source" sub="Only the admission team can do this" action={changeSourceAction} hidden={hidden} submitLabel="Change source">
        {(f) => <>
          <Banner tone="info" icon={Lock}>The first recorded source, <b className="font-semibold text-ink">{e.firstSourceLabel ?? e.sourceLabel}</b>, stays in the activity log and the source reports count it.</Banner>
          <SelectField label="New source" name="source" required options={c.sources.filter((s) => s.value !== e.source)} placeholder="Choose" defaultValue={f.val("source")} error={f.err("source")} />
          <TextField label="Reason" name="reason" required maxLength={300} placeholder="For example: parent says a friend referred them" defaultValue={f.val("reason")} error={f.err("reason")} />
        </>}
      </FormSheet>
      <FormSheet open={sheet === "status"} onClose={close} title="Change status" sub={`Now: ${e.statusLabel}. Applied and Admitted are set by School OS.`} action={changeStatusAction} hidden={hidden} submitLabel="Set status">
        {(f) => <SelectField label="New status" name="status" required options={statuses.filter((s) => s.value !== e.status)} placeholder="Choose" defaultValue={f.val("status")} error={f.err("status")} />}
      </FormSheet>
      <FormSheet open={sheet === "lost"} onClose={close} title="Close as lost" sub={`${e.childName}${e.className ? ` · ${e.className}` : ""}. It can be reopened later.`} action={closeLostAction} hidden={hidden} submitLabel="Close as lost" submitVariant="danger">
        {(f) => <>
          <SelectField label="Reason" name="reason" required options={lossReasons} placeholder="Choose a reason" defaultValue={f.val("reason")} error={f.err("reason")} />
          <TextArea label="Note" name="note" rows={2} maxLength={500} help="Needed when the reason is Other." defaultValue={f.val("note")} error={f.err("note")} />
        </>}
      </FormSheet>
      <FormSheet open={sheet === "reopen"} onClose={close} title="Reopen enquiry" sub="It goes back to Contacted with a new follow-up." action={reopenAction} hidden={hidden} submitLabel="Reopen" submitIcon={RotateCcw}>
        {(f) => <WhenField label="Next follow-up" name="nextFollowUpAt" required defaultValue={f.val("nextFollowUpAt", c.defaultFollowUp)} error={f.err("nextFollowUpAt")} />}
      </FormSheet>
      <FormSheet open={sheet === "archive"} onClose={close} title="Archive enquiry" sub="It leaves the lists but is kept with its history. You can restore it." action={archiveAction} hidden={hidden} submitLabel="Archive" submitVariant="danger" submitIcon={Archive}>
        {(f) => <TextField label="Reason" name="reason" required maxLength={300} placeholder="For example: entered twice by mistake" defaultValue={f.val("reason")} error={f.err("reason")} />}
      </FormSheet>
    </Card>
  );
}
