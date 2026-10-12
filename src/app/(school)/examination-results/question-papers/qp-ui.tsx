"use client";

import { useState } from "react";
import { Archive, FileCheck2, FilePen, FileText, Plus, Printer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { MenuItem, MenuLink, MoreMenu, SelectBar } from "@/components/ui/kit-client";
import { ActionSheet } from "../_components/sheets";
import { archiveQuestionAction, makePaperForm, paperStatusAction, saveQuestionForm } from "./actions";

export type Pair = { value: string; label: string; chapters: { id: string; title: string }[] };
type Opt = { value: string; label: string };

const TYPES: Opt[] = [
  { value: "mcq", label: "MCQ" }, { value: "short", label: "Short answer" }, { value: "long", label: "Long answer" },
  { value: "true-false", label: "True or false" }, { value: "fill-blank", label: "Fill in the blanks" }, { value: "match", label: "Match the following" },
];

function F({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13.5px] font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] text-ink3">{hint}</span>}
    </label>
  );
}
const field = cx(inputCls(), "h-11");

export function AddQuestionButton({ pairs, start }: { pairs: Pair[]; start: string }) {
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState(start || pairs[0]?.value || "");
  const [type, setType] = useState("short");
  const [diff, setDiff] = useState("medium");
  const chapters = pairs.find((p) => p.value === pair)?.chapters ?? [];
  return (
    <>
      <Button variant="secondary" icon={Plus} onClick={() => setOpen(true)}>Add question</Button>
      <ActionSheet open={open} onClose={() => setOpen(false)} title="Add question" sub="It goes into the question bank for the class and subject." confirmLabel="Add to bank" pendingText="Adding…" run={saveQuestionForm} wide>
        <div className="grid gap-4 md:grid-cols-2">
          <F label="Class and subject"><select name="pair" value={pair} onChange={(e) => setPair(e.target.value)} className={field}>{pairs.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></F>
          <F label="Chapter" hint={chapters.length ? undefined : "No chapters yet. Add the syllabus in Academic Management first."}>
            <select name="chapterId" required className={field} defaultValue=""><option value="" disabled>Choose from the syllabus</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          </F>
          <F label="Type"><select name="type" value={type} onChange={(e) => setType(e.target.value)} className={field}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></F>
          <F label="Marks"><input name="marks" type="number" inputMode="numeric" min={1} max={100} defaultValue={1} required className={cx(field, "tnum")} /></F>
          <F label="Question" className="md:col-span-2"><textarea name="text" required rows={3} maxLength={4000} placeholder="Type the question as it should print" className={cx(inputCls(), "py-2.5")} /></F>
          {(type === "mcq" || type === "match") && (
            <F label={type === "mcq" ? "Options" : "Pairs"} hint={type === "mcq" ? "One option per line." : "One pair per line, such as Tiger = Carnivore."} className="md:col-span-2">
              <textarea name="options" rows={4} className={cx(inputCls(), "py-2.5")} />
            </F>
          )}
          {type === "true-false" ? (
            <F label="Correct answer"><select name="answer" className={field} defaultValue="True"><option>True</option><option>False</option></select></F>
          ) : type !== "match" && (
            <F label={type === "mcq" ? "Correct option" : "Answer (for the answer key)"} hint={type === "mcq" ? "Type it the same way as in the options." : "Optional."} className={type === "mcq" ? undefined : "md:col-span-2"}>
              <input name="answer" maxLength={2000} className={field} />
            </F>
          )}
          <div className="md:col-span-2">
            <span className="mb-1.5 block text-[13.5px] font-semibold">Difficulty</span>
            <div role="radiogroup" aria-label="Difficulty" className="inline-flex w-full rounded-xl bg-sunken p-1 gap-1">
              {["easy", "medium", "hard"].map((d) => (
                <button key={d} type="button" role="radio" aria-checked={diff === d} onClick={() => setDiff(d)} className={cx("h-9 flex-1 rounded-lg text-[13px] font-semibold capitalize", diff === d ? "bg-surface text-ink shadow-card" : "text-ink2")}>{d}</button>
              ))}
            </div>
            <input type="hidden" name="difficulty" value={diff} />
          </div>
          <F label="Tags" hint="Optional, separated by commas." className="md:col-span-2"><input name="tags" maxLength={200} className={field} /></F>
        </div>
      </ActionSheet>
    </>
  );
}

function PaperFields({ pairs, exams, pair, setPair, manual }: { pairs: Pair[]; exams: Opt[]; pair: string; setPair: (v: string) => void; manual: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <F label="Title" className="md:col-span-2"><input name="title" required maxLength={120} placeholder="Half Yearly · Mathematics · Class 6" className={field} /></F>
      {manual ? <input type="hidden" name="pair" value={pair} /> : (
        <F label="Class and subject"><select name="pair" value={pair} onChange={(e) => setPair(e.target.value)} className={field}>{pairs.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></F>
      )}
      <F label="Exam" hint="Optional."><select name="examId" className={field} defaultValue=""><option value="">Not for one exam</option>{exams.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}</select></F>
      <F label="Time allowed" hint="Minutes. Optional."><input name="durationMin" type="number" inputMode="numeric" min={15} max={600} placeholder="180" className={cx(field, "tnum")} /></F>
      {!manual && (
        <>
          <F label="Total marks"><input name="total" type="number" inputMode="numeric" min={1} max={1000} defaultValue={80} required className={cx(field, "tnum")} /></F>
          <fieldset className="md:col-span-2">
            <legend className="mb-1.5 text-[13.5px] font-semibold">Difficulty mix, % of marks</legend>
            <div className="grid grid-cols-3 gap-3">
              {([["easy", 30], ["medium", 50], ["hard", 20]] as const).map(([k, v]) => (
                <label key={k} className="block text-[13px] capitalize text-ink2">{k}<input name={k} type="number" inputMode="numeric" min={0} max={100} defaultValue={v} className={cx(field, "tnum mt-1")} /></label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <F label="Instructions" hint="Printed at the top. Optional." className="md:col-span-2"><textarea name="instructions" rows={3} maxLength={2000} placeholder="Answer all questions. Marks are shown in brackets." className={cx(inputCls(), "py-2.5")} /></F>
    </div>
  );
}

export function MakePaperButton({ pairs, exams, start }: { pairs: Pair[]; exams: Opt[]; start: string }) {
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState(start || pairs[0]?.value || "");
  return (
    <>
      <Button variant="primary" icon={Sparkles} onClick={() => setOpen(true)}>Make a paper</Button>
      <ActionSheet open={open} onClose={() => setOpen(false)} title="Make a paper" sub="Questions are picked from the bank to match the total and the difficulty mix. It is saved as a draft."
        confirmLabel="Make paper" pendingText="Picking questions…" run={(fd) => { fd.set("method", "automatic"); return makePaperForm(fd); }} wide>
        <PaperFields pairs={pairs} exams={exams} pair={pair} setPair={setPair} manual={false} />
      </ActionSheet>
    </>
  );
}

/** The bar shown when questions are ticked in the bank: make a paper from them. */
export function BankBar({ form, pairs, exams, pair }: { form: string; pairs: Pair[]; exams: Opt[]; pair: string }) {
  const [ids, setIds] = useState<string[] | null>(null);
  return (
    <>
      <SelectBar form={form}>
        {(chosen) => <Button size="sm" variant="primary" icon={FileText} disabled={!pair} onClick={() => setIds(chosen)}>Make a paper from these</Button>}
      </SelectBar>
      <ActionSheet open={Boolean(ids)} onClose={() => setIds(null)} title={`Make a paper from ${ids?.length ?? 0} questions`} sub={pairs.find((p) => p.value === pair)?.label}
        confirmLabel="Save as draft" pendingText="Saving…" run={(fd) => { fd.set("method", "manual"); for (const id of ids ?? []) fd.append("questionIds", id); return makePaperForm(fd); }} wide>
        <PaperFields pairs={pairs} exams={exams} pair={pair} setPair={() => undefined} manual />
      </ActionSheet>
    </>
  );
}

export function PaperMenu({ id, title, status, canEdit }: { id: string; title: string; status: string; canEdit: boolean }) {
  const [ask, setAsk] = useState<"final" | "draft" | "archived" | null>(null);
  const words = { final: { t: `Mark ${title} final?`, b: "A final paper cannot be changed. Make a copy if it needs changes later.", c: "Mark final" }, draft: { t: `Make ${title} a draft again?`, b: "It can then be changed. Papers already printed are not affected.", c: "Make draft" }, archived: { t: `Archive ${title}?`, b: "It leaves the list. Its questions stay in the bank.", c: "Archive" } };
  return (
    <>
      <MoreMenu label={`More actions for ${title}`} size="sm">
        <MenuLink href={`/examination-results/question-papers/${id}/print`} external icon={<Printer size={17} />}>Print paper</MenuLink>
        <MenuLink href={`/examination-results/question-papers/${id}/print?answers=1`} external icon={<FileCheck2 size={17} />}>Print with answers</MenuLink>
        {canEdit && status === "draft" && <MenuItem onSelect={() => setAsk("final")} icon={<FileCheck2 size={17} />}>Mark final</MenuItem>}
        {canEdit && status === "final" && <MenuItem onSelect={() => setAsk("draft")} icon={<FilePen size={17} />}>Make draft again</MenuItem>}
        {canEdit && <MenuItem onSelect={() => setAsk("archived")} icon={<Archive size={17} />} tone="bad">Archive</MenuItem>}
      </MoreMenu>
      {ask && (
        <ActionSheet open onClose={() => setAsk(null)} title={words[ask].t} confirmLabel={words[ask].c} confirmVariant={ask === "archived" ? "danger" : "primary"} run={() => paperStatusAction(id, ask)}>
          <p className="text-[14px] text-ink2">{words[ask].b}</p>
        </ActionSheet>
      )}
    </>
  );
}

export function ArchiveQuestionButton({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon={Archive} onClick={() => setOpen(true)} aria-label={`Archive question: ${text.slice(0, 60)}`} className="relative z-[1]" />
      <ActionSheet open={open} onClose={() => setOpen(false)} title="Archive this question?" confirmLabel="Archive" confirmVariant="danger" run={() => archiveQuestionAction(id)}>
        <p className="text-[14px] text-ink2 line-clamp-3">{text}</p>
        <p className="mt-2 text-[14px] text-ink2">It will not be picked for new papers. Papers that already use it keep it.</p>
      </ActionSheet>
    </>
  );
}
