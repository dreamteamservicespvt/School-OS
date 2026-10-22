"use client";

// Library Settings (13 §6) as one form: borrowing limits and loan days by
// class group and for staff, fine rates, the lost and damaged charge and the
// amount that needs approval, renewals, the reservation queue order, labels,
// accession numbers and reminders. What was typed is kept when a check
// fails. People who only read the settings see the same values, unchangeable.

import { createContext, useActionState, useContext, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented, Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { saveSettingsAction } from "../actions";
import { Words } from "@/lib/i18n/client";

export type SettingsStart = {
  rules: { level: string; books: number; loanDays: number }[];
  studentBooks: number; studentLoanDays: number; staffBooks: number; staffLoanDays: number; moveDueOffHolidays: boolean;
  finePerDay: string; maxFine: string; graceDays: number; blockAbove: string; finesToFees: boolean;
  lostCharge: string; lostExtra: string; approvalAbove: string; maxRenewals: number; queueOrder: string; labelType: string;
  accessionPrefix: string; accessionWidth: number; nextAccession: number; nextPreview: string;
  remindDueTomorrow: boolean; remindOverdue: boolean; remindReservation: boolean;
};

type Ctx = { readOnly: boolean; values: Record<string, string> | null; errors: Record<string, string> };
const FormCtx = createContext<Ctx>({ readOnly: false, values: null, errors: {} });
function useField() {
  const c = useContext(FormCtx);
  return { readOnly: c.readOnly, v: (k: string, fallback: string | number) => c.values?.[k] ?? String(fallback), err: (k: string) => c.errors[k], typed: c.values };
}

function Num({ name, label, start: s, suffix, money, min = 0, max, width = "w-24" }: { name: string; label: string; start: string | number; suffix?: string; money?: boolean; min?: number; max?: number; width?: string }) {
  const { readOnly, v, err } = useField();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`set-${name}`} className="sr-only">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          {money && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3 font-semibold text-[14px]" aria-hidden="true">₹</span>}
          <input id={`set-${name}`} name={name} defaultValue={v(name, s)} inputMode={money ? "decimal" : "numeric"} type={money ? "text" : "number"} min={money ? undefined : min} max={max}
            aria-invalid={err(name) ? true : undefined} aria-describedby={err(name) ? `set-${name}-error` : undefined} disabled={readOnly}
            className={cx(inputCls(err(name)), "h-10 tnum text-right", money && "pl-7", width)} />
        </div>
        {suffix && <span className="text-[13px] text-ink3">{suffix}</span>}
      </div>
      {err(name) && <p id={`set-${name}-error`} className="text-[12px] text-bad max-w-[220px]">{err(name)}</p>}
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
      <div className="min-w-0 flex-1 text-[14px] basis-[220px]"><b className="font-semibold block">{title}</b>{sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}</div>
      <div className="min-w-0 max-w-full flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

function Toggle({ name, title, sub, start: s }: { name: string; title: string; sub?: string; start: boolean }) {
  const { readOnly, typed } = useField();
  const [on, setOn] = useState(typed ? typed[name] === "on" : s);
  return <Row title={title} sub={sub}>{readOnly ? <span className="text-[13.5px] text-ink2">{on ? "On" : "Off"}</span> : <Switch on={on} onChange={setOn} label={title} name={name} />}</Row>;
}

function Seg({ name, label, options, start: s }: { name: string; label: string; options: { value: string; label: string }[]; start: string }) {
  const { readOnly, v } = useField();
  const [val, setVal] = useState(v(name, s));
  return readOnly ? <span className="text-[13.5px] text-ink2">{options.find((o) => o.value === val)?.label}</span> : <><Segmented label={label} value={val} onChange={setVal} options={options} size="sm" /><input type="hidden" name={name} value={val} /></>;
}

export function SettingsForm({ start, readOnly }: { start: SettingsStart; readOnly: boolean }) {
  const [state, run, pending] = useActionState<FormState, FormData>(saveSettingsAction, null);
  const typed = state && !state.ok ? state.values ?? {} : null;
  const ctx: Ctx = { readOnly, values: typed, errors: state?.errors ?? {} };
  const v = (k: string, fallback: string | number) => typed?.[k] ?? String(fallback);
  const err = (k: string) => state?.errors?.[k];
  const key = typed ? JSON.stringify(typed).length : 0;

  return (
    <FormCtx.Provider value={ctx}>
    <form action={run} key={key} className="flex flex-col gap-5" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      <Card>
        <CardHeader title="Borrowing limits and loan days" description="Books at a time and days per loan. A category's own loan days come first." divided />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-[14px] min-w-[420px]">
            <caption className="sr-only"><Words k="Borrowing limits by member type" /></caption>
            <thead><tr className="text-[12px] text-ink3 border-b border-line text-left"><th scope="col" className="px-5 py-2.5 font-semibold"><Words k="Members" /></th><th scope="col" className="px-3 py-2.5 font-semibold"><Words k="Books at a time" /></th><th scope="col" className="px-3 py-2.5 font-semibold"><Words k="Loan days" /></th></tr></thead>
            <tbody className="divide-y divide-line/70">
              {start.rules.map((r) => (
                <tr key={r.level}>
                  <th scope="row" className="px-5 py-2.5 font-semibold text-left">{r.level} <Words k="classes" /></th>
                  <td className="px-3 py-2"><Num name={`books-${r.level}`} label={`Books for ${r.level}`} start={r.books} max={30} width="w-20" /></td>
                  <td className="px-3 py-2"><Num name={`days-${r.level}`} label={`Loan days for ${r.level}`} start={r.loanDays} min={1} max={180} width="w-20" /></td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="px-5 py-2.5 font-semibold text-left"><Words k="Other students" /><span className="block text-[12px] text-ink3 font-normal"><Words k="Classes with no group" /></span></th>
                <td className="px-3 py-2"><Num name="studentBooks" label="Books for other students" start={start.studentBooks} max={30} width="w-20" /></td>
                <td className="px-3 py-2"><Num name="studentLoanDays" label="Loan days for other students" start={start.studentLoanDays} min={1} max={180} width="w-20" /></td>
              </tr>
              <tr>
                <th scope="row" className="px-5 py-2.5 font-semibold text-left"><Words k="Staff" /></th>
                <td className="px-3 py-2"><Num name="staffBooks" label="Books for staff" start={start.staffBooks} max={30} width="w-20" /></td>
                <td className="px-3 py-2"><Num name="staffLoanDays" label="Loan days for staff" start={start.staffLoanDays} min={1} max={180} width="w-20" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="border-t border-line divide-y divide-line/70">
          <Toggle name="moveDueOffHolidays" title="Move due dates off holidays" sub="A due date on a Sunday or a School Calendar holiday moves to the next school day." start={start.moveDueOffHolidays} />
          <Row title="Most renewals per issue" sub="After this the book must be returned. 0 switches renewals off."><Num name="maxRenewals" label="Most renewals" start={start.maxRenewals} max={10} width="w-20" /></Row>
          <Row title="Reservation queue order" sub="Who gets the next copy returned."><Seg name="queueOrder" label="Queue order" start={start.queueOrder} options={[{ value: "fcfs", label: "First come, first served" }, { value: "staff-first", label: "Staff first" }]} /></Row>
        </div>
      </Card>

      <Card>
        <CardHeader title="Fines and charges" divided />
        <div className="divide-y divide-line/70">
          <Row title="Fine per day late"><Num name="finePerDay" label="Fine per day" start={start.finePerDay} money /></Row>
          <Row title="Most fine for one book"><Num name="maxFine" label="Most fine for one book" start={start.maxFine} money /></Row>
          <Row title="Days of grace" sub="Days late with no fine."><Num name="graceDays" label="Days of grace" start={start.graceDays} max={30} suffix="days" width="w-20" /></Row>
          <Row title="Stop issuing when fines due are above" sub="0 never stops issues."><Num name="blockAbove" label="Block issues above" start={start.blockAbove} money /></Row>
          <Toggle name="finesToFees" title="Add students' fines to their fees" sub="Paid with the other fees in Fee Management. Staff fines are collected at the desk." start={start.finesToFees} />
          <Row title="Charge for a lost book"><Seg name="lostCharge" label="Lost book charge" start={start.lostCharge} options={[{ value: "price", label: "Book price" }, { value: "price-plus", label: "Price plus a fee" }]} /></Row>
          <Row title="Fee on top of the price" sub="Used when the charge is price plus a fee."><Num name="lostExtra" label="Fee on top of the price" start={start.lostExtra} money /></Row>
          <Row title="Charges that need approval" sub="Lost or damaged charges above this go to Approvals first."><Num name="approvalAbove" label="Needs approval above" start={start.approvalAbove} money /></Row>
        </div>
      </Card>

      <Card>
        <CardHeader title="Labels and accession numbers" divided />
        <div className="divide-y divide-line/70">
          <Row title="Book labels"><Seg name="labelType" label="Label type" start={start.labelType} options={[{ value: "barcode", label: "Barcode" }, { value: "qr", label: "QR code" }, { value: "rfid", label: "RFID" }]} /></Row>
          <Row title="Accession number format" sub={`The next copy gets ${start.nextPreview}.`}>
            <label htmlFor="set-accessionPrefix" className="sr-only"><Words k="Prefix" /></label>
            <input id="set-accessionPrefix" name="accessionPrefix" defaultValue={v("accessionPrefix", start.accessionPrefix)} maxLength={8} placeholder="Prefix" disabled={readOnly}
              aria-invalid={err("accessionPrefix") ? true : undefined} className={cx(inputCls(err("accessionPrefix")), "h-10 w-24 font-mono")} />
            <Num name="accessionWidth" label="Digits" start={start.accessionWidth} min={1} max={10} suffix="digits" width="w-20" />
          </Row>
          <Row title="Next accession number" sub="Raise it to skip numbers already used on old labels. It cannot go back."><Num name="nextAccession" label="Next accession number" start={start.nextAccession} min={1} width="w-28" /></Row>
          {err("accessionPrefix") && <p className="px-5 py-2 text-[12.5px] text-bad">{err("accessionPrefix")}</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Reminders" description="Students' parents get a message on their preferred channel; staff are told in the app." divided />
        <div className="divide-y divide-line/70">
          <Toggle name="remindDueTomorrow" title="Remind the day before a book is due" start={start.remindDueTomorrow} />
          <Toggle name="remindOverdue" title="Remind when a book is overdue" sub="On the first day late, then once a week." start={start.remindOverdue} />
          <Toggle name="remindReservation" title="Tell members when a reserved book is ready" start={start.remindReservation} />
        </div>
      </Card>

      {!readOnly && (
        <div className="sticky bottom-20 md:bottom-3 z-10 flex justify-end">
          <Button type="submit" variant="primary" size="lg" icon={Save} loading={pending} loadingText="Saving…" className="shadow-pop"><Words k="Save settings" /></Button>
        </div>
      )}
    </form>
    </FormCtx.Provider>
  );
}
