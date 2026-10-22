"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleCheck, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Segmented, Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { TONE_SOFT } from "@/components/ui/kit";
import { cx } from "@/components/ui/cx";
import { checkBands, type Band } from "@/lib/exams/grades";
import { BLANK_WORDS, checkPhrase, DEFAULT_PHRASES, MAX_VARIANTS, PHRASE_KEYS, PHRASES, type PhraseBank, type PhraseKey } from "@/lib/exams/remark-phrases";
import { ActionSheet } from "../_components/sheets";
import {
  addListItemAction, archiveAreaAction, archiveCompetencyAction, archiveListItemAction, archiveScaleAction, importPresetAction, saveAreaForm, saveBoardsAction, saveClassPatternsAction,
  saveCompetencyForm, saveRemarkPhrasesAction, saveRulesForm, saveScaleAction, saveWeightsAction, setFeatureAction,
} from "./actions";
import { Words } from "@/lib/i18n/client";

type Option = { value: string; label: string; help?: string };

type Msg = { ok: boolean; text: string } | null;

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const run = (fn: () => Promise<string | undefined>, done: string, after?: () => void) => start(async () => {
    const e = await fn();
    setMsg(e ? { ok: false, text: e } : { ok: true, text: done });
    if (!e) { after?.(); router.refresh(); }
  });
  return { pending, msg, setMsg, run };
}

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cx("text-[13px] flex items-start gap-1.5", msg.ok ? "text-ok" : "text-bad")}>
      {msg.ok ? <CircleCheck size={15} className="shrink-0 mt-0.5" aria-hidden="true" /> : <CircleAlert size={15} className="shrink-0 mt-0.5" aria-hidden="true" />}{msg.text}
    </p>
  );
}

const gradeTone = (b: Band, i: number, n: number) => (!b.passing ? "bad" : i === 0 ? "ok" : i < n / 3 ? "ok" : i < (2 * n) / 3 ? "brand" : "warn") as "ok" | "brand" | "warn" | "bad";

// ---------- Exam types and mark categories ----------

export function NameList({ kind, items, canEdit, what, example }: { kind: "examType" | "markCategory"; items: { id: string; name: string; used?: boolean }[]; canEdit: boolean; what: string; example: string }) {
  const [adding, setAdding] = useState(false);
  const [archive, setArchive] = useState<{ id: string; name: string } | null>(null);
  return (
    <>
      <div className="px-5 pb-5 flex flex-wrap gap-2">
        {items.map((t) => (
          <span key={t.id} className="h-9 pl-3.5 pr-1.5 rounded-xl border border-line text-[13.5px] font-semibold inline-flex items-center gap-1.5">
            {t.name}
            {canEdit && (
              <button type="button" onClick={() => setArchive(t)} aria-label={`Archive ${t.name}`} className="grid size-7 place-items-center rounded-lg text-ink3 hover:bg-sunken hover:text-bad">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {canEdit && <Button size="sm" variant="soft" icon={Plus} onClick={() => setAdding(true)}><Words k="Add" /></Button>}
      </div>
      <ActionSheet open={adding} onClose={() => setAdding(false)} title={`Add ${what}`} confirmLabel={`Add ${what}`} pendingText="Adding…"
        run={(fd) => addListItemAction(kind, String(fd.get("name") ?? ""))}>
        <label className="block">
          <span className="mb-1.5 block text-[13.5px] font-semibold"><Words k="Name" /></span>
          <input name="name" required maxLength={40} autoFocus className={cx(inputCls(), "h-11")} placeholder={example} />
          <span className="mt-1 block text-[12.5px] text-ink3">{kind === "examType" ? "It is offered when adding a datesheet." : "It is offered when splitting a subject's marks on a datesheet."}</span>
        </label>
      </ActionSheet>
      <ActionSheet open={Boolean(archive)} onClose={() => setArchive(null)} title={`Archive ${archive?.name ?? ""}?`} confirmLabel="Archive" confirmVariant="danger" pendingText="Archiving…"
        run={() => archiveListItemAction(kind, archive!.id)}>
        <p className="text-[14px] text-ink2"><Words k="It will no longer be offered for new datesheets. Exams that already use it keep it. Adding the same name again brings it back." /></p>
      </ActionSheet>
    </>
  );
}

// ---------- Grade scale ----------

type Scale = { id: string; name: string; preset: string | null; version: number; bands: Band[] };
type Preset = { key: string; name: string; bands: Band[] };

export function ScaleEditor({ scales, schoolScaleId, presets, canEdit, pass }: { scales: Scale[]; schoolScaleId: string | null; presets: Preset[]; canEdit: boolean; pass: number }) {
  const [id, setId] = useState(schoolScaleId ?? scales[0]?.id ?? "");
  const scale = scales.find((s) => s.id === id) ?? scales[0];
  const [name, setName] = useState(scale?.name ?? "");
  const [bands, setBands] = useState<Band[]>(() => (scale?.bands ?? []).map((b) => ({ ...b })));
  const [key, setKey] = useState(scale?.id);
  const { pending, msg, setMsg, run } = useRun();
  if (scale && key !== scale.id) { setKey(scale.id); setName(scale.name); setBands(scale.bands.map((b) => ({ ...b }))); setMsg(null); }
  const problem = useMemo(() => checkBands(bands.map((b) => ({ ...b, from: Number(b.from), to: Number(b.to) }))), [bands]);
  const sorted = [...bands].sort((a, b) => Number(b.from) - Number(a.from));
  const changed = scale && (name !== scale.name || JSON.stringify(bands) !== JSON.stringify(scale.bands));
  const set = (i: number, k: keyof Band, v: string | boolean) => {
    setMsg(null);
    setBands((x) => x.map((b, j) => (j !== i ? b : { ...b, [k]: k === "from" || k === "to" ? Number(String(v).replace(/\D/g, "").slice(0, 3) || 0) : k === "points" ? (v === "" ? null : Number(String(v).replace(/[^\d.]/g, "").slice(0, 4))) : v })));
  };
  if (!scale) return <p className="px-5 pb-5 text-ink3"><Words k="No grade scale yet." /></p>;

  return (
    <>
      <div className="px-5 pb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {scales.length > 1 && (
            <select aria-label="Grade scale" value={id} onChange={(e) => setId(e.target.value)} className={cx(inputCls(), "h-10 w-auto pr-8")}>
              {scales.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === schoolScaleId ? " (school's scale)" : ""}</option>)}
            </select>
          )}
          {canEdit && (
            <>
              <span className="text-[13px] font-semibold text-ink2"><Words k="Start from" /></span>
              <Segmented size="sm" label="Start from a ready-made scale" value={presets.find((p) => JSON.stringify(p.bands) === JSON.stringify(bands))?.key ?? ""}
                onChange={(k) => { const p = presets.find((x) => x.key === k); if (p) { setBands(p.bands.map((b) => ({ ...b }))); setMsg(null); } }}
                options={presets.map((p) => ({ value: p.key, label: p.name }))} />
            </>
          )}
        </div>
        <div>
          <div className="flex h-8 rounded-lg overflow-hidden border border-line" role="img" aria-label={`Scale preview: ${sorted.map((b) => `${b.grade} ${b.from} to ${b.to}%`).join(", ")}`}>
            {[...sorted].reverse().map((b) => {
              const i = sorted.indexOf(b);
              const w = Math.max(0, Number(b.to) - Number(b.from) + 1);
              return <span key={`${b.grade}${i}`} className={cx("grid place-items-center text-[11px] font-bold", TONE_SOFT[gradeTone(b, i, sorted.length)])} style={{ width: `${w}%` }} title={`${b.grade}: ${b.from}–${b.to}%`}>{w >= 6 ? b.grade : ""}</span>;
            })}
          </div>
          <div className="relative h-4 text-[11px] text-ink3 mt-1 tnum">
            <span className="absolute left-0">0%</span>
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pass}%` }}>{pass}<Words k="% pass" /></span>
            <span className="absolute right-0">100%</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin border-t border-line">
        <table className="w-full text-[13.5px] min-w-[600px]">
          <caption className="sr-only"><Words k="Grades of" /> {scale.name}</caption>
          <thead><tr className="text-[12px] text-ink3 text-left border-b border-line">{["Grade", "From %", "To %", "Points", "Remark", "Passing"].map((h) => <th key={h} scope="col" className="font-semibold px-3 py-2.5 first:pl-5">{h}</th>)}</tr></thead>
          <tbody>
            {bands.map((b, i) => (
              <tr key={i} className="border-b border-line/70 last:border-0">
                <td className="px-3 pl-5 py-2">{canEdit ? <input aria-label={`Grade ${i + 1}`} value={b.grade} maxLength={10} onChange={(e) => set(i, "grade", e.target.value)} className={cx(inputCls(), "!h-9 !w-16 font-semibold")} /> : <Pill tone={gradeTone(b, sorted.indexOf(b), bands.length)}>{b.grade}</Pill>}</td>
                <td className="px-3 py-2"><input aria-label={`${b.grade} from`} inputMode="numeric" disabled={!canEdit} value={b.from} onChange={(e) => set(i, "from", e.target.value)} className={cx(inputCls(), "!h-9 !w-20 tnum")} /></td>
                <td className="px-3 py-2"><input aria-label={`${b.grade} to`} inputMode="numeric" disabled={!canEdit} value={b.to} onChange={(e) => set(i, "to", e.target.value)} className={cx(inputCls(), "!h-9 !w-20 tnum")} /></td>
                <td className="px-3 py-2">{canEdit ? <input aria-label={`${b.grade} points`} inputMode="decimal" value={b.points ?? ""} onChange={(e) => set(i, "points", e.target.value)} className={cx(inputCls(), "!h-9 !w-16 tnum")} /> : <span className="tnum">{b.points ?? ""}</span>}</td>
                <td className="px-3 py-2 text-ink2">{canEdit ? <input aria-label={`${b.grade} remark`} value={b.remark} maxLength={60} onChange={(e) => set(i, "remark", e.target.value)} className={cx(inputCls(), "!h-9 min-w-36")} /> : b.remark}</td>
                <td className="px-3 py-2">{canEdit ? <Switch label={`${b.grade} passes`} on={b.passing} onChange={(v) => set(i, "passing", v)} /> : b.passing ? <Check size={17} className="text-ok" aria-label="Yes" /> : <span className="text-ink3"><Words k="No" /></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-line flex flex-col md:flex-row gap-2 md:items-center">
        <div className="flex-1 flex flex-col gap-1">
          {problem ? <Note msg={{ ok: false, text: problem }} /> : <Note msg={msg ?? { ok: true, text: "No gaps or overlaps" }} />}
          {problem && msg && !msg.ok && <Note msg={msg} />}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {canEdit && bands.length < 20 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setBands((x) => [...x, { grade: "", from: 0, to: 0, points: null, remark: "", passing: false }])}><Words k="Add grade" /></Button>}
            {id !== schoolScaleId && scales.length > 1 && <Button size="sm" variant="danger-soft" disabled={pending} onClick={() => run(() => archiveScaleAction(scale.id), "Grade scale archived.")}><Words k="Archive" /></Button>}
            <Button variant="primary" icon={Check} disabled={Boolean(problem) || !changed} loading={pending} loadingText="Saving"
              onClick={() => run(() => saveScaleAction(scale.id, name, bands), `Saved as version ${scale.version + 1}. Published results keep the scale they were made with.`)}><Words k="Save grade scale" /></Button>
          </div>
        )}
      </div>
      {canEdit && presets.some((p) => !scales.some((s) => s.preset === p.key)) && (
        <div className="px-5 py-3 border-t border-line flex flex-wrap items-center gap-2 text-[13px] text-ink2">
          <span><Words k="Add another ready-made scale, for example for a second board:" /></span>
          {presets.filter((p) => !scales.some((s) => s.preset === p.key)).map((p) => (
            <Button key={p.key} size="sm" variant="secondary" disabled={pending} onClick={() => run(() => importPresetAction(p.key), `${p.name} added.`)}>{p.name}</Button>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Final result weights ----------

export function WeightsEditor({ types, weights, canEdit }: { types: { id: string; name: string }[]; weights: Record<string, number>; canEdit: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(types.map((t) => [t.id, weights[t.id] ? String(weights[t.id]) : ""])));
  const { pending, msg, setMsg, run } = useRun();
  const sum = Object.values(vals).reduce((a, v) => a + Number(v || 0), 0);
  const used = types.filter((t) => weights[t.id] || vals[t.id]);
  const [showAll, setShowAll] = useState(used.length === 0);
  const list = showAll ? types : used;
  const ok = sum === 100 || sum === 0;
  return (
    <div className="px-5 pb-5 flex flex-col gap-2.5">
      {list.map((t) => (
        <div key={t.id} className="flex items-center gap-3">
          <label htmlFor={`w-${t.id}`} className="flex-1 font-semibold text-[14px]">{t.name}</label>
          <div className="relative w-24">
            <input id={`w-${t.id}`} inputMode="numeric" disabled={!canEdit} value={vals[t.id]} placeholder="0"
              onChange={(e) => { setMsg(null); setVals({ ...vals, [t.id]: e.target.value.replace(/\D/g, "").slice(0, 3) }); }}
              className={cx(inputCls(!ok), "!h-10 pr-8 tnum text-right")} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true">%</span>
          </div>
        </div>
      ))}
      {canEdit && !showAll && <button type="button" onClick={() => setShowAll(true)} className="self-start text-[13px] font-semibold text-brand hover:underline"><Words k="Show every exam type" /></button>}
      <p className={cx("text-[13px] flex items-center gap-1.5", sum === 100 ? "text-ok" : sum === 0 ? "text-ink3" : "text-bad")}>
        {sum === 100 ? <><CircleCheck size={15} aria-hidden="true" /><Words k="Adds up to 100%" /></> : sum === 0 ? "No weights: the final result is the average of the year's exams." : <><CircleAlert size={15} aria-hidden="true" /><Words k="These add up to" /> {sum}<Words k="%. They must add up to 100%." /></>}
      </p>
      <Note msg={msg} />
      {canEdit && (
        <Button variant="secondary" className="self-start" icon={Check} disabled={!ok} loading={pending} loadingText="Saving"
          onClick={() => run(() => saveWeightsAction(types.map((t) => ({ examTypeId: t.id, weight: Number(vals[t.id] || 0) }))), "Final result weights saved.")}><Words k="Save weights" /></Button>
      )}
    </div>
  );
}

// ---------- Pass rules, ranks and exam rules ----------

export type RulesValues = {
  ranksOn: boolean; tieRule: string; passPercentSubject: number; passPercentOverall: number; graceMarks: number; compartmentSubjects: number; absentRule: string;
  gradeOnlyGrades: string[]; publishRoles: string[]; marksDueDays: number; reminderDaysBefore: number; gpaOn: boolean; defaultScaleId: string | null;
  lateMarks: string; lateJoinRule: string;
};

function Row({ title, sub, htmlFor, children }: { title: string; sub?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3.5 md:flex-row md:items-center md:justify-between md:gap-6 border-b border-line/70 last:border-0">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="font-semibold text-[14px]">{title}</label>
        {sub && <p className="text-[12.5px] text-ink3">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Num({ name, value, min, max, suffix, disabled }: { name: string; value: number; min: number; max: number; suffix?: string; disabled: boolean }) {
  return (
    <span className="relative inline-block w-28">
      <input id={`r-${name}`} name={name} type="number" inputMode="numeric" min={min} max={max} defaultValue={value} disabled={disabled} className={cx(inputCls(), "!h-10 tnum text-right", suffix && "pr-14")} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink3" aria-hidden="true">{suffix}</span>}
    </span>
  );
}

export function RulesForm({ v, scales, roles, canEdit, lateMarks, lateJoin }: { v: RulesValues; scales: { id: string; name: string }[]; roles: { key: string; name: string }[]; canEdit: boolean; lateMarks: Option[]; lateJoin: Option[] }) {
  const { pending, msg, run } = useRun();
  const [ranks, setRanks] = useState(v.ranksOn);
  const [gpa, setGpa] = useState(v.gpaOn);
  const [late, setLate] = useState(v.lateMarks);
  const [missed, setMissed] = useState(v.lateJoinRule);
  const sel = cx(inputCls(), "!h-10 w-auto min-w-48");
  return (
    <form className="px-5 pb-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => saveRulesForm(fd), "Exam rules saved."); }}>
      <fieldset disabled={!canEdit || pending} className="contents">
        <h3 className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-ink3"><Words k="Pass rules and ranks" /></h3>
        <Row title="Pass marks per subject" sub="Below this, the subject shows as failed" htmlFor="r-passPercentSubject"><Num name="passPercentSubject" value={v.passPercentSubject} min={0} max={100} suffix="%" disabled={!canEdit} /></Row>
        <Row title="Pass marks overall" htmlFor="r-passPercentOverall"><Num name="passPercentOverall" value={v.passPercentOverall} min={0} max={100} suffix="%" disabled={!canEdit} /></Row>
        <Row title="Absent (AB)" sub="How AB counts in the total. Medical leave (ML) is always left out." htmlFor="r-absentRule">
          <select id="r-absentRule" name="absentRule" defaultValue={v.absentRule} className={sel}><option value="zero">Counted as zero</option><option value="leave-out">Left out of the total</option></select>
        </Row>
        <Row title="Grace marks" sub="Added to one subject to reach the pass mark. 0 is off." htmlFor="r-graceMarks"><Num name="graceMarks" value={v.graceMarks} min={0} max={20} suffix="marks" disabled={!canEdit} /></Row>
        <Row title="Compartment" sub="Failing in up to this many subjects, but passing overall. 0 is off." htmlFor="r-compartmentSubjects"><Num name="compartmentSubjects" value={v.compartmentSubjects} min={0} max={5} suffix="subj." disabled={!canEdit} /></Row>
        <Row title="Show ranks" sub="On result sheets and report cards">
          <Switch label="Show ranks" name="ranksOn" on={ranks} onChange={setRanks} disabled={!canEdit} />
        </Row>
        <Row title="Tie rule" htmlFor="r-tieRule">
          <select id="r-tieRule" name="tieRule" defaultValue={v.tieRule} className={sel}><option value="skip">Same rank, next rank skipped (1, 1, 3)</option><option value="dense">Same rank, next rank follows (1, 1, 2)</option></select>
        </Row>
        <Row title="GPA and CGPA" sub="Grade points on report cards: GPA for an exam or term, CGPA for the year">
          <Switch label="GPA and CGPA" name="gpaOn" on={gpa} onChange={setGpa} disabled={!canEdit} />
        </Row>

        <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-ink3"><Words k="Late joiners" /></h3>
        <p className="text-[12.5px] text-ink3"><Words k={"A student who joins after an exam's marks are in shows as \"Joined after this exam\". They never stop the class's results from being published."} /></p>
        <Row title="Their marks" sub={lateMarks.find((o) => o.value === late)?.help} htmlFor="r-lateMarks">
          <select id="r-lateMarks" name="lateMarks" value={late} onChange={(e) => setLate(e.target.value)} className={sel}>{lateMarks.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </Row>
        <Row title="An exam they missed, in the final result" sub={lateJoin.find((o) => o.value === missed)?.help} htmlFor="r-lateJoinRule">
          <select id="r-lateJoinRule" name="lateJoinRule" value={missed} onChange={(e) => setMissed(e.target.value)} className={sel}>{lateJoin.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </Row>

        <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-ink3"><Words k="Exam rules" /></h3>
        <Row title="School's grade scale" sub="Used unless a datesheet or a board chooses another" htmlFor="r-defaultScaleId">
          <select id="r-defaultScaleId" name="defaultScaleId" defaultValue={v.defaultScaleId ?? ""} className={sel}>{scales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Row>
        <Row title="Grades for grade-only subjects" sub="Best first, separated by commas" htmlFor="r-gradeOnlyGrades">
          <input id="r-gradeOnlyGrades" name="gradeOnlyGrades" defaultValue={v.gradeOnlyGrades.join(", ")} maxLength={80} className={cx(inputCls(), "!h-10 w-56")} />
        </Row>
        <Row title="Marks due" sub="Days after each paper. Teachers are reminded before." htmlFor="r-marksDueDays"><Num name="marksDueDays" value={v.marksDueDays} min={1} max={60} suffix="days" disabled={!canEdit} /></Row>
        <Row title="Reminder to parents" sub="Days before each paper. 0 sends no reminder." htmlFor="r-reminderDaysBefore"><Num name="reminderDaysBefore" value={v.reminderDaysBefore} min={0} max={7} suffix="days" disabled={!canEdit} /></Row>
        <div className="py-3.5">
          <p className="font-semibold text-[14px]" id="r-pub"><Words k="Who can publish results" /></p>
          <p className="text-[12.5px] text-ink3"><Words k={"Only roles with full reach in Examination & Results can be chosen."} /></p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="r-pub">
            {roles.map((r) => (
              <label key={r.key} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-[13.5px] font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand">
                <input type="checkbox" name="publishRoles" value={r.key} defaultChecked={v.publishRoles.includes(r.key)} className="size-4 accent-[var(--brand)]" />{r.name}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {canEdit && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 md:flex-row md:items-center md:justify-between">
          <Note msg={msg} />
          <Button type="submit" variant="primary" icon={Check} loading={pending} loadingText="Saving" className="md:ml-auto"><Words k="Save rules" /></Button>
        </div>
      )}
    </form>
  );
}

// ---------- Co-scholastic areas and features ----------

type Area = { id: string; name: string; kind: string; grades: string[]; description: string | null };
const KIND_WORDS: Record<string, string> = { area: "Area", skill: "Skill", activity: "Activity" };

export function AreasList({ areas, canEdit, on }: { areas: Area[]; canEdit: boolean; on: boolean }) {
  const [edit, setEdit] = useState<Area | "new" | null>(null);
  const [archive, setArchive] = useState<Area | null>(null);
  const a = edit && edit !== "new" ? edit : null;
  return (
    <>
      {!on && <p className="px-5 pb-3 text-[13px] text-ink3"><Words k="Switch on co-scholastic grades below to show these on report cards." /></p>}
      <ul className="px-5 pb-4 flex flex-col gap-2">
        {areas.map((x) => (
          <li key={x.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px]">{x.name} <span className="ml-1 text-[12px] font-normal text-ink3">{KIND_WORDS[x.kind] ?? x.kind}</span></p>
              <p className="text-[12.5px] text-ink3 truncate"><Words k="Grades" /> {x.grades.join(", ")}{x.description ? ` · ${x.description}` : ""}</p>
            </div>
            {canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit(x)}><Words k="Edit" /></Button>}
            {canEdit && <Button size="sm" variant="ghost" onClick={() => setArchive(x)} aria-label={`Archive ${x.name}`}><X size={15} aria-hidden="true" /></Button>}
          </li>
        ))}
        {areas.length === 0 && <li className="text-[13px] text-ink3"><Words k="No areas yet." /></li>}
      </ul>
      {canEdit && <div className="px-5 pb-5"><Button size="sm" variant="soft" icon={Plus} onClick={() => setEdit("new")}><Words k="Add area" /></Button></div>}
      <ActionSheet key={a?.id ?? "new"} open={Boolean(edit)} onClose={() => setEdit(null)} title={a ? `Change ${a.name}` : "Add co-scholastic area"} confirmLabel={a ? "Save" : "Add area"} pendingText="Saving…" run={saveAreaForm}>
        <div className="flex flex-col gap-4">
          {a && <input type="hidden" name="id" value={a.id} />}
          <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold"><Words k="Name" /></span><input name="name" required maxLength={60} defaultValue={a?.name} placeholder="Art education" className={cx(inputCls(), "h-11")} /></label>
          <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold"><Words k="Kind" /></span>
            <select name="kind" defaultValue={a?.kind ?? "area"} className={cx(inputCls(), "h-11")}><option value="area">Area</option><option value="skill">Skill</option><option value="activity">Activity</option></select>
          </label>
          <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold"><Words k="Grades" /></span><input name="grades" required defaultValue={a?.grades.join(", ") ?? "A, B, C"} className={cx(inputCls(), "h-11")} /><span className="mt-1 block text-[12.5px] text-ink3"><Words k="Best first, separated by commas." /></span></label>
          <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold"><Words k="Who grades it" /> <span className="font-normal text-ink3"><Words k="(optional)" /></span></span><input name="description" maxLength={120} defaultValue={a?.description ?? ""} placeholder="Graded by the art teacher" className={cx(inputCls(), "h-11")} /></label>
        </div>
      </ActionSheet>
      <ActionSheet open={Boolean(archive)} onClose={() => setArchive(null)} title={`Archive ${archive?.name ?? ""}?`} confirmLabel="Archive" confirmVariant="danger" pendingText="Archiving…" run={() => archiveAreaAction(archive!.id)}>
        <p className="text-[14px] text-ink2"><Words k="It will not be on new report cards. Grades already given stay on past report cards." /></p>
      </ActionSheet>
    </>
  );
}

// ---------- Exam pattern per class ----------

export function ClassPatternsEditor({ classes, patterns, options, canEdit }: { classes: { id: string; name: string }[]; patterns: Record<string, string>; options: Option[]; canEdit: boolean }) {
  const start = () => Object.fromEntries(classes.map((c) => [c.id, patterns[c.id] ?? "PERCENTAGE"]));
  const [vals, setVals] = useState<Record<string, string>>(start);
  const { pending, msg, setMsg, run } = useRun();
  const changed = classes.some((c) => vals[c.id] !== (patterns[c.id] ?? "PERCENTAGE"));
  if (classes.length === 0) return <p className="px-5 pb-5 text-[13px] text-ink3"><Words k={"No classes yet. Add them in Academic Management, Classes & Sections."} /></p>;
  return (
    <div className="px-5 pb-5 flex flex-col gap-2.5">
      {classes.map((c) => (
        <div key={c.id} className="flex items-center gap-3">
          <label htmlFor={`pat-${c.id}`} className="flex-1 min-w-0 truncate font-semibold text-[14px]">{c.name}</label>
          <select id={`pat-${c.id}`} disabled={!canEdit} value={vals[c.id]} onChange={(e) => { setMsg(null); setVals({ ...vals, [c.id]: e.target.value }); }} className={cx(inputCls(), "!h-10 !w-36")}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      ))}
      <Note msg={msg} />
      {canEdit && (
        <Button variant="secondary" className="self-start" icon={Check} disabled={!changed} loading={pending} loadingText="Saving"
          onClick={() => run(() => saveClassPatternsAction(vals), "Exam pattern per class saved.")}><Words k="Save patterns" /></Button>
      )}
    </div>
  );
}

// ---------- Per board: grade scale and report card format ----------

type BoardRow = { board: string; isSchoolBoard: boolean; classes: string[] };
type BoardVal = { scaleId: string; reportBase: string };

export function BoardsEditor({ boards, values, scales, formats, schoolScale, canEdit, on }: {
  boards: BoardRow[]; values: Record<string, { scaleId: string | null; reportBase: string | null }>; scales: { id: string; name: string }[]; formats: Option[]; schoolScale: string; canEdit: boolean; on: boolean;
}) {
  const start = () => Object.fromEntries(boards.map((b) => [b.board, { scaleId: values[b.board]?.scaleId ?? "", reportBase: values[b.board]?.reportBase ?? "" }])) as Record<string, BoardVal>;
  const [vals, setVals] = useState<Record<string, BoardVal>>(start);
  const { pending, msg, setMsg, run } = useRun();
  const changed = boards.some((b) => vals[b.board].scaleId !== (values[b.board]?.scaleId ?? "") || vals[b.board].reportBase !== (values[b.board]?.reportBase ?? ""));
  const set = (board: string, k: keyof BoardVal, v: string) => { setMsg(null); setVals({ ...vals, [board]: { ...vals[board], [k]: v } }); };
  const sel = cx(inputCls(), "!h-10");
  return (
    <div className="px-5 pb-5 flex flex-col gap-3">
      {!on && <p className="text-[13px] text-ink3"><Words k="Switch on Different boards below. Until then every class uses the school's grade scale and report card design." /></p>}
      {boards.length === 0 && <p className="text-[13px] text-ink3"><Words k={"No board is set. Set the school's board in Settings, School Profile, and a class's own board in Academic Management, Classes & Sections."} /></p>}
      {boards.map((b) => (
        <fieldset key={b.board} className="rounded-xl border border-line p-3.5 flex flex-col gap-3">
          <legend className="sr-only">{b.board}</legend>
          <div>
            <p className="font-semibold text-[14px] flex items-center gap-2">{b.board}{b.isSchoolBoard && <Pill tone="neutral"><Words k="School's board" /></Pill>}</p>
            <p className="text-[12.5px] text-ink3">{b.classes.length ? `Classes: ${b.classes.join(", ")}` : "No class follows this board yet."}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2"><Words k="Grade scale" />
              <select disabled={!canEdit} value={vals[b.board].scaleId} onChange={(e) => set(b.board, "scaleId", e.target.value)} className={sel}>
                <option value="">School&apos;s scale ({schoolScale})</option>
                {scales.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2"><Words k="Report card format" />
              <select disabled={!canEdit} value={vals[b.board].reportBase} onChange={(e) => set(b.board, "reportBase", e.target.value)} className={sel}>
                <option value="">School&apos;s report card design</option>
                {formats.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </label>
          </div>
        </fieldset>
      ))}
      <Note msg={msg} />
      {canEdit && boards.length > 0 && (
        <Button variant="secondary" className="self-start" icon={Check} disabled={!changed} loading={pending} loadingText="Saving"
          onClick={() => run(() => saveBoardsAction(Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { scaleId: v.scaleId || null, reportBase: v.reportBase || null }]))), "Board settings saved.")}><Words k="Save board settings" /></Button>
      )}
    </div>
  );
}

// ---------- Competencies ----------

type Competency = { id: string; subjectId: string; name: string; levels: string[] };

export function CompetencyList({ items, subjects, canEdit, on }: { items: Competency[]; subjects: { id: string; name: string }[]; canEdit: boolean; on: boolean }) {
  const [edit, setEdit] = useState<Competency | "new" | null>(null);
  const [archive, setArchive] = useState<Competency | null>(null);
  const c = edit && edit !== "new" ? edit : null;
  const bySubject = subjects.map((s) => ({ s, list: items.filter((x) => x.subjectId === s.id) })).filter((g) => g.list.length);
  return (
    <>
      {!on && <p className="px-5 pb-3 text-[13px] text-ink3"><Words k="Switch on Competency-based assessment below to grade these on report cards." /></p>}
      <div className="px-5 pb-4 flex flex-col gap-3">
        {bySubject.map(({ s, list }) => (
          <div key={s.id}>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink3 mb-1.5">{s.name}</p>
            <ul className="flex flex-col gap-2">
              {list.map((x) => (
                <li key={x.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px]">{x.name}</p>
                    <p className="text-[12.5px] text-ink3 truncate"><Words k="Levels" /> {x.levels.join(", ")}</p>
                  </div>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit(x)}><Words k="Edit" /></Button>}
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => setArchive(x)} aria-label={`Archive ${x.name}`}><X size={15} aria-hidden="true" /></Button>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {items.length === 0 && <p className="text-[13px] text-ink3"><Words k="No competencies yet." /></p>}
      </div>
      {canEdit && subjects.length > 0 && <div className="px-5 pb-5"><Button size="sm" variant="soft" icon={Plus} onClick={() => setEdit("new")}><Words k="Add competency" /></Button></div>}
      <ActionSheet key={c?.id ?? "new"} open={Boolean(edit)} onClose={() => setEdit(null)} title={c ? `Change ${c.name}` : "Add competency"} confirmLabel={c ? "Save" : "Add competency"} pendingText="Saving…" run={saveCompetencyForm}>
        <div className="flex flex-col gap-4">
          {c && <input type="hidden" name="id" value={c.id} />}
          <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold"><Words k="Subject" /></span>
            <select name="subjectId" required defaultValue={c?.subjectId ?? ""} className={cx(inputCls(), "h-11")}>
              <option value="" disabled>Choose the subject</option>
              {subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold"><Words k="Competency" /></span><input name="name" required maxLength={120} defaultValue={c?.name} placeholder="Reads with understanding" className={cx(inputCls(), "h-11")} /></label>
          <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold"><Words k="Levels" /></span><input name="levels" required defaultValue={c?.levels.join(", ") ?? "Beginning, Developing, Proficient, Advanced"} className={cx(inputCls(), "h-11")} /><span className="mt-1 block text-[12.5px] text-ink3"><Words k="From first to highest, separated by commas. 2 to 8 levels." /></span></label>
        </div>
      </ActionSheet>
      <ActionSheet open={Boolean(archive)} onClose={() => setArchive(null)} title={`Archive ${archive?.name ?? ""}?`} confirmLabel="Archive" confirmVariant="danger" pendingText="Archiving…" run={() => archiveCompetencyAction(archive!.id)}>
        <p className="text-[14px] text-ink2"><Words k="It will not be on new report cards. Levels already given stay on past report cards." /></p>
      </ActionSheet>
    </>
  );
}

export function FeatureSwitch({ k, title, sub, on, canEdit }: { k: string; title: string; sub: string; on: boolean; canEdit: boolean }) {
  const [v, setV] = useState(on);
  const { pending, msg, run } = useRun();
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-line/70 last:border-0">
      <div className="min-w-0">
        <p className="font-semibold text-[14px]">{title}</p>
        <p className="text-[12.5px] text-ink3">{sub}</p>
        {msg && !msg.ok && <Note msg={msg} />}
      </div>
      <Switch label={title} on={v} disabled={!canEdit || pending} onChange={(x) => { setV(x); run(() => setFeatureAction(k, x), x ? "On" : "Off", undefined); }} />
    </div>
  );
}

// ---------- Remark phrases (gap G30) ----------

/** The school's words for remark suggestions: one sentence per line, up to three ways of saying each. */
export function RemarkPhrasesEditor({ bank, canEdit, on }: { bank: PhraseBank; canEdit: boolean; on: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(PHRASE_KEYS.map((k) => [k, bank[k].join("\n")])));
  const { pending, msg, setMsg, run } = useRun();
  const lines = (k: PhraseKey) => (vals[k] ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const problem = (k: PhraseKey) => {
    const l = lines(k);
    if (l.length > MAX_VARIANTS) return `At most ${MAX_VARIANTS} ways of saying it.`;
    return l.map((t) => checkPhrase(k, t)).find(Boolean) ?? null;
  };
  const bad = PHRASE_KEYS.some((k) => problem(k));
  return (
    <div className="px-5 pb-5 flex flex-col gap-3">
      <p className="text-[13px] text-ink3">
        {on ? "Used when a class teacher asks for remark suggestions. " : "Used once Remark suggestions is switched on below, or the AI teacher assistant is on. "}
        <Words k="The numbers always come from the student's own records and are shown as the source; only these words change. Words in braces are filled in:" /> {Object.entries(BLANK_WORDS).map(([k, w]) => `{${k}} ${w}`).join(", ")}.
      </p>
      {PHRASE_KEYS.map((k) => {
        const p = problem(k);
        return (
          <div key={k} className="flex flex-col gap-1">
            <label htmlFor={`phrase-${k}`} className="font-semibold text-[14px]">{PHRASES[k].when}</label>
            <textarea id={`phrase-${k}`} rows={Math.max(1, Math.min(MAX_VARIANTS, lines(k).length))} disabled={!canEdit} value={vals[k]}
              onChange={(e) => { setMsg(null); setVals({ ...vals, [k]: e.target.value }); }}
              aria-invalid={Boolean(p)} aria-describedby={`phrase-${k}-help`} className={cx(inputCls(Boolean(p)), "!h-auto py-2")} />
            <span id={`phrase-${k}-help`} className={cx("text-[12px]", p ? "text-bad" : "text-ink3")}>{p ?? `One sentence per line. Can use ${PHRASES[k].blanks.map((b) => `{${b}}`).join(", ")}.`}</span>
          </div>
        );
      })}
      <Note msg={msg} />
      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" icon={Check} disabled={bad} loading={pending} loadingText="Saving"
            onClick={() => run(() => saveRemarkPhrasesAction(Object.fromEntries(PHRASE_KEYS.map((k) => [k, lines(k)]))), "Remark phrases saved.")}><Words k="Save phrases" /></Button>
          <Button variant="ghost" onClick={() => { setMsg(null); setVals(Object.fromEntries(PHRASE_KEYS.map((k) => [k, DEFAULT_PHRASES[k].join("\n")]))); }}><Words k="Back to the ready-made phrases" /></Button>
        </div>
      )}
    </div>
  );
}
