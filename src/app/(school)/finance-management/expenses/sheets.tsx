"use client";

import { useState } from "react";
import { Camera, FileImage, Paperclip, Upload } from "lucide-react";
import { SheetForm, useSheetResult, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented, Switch } from "@/components/ui/controls";
import { Alert } from "@/components/ui/alert";
import type { Option } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { WarnCheck } from "../_components/forms";
import { attachBillAction, changeExpenseAction, payExpenseAction, recordBillAction, recordExpenseAction } from "./actions";
import { Words } from "@/lib/i18n/client";

const MODES = [{ value: "CASH", label: "Cash" }, { value: "UPI", label: "UPI" }, { value: "BANK_TRANSFER", label: "Bank transfer" }, { value: "CHEQUE", label: "Cheque" }];
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

/** Who approves above the at-once limit: the first step whose limit covers the amount. */
export type ApproverStep = { upTo: number | null; who: string };
const approverFor = (steps: ApproverStep[], atOnce: number, a: number) => (a <= atOnce ? null : (steps.find((s) => s.upTo === null || a <= s.upTo) ?? steps[steps.length - 1])?.who ?? "the approver");

/** A likely mistake the server warned about: say why, or confirm, and save again. */
function Warned() {
  const state = useSheetResult();
  const data = state && !state.ok ? (state.data as { warning?: boolean } | undefined) : undefined;
  if (!data?.warning) return null;
  const dup = Boolean(state?.errors?.billNo);
  const cash = Boolean(state?.errors?.mode);
  return (
    <>
      {dup && <SArea name="duplicateReason" label="Why save it again?" required placeholder="Example: a second bill with the same number, confirmed with the vendor" />}
      {cash && <WarnCheck field="mode" name="confirmLowCash" title="Pay from cash anyway" sub="Cash in hand goes below zero until cash comes in." />}
    </>
  );
}

function BillPicker({ required, help }: { required?: boolean; help: string }) {
  const [name, setName] = useState<string | null>(null);
  const t = useTyped("bill");
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink2"><Words k="Bill photo or file" />{required && <span className="text-bad" aria-hidden="true"> *</span>}</span>
      {name ? (
        <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
          <span className="w-10 h-10 rounded-lg bg-ok/10 text-ok grid place-items-center"><FileImage size={19} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1 text-[14px] font-semibold truncate">{name}</span>
        </div>
      ) : null}
      <div className={cx("grid grid-cols-2 gap-2", name && "hidden")}>
        <label className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-line bg-surface text-[14px] font-semibold text-ink2 cursor-pointer hover:bg-sunken focus-within:ring-2 focus-within:ring-brand/40">
          <Camera size={16} aria-hidden="true" /><Words k="Take photo" />
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const main = document.getElementById("exp-bill") as HTMLInputElement | null; if (main) { main.files = e.target.files; } setName(f.name); } }} />
        </label>
        <label className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-line bg-surface text-[14px] font-semibold text-ink2 cursor-pointer hover:bg-sunken focus-within:ring-2 focus-within:ring-brand/40">
          <Upload size={16} aria-hidden="true" /><Words k="Choose file" />
          <input id="exp-bill" type="file" name="bill" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
        </label>
      </div>
      {t.error ? <p className="text-[12.5px] text-bad font-semibold" role="alert">{t.error}</p> : <p className="text-[12.5px] text-ink3">{help}</p>}
    </div>
  );
}

function ModeFields({ prefix, mode, setMode, cash, banks, mainBank, cashInHand, amount }: { prefix: string; mode: string; setMode: (m: string) => void; cash: Option[]; banks: Option[]; mainBank: string; cashInHand: number; amount: number }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2"><Words k="Mode" /><span className="text-bad" aria-hidden="true"> *</span></span>
        <Segmented label="Mode" value={mode} onChange={setMode} className="w-full" options={MODES} />
      </div>
      {mode !== "CASH" && <SText name="reference" label="Reference" required placeholder={mode === "CHEQUE" ? "Cheque 118204" : "UTR SBIN2262…"} maxLength={60} id={`${prefix}-ref`} />}
      {mode === "CASH"
        ? (amount > cashInHand
          ? <Alert tone="danger" title={`Cash in hand is ${inr(cashInHand)}. This payment is ${inr(amount)}.`}><Words k="Pay from the bank, or record the cash received first." /></Alert>
          : <p className="text-[13px] text-ink3 -mt-1"><Words k="From the office cash box ·" /> {inr(cashInHand)} <Words k="in hand now" /></p>)
        : <SSelect key={mode} name="accountId" label="Paid from" required options={banks} start={mainBank} />}
      {mode === "CASH" && cash[0] && <input type="hidden" name="accountId" value={cash[0].value} />}
    </>
  );
}

export type ExpenseFormData = {
  closeHref: string; today: string; heads: Option[]; lastHead: string | null; centres: Option[] | null; vendors: string[];
  cash: Option[]; banks: Option[]; mainBank: string; cashInHand: number; atOnce: number; billAbove: number; steps: ApproverStep[];
};

/** Record expense (mod-finance.jsx RecordExpenseSheet): photo of the bill, amount, head. */
export function RecordExpenseSheet(p: ExpenseFormData) {
  const [amt, setAmt] = useState(0);
  const [paid, setPaid] = useState(true);
  const [mode, setMode] = useState("CASH");
  const who = amt > 0 ? approverFor(p.steps, p.atOnce, amt) : null;
  const payNow = paid && amt > 0 && !who;
  const label = !amt ? "Save expense" : who ? `Send to ${who}` : payNow ? "Save and mark paid" : "Save expense";
  return (
    <SheetForm title="Record expense" sub="Photo of the bill, amount, head. Takes under a minute." closeHref={p.closeHref} action={recordExpenseAction}
      submitLabel={label} pendingText="Saving…" hidden={{ paid: payNow ? "on" : "", mode }}>
      <BillPicker required={amt > p.billAbove} help={`Needed above ${inr(p.billAbove)}`} />
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="amount" label="Amount" required onValue={(v) => setAmt(num(v))} help={amt ? (who ? `Goes to ${who}` : "Approved at once") : undefined} />
        <SDate name="date" label="Date" required start={p.today} max={p.today} />
      </div>
      <SText name="what" label="What was it for" required placeholder="Example: Chalk and dusters for Block B" maxLength={200} />
      <div className={cx("grid gap-3", p.centres && "grid-cols-2")}>
        <SSelect name="accountHeadId" label="Expense head" required options={p.heads} start={p.lastHead ?? undefined} placeholder="Choose a head" help={p.lastHead ? "The one you used last" : undefined} />
        {p.centres && <SSelect name="costCentreId" label="Department" options={p.centres} placeholder="None" help="Cost centre" />}
      </div>
      <SText name="vendorName" label="Vendor" placeholder="Example: Sri Sai Stationers" list="re-vendors" maxLength={120} help="Pick one, or type a new name to add it" />
      <datalist id="re-vendors">{p.vendors.map((v) => <option key={v} value={v} />)}</datalist>
      {who ? (
        <Alert tone="info" title={`Above ${inr(p.atOnce)}: it waits for ${who}.`}><Words k="It cannot be marked paid until approved. You will be told when it is decided." /></Alert>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-sunken/70 px-3.5 py-3">
            <Switch id="re-paid" on={paid} label="Paid now" onChange={setPaid} />
            <label htmlFor="re-paid" className="text-[14px]"><b className="font-semibold"><Words k="Paid now" /></b><span className="block text-[12.5px] text-ink3">{paid ? "Goes into the Day Book on this date" : "Saved as approved; mark it paid later"}</span></label>
          </div>
          {paid && <ModeFields prefix="re" mode={mode} setMode={setMode} cash={p.cash} banks={p.banks} mainBank={p.mainBank} cashInHand={p.cashInHand} amount={amt} />}
        </>
      )}
      <Warned />
    </SheetForm>
  );
}

/** Change an expense the approver sent back, then send it again (07 §2: "to be changed and sent again"). */
export function ChangeExpenseSheet({ closeHref, expenseId, number, reason, start, heads, centres, vendors, atOnce, billAbove, steps, hasBill }: {
  closeHref: string; expenseId: string; number: string; reason: string | null; heads: Option[]; centres: Option[] | null; vendors: string[];
  atOnce: number; billAbove: number; steps: ApproverStep[]; hasBill: boolean;
  start: { amount: string; date: string; what: string; headId: string; costCentreId: string | null; vendor: string };
}) {
  const [amt, setAmt] = useState(num(start.amount));
  const who = amt > 0 ? approverFor(steps, atOnce, amt) : null;
  return (
    <SheetForm title={`Change ${number}`} sub={reason ? `Sent back: “${reason}”` : "Change it, then send it again."} closeHref={closeHref} action={changeExpenseAction}
      submitLabel={who ? `Save and send to ${who}` : "Save and send"} pendingText="Saving…" hidden={{ expenseId }}>
      <BillPicker required={!hasBill && amt > billAbove} help={hasBill ? "A bill is attached. Choose a file only to replace it." : `Needed above ${inr(billAbove)}`} />
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="amount" label="Amount" required start={start.amount} onValue={(v) => setAmt(num(v))} help={amt ? (who ? `Goes to ${who}` : "Approved at once") : undefined} />
        <SDate name="date" label="Date" required start={start.date} />
      </div>
      <SText name="what" label="What was it for" required start={start.what} maxLength={200} />
      <div className={cx("grid gap-3", centres && "grid-cols-2")}>
        <SSelect name="accountHeadId" label="Expense head" required options={heads} start={start.headId} placeholder="Choose a head" />
        {centres && <SSelect name="costCentreId" label="Department" options={centres} start={start.costCentreId ?? undefined} placeholder="None" help="Cost centre" />}
      </div>
      <SText name="vendorName" label="Vendor" start={start.vendor} list="ce-vendors" maxLength={120} help="Pick one, or type a new name to add it" />
      <datalist id="ce-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
      <Warned />
    </SheetForm>
  );
}

/** Record vendor bill: pay it later, in part or in full. */
export function VendorBillSheet({ closeHref, today, heads, lastHead, centres, vendors, billAbove }: Pick<ExpenseFormData, "closeHref" | "today" | "heads" | "lastHead" | "centres" | "billAbove"> & { vendors: Option[] }) {
  return (
    <SheetForm title="Record vendor bill" sub="Pay it later, in part or in full." closeHref={closeHref} action={recordBillAction} submitLabel="Save bill" pendingText="Saving…">
      <SSelect name="vendorId" label="Vendor" required options={vendors} placeholder="Choose a vendor" help={vendors.length ? undefined : "Add vendors by recording an expense with a new vendor name"} />
      <div className="grid grid-cols-2 gap-3">
        <SText name="billNo" label="Bill number" required placeholder="SSS/1210" maxLength={40} />
        <SDate name="date" label="Bill date" required start={today} max={today} />
        <SMoney name="amount" label="Amount" required />
        <SDate name="dueDate" label="Due date" required />
      </div>
      <div className={cx("grid gap-3", centres && "grid-cols-2")}>
        <SSelect name="accountHeadId" label="Expense head" required options={heads} start={lastHead ?? undefined} placeholder="Choose a head" />
        {centres && <SSelect name="costCentreId" label="Department" options={centres} placeholder="None" />}
      </div>
      <SText name="what" label="What was it for" placeholder="Optional" maxLength={200} />
      <BillPicker help={`Optional here; needed before paying above ${inr(billAbove)}`} />
      <Warned />
    </SheetForm>
  );
}

/** Mark paid (or pay a vendor bill, in part). It goes into the Day Book on the date paid. */
export function PaySheet({ closeHref, expenseId, title, sub, left, partial, today, cash, banks, mainBank, cashInHand }: {
  closeHref: string; expenseId: string; title: string; sub: string; left: number; partial: boolean; today: string; cash: Option[]; banks: Option[]; mainBank: string; cashInHand: number;
}) {
  const [mode, setMode] = useState("BANK_TRANSFER");
  const [amt, setAmt] = useState(left);
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} action={payExpenseAction} submitLabel={`Mark ${inr(amt || 0)} paid`} pendingText="Saving…" hidden={{ expenseId, mode }}>
      {partial && <SMoney name="payAmount" label="Amount" required start={String(left)} onValue={(v) => setAmt(num(v))} help="Pay part now and the rest later, if you like" />}
      <ModeFields prefix="mp" mode={mode} setMode={setMode} cash={cash} banks={banks} mainBank={mainBank} cashInHand={cashInHand} amount={amt} />
      <SDate name="date" label="Date paid" required start={today} max={today} />
      <Warned />
    </SheetForm>
  );
}

export function AttachBillSheet({ closeHref, expenseId, sub }: { closeHref: string; expenseId: string; sub: string }) {
  return (
    <SheetForm title="Add bill" sub={sub} closeHref={closeHref} action={attachBillAction} submitLabel="Attach bill" pendingText="Uploading…" hidden={{ expenseId }}>
      <BillPicker required help="A photo (JPG or PNG) or a PDF, up to 10 MB" />
      <p className="text-[12.5px] text-ink3 flex gap-1.5"><Paperclip size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><Words k="Kept with the expense. Anyone who can see the expense can open it." /></p>
    </SheetForm>
  );
}
