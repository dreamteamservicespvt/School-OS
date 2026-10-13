"use client";

import { useState } from "react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, type Option } from "@/components/ui/field";
import { closeCashAction, giveAdvanceAction, installmentAction, payAdvanceAction } from "./actions";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

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

const TYPES = [{ value: "ADVANCE", label: "Advance" }, { value: "LOAN", label: "Loan" }];

/** Give advance or loan (mod-salary.jsx Advances, FormSheet "Give advance or loan"). */
export function GiveSheet({ closeHref, staff, months, approver }: { closeHref: string; staff: Option[]; months: Option[]; approver: string }) {
  const [type, setType] = useState("ADVANCE");
  const [amount, setAmount] = useState(0);
  const def = type === "ADVANCE" ? amount : Math.round(amount / 10);
  return (
    <SheetForm title="Give advance or loan" sub={`Needs ${approver}’s approval (Forms & Approvals). It goes in the Day Book when paid.`} closeHref={closeHref} action={giveAdvanceAction} submitLabel="Send for approval" pendingText="Sending…">
      <SSelect name="staffId" label="Staff member" required options={staff} placeholder="Choose" />
      <SegField name="type" label="Type" options={TYPES} start="ADVANCE" onValue={setType} />
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="amount" label="Amount" required placeholder="10,000" onValue={(v) => setAmount(Number(String(v).replace(/[^\d.]/g, "")) || 0)} />
        <SMoney key={`${type}-${def}`} name="installment" label="Recover each month" required start={def ? String(def) : ""} help={type === "ADVANCE" ? "Default: all of it next month" : `Default: over 10 months${def ? ` (${inr(def)})` : ""}`} />
      </div>
      <SSelect name="from" label="Start recovery from" required options={months} start={months[0]?.value} />
      <SArea name="reason" label="Reason" required rows={2} placeholder="Like: Dussehra festival advance" />
    </SheetForm>
  );
}

const MODES = [{ value: "BANK_TRANSFER", label: "Bank transfer" }, { value: "CHEQUE", label: "Cheque" }, { value: "CASH", label: "Cash" }];

export function PaySheet({ closeHref, advanceId, title, amount, today, banks, mainBank }: { closeHref: string; advanceId: string; title: string; amount: string; today: string; banks: Option[]; mainBank: string }) {
  const [mode, setMode] = useState("BANK_TRANSFER");
  return (
    <SheetForm title={title} sub="It goes into the Day Book as money out on this date." closeHref={closeHref} action={payAdvanceAction} submitLabel={`Mark ${amount} paid`} pendingText="Saving…" hidden={{ advanceId }}>
      <SDate name="date" label="Paid on" required start={today} max={today} />
      <SegField name="mode" label="Mode" options={MODES} start="BANK_TRANSFER" onValue={setMode} />
      {mode !== "CASH" && <SText name="reference" label="Reference" className="font-mono" placeholder="UTR or cheque number" />}
      {mode !== "CASH" && banks.length > 0 && <SSelect name="accountId" label="From account" options={banks} start={mainBank} />}
    </SheetForm>
  );
}

export function InstallmentSheet({ closeHref, advanceId, name, current, balance }: { closeHref: string; advanceId: string; name: string; current: string; balance: string }) {
  return (
    <SheetForm title={`Change installment for ${name}`} sub={`Now ${current} a month · ${balance} left. Applies from the next salary.`} closeHref={closeHref} action={installmentAction} submitLabel="Save installment" pendingText="Saving…" hidden={{ advanceId }}>
      <SMoney name="installment" label="New monthly installment" required />
      <SArea name="reason" label="Reason" required rows={2} placeholder="Like: asked to repay faster after the bonus" help="Saved with the change" />
    </SheetForm>
  );
}

export function CloseCashSheet({ closeHref, advanceId, title, label, today, children }: { closeHref: string; advanceId: string; title: string; label: string; today: string; children: React.ReactNode }) {
  return (
    <SheetForm title={title} closeHref={closeHref} action={closeCashAction} submitLabel={label} pendingText="Saving…" hidden={{ advanceId }}>
      {children}
      <SDate name="date" label="Received on" required start={today} max={today} />
      <SArea name="reason" label="Reason" required rows={2} placeholder="Like: repaid from the Diwali bonus" help="Kept with the record and in the audit log." />
    </SheetForm>
  );
}
