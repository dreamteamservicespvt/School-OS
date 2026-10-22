"use client";

// Admission Settings controls (design: mod-admissions.jsx AdmSettings). Each
// switch saves as soon as it changes; the server checks the role again and
// writes the change to the Audit Log. A failed save puts the switch back.
import { useState, useTransition } from "react";
import { Pencil, Plus, Settings2, X } from "lucide-react";
import type { FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/controls";
import { SelectField, TextField, inputCls } from "@/components/ui/field";
import { useNotice } from "@/components/ui/notice";
import { cx } from "@/components/ui/cx";
import { FormSheet, SubHead } from "../_components/forms";
import { saveClassAction, saveListAction, saveNumbersAction, saveOwnerRuleAction, saveStagesAction, setPaperAction, setRuleAction } from "./actions";
import { Words } from "@/lib/i18n/client";

type Opt = { value: string; label: string };

function useSave() {
  const notice = useNotice();
  const [pending, start] = useTransition();
  const run = (work: () => Promise<FormState<unknown>>, undo?: () => void) => start(async () => {
    const r = await work();
    if (r?.ok) notice.show({ title: r.message ?? "Saved." });
    else { undo?.(); notice.show({ title: r?.message ?? "Could not save. Try again.", tone: "bad" }); }
  });
  return { run, pending, view: notice.view };
}

/* ---------- Stages ---------- */
type StageRow = { key: string; label: string; on: boolean; needsApproval: boolean; sub: string; always: boolean; approvable: boolean };

export function StagesList({ stages, canEdit }: { stages: StageRow[]; canEdit: boolean }) {
  const [list, setList] = useState(stages);
  const { run, view } = useSave();
  const change = (i: number, patch: Partial<StageRow>) => {
    const before = list;
    const next = list.map((x, j) => (j === i ? { ...x, ...patch } : x));
    setList(next);
    run(() => saveStagesAction(next.map(({ key, label, on, needsApproval }) => ({ key, label, on, needsApproval }))), () => setList(before));
  };
  return (
    <>
      <ol className="border-t border-line/70 divide-y divide-line/70">
        {list.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 px-5 py-3">
            <span className="w-7 h-7 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum shrink-0">{i + 1}</span>
            <div className="min-w-0 flex-1"><p className={cx("font-semibold text-[14px]", !s.on && "text-ink3")}>{s.label}</p><p className="text-[12.5px] text-ink3 truncate">{s.sub}</p></div>
            {s.approvable && (
              <label className="hidden sm:flex items-center gap-2 text-[12.5px] text-ink2 font-semibold">
                {canEdit ? <Checkbox checked={s.needsApproval} label={`${s.label} needs approval`} onChange={(v) => change(i, { needsApproval: v })} /> : null}
                {canEdit ? "Approval" : s.needsApproval ? "Needs approval" : "No approval"}
              </label>
            )}
            {s.always ? <span className="text-[12px] text-ink3 font-semibold shrink-0"><Words k="Always on" /></span>
              : canEdit ? <Switch on={s.on} label={`${s.label} on`} onChange={(v) => change(i, { on: v })} />
              : <span className="text-[12.5px] font-semibold shrink-0">{s.on ? "On" : "Off"}</span>}
          </li>
        ))}
      </ol>
      {view}
    </>
  );
}

/* ---------- On/off rules ---------- */
export function RuleSwitch({ k, on, label }: { k: string; on: boolean; label: string }) {
  const [value, setValue] = useState(on);
  const { run, view } = useSave();
  return (
    <>
      <Switch on={value} label={label} onChange={(v) => { setValue(v); run(() => setRuleAction(k as Parameters<typeof setRuleAction>[0], v), () => setValue(!v)); }} />
      {view}
    </>
  );
}

/* ---------- Who gets new enquiries ---------- */
export function OwnerRule({ rule, rules, defaultOwner, turn, staff, canEdit }: { rule: string; rules: { value: string; label: string; help: string }[]; defaultOwner: string | null; turn: string[]; staff: Opt[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(rule);
  const [chosen, setChosen] = useState<string[]>(turn);
  return (
    <>
      <div className="flex flex-col gap-3">
        {rules.map((r) => (
          <div key={r.value} className={cx("flex items-start gap-3 rounded-xl border p-3.5", rule === r.value ? "border-brand ring-1 ring-brand bg-brand/5" : "border-line")}>
            <span className={cx("w-5 h-5 rounded-full border-2 grid place-items-center mt-0.5 shrink-0", rule === r.value ? "border-brand" : "border-line")} aria-hidden="true">{rule === r.value && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
            <span><b className="font-semibold text-[14px] block">{r.label}{rule === r.value && <span className="sr-only"> <Words k="(chosen)" /></span>}</b><span className="text-[12.5px] text-ink3">{r.help}</span></span>
          </div>
        ))}
        {canEdit && <div><Button variant="secondary" size="sm" icon={Settings2} onClick={() => setOpen(true)}><Words k="Change" /></Button></div>}
      </div>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Who gets new enquiries" sub="The owner can still be changed by hand. The history keeps every change." action={saveOwnerRuleAction} hidden={{ rule: pick }} submitLabel="Save">
        {(f) => (
          <>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Rule">
              {rules.map((r) => (
                <button type="button" key={r.value} role="radio" aria-checked={pick === r.value} onClick={() => setPick(r.value)}
                  className={cx("flex items-start gap-3 rounded-xl border p-3 text-left transition", pick === r.value ? "border-brand ring-1 ring-brand bg-brand/5" : "border-line hover:bg-sunken/60")}>
                  <span className={cx("w-5 h-5 rounded-full border-2 grid place-items-center mt-0.5 shrink-0", pick === r.value ? "border-brand" : "border-line")}>{pick === r.value && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
                  <span><b className="font-semibold text-[14px] block">{r.label}</b><span className="text-[12.5px] text-ink3">{r.help}</span></span>
                </button>
              ))}
            </div>
            <SelectField label="Default owner" name="defaultOwnerStaffId" options={staff} placeholder="The person adding it" defaultValue={f.val("defaultOwnerStaffId", defaultOwner ?? "")} error={f.err("defaultOwnerStaffId")}
              help={pick === "class" ? "Gets enquiries with no class wanted, and classes with no owner set below." : "Gets every new enquiry when no other rule applies."} />
            {pick === "turn" && (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[13px] font-semibold text-ink2 mb-1.5"><Words k="Share in turn among" /></legend>
                {staff.map((s) => (
                  <label key={s.value} className="flex items-center gap-3 text-[14px]">
                    <Checkbox checked={chosen.includes(s.value)} label={s.label} onChange={(v) => setChosen((c) => (v ? [...c, s.value] : c.filter((x) => x !== s.value)))} />{s.label}
                  </label>
                ))}
                {chosen.map((id) => <input key={id} type="hidden" name="turnStaffIds" value={id} />)}
                {f.err("turnStaffIds") && <p className="text-[12.5px] text-bad">{f.err("turnStaffIds")}</p>}
              </fieldset>
            )}
            {pick === "class" && <p className="text-[12.5px] text-ink3"><Words k="Set the owner for each class in “Per class” below." /></p>}
          </>
        )}
      </FormSheet>
    </>
  );
}

/* ---------- Papers needed per class ---------- */
type Need = "required" | "optional" | "none";
const NEXT: Record<Need, Need> = { required: "optional", optional: "none", none: "required" };
const NEED_WORD: Record<Need, string> = { required: "Required", optional: "Optional", none: "Not needed" };

export function PapersTable({ classes, docs, cells, canEdit }: { classes: Opt[]; docs: Opt[]; cells: Record<string, Record<string, Need>>; canEdit: boolean }) {
  const [grid, setGrid] = useState(cells);
  const { run, pending, view } = useSave();
  const flip = (cls: string, doc: string) => {
    const was = grid[cls]?.[doc] ?? "none";
    const now = NEXT[was];
    const set = (v: Need) => setGrid((g) => ({ ...g, [cls]: { ...g[cls], [doc]: v } }));
    set(now);
    run(() => setPaperAction(cls, doc, now), () => set(was));
  };
  return (
    <>
      <div className="overflow-x-auto scroll-thin border-t border-line">
        <table className="text-[13.5px] min-w-full">
          <thead>
            <tr className="text-[12px] text-ink3 border-b border-line">
              <th scope="col" className="sticky left-0 z-[1] bg-surface text-left font-semibold px-4 sm:px-5 py-2.5 min-w-[140px] sm:min-w-[190px]"><Words k="Paper" /></th>
              {classes.map((c) => <th key={c.value} scope="col" className="font-semibold px-2 py-2.5 whitespace-nowrap">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.value} className="border-b border-line/70 last:border-0">
                <th scope="row" className="sticky left-0 z-[1] bg-surface px-5 py-2 font-medium whitespace-nowrap text-left">{d.label}</th>
                {classes.map((c) => {
                  const v = grid[c.value]?.[d.value] ?? "none";
                  return (
                    <td key={c.value} className="px-2 py-2 text-center">
                      <button type="button" disabled={!canEdit || pending} onClick={() => flip(c.value, d.value)} aria-label={`${d.label}, ${c.label}: ${NEED_WORD[v]}${canEdit ? ". Change" : ""}`}
                        className={cx("h-7 px-2.5 rounded-lg text-[12px] font-semibold min-w-[82px] whitespace-nowrap disabled:cursor-default", v === "required" ? "bg-brand/10 text-brand" : v === "optional" ? "bg-sunken text-ink2" : "text-ink3", canEdit && "enabled:hover:ring-1 enabled:hover:ring-line")}>
                        {NEED_WORD[v]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view}
    </>
  );
}

/* ---------- One class: fee, online form, ages, owner ---------- */
export function ClassEdit({ cls, fee, online, minAge, maxAge, owner, staff, feeOn, onlineOn }: { cls: Opt; fee: string; online: boolean; minAge: number | null; maxAge: number | null; owner: string | null; staff: Opt[]; feeOn: boolean; onlineOn: boolean }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(online);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Change ${cls.label}`} className="w-9 h-9 grid place-items-center rounded-xl text-ink2 hover:bg-sunken shrink-0"><Pencil size={16} aria-hidden="true" /></button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={cls.label} sub="Rules for this class only" action={saveClassAction} hidden={{ classId: cls.value, ...(on ? { onlineOpen: "on" } : {}) }} submitLabel="Save">
        {(f) => (
          <>
            {feeOn && <TextField label="Application fee (₹)" name="fee" inputMode="decimal" defaultValue={f.val("fee", fee)} error={f.err("fee")} placeholder="No fee" help="Leave empty for no fee. The fee head lives in Fee Structure." className="tnum" />}
            {onlineOn && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3">
                <span><b className="font-semibold text-[14px] block"><Words k="Takes online applications" /></b><span className="text-[12.5px] text-ink3"><Words k="Shown on the online form" /></span></span>
                <Switch on={on} onChange={setOn} label="Takes online applications" />
              </div>
            )}
            <SubHead><Words k="Age on 1 June" /></SubHead>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Lowest age" name="minAge" inputMode="numeric" defaultValue={f.val("minAge", minAge?.toString() ?? "")} error={f.err("minAge")} placeholder="Any" className="tnum" />
              <TextField label="Highest age" name="maxAge" inputMode="numeric" defaultValue={f.val("maxAge", maxAge?.toString() ?? "")} error={f.err("maxAge")} placeholder="Any" className="tnum" />
            </div>
            <SelectField label="Owner for this class" name="ownerStaffId" options={staff} placeholder="The default owner" defaultValue={f.val("ownerStaffId", owner ?? "")} error={f.err("ownerStaffId")} help="Used when new enquiries go by class wanted." />
          </>
        )}
      </FormSheet>
    </>
  );
}

/* ---------- Lists: statuses, sources, loss reasons ---------- */
type Item = { key: string; label: string; archived: boolean; system: boolean };

export function ListChips({ kind, items, what, canEdit }: { kind: "enquiryStatuses" | "sources" | "lossReasons"; items: Item[]; what: string; canEdit: boolean }) {
  const [list, setList] = useState(items);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const { run, pending, view } = useSave();
  const save = (next: Item[]) => {
    const before = list;
    setList(next);
    run(() => saveListAction(kind, next.map(({ key, label, archived }) => ({ key: key.startsWith("new:") ? null : key, label, archived }))), () => setList(before));
  };
  const live = list.filter((x) => !x.archived);
  const archived = list.filter((x) => x.archived);
  return (
    <div className="px-5 pb-5 flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {live.map((x) => (
          <li key={x.key} className="h-8 pl-3 pr-1 rounded-full bg-sunken text-[13px] font-medium inline-flex items-center gap-1">
            {x.label}
            {canEdit && !x.system
              ? <button type="button" disabled={pending} aria-label={`Archive ${x.label}`} onClick={() => save(list.map((y) => (y.key === x.key ? { ...y, archived: true } : y)))} className="w-6 h-6 grid place-items-center rounded-full text-ink3 hover:bg-line/60 hover:text-ink"><X size={13} aria-hidden="true" /></button>
              : <span className="w-2" />}
          </li>
        ))}
        {canEdit && !adding && (
          <li><button type="button" onClick={() => setAdding(true)} className="h-8 px-3 rounded-full border border-dashed border-line text-[13px] font-semibold text-brand inline-flex items-center gap-1"><Plus size={14} aria-hidden="true" /><Words k="Add" /></button></li>
        )}
      </ul>
      {adding && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; save([...list, { key: `new:${t}`, label: t, archived: false, system: false }]); setText(""); setAdding(false); }}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={60} aria-label={`New ${what}`} placeholder={`New ${what}`} className={cx(inputCls(false), "h-10 flex-1 min-w-0")} />
          <Button type="submit" size="sm" disabled={!text.trim() || pending}><Words k="Add" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setText(""); }}><Words k="Cancel" /></Button>
        </form>
      )}
      {archived.length > 0 && (
        <p className="text-[12.5px] text-ink3">
          <Words k="Archived:" /> {archived.map((x, i) => (
            <span key={x.key}>{i > 0 && ", "}{canEdit ? <button type="button" disabled={pending} onClick={() => save(list.map((y) => (y.key === x.key ? { ...y, archived: false } : y)))} className="underline hover:text-ink" aria-label={`Bring back ${x.label}`}>{x.label}</button> : x.label}</span>
          ))}
        </p>
      )}
      {view}
    </div>
  );
}

/* ---------- Year, number format, sibling points, quotas ---------- */
export function NumbersButton({ years, yearId, prefix, nextNo, siblingWeight, siblingOn, quotaOn, quotas, categories }: { years: Opt[]; yearId: string | null; prefix: string; nextNo: string; siblingWeight: number; siblingOn: boolean; quotaOn: boolean; quotas: Record<string, number>; categories: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setOpen(true)}><Words k="Change" /></Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Year, numbers and priority" sub="Every change is recorded in the audit log" action={saveNumbersAction} hidden={quotaOn ? { quotasShown: "1" } : undefined} submitLabel="Save">
        {(f) => (
          <>
            <SelectField label="Admission year" name="admissionYearId" options={years} placeholder="Worked out (the upcoming year with sections, else this year)" defaultValue={f.val("admissionYearId", yearId ?? "")} error={f.err("admissionYearId")} />
            <TextField label="Application number format" name="applicationPrefix" required maxLength={30} defaultValue={f.val("applicationPrefix", prefix)} error={f.err("applicationPrefix")} help={`{YYYY} becomes the year. A 4-digit number follows. Next: ${nextNo}`} className="font-mono" />
            {siblingOn && <TextField label="Sibling priority (points)" name="siblingWeight" inputMode="numeric" defaultValue={f.val("siblingWeight", String(siblingWeight))} error={f.err("siblingWeight")} help="Added to the test score out of 100 when ranking the waiting list." className="tnum" />}
            {quotaOn && (
              <>
                <SubHead><Words k="Share of seats by category (%)" /></SubHead>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {categories.map((c) => <TextField key={c} label={c} name={`quota_${c}`} inputMode="decimal" defaultValue={f.val(`quota_${c}`, quotas[c] ? String(quotas[c]) : "")} error={f.err(`quota_${c}`)} placeholder="0" className="tnum" />)}
                </div>
                {f.err("quotas") && <p className="text-[12.5px] text-bad">{f.err("quotas")}</p>}
              </>
            )}
          </>
        )}
      </FormSheet>
    </>
  );
}
