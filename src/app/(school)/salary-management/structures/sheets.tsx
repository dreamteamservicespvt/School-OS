"use client";

import { useMemo, useState } from "react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SDate, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { SelectField, type Option } from "@/components/ui/field";
import { reviseBulkAction, saveStructureAction } from "./actions";

export type Comp = { id: string; name: string; kind: string; calc: string; percentBp: number | null; systemKey: string | null };
export type Template = { id: string; name: string; amounts: Record<string, number> };
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (s: string) => Number(String(s).replace(/[^\d.]/g, "")) || 0;

/** Add, copy or revise a structure: the school's fixed earnings (percentage ones are worked out from basic), PF, ESI, TDS and the salary account. */
export function StructureSheet({ closeHref, mode, title, sub, staff, staffId, comps, templates, start, from, esiLimit, reasonStart }: {
  closeHref: string; mode: "add" | "revise"; title: string; sub: string; staff: Option[]; staffId: string; comps: Comp[]; templates: Template[];
  start: { amounts: Record<string, number>; tds: number; pf: boolean; esi: boolean }; from: string; esiLimit: number; reasonStart?: string;
}) {
  const fixed = comps.filter((c) => c.calc === "FIXED");
  const pct = comps.filter((c) => c.calc === "PERCENT" && c.kind === "EARNING");
  const [tpl, setTpl] = useState("");
  const base = useMemo(() => (tpl ? templates.find((t) => t.id === tpl)?.amounts ?? start.amounts : start.amounts), [tpl, templates, start.amounts]);
  const [typed, setTyped] = useState<Record<string, number>>({});
  const amounts = { ...base, ...typed };
  const basicId = comps.find((c) => c.systemKey === "basic")?.id ?? "";
  const gross = fixed.filter((c) => c.kind === "EARNING").reduce((s, c) => s + (amounts[c.id] ?? 0), 0) + pct.reduce((s, c) => s + Math.round(((amounts[basicId] ?? 0) * (c.percentBp ?? 0)) / 10000), 0);
  const t = useTyped("staffId", staffId);
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} action={saveStructureAction} submitLabel={mode === "revise" ? "Save new version" : "Save structure"} pendingText="Saving…" hidden={{ mode }}>
      {mode === "revise" ? <input type="hidden" name="staffId" value={staffId} /> : <SSelect name="staffId" label="Staff member" required options={staff} start={t.value} placeholder="Choose" />}
      <div className="grid grid-cols-2 gap-3">
        {mode === "add" && templates.length > 0 && (
          <SelectField label="Start from" name="template" value={tpl} onChange={(e) => { setTpl(e.target.value); setTyped({}); }}
            options={[{ value: "", label: "No template" }, ...templates.map((x) => ({ value: x.id, label: `${x.name} template` }))]} />
        )}
        <SDate name="effectiveFrom" label="Effective from" required start={from} help="The 1st of a month" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3" key={tpl}>
        {fixed.filter((c) => c.kind === "EARNING").map((c) => (
          <SMoney key={c.id} name={`c_${c.id}`} label={c.name} required={c.systemKey === "basic"} start={base[c.id] ? String(base[c.id]) : ""} onValue={(v) => setTyped((x) => ({ ...x, [c.id]: num(v) }))} />
        ))}
      </div>
      {pct.length > 0 && <p className="text-[13px] text-ink3 -mt-1">{pct.map((c) => `${c.name.replace(/ allowance$/, "")} (${(c.percentBp ?? 0) / 100}%)`).join(" and ")} {pct.length === 1 ? "is" : "are"} worked out from basic. Gross: <b className="text-ink font-semibold tnum">{inr(gross)}</b> a month.</p>}
      {fixed.filter((c) => c.kind === "DEDUCTION").map((c) => (
        <SMoney key={c.id} name={`c_${c.id}`} label={`${c.name} (a month)`} start={base[c.id] ? String(base[c.id]) : ""} help="Leave empty if it does not apply" />
      ))}
      <SSwitch name="pf" title="PF applies" sub="UAN is asked for once, kept restricted" start={start.pf} />
      <SSwitch name="esi" title="ESI applies" sub={gross <= esiLimit ? `On, because wages are within ${inr(esiLimit)}` : `Wages are above the ${inr(esiLimit)} ESI limit`} start={mode === "revise" ? start.esi : gross <= esiLimit} key={`esi-${gross <= esiLimit}`} />
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="tds" label="TDS per month" start={String(start.tds)} help="Typed in, not worked out" />
        <SText name="bankAccount" label="Bank account" inputMode="numeric" autoComplete="off" placeholder="Account number" help="Only salary staff see it" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SText name="ifsc" label="IFSC" placeholder="HDFC0001234" className="uppercase" />
        <SText name="bankName" label="Bank name" placeholder="HDFC Bank" />
      </div>
      {mode === "revise" ? <SText name="reason" label="Reason" required start={reasonStart ?? ""} placeholder="Like: promotion from 1 Nov 2026" /> : <SText name="reason" label="Note" placeholder="Like: on joining" />}
    </SheetForm>
  );
}

export function ReviseBulkSheet({ closeHref, ids, rows, from }: { closeHref: string; ids: string; rows: { name: string; gross: number }[]; from: string }) {
  const [pct, setPct] = useState("5");
  const p = num(pct);
  return (
    <SheetForm wide title={`Revise ${rows.length} structures`} sub="A new version from the date you choose. Past salaries keep the old version." closeHref={closeHref} action={reviseBulkAction} submitLabel={`Revise ${rows.length} structures`} pendingText="Saving…" hidden={{ ids }}>
      <div className="grid grid-cols-2 gap-3">
        <SText name="percent" label="Increase by (%)" required start="5" inputMode="decimal" className="tnum" onChange={(e) => setPct(e.target.value)} />
        <SDate name="from" label="From" required start={from} />
      </div>
      <SText name="reason" label="Reason" required placeholder="Like: annual increment 2026-27" />
      <div>
        <p className="eyebrow text-ink3 mb-1.5">Preview</p>
        <ul className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
          {rows.slice(0, 8).map((r) => <li key={r.name} className="flex justify-between gap-3 px-3.5 py-2.5"><span className="truncate">{r.name}</span><span className="tnum shrink-0">{inr(r.gross)} → <b className="font-semibold">{inr(Math.round(r.gross * (1 + p / 100)))}</b></span></li>)}
          {rows.length > 8 && <li className="px-3.5 py-2.5 text-ink3">and {rows.length - 8} more</li>}
        </ul>
        <p className="text-[12.5px] text-ink3 mt-1.5">Fixed earnings go up and are rounded to the rupee; percentage parts follow basic pay.</p>
      </div>
    </SheetForm>
  );
}

