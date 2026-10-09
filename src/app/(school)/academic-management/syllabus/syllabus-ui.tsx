"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormDialog, err, v } from "../_components/form-dialog";
import {
  addItemAction, archiveItemAction, archiveLessonPlanAction, copySourcesAction, copySyllabusAction, logProgressAction, moveItemAction,
  pasteItemsAction, planDefaultsAction, saveLessonPlanAction, untickAction, updateItemAction,
} from "./actions";

type Kind = "UNIT" | "CHAPTER" | "LESSON" | "TOPIC";
const KINDS: Kind[] = ["UNIT", "CHAPTER", "LESSON", "TOPIC"];
const KIND_WORDS: Record<Kind, string> = { UNIT: "Unit", CHAPTER: "Chapter", LESSON: "Lesson", TOPIC: "Topic" };
const STATUS_TONE: Record<string, BadgeTone> = { Completed: "success", Taught: "brand", Pending: "danger", Planned: "neutral" };
const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "");

export type Row = { id: string; parentId: string | null; kind: Kind; title: string; depth: number; status: string; plannedFrom: string | null; plannedTo: string | null; ownPlannedTo: string | null; leaves: number; done: number; hasChildren: boolean; first: boolean; last: boolean };
type Where = { yearId: string; classId: string; subjectId: string };

export function SyllabusTree({ rows, canEdit, where, showStatus }: { rows: Row[]; canEdit: boolean; where: Where; showStatus: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const move = (id: string, dir: "up" | "down") => start(async () => { const p = await moveItemAction(id, dir); if (p) setError(p); else router.refresh(); });

  return (
    <>
      {error && <p className="mb-2 text-sm text-danger" role="alert">{error}</p>}
      <ol className="divide-y divide-line rounded-2xl border border-line bg-surface" aria-busy={pending}>
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-3" style={{ paddingLeft: `${12 + r.depth * 20}px` }}>
            <div className="min-w-0 flex-1">
              <p className={r.depth === 0 ? "font-semibold" : r.hasChildren ? "font-medium" : ""}>
                <span className="mr-1.5 text-xs uppercase tracking-wide text-ink-2">{KIND_WORDS[r.kind]}</span>{r.title}
              </p>
              <p className="text-xs text-ink-2">
                {r.plannedTo ? `Planned ${r.plannedFrom ? `${fmt(r.plannedFrom)} to ` : "by "}${fmt(r.plannedTo)}` : "No planned date"}
                {showStatus && r.hasChildren ? ` · ${r.done} of ${r.leaves} done` : ""}
              </p>
            </div>
            {showStatus && <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>}
            {canEdit && (
              <div className="flex flex-wrap items-center gap-1">
                {r.kind !== "TOPIC" && <Button size="sm" variant="ghost" onClick={() => setAdding(r)} aria-label={`Add under ${r.title}`}>+ Add</Button>}
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.title}`}>Edit</Button>
                <Button size="sm" variant="ghost" disabled={r.first || pending} onClick={() => move(r.id, "up")} aria-label={`Move ${r.title} up`}>↑</Button>
                <Button size="sm" variant="ghost" disabled={r.last || pending} onClick={() => move(r.id, "down")} aria-label={`Move ${r.title} down`}>↓</Button>
                <ConfirmButton trigger="Archive" triggerVariant="ghost" triggerClassName="text-danger" title={`Archive ${r.title}?`} confirmLabel={`Archive ${KIND_WORDS[r.kind].toLowerCase()}`} confirmVariant="danger"
                  onConfirm={async () => { const p = await archiveItemAction(r.id); if (!p) router.refresh(); return p; }}>
                  {r.hasChildren ? "Everything under it is archived too. " : ""}Progress already logged stays in history.
                </ConfirmButton>
              </div>
            )}
          </li>
        ))}
      </ol>
      {adding && <ItemDialog where={where} parent={adding} onClose={() => setAdding(null)} />}
      {editing && (
        <FormDialog open onClose={() => setEditing(null)} title={`Edit ${KIND_WORDS[editing.kind].toLowerCase()}`} action={updateItemAction} submitLabel="Save" hidden={{ id: editing.id }}>
          {(state) => (
            <>
              <TextField label="Title" name="title" required defaultValue={v(state, "title", editing.title)} error={err(state, "title")} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Planned start" name="plannedFrom" type="date" defaultValue={v(state, "plannedFrom", editing.plannedFrom)} error={err(state, "plannedFrom")} />
                <TextField label="Planned end" name="plannedTo" type="date" defaultValue={v(state, "plannedTo", editing.ownPlannedTo)} error={err(state, "plannedTo")} help={!editing.ownPlannedTo && editing.plannedTo ? `Now from the item above: ${fmt(editing.plannedTo)}.` : undefined} />
              </div>
            </>
          )}
        </FormDialog>
      )}
    </>
  );
}

function ItemDialog({ where, parent, onClose }: { where: Where; parent: Row | null; onClose?: () => void }) {
  const allowed = parent ? KINDS.slice(KINDS.indexOf(parent.kind) + 1) : KINDS;
  const fields = (state: Parameters<typeof v>[0]) => (
    <>
      {parent && <p className="text-ink-2">Under {KIND_WORDS[parent.kind].toLowerCase()} <strong>{parent.title}</strong>.</p>}
      <SelectField label="Kind" name="kind" required defaultValue={v(state, "kind", allowed[0])} options={allowed.map((k) => ({ value: k, label: KIND_WORDS[k] }))} error={err(state, "kind")} />
      <TextField label="Title" name="title" required defaultValue={v(state, "title")} placeholder={allowed[0] === "UNIT" ? "Unit 1: Numbers" : "Place value"} error={err(state, "title")} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Planned start" name="plannedFrom" type="date" defaultValue={v(state, "plannedFrom")} error={err(state, "plannedFrom")} />
        <TextField label="Planned end" name="plannedTo" type="date" defaultValue={v(state, "plannedTo")} error={err(state, "plannedTo")} />
      </div>
    </>
  );
  const hidden = { ...where, parentId: parent?.id ?? "" };
  return parent
    ? <FormDialog open onClose={onClose} title="Add to the syllabus" action={addItemAction} submitLabel="Add" hidden={hidden}>{fields}</FormDialog>
    : <FormDialog trigger="Add unit or chapter" triggerVariant="primary" title="Add to the syllabus" action={addItemAction} submitLabel="Add" hidden={hidden}>{fields}</FormDialog>;
}

export function AddTopItem({ where }: { where: Where }) {
  return <ItemDialog where={where} parent={null} />;
}

export function PasteItems({ where }: { where: Where }) {
  return (
    <FormDialog trigger="Paste a list" title="Paste the syllabus as a list" action={pasteItemsAction} submitLabel="Add all" hidden={where} wide>
      {(state) => (
        <>
          <p className="text-ink-2">One item a line. No dash for a unit, one dash for a chapter, two for a lesson, three for a topic. Add a planned end date after a bar. Copy a column from Excel and add the dashes, or type it.</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-sm">{"Unit 1: Numbers\n- Large numbers | 15-07-2026\n--- Place value\n--- Comparing numbers\n- Fractions | 30-08-2026"}</pre>
          <TextArea label="List" name="text" required rows={10} defaultValue={v(state, "text")} error={err(state, "text")} />
        </>
      )}
    </FormDialog>
  );
}

export function CopySyllabus({ where, yearIds }: { where: Where; yearIds: string[] }) {
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    copySourcesAction(yearIds, where.subjectId).then((o) => { if (live) setOptions(o.filter((x) => x.value !== `${where.yearId}:${where.classId}:${where.subjectId}`)); });
    return () => { live = false; };
  }, [open, yearIds, where]);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Copy from another class or year</Button>
      {open && (
        <FormDialog open onClose={() => { setOpen(false); setOptions(null); }} title="Copy a syllabus" action={copySyllabusAction} submitLabel="Copy" hidden={where}>
          {(state) => (
            options === null ? <p className="text-ink-2" aria-live="polite">Loading syllabuses…</p> : options.length === 0 ? <p className="text-ink-2">No other class or year has a syllabus yet.</p> : (
              <SelectField label="Copy from" name="from" required defaultValue={v(state, "from", options[0]?.value)} options={options} error={err(state, "from")} help="Planned dates move to this year. The same subject is listed first." />
            )
          )}
        </FormDialog>
      )}
    </>
  );
}

// ------------------------------------------------------------ daily log

export type LogChapter = { id: string; title: string; status: string; topics: { id: string; title: string; status: string; tickedToday: boolean }[] };

export function DailyLog({ chapters, yearId, sectionId, date, maxDate }: { chapters: LogChapter[]; yearId: string; sectionId: string; date: string; maxDate: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof logProgressAction>>, fd: FormData) => {
    const r = await logProgressAction(prev, fd);
    if (r?.ok) { setPicked([]); router.refresh(); }
    return r;
  }, null);
  const [day, setDay] = useState(date);
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const takeBack = (itemId: string) => start(async () => { const p = await untickAction({ sectionId, itemId, date: day }); setProblem(p ?? null); if (!p) router.refresh(); });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="yearId" value={yearId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="status" value="taught" />
      <FormMessage state={state} />
      {problem && <p className="text-sm text-danger" role="alert">{problem}</p>}
      <TextField label="Date" name="date" type="date" max={maxDate} value={day} onChange={(e) => { setDay(e.target.value); router.replace(`?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(window.location.search)), date: e.target.value })}`, { scroll: false }); }} className="max-w-xs" />
      {chapters.map((c) => (
        <fieldset key={c.id} className="rounded-2xl border border-line bg-surface">
          <legend className="sr-only">{c.title}</legend>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
            <p className="font-semibold">{c.title} <Badge tone={STATUS_TONE[c.status] ?? "neutral"} className="ml-1">{c.status}</Badge></p>
            {c.status !== "Completed" && (
              <ChapterDone yearId={yearId} sectionId={sectionId} chapterId={c.id} title={c.title} date={day} />
            )}
          </div>
          <ul>
            {c.topics.map((t) => (
              <li key={t.id} className="border-b border-line last:border-0">
                {t.tickedToday ? (
                  <div className="flex min-h-14 items-center justify-between gap-2 px-4">
                    <span className="flex items-center gap-3"><span aria-hidden="true" className="grid size-6 place-items-center rounded bg-success text-surface">✓</span>{t.title}</span>
                    <Button size="sm" variant="ghost" onClick={() => takeBack(t.id)} loading={busy}>Take back</Button>
                  </div>
                ) : (
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 hover:bg-surface-2">
                    <input type="checkbox" name="itemIds" value={t.id} className="size-6" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
                    <span className="flex-1">{t.title}</span>
                    {t.status !== "Planned" && <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>}
                  </label>
                )}
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
      <div className="sticky bottom-20 z-10 lg:bottom-4">
        <SubmitButton pendingText="Saving…" className="w-full shadow-card sm:w-auto">
          {picked.length ? `Save ${picked.length} ${picked.length === 1 ? "topic" : "topics"} taught` : "Tick the topics taught"}
        </SubmitButton>
      </div>
    </form>
  );
}

function ChapterDone({ yearId, sectionId, chapterId, title, date }: { yearId: string; sectionId: string; chapterId: string; title: string; date: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Mark completed" triggerVariant="ghost" title={`Mark ${title} completed?`} confirmLabel="Mark completed"
      onConfirm={async () => {
        const fd = new FormData();
        fd.set("yearId", yearId); fd.set("sectionId", sectionId); fd.append("itemIds", chapterId); fd.set("date", date); fd.set("status", "completed");
        const r = await logProgressAction(null, fd);
        if (r?.ok) { router.refresh(); return; }
        return r?.message ?? "That did not work. Please try again.";
      }}>
      Every topic under it counts as done for this section.
    </ConfirmButton>
  );
}

// ------------------------------------------------------------ lesson plans

export type PlanRow = { id: string; pair: string; topicId: string; date: string; objectives: string | null; resources: string | null; activities: string | null };

export function LessonPlanButton({ yearId, pairs, plan, defaultPair }: { yearId: string; pairs: { value: string; label: string }[]; plan?: PlanRow; defaultPair?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={plan ? "ghost" : "primary"} size={plan ? "sm" : "md"} onClick={() => setOpen(true)}>{plan ? "Edit" : "New lesson plan"}</Button>
      {open && <PlanDialog yearId={yearId} pairs={pairs} plan={plan} defaultPair={defaultPair} onClose={() => setOpen(false)} />}
    </>
  );
}

function PlanDialog({ yearId, pairs, plan, defaultPair, onClose }: { yearId: string; pairs: { value: string; label: string }[]; plan?: PlanRow; defaultPair?: string; onClose: () => void }) {
  const [pair, setPair] = useState(plan?.pair ?? defaultPair ?? pairs[0]?.value ?? "");
  const [info, setInfo] = useState<{ topics: { id: string; label: string }[]; topicId: string; date: string } | null>(null);
  const [topicId, setTopicId] = useState(plan?.topicId ?? "");
  const [date, setDate] = useState(plan?.date ?? "");
  useEffect(() => {
    if (!pair) return;
    let live = true;
    const [sectionId, subjectId] = pair.split(":");
    planDefaultsAction(sectionId, subjectId).then((r) => {
      if (!live) return;
      setInfo(r ?? { topics: [], topicId: "", date: "" });
      if (!plan || plan.pair !== pair) { setTopicId(r?.topicId ?? ""); setDate(r?.date ?? ""); }
    });
    return () => { live = false; };
  }, [pair, plan]);

  return (
    <FormDialog open onClose={onClose} title={plan ? "Edit lesson plan" : "New lesson plan"} action={saveLessonPlanAction} submitLabel="Save lesson plan" hidden={{ yearId, id: plan?.id ?? "" }} wide>
      {(state) => (
        <>
          <SelectField label="Class, section and subject" name="pair" required value={pair} onChange={(e) => setPair(e.target.value)} options={pairs} error={err(state, "pair")} placeholder={pairs.length ? undefined : "No classes given to you yet"} />
          {info === null ? <p className="text-sm text-ink-2" aria-live="polite">Loading topics…</p> : info.topics.length === 0 ? (
            <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn-text">This subject has no syllabus yet for the class. Ask the Academic Head to set it up in the Syllabus view.</p>
          ) : (
            <SelectField label="Topic" name="topicId" required value={topicId} onChange={(e) => setTopicId(e.target.value)} options={info.topics.map((t) => ({ value: t.id, label: t.label }))} error={err(state, "topicId")} help={plan ? undefined : "The next pending topic is chosen for you."} />
          )}
          <TextField label="Date" name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} error={err(state, "date")} help={plan ? undefined : "The next period of this subject in the Time Table."} />
          <TextArea label="Objectives" name="objectives" rows={3} defaultValue={v(state, "objectives", plan?.objectives)} error={err(state, "objectives")} placeholder="Students can compare two 5-digit numbers." />
          <TextArea label="Resources" name="resources" rows={2} defaultValue={v(state, "resources", plan?.resources)} error={err(state, "resources")} placeholder="Place value chart, textbook page 14, a video link" />
          <TextArea label="Activities and homework" name="activities" rows={3} defaultValue={v(state, "activities", plan?.activities)} error={err(state, "activities")} />
        </>
      )}
    </FormDialog>
  );
}

export function ArchivePlan({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Archive" triggerVariant="ghost" triggerClassName="text-danger" title="Archive this lesson plan?" confirmLabel="Archive lesson plan" confirmVariant="danger"
      onConfirm={async () => { const p = await archiveLessonPlanAction(id); if (!p) router.refresh(); return p; }}>
      The plan for {title} leaves the list. It stays in the history.
    </ConfirmButton>
  );
}
