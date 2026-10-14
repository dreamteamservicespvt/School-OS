"use client";

import { useState, useTransition } from "react";
import { Archive, Bell, ChevronDown, Copy, Eye, Pencil, Send, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Segmented, Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { MoreMenu } from "@/components/money/more-menu";
import { cx } from "@/components/ui/cx";
import { ActionButton } from "@/components/students/confirm-action";
import { AttachPicker, HandInPicker } from "./_components/attach";
import { archiveHomeworkAction, draftHomeworkAction, editHomeworkAction, giveHomeworkAction, remindTeacherAction, resendHomeworkAction, submitWorkAction } from "./actions";

export type DueChoice = { date: string; words: string };
export type GiveSection = {
  id: string; label: string; classId: string; className: string; students: number;
  subjects: { id: string; name: string; next: DueChoice }[];
  tomorrow: DueChoice;
  roster: { id: string; name: string; rollNo: number | null }[];
};

export function Text({ name, label, start, required, placeholder, help, value, onValue, area, rows = 3, className }: {
  name: string; label: string; start?: string; required?: boolean; placeholder?: string; help?: React.ReactNode;
  value?: string; onValue?: (v: string) => void; area?: boolean; rows?: number; className?: string;
}) {
  const t = useTyped(name, start);
  const id = `f-${name}`;
  const common = {
    id, name, placeholder, "aria-invalid": t.error ? true : undefined, "aria-describedby": t.error ? `${id}-error` : help ? `${id}-help` : undefined,
    ...(onValue ? { value: value ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onValue(e.target.value) } : { defaultValue: t.value, key: t.key }),
  };
  return (
    <FieldShell label={label} id={id} required={required} error={t.error} help={help} className={className}>
      {area ? <textarea rows={rows} {...common} className={cx(inputCls(t.error), "py-2.5 resize-y")} /> : <input {...common} className={cx(inputCls(t.error), "h-11")} autoComplete="off" />}
    </FieldShell>
  );
}

/** Give homework (mod-homework.jsx GiveHomeworkSheet): 1 class, 2 what to do, 3 due. The due date is filled for you. */
export function GiveSheet({ closeHref, sections, own, today, defaultMax, onlineOn, ai, startSection }: {
  closeHref: string; sections: GiveSection[]; own: boolean; today: string; defaultMax: number; onlineOn: boolean; ai: boolean; startSection?: string;
}) {
  const typedSection = useTyped("sectionId", startSection ?? sections[0]?.id).value;
  const [sectionId, setSectionId] = useState(sections.some((s) => s.id === typedSection) ? typedSection : sections[0]?.id ?? "");
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  const typedSubject = useTyped("subjectId", section?.subjects[0]?.id).value;
  const [subjectId, setSubjectId] = useState(section?.subjects.some((x) => x.id === typedSubject) ? typedSubject : section?.subjects[0]?.id ?? "");
  const subject = section?.subjects.find((x) => x.id === subjectId) ?? section?.subjects[0];
  const typedTitle = useTyped("title", "").value;
  const typedInstr = useTyped("instructions", "").value;
  const [title, setTitle] = useState(typedTitle);
  const [instr, setInstr] = useState(typedInstr);
  const [due, setDue] = useState<"next" | "tomorrow" | "pick">(useTyped("due", "next").value as "next" | "tomorrow" | "pick" || "next");
  const typedPick = useTyped("dueDate", "");
  const [picked, setPicked] = useState(typedPick.value);
  const startT = useTyped("startDate", today);
  const maxT = useTyped("maxMarks", defaultMax);
  const studentsT = useTyped("studentIds", null);
  const [more, setMore] = useState(!!(startT.error || maxT.error || studentsT.error));
  const [to, setTo] = useState(useTyped("givenTo", "SECTION").value || "SECTION");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState(onlineOn);
  const [draft, setDraft] = useState<{ title: string; instructions: string; source: string } | null>(null);
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [aiProblem, setAiProblem] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const classError = useTyped("sectionId").error ?? useTyped("subjectId").error;
  if (!section || !subject) return null;

  const pick = (id: string) => {
    setSectionId(id);
    const next = sections.find((s) => s.id === id);
    if (next && !next.subjects.some((x) => x.id === subjectId)) setSubjectId(next.subjects[0]?.id ?? "");
    setChosen(new Set());
    setDraft(null);
  };
  const dueDate = due === "next" ? subject.next.date : due === "tomorrow" ? section.tomorrow.date : picked;
  const sameClass = sections.filter((s) => s.classId === section.classId && s.subjects.some((x) => x.id === subject.id));
  const askDraft = () => startDraft(async () => {
    setAiProblem(null);
    const r = await draftHomeworkAction(section.id, subject.id);
    if (r.draft) setDraft(r.draft); else setAiProblem(r.problem ?? "No draft this time.");
  });

  return (
    <SheetForm title="Give homework" sub="Three steps: class, what to do, send. Due date is filled for you." closeHref={closeHref} action={giveHomeworkAction}
      submitLabel={<><Send size={16} aria-hidden="true" />{`Send to ${to === "CLASS" && sameClass.length > 1 ? `all of ${section.className}` : section.label}`}</>} pendingText="Sending…"
      hidden={{ sectionId: section.id, subjectId: subject.id, dueDate, due, givenTo: to, fromSuggestion: fromSuggestion ? "1" : "" }}>
      <FieldShell label="1 · Class" id="gh-class" required help="Only your classes that have students are shown" error={classError}>
        {own ? (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Class">
            {sections.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={c.id === section.id} onClick={() => pick(c.id)}
                className={cx("h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2", c.id === section.id ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50")}>
                {c.label}<span className={cx("text-[11.5px] tnum", c.id === section.id ? "opacity-90" : "text-ink3")}>{c.students}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <select id="gh-class" value={section.id} onChange={(e) => pick(e.target.value)} className={cx(inputCls(), "h-11")} aria-label="Class">
              {sections.map((c) => <option key={c.id} value={c.id}>Class {c.label} · {c.students}</option>)}
            </select>
            <select value={subject.id} onChange={(e) => { setSubjectId(e.target.value); setDraft(null); }} className={cx(inputCls(), "h-11")} aria-label="Subject">
              {section.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        )}
      </FieldShell>
      {own && (section.subjects.length > 1 ? (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-ink3">Subject:
          {section.subjects.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === subject.id} onClick={() => { setSubjectId(x.id); setDraft(null); }}
              className={cx("h-8 px-2.5 rounded-lg border text-[13px] font-semibold", x.id === subject.id ? "bg-brand/10 border-brand text-brand" : "border-line text-ink2")}>{x.name}</button>
          ))}
        </div>
      ) : <p className="text-[13px] text-ink3 -mt-2">Subject: <b className="font-semibold text-ink2">{subject.name}</b></p>)}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink2">2 · What to do</p>
          {ai && <Button size="sm" variant="soft" icon={Sparkles} loading={drafting} onClick={askDraft}>Draft with AI</Button>}
        </div>
        {aiProblem && <p className="text-[12.5px] text-ink3" role="status">{aiProblem}</p>}
        {draft && (
          <div className="rounded-2xl border border-brand/25 bg-brand/[.03] p-3.5">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold"><Sparkles size={15} className="text-brand" aria-hidden="true" />Draft homework<Pill tone="brand" className="!h-5 !text-[11px] ml-auto">Suggestion</Pill></p>
            <p className="text-[13.5px] font-semibold mt-2">{draft.title}</p>
            <p className="text-[13.5px] text-ink2 mt-0.5">{draft.instructions}</p>
            <p className="text-[12px] text-ink3 mt-1.5">Based on: {draft.source}</p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="soft" onClick={() => { setTitle(draft.title); setInstr(draft.instructions); setFromSuggestion(true); setDraft(null); }}>Use and edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
            </div>
          </div>
        )}
        <Text name="title" label="Title" required placeholder="Exercise 4.3, Q1–Q8" value={title} onValue={setTitle} />
        <Text name="instructions" label="Instructions" area placeholder="What should students do?" help="Or just attach a photo of the board" value={instr} onValue={setInstr} />
        <AttachPicker />
      </div>

      <FieldShell label="3 · Due" id="gh-due" required error={typedPick.error}>
        <Segmented value={due} onChange={(v) => setDue(v as typeof due)} className="w-full" label="Due"
          options={[{ value: "next", label: "Next class" }, { value: "tomorrow", label: "Tomorrow" }, { value: "pick", label: "Pick a date" }]} />
        {due === "pick"
          ? <input id="gh-due" type="date" value={picked} min={today} onChange={(e) => setPicked(e.target.value)} aria-invalid={typedPick.error ? true : undefined} className={cx(inputCls(typedPick.error), "h-11 tnum mt-1")} />
          : <p className="text-[12.5px] text-ink3">{due === "next" ? `Next ${subject.name} class: ${subject.next.words}` : `${section.tomorrow.words}, 11:59 PM`}</p>}
      </FieldShell>

      <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="self-start inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand h-8 px-1 rounded-lg">
        <ChevronDown size={16} className={cx("transition", more && "rotate-180")} aria-hidden="true" />More details
      </button>
      <div className={cx("flex flex-col gap-3", !more && "hidden")}>
        <FieldShell label="Given to" id="gh-to" required error={studentsT.error}>
          <Segmented value={to} onChange={setTo} className="w-full" label="Given to"
            options={[{ value: "SECTION", label: `Whole ${section.label}` }, ...(sameClass.length > 1 ? [{ value: "CLASS", label: `All of ${section.className}` }] : []), { value: "STUDENTS", label: "Chosen students" }]} />
        </FieldShell>
        {to === "CLASS" && <p className="text-[12.5px] text-ink3 -mt-1">Goes to {sameClass.map((s) => s.label).join(", ")}: {sameClass.reduce((a, s) => a + s.students, 0)} students.</p>}
        {to === "STUDENTS" && (
          <fieldset className="rounded-xl border border-line p-2 max-h-56 overflow-y-auto scroll-thin">
            <legend className="sr-only">Chosen students</legend>
            {section.roster.map((st) => (
              <label key={st.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-sunken/60 text-[14px] cursor-pointer">
                <input type="checkbox" name="studentIds" value={st.id} checked={chosen.has(st.id)} className="size-4 accent-[rgb(var(--brand))]"
                  onChange={(e) => setChosen((x) => { const n = new Set(x); if (e.target.checked) n.add(st.id); else n.delete(st.id); return n; })} />
                <span className="tnum text-ink3 w-6 text-right">{st.rollNo ?? ""}</span>{st.name}
              </label>
            ))}
          </fieldset>
        )}
        {to === "STUDENTS" && <p className="text-[12.5px] text-ink3 -mt-1">{chosen.size} chosen. Others will not see it.</p>}
        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Start date" id="gh-start" required error={startT.error}>
            <input id="gh-start" name="startDate" type="date" defaultValue={startT.value} key={startT.key} className={cx(inputCls(startT.error), "h-11 tnum")} />
          </FieldShell>
          <FieldShell label="Maximum marks" id="gh-max" error={maxT.error}>
            <input id="gh-max" name="maxMarks" inputMode="numeric" defaultValue={maxT.value} key={maxT.key} className={cx(inputCls(maxT.error), "h-11 tnum")} />
          </FieldShell>
        </div>
        {onlineOn && (
          <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
            <Switch id="gh-online" on={online} onChange={setOnline} label="Online submission" name="online" />
            <label htmlFor="gh-online" className="text-[13.5px]"><b className="font-semibold block">Online submission</b><span className="text-ink3 text-[12.5px]">Students with a login hand in a photo or file</span></label>
          </div>
        )}
      </div>
    </SheetForm>
  );
}

/** Edit homework: the same details; students and parents see the change, and it is logged. */
export function EditSheet({ closeHref, hw, files, onlineOn }: {
  closeHref: string; onlineOn: boolean;
  hw: { id: string; title: string; instructions: string; startDate: string; dueDate: string; maxMarks: number; onlineSubmission: boolean; label: string };
  files: { id: string; name: string }[];
}) {
  const [online, setOnline] = useState(hw.onlineSubmission);
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const startT = useTyped("startDate", hw.startDate);
  const dueT = useTyped("dueDate", hw.dueDate);
  const maxT = useTyped("maxMarks", hw.maxMarks);
  return (
    <SheetForm title={`Edit: ${hw.title}`} sub={`${hw.label} · students and parents see the change. It is logged.`} closeHref={closeHref} action={editHomeworkAction}
      submitLabel="Save changes" pendingText="Saving…" hidden={{ id: hw.id }}>
      <Text name="title" label="Title" required start={hw.title} />
      <Text name="instructions" label="Instructions" area start={hw.instructions} />
      {files.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[13px] font-semibold text-ink2 mb-1">Attached</legend>
          {files.map((f) => (
            <label key={f.id} className={cx("flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13.5px]", remove.has(f.id) && "opacity-50 line-through")}>
              <span className="flex-1 min-w-0 truncate">{f.name}</span>
              <input type="checkbox" name="remove" value={f.id} checked={remove.has(f.id)} className="size-4"
                onChange={(e) => setRemove((x) => { const n = new Set(x); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })} />
              <span className="text-[12.5px] text-ink3">Remove</span>
            </label>
          ))}
        </fieldset>
      )}
      <AttachPicker />
      <div className="grid grid-cols-3 gap-3">
        <FieldShell label="Start date" id="ed-start" required error={startT.error}><input id="ed-start" name="startDate" type="date" defaultValue={startT.value} key={startT.key} className={cx(inputCls(startT.error), "h-11 tnum")} /></FieldShell>
        <FieldShell label="Due date" id="ed-due" required error={dueT.error}><input id="ed-due" name="dueDate" type="date" defaultValue={dueT.value} key={dueT.key} className={cx(inputCls(dueT.error), "h-11 tnum")} /></FieldShell>
        <FieldShell label="Maximum marks" id="ed-max" error={maxT.error}><input id="ed-max" name="maxMarks" inputMode="numeric" defaultValue={maxT.value} key={maxT.key} className={cx(inputCls(maxT.error), "h-11 tnum")} /></FieldShell>
      </div>
      {onlineOn && (
        <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
          <Switch id="ed-online" on={online} onChange={setOnline} label="Online submission" name="online" />
          <label htmlFor="ed-online" className="text-[13.5px]"><b className="font-semibold block">Online submission</b><span className="text-ink3 text-[12.5px]">Students with a login hand in a photo or file</span></label>
        </div>
      )}
    </SheetForm>
  );
}

export function ArchiveSheet({ closeHref, id, title }: { closeHref: string; id: string; title: string }) {
  return (
    <SheetForm title={`Archive “${title}”?`} closeHref={closeHref} action={archiveHomeworkAction} submitLabel="Archive homework" pendingText="Archiving…" hidden={{ id }}>
      <p className="text-[14px] text-ink2">It leaves the lists for students, parents and teachers. Hand-ins and marks are kept, and you can undo it from the message that follows, or find it in History with Archived.</p>
    </SheetForm>
  );
}

export function ResendSheet({ closeHref, id, title, parents, credits, channel, problem }: { closeHref: string; id: string; title: string; parents: number; credits: number; channel: string; problem: string | null }) {
  return (
    <SheetForm title={`Resend to ${parents} parents?`} closeHref={closeHref} action={resendHomeworkAction} submitLabel={`Send to ${parents} parents`} pendingText="Sending…" hidden={{ id }} submitDisabled={!!problem || parents === 0}>
      <p className="text-[14px] text-ink2">Only the parents who have not seen “{title}”. By {channel}, with SMS backup. Cost: {credits} credits. A message cannot be unsent.</p>
      {problem && <p className="text-[13.5px] text-bad" role="alert">{problem}</p>}
    </SheetForm>
  );
}

/** Hand in work (mod-homework.jsx SubmitSheet). */
export function SubmitSheet({ closeHref, id, title, sub, maxMb, again }: { closeHref: string; id: string; title: string; sub: string; maxMb: number; again: boolean }) {
  const [count, setCount] = useState(0);
  const [note, setNote] = useState(useTyped("note", "").value);
  const ready = count > 0 || note.trim().length > 0;
  return (
    <SheetForm title={`${again ? "Hand in again" : "Hand in"}: ${title}`} sub={sub} closeHref={closeHref} action={submitWorkAction} hidden={{ id }} pendingText="Handing in…" submitDisabled={!ready}
      submitLabel={<><Upload size={16} aria-hidden="true" />{count ? `Hand in ${count} ${count === 1 ? "file" : "files"}` : ready ? "Hand in" : "Add a photo or file first"}</>}>
      <HandInPicker maxMb={maxMb} onCount={setCount} />
      <Text name="note" label="Note to your teacher" area rows={2} placeholder="For example: I could not do Q9" help="Optional" value={note} onValue={setNote} />
    </SheetForm>
  );
}

/** "Remind" next to a teacher with work waiting (By teacher card). */
export function RemindButton({ staffId }: { staffId: string }) {
  return <ActionButton action={remindTeacherAction} fields={{ staffId }} className="shrink-0"><Bell size={15} aria-hidden="true" />Remind</ActionButton>;
}

/** The ... menu on a homework card. */
export function CardMenu({ detail, edit, copy, archive, size = "sm" }: { detail?: string; edit?: string; copy?: string; archive?: string; size?: "sm" | "md" }) {
  return (
    <MoreMenu size={size} label="More for this homework" items={[
      ...(detail ? [{ icon: Eye, label: "Open details", href: detail }] : []),
      ...(edit ? [{ icon: Pencil, label: "Edit", href: edit }] : []),
      ...(copy ? [{ icon: Copy, label: "Give to another section", href: copy }] : []),
      ...(archive ? [{ icon: Archive, label: "Archive", href: archive, tone: "bad" as const }] : []),
    ]} />
  );
}

