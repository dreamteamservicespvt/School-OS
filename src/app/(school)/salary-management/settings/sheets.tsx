"use client";

// Salary Settings sheets and switches (mod-salary.jsx SalarySettings).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Segmented, Switch } from "@/components/ui/controls";
import { FieldShell, type Option } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import { addComponentAction, preferencesAction, ratesAction, slabsAction, slipOptionAction, statutorySwitchAction } from "./actions";

type Act = (prev: unknown, fd: FormData) => Promise<FormState<unknown>>;

/** An on/off switch that saves at once, and says so if it did not work. */
function SaveSwitch({ on, label, action, fields }: { on: boolean; label: string; action: Act; fields: (next: boolean) => Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState(on);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="flex flex-col items-end gap-1 shrink-0">
      <Switch on={v} label={label} disabled={busy} onChange={async (next) => {
        setBusy(true); setMsg(null); setV(next);
        const fd = new FormData();
        for (const [k, val] of Object.entries(fields(next))) fd.set(k, val);
        const r = await action(null, fd);
        if (r && !r.ok) { setV(!next); setMsg({ ok: false, text: r.message || "That did not work." }); } else { setMsg(r?.message ? { ok: true, text: r.message } : null); router.refresh(); }
        setBusy(false);
      }} />
      {msg && <span className={msg.ok ? "text-[12px] text-ink3 max-w-[240px] text-right" : "text-[12px] text-bad max-w-[240px] text-right"} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
    </span>
  );
}

export function StatutorySwitch({ field, on, label }: { field: "pfOn" | "esiOn" | "ptOn"; on: boolean; label: string }) {
  return <SaveSwitch on={on} label={label} action={statutorySwitchAction} fields={(next) => ({ field, on: next ? "1" : "0" })} />;
}

export function SlipSwitch({ optionKey, on, label }: { optionKey: string; on: boolean; label: string }) {
  return <SaveSwitch on={on} label={label} action={slipOptionAction} fields={(next) => ({ key: optionKey, on: next ? "1" : "0" })} />;
}

function SegField({ name, label, options, start, onValue }: { name: string; label: string; options: readonly Option[]; start: string; onValue?: (v: string) => void }) {
  const t = useTyped(name, start);
  const [v, setV] = useState(t.value || start);
  return (
    <FieldShell label={label} id={`seg-${name}`} required error={t.error}>
      <input type="hidden" name={name} value={v} />
      <Segmented value={v} onChange={(x) => { setV(x); onValue?.(x); }} options={options} className="w-full" label={label} />
    </FieldShell>
  );
}

export function ComponentSheet({ closeHref }: { closeHref: string }) {
  const [kind, setKind] = useState("EARNING");
  const [calc, setCalc] = useState("FIXED");
  return (
    <SheetForm title="Add salary component" sub="Available in structures from now on. Old structure versions do not change." closeHref={closeHref} action={addComponentAction} submitLabel="Add component" pendingText="Adding…">
      <SText name="name" label="Name" required placeholder="Like: Transport allowance" />
      <SegField name="kind" label="Earning or deduction" options={[{ value: "EARNING", label: "Earning" }, { value: "DEDUCTION", label: "Deduction" }]} start="EARNING" onValue={setKind} />
      <SSelect name="calc" label="Worked out as" required options={[{ value: "FIXED", label: "Fixed amount" }, { value: "PERCENT", label: "% of basic" }]} start="FIXED" onChange={(e) => setCalc(e.target.value)} />
      {calc === "PERCENT" && <SText name="percent" label="Percent of basic pay" required inputMode="decimal" className="tnum" placeholder="10" />}
      {kind === "EARNING" && <SSwitch name="taxable" title="Taxable" sub="Counts in the tax summary on slips" start />}
    </SheetForm>
  );
}

const pct = (bp: number) => String(bp / 100);

export function RatesSheet({ closeHref, months, now }: { closeHref: string; months: Option[]; now: { pfEmployeeBp: number; pfEmployerBp: number; pfCeiling: string; esiEmployeeBp: number; esiEmployerBp: number; esiLimit: string } }) {
  return (
    <SheetForm title="Change PF and ESI rates" sub="From a month you choose. Approved salaries never change." closeHref={closeHref} action={ratesAction} submitLabel="Save rates" pendingText="Saving…">
      <SSelect name="from" label="Starting from" required options={months} start={months[0]?.value} />
      <div className="grid grid-cols-2 gap-3">
        <SText name="pfEmployee" label="PF employee %" required inputMode="decimal" className="tnum" start={pct(now.pfEmployeeBp)} />
        <SText name="pfEmployer" label="PF employer %" required inputMode="decimal" className="tnum" start={pct(now.pfEmployerBp)} />
      </div>
      <SMoney name="pfCeiling" label="PF wage ceiling" required start={now.pfCeiling} help="PF is worked out on basic pay up to this" />
      <div className="grid grid-cols-2 gap-3">
        <SText name="esiEmployee" label="ESI employee %" required inputMode="decimal" className="tnum" start={pct(now.esiEmployeeBp)} />
        <SText name="esiEmployer" label="ESI employer %" required inputMode="decimal" className="tnum" start={pct(now.esiEmployerBp)} />
      </div>
      <SMoney name="esiLimit" label="ESI wage limit a month" required start={now.esiLimit} help="ESI applies to staff whose gross is up to this" />
    </SheetForm>
  );
}

const PAY_DAYS = [{ value: "last-working", label: "Last working day" }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"} of next month` }))];
const LOP = [{ value: "calendar", label: "Calendar days" }, { value: "thirty", label: "A fixed 30" }];
const LATE = [{ value: "0", label: "Off" }, ...[2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} late = ½ day` }))];

export function PreferencesSheet({ closeHref, now }: { closeHref: string; now: { payDay: string; lopDays: string; lateMarks: string; overtimeOn: boolean; overtimeHour: string; tdsReminder: string } }) {
  const [ot, setOt] = useState(now.overtimeOn);
  return (
    <SheetForm title="Payroll preferences" sub="They apply to months not approved yet." closeHref={closeHref} action={preferencesAction} submitLabel="Save" pendingText="Saving…">
      <SSelect name="payDay" label="Pay day" required options={PAY_DAYS} start={now.payDay} />
      <SSelect name="lopDays" label="Days in a month for loss of pay" required options={LOP} start={now.lopDays} />
      <SSelect name="lateMarks" label="Late marks" required options={LATE} start={now.lateMarks} help="From Staff Attendance" />
      <FieldShell label="Overtime" id="ot-switch"><span className="flex items-center justify-between gap-3 text-[14px]"><span className="text-ink2">Pay extra hours</span><Switch id="ot-switch" on={ot} onChange={setOt} label="Overtime" /></span></FieldShell>
      {ot && <input type="hidden" name="overtimeOn" value="on" />}
      {ot && <SMoney name="overtimeHour" label="Overtime pay an hour" required start={now.overtimeHour} />}
      <SMoney name="tdsReminder" label="TDS reminder above" required start={now.tdsReminder} help="Flags staff with no TDS whose yearly pay is above this" />
    </SheetForm>
  );
}

export function SlabsSheet({ closeHref, state, rows }: { closeHref: string; state: string; rows: { from: string; to: string; tax: string }[] }) {
  const list = [...rows, ...Array.from({ length: Math.max(0, 6 - rows.length) }, () => ({ from: "", to: "", tax: "" }))].slice(0, 6);
  return (
    <SheetForm title={`Professional Tax · ${state}`} sub="Salary in the month, and the tax a month. Leave “To” blank on the last row for “and above”." closeHref={closeHref} action={slabsAction} submitLabel="Save table" pendingText="Saving…" hidden={{ state }}>
      {list.map((r, i) => (
        <div key={i} className="grid grid-cols-3 gap-2">
          <SMoney name={`from_${i}`} label={i === 0 ? "From" : ""} start={r.from} aria-label={`Row ${i + 1} from`} />
          <SMoney name={`to_${i}`} label={i === 0 ? "To" : ""} start={r.to} aria-label={`Row ${i + 1} to`} />
          <SMoney name={`tax_${i}`} label={i === 0 ? "Tax a month" : ""} start={r.tax} aria-label={`Row ${i + 1} tax`} />
        </div>
      ))}
    </SheetForm>
  );
}
