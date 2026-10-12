"use client";

// The sheets on Fee Settings (mod-fees.jsx FeeSettings): one per card. Each
// is checked on the server and written to the audit log.

import { useState } from "react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SChips, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Switch } from "@/components/ui/controls";
import { Alert } from "@/components/ui/alert";
import type { Option } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import {
  ageingAction, counterAction, featureAction, headAccountsAction, lateFeeAction, numberingAction, paymentsAction, receiptsAction, remindersAction, routingAction, scholarshipTypesAction,
} from "./actions";

type C = { closeHref: string };

export function LateFeeSheet({ closeHref, s, heads }: C & { s: { on: boolean; type: string; amount: string; percent: string; grace: number; max: string; headIds: string[] }; heads: Option[] }) {
  const [type, setType] = useState(s.type);
  return (
    <SheetForm title="Late fee rules" sub="Added as its own row after the grace period. Late fees already added do not change." closeHref={closeHref} action={lateFeeAction} submitLabel="Save late fee rules" pendingText="Saving…">
      <SSwitch name="on" title="Add late fee" sub="Off: no late fee is added to any installment." start={s.on} />
      <SSelect name="type" label="How it is worked out" required start={type} onChange={(e) => setType(e.target.value)} options={[
        { value: "flat", label: "One amount, once" }, { value: "per-day", label: "An amount for each day late" }, { value: "percent", label: "A percent of the installment" },
      ]} />
      <div className="grid grid-cols-2 gap-3">
        {type === "percent" ? <SText name="percent" label="Percent" required inputMode="decimal" start={s.percent} className="tnum" />
          : <SMoney name="amount" label={type === "per-day" ? "Amount per day" : "Late fee"} required start={s.amount} />}
        <SText name="graceDays" label="Grace period (days)" required inputMode="numeric" start={s.grace} className="tnum" />
      </div>
      <SMoney name="max" label="Most per installment" start={s.max} help="Optional. Empty means no upper limit." />
      <SChips name="headId" label="Fee heads with late fee" options={heads} start={s.headIds} help="None chosen means every fee head that allows late fee." />
    </SheetForm>
  );
}

const DAY_WORDS = (d: number) => (d === 0 ? "On the due date" : d < 0 ? `${-d} ${d === -1 ? "day" : "days"} before` : `${d} ${d === 1 ? "day" : "days"} after`);

export function RemindersSheet({ closeHref, s, choices }: C & { s: { on: boolean; days: number[]; channel: string; template: string }; choices: number[] }) {
  return (
    <SheetForm title="Reminder schedule" sub="Sent by itself for each unpaid installment. Opted-out parents are skipped." closeHref={closeHref} action={remindersAction} submitLabel="Save schedule" pendingText="Saving…">
      <SSwitch name="on" title="Send reminders by themselves" start={s.on} />
      <SChips name="day" label="When" options={choices.map((d) => ({ value: String(d), label: DAY_WORDS(d) }))} start={s.days.map(String)} />
      <SSelect name="channel" label="Send by" required start={s.channel} options={[{ value: "whatsapp", label: "WhatsApp, SMS if it fails" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }]} />
      <SArea name="template" label="Message" required rows={4} start={s.template} help="You can use {guardian_name}, {student_name}, {class}, {due_amount}, {due_date}, {link} and {school_name}." />
    </SheetForm>
  );
}

export function ReceiptsSheet({ closeHref, s }: C & { s: { prefix: string; digits: number; restart: boolean; partialSeries: boolean; partialPrefix: string; printCopies: string; terms: string } }) {
  const [partial, setPartial] = useState(s.partialSeries);
  return (
    <SheetForm title="Receipts" sub="Receipts already given keep their numbers. A new prefix applies to new receipts." closeHref={closeHref} action={receiptsAction} submitLabel="Save receipts" pendingText="Saving…">
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <SText name="prefix" label="Prefix" required start={s.prefix} className="font-mono" help="{YEAR} becomes the financial year, like 2026-27." />
        <SText name="digits" label="Digits" required inputMode="numeric" start={s.digits} className="tnum" />
      </div>
      <SSwitch name="restart" title="Start again each year" sub="Numbers start from 1 in each financial year." start={s.restart} />
      <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
        <div className="min-w-0 flex-1 text-[14px]"><b className="font-semibold block">Separate series for part payments</b><span className="block text-[12.5px] text-ink3 mt-0.5">Like PP/2026-27/00001</span></div>
        <Switch on={partial} onChange={setPartial} label="Separate series for part payments" name="partialSeries" />
      </div>
      {partial && <SText name="partialPrefix" label="Part-payment prefix" required start={s.partialPrefix} className="font-mono" />}
      {!partial && <input type="hidden" name="partialPrefix" value={s.partialPrefix} />}
      <SSelect name="printCopies" label="Copies to print" required start={s.printCopies} options={[{ value: "both", label: "Office copy and parent copy" }, { value: "parent", label: "Parent copy only" }, { value: "office", label: "Office copy only" }]} />
      <SArea name="terms" label="Terms on the receipt" rows={3} start={s.terms} placeholder="Example: Fees once paid are not refundable except as per school policy." />
    </SheetForm>
  );
}

export function NumberingSheet({ closeHref, s }: C & { s: { taxInvoicePrefix: string; invoicePrefix: string; certificatePrefix: string } }) {
  return (
    <SheetForm title="Tax invoices and other numbers" sub="Prefixes for new tax invoices, fee invoices and fee certificates." closeHref={closeHref} action={numberingAction} submitLabel="Save numbering" pendingText="Saving…">
      <SText name="taxInvoicePrefix" label="Tax invoice prefix" required start={s.taxInvoicePrefix} className="font-mono" />
      <SText name="invoicePrefix" label="Fee invoice prefix" required start={s.invoicePrefix} className="font-mono" />
      <SText name="certificatePrefix" label="Fee certificate prefix" required start={s.certificatePrefix} className="font-mono" />
    </SheetForm>
  );
}

export function AgeingSheet({ closeHref, ends }: C & { ends: string }) {
  return (
    <SheetForm title="Dues ageing groups" sub="Used on Defaulters and the outstanding report." closeHref={closeHref} action={ageingAction} submitLabel="Save groups" pendingText="Saving…">
      <SText name="ends" label="Each group ends after (days)" required start={ends} className="tnum" help="Example: 30, 60, 90 gives 0 to 30, 31 to 60, 61 to 90 and over 90 days." />
    </SheetForm>
  );
}

export function RoutingSheet({ closeHref, gateways, classes, s }: C & { gateways: Option[]; classes: Option[]; s: { default: string; byClass: Record<string, string> } }) {
  return (
    <SheetForm title="Payment gateway for each class" sub="Gateways are connected in Settings, Payment Gateways." closeHref={closeHref} action={routingAction} submitLabel="Save" pendingText="Saving…" submitDisabled={!gateways.length}>
      {!gateways.length ? <Alert tone="info">No payment gateway is connected yet. Connect Razorpay in Settings, Payment Gateways.</Alert> : (
        <>
          <SSelect name="default" label="Every class" start={s.default} options={gateways} placeholder="The first switched-on Razorpay" />
          {classes.map((c) => <SSelect key={c.value} name={`class:${c.value}`} label={c.label} start={s.byClass[c.value] ?? ""} options={gateways} placeholder="Same as every class" />)}
        </>
      )}
    </SheetForm>
  );
}

export function PaymentsSheet({ closeHref, s, modes, verifyOn }: C & { s: { verifyModes: string[]; limit: string; cancelPast: boolean }; modes: Option[]; verifyOn: boolean }) {
  return (
    <SheetForm title="Payments" sub="Limits and checks at the counter." closeHref={closeHref} action={paymentsAction} submitLabel="Save" pendingText="Saving…">
      <SMoney name="limit" label="Concessions apply at once up to" required start={s.limit} help="Above this, a concession or counter discount goes to Approvals." />
      <SSwitch name="cancelPast" title="Cancelling a payment from before today needs approval" start={s.cancelPast} />
      <SChips name="verifyMode" label="Modes that wait for verification" options={modes} start={s.verifyModes} help={verifyOn ? "Payments in these modes post only after the accountant verifies them." : "Switch on “Verify payments before posting” for this to apply."} />
    </SheetForm>
  );
}

export function CounterSheet({ closeHref, perms, roles }: C & { perms: { key: string; label: string; roles: string[] }[]; roles: Option[] }) {
  return (
    <SheetForm title="Counter permissions" sub="Who may do each thing at the fee counter. Changes apply from the next action." closeHref={closeHref} action={counterAction} submitLabel="Save permissions" pendingText="Saving…">
      {perms.map((p) => <SChips key={p.key} name={p.key} label={p.label} options={roles} start={p.roles} />)}
    </SheetForm>
  );
}

export function HeadAccountsSheet({ closeHref, heads, accounts }: C & { heads: { id: string; name: string; accountId: string }[]; accounts: Option[] }) {
  return (
    <SheetForm title="Bank account for each fee head" sub="Receipts and the Day Book show each head’s account. Razorpay splits online payments." closeHref={closeHref} action={headAccountsAction} submitLabel="Save" pendingText="Saving…">
      {heads.map((h) => <SSelect key={h.id} name={`head:${h.id}`} label={h.name} start={h.accountId} options={accounts} placeholder="Main bank account" />)}
    </SheetForm>
  );
}

export function ScholarshipTypesSheet({ closeHref, types }: C & { types: string }) {
  return (
    <SheetForm title="Scholarship types" sub="Offered when giving a scholarship. One per line." closeHref={closeHref} action={scholarshipTypesAction} submitLabel="Save" pendingText="Saving…">
      <SArea name="types" label="Types" rows={6} start={types} placeholder={"Merit scholarship\nSports scholarship\nNeed-based"} />
    </SheetForm>
  );
}

/** Switches an optional part on or off at once; puts it back if the server says no. */
export function FeatureSwitch({ featureKey, on, label }: { featureKey: string; on: boolean; label: string }) {
  const [v, setV] = useState(on);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1 shrink-0">
      <Switch on={v} label={label} disabled={busy} onChange={async (next) => {
        setBusy(true); setErr(null); setV(next);
        const fd = new FormData();
        fd.set("key", featureKey); fd.set("on", next ? "1" : "0");
        const r = (await featureAction(null, fd)) as FormState<unknown>;
        if (r && !r.ok) { setV(!next); setErr(r.message || "That did not work."); }
        setBusy(false);
      }} />
      {err && <span className="text-[12px] text-bad max-w-[200px] text-right" role="alert">{err}</span>}
    </span>
  );
}
