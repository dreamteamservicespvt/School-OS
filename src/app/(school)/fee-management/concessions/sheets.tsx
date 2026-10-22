"use client";

// The sheets on Concessions & Refunds (mod-fees.jsx Concessions): new
// concession, new refund, mark refunded, decline with a reason, take a
// concession off, and the bulk discount rules. Every one is checked again on
// the server and written to the audit log.

import { useActionState, useState } from "react";
import { Check, Paperclip } from "lucide-react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SChips, SDate, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Segmented, Switch } from "@/components/ui/controls";
import { ConfirmButton } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Option } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import {
  archiveRuleAction, decideAction, markRefundedAction, newConcessionAction, newRefundAction, revokeConcessionAction, saveRuleAction, toggleRuleAction,
} from "./actions";
import { Words } from "@/lib/i18n/client";

/** Runs a server action from a button; returns the problem in words, if any. */
async function run(fn: (prev: unknown, fd: FormData) => Promise<FormState<unknown>>, fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const r = await fn(null, fd);
  return r && !r.ok ? r.message || "That did not work. Nothing was changed." : undefined;
}

const TYPES: Option[] = [
  { value: "DISCOUNT", label: "Discount" },
  { value: "SCHOLARSHIP", label: "Scholarship" },
  { value: "SIBLING", label: "Sibling" },
  { value: "STAFF_CHILD", label: "Staff child" },
  { value: "LATE_FEE_WAIVER", label: "Late fee waiver" },
];
const PERIODS: Option[] = [
  { value: "rest", label: "Rest of this year" },
  { value: "whole", label: "Whole year" },
  { value: "range", label: "Choose dates" },
];

export function ConcessionSheet({ closeHref, student, heads, startHead, scholarships, limit, startType }: {
  closeHref: string;
  student: { id: string; name: string; classLabel: string };
  /** The student's own fee heads with something left to pay this year. */
  heads: Option[];
  /** Chosen at the start: Tuition when the student has it. */
  startHead: string | null;
  scholarships: string[];
  limit: string;
  startType: string;
}) {
  const [type, setType] = useState(startType);
  const [unit, setUnit] = useState<"amount" | "percent">("amount");
  const [period, setPeriod] = useState("rest");
  const [doc, setDoc] = useState<string | null>(null);
  return (
    <SheetForm title="New concession" sub={`Amount or percentage off the fees of ${student.name}${student.classLabel ? `, ${student.classLabel}` : ""}`}
      closeHref={closeHref} action={newConcessionAction} submitLabel="Apply concession" pendingText="Saving…" hidden={{ studentId: student.id, mode: unit }}>
      <div className="grid grid-cols-2 gap-3">
        <SSelect name="type" label="Type" required options={TYPES} start={type} onChange={(e) => setType(e.target.value)} />
        <SSelect name="period" label="Period" required options={PERIODS} start={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>
      {period === "range" && (
        <div className="grid grid-cols-2 gap-3">
          <SDate name="periodFrom" label="From" required />
          <SDate name="periodTo" label="To" required />
        </div>
      )}
      {type === "SCHOLARSHIP" && (
        <>
          <SText name="scholarshipType" label="Scholarship" required placeholder="Example: Merit scholarship" list="scholarship-names" maxLength={80} />
          <datalist id="scholarship-names">{scholarships.map((s) => <option key={s} value={s} />)}</datalist>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2"><Words k="Amount or %" /><span className="text-bad" aria-hidden="true"> *</span></span>
        <div className="flex gap-2 items-start">
          <Segmented label="Amount or percent" value={unit} onChange={(v) => setUnit(v as typeof unit)} options={[{ value: "amount", label: "₹" }, { value: "percent", label: "%" }]} />
          <div className="flex-1 min-w-0">
            {unit === "amount" ? <SMoney name="value" label="Amount" placeholder="2,000" />
              : <SText name="value" label="Percent" inputMode="decimal" placeholder="10" className="tnum" />}
          </div>
        </div>
        <p className="text-[12.5px] text-ink3"><Words k="Up to" /> {limit} <Words k="applies at once. Above it, the request goes to Approvals and applies once approved." /></p>
      </div>
      {type !== "LATE_FEE_WAIVER" ? (
        heads.length ? <SChips name="feeHeadId" label="Fee heads" required options={heads} start={startHead ? [startHead] : heads[0] ? [heads[0].value] : []} />
          : <Alert tone="info"><Words k="No fee heads yet. Add them in Fee Structure first." /></Alert>
      ) : <p className="text-[13px] text-ink3"><Words k="Takes off late fees the student has not paid yet." /></p>}
      <SArea name="reason" label="Reason" required placeholder="Example: father’s job loss, letter attached" help="Printed on the approval and kept in the audit log." />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2"><Words k="Document" /></span>
        <label className="inline-flex items-center gap-2 self-start h-10 px-3.5 rounded-xl border border-line text-[14px] font-semibold text-ink2 cursor-pointer hover:bg-sunken focus-within:ring-2 focus-within:ring-brand/40">
          <Paperclip size={16} aria-hidden="true" />{doc ?? "Attach"}
          <input type="file" name="document" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => setDoc(e.target.files?.[0]?.name ?? null)} />
        </label>
        <p className="text-[12.5px] text-ink3"><Words k="Optional. Photo or PDF." /></p>
      </div>
    </SheetForm>
  );
}

export function RefundSheet({ closeHref, student, payments, modes }: {
  closeHref: string;
  student: { id: string; name: string; classLabel: string };
  payments: (Option & { max: string; maxRupees: string; mode: string })[];
  modes: Option[];
}) {
  const [pay, setPay] = useState(payments[0]?.value ?? "");
  const chosen = payments.find((x) => x.value === pay);
  return (
    <SheetForm title="New refund" sub={`For ${student.name}${student.classLabel ? `, ${student.classLabel}` : ""}. Every refund goes to Approvals.`}
      closeHref={closeHref} action={newRefundAction} submitLabel="Send for approval" pendingText="Sending…" submitDisabled={!payments.length}>
      {payments.length === 0 ? <Alert tone="info"><Words k="This student has no payment that can be refunded. Cancelled payments, payments brought in from old software and payments refunded in full are left out." /></Alert> : (
        <>
          <SSelect name="paymentId" label="Payment" required options={payments} start={pay} onChange={(e) => setPay(e.target.value)} />
          <SMoney key={pay} name="amount" label="Amount" required start={chosen?.maxRupees} help={chosen ? `Not more than ${chosen.max} (paid, minus earlier refunds)` : undefined} />
          <SSelect key={`m-${pay}`} name="mode" label="Refund mode" required options={modes} start={modes.some((m) => m.value === chosen?.mode) ? chosen?.mode : modes[0]?.value} />
          <SArea name="reason" label="Reason" required placeholder="Example: paid twice, once by link and once at the counter" />
        </>
      )}
    </SheetForm>
  );
}

export function MarkRefundedSheet({ closeHref, refundId, words, today, accounts, needsReference }: {
  closeHref: string; refundId: string; words: string; today: string; accounts: Option[]; needsReference: boolean;
}) {
  return (
    <SheetForm title="Mark refunded" sub={words} closeHref={closeHref} action={markRefundedAction} submitLabel="Mark refunded" pendingText="Saving…" hidden={{ refundId }}>
      <SDate name="date" label="Date paid" required start={today} />
      <SText name="reference" label="Reference" required={needsReference} placeholder={needsReference ? "UTR or cheque number" : "Cash voucher number (optional)"} className="font-mono" maxLength={80} help="UTR, cheque number or cash voucher" />
      {accounts.length > 1 && <SSelect name="accountId" label="Paid from" options={accounts} placeholder="The usual account for this mode" />}
    </SheetForm>
  );
}

export function DeclineSheet({ closeHref, kind, recordId, words }: { closeHref: string; kind: "concession" | "refund"; recordId: string; words: string }) {
  return (
    <SheetForm title="Decline" sub={words} closeHref={closeHref} action={decideAction} submitLabel="Decline" submitVariant="danger" pendingText="Saving…" hidden={{ kind, recordId, decision: "reject" }}>
      <SArea name="note" label="Reason" required placeholder="The person who asked sees this" />
    </SheetForm>
  );
}

export function RevokeSheet({ closeHref, concessionId, words }: { closeHref: string; concessionId: string; words: string }) {
  return (
    <SheetForm title="Take off this concession" sub={words} closeHref={closeHref} action={revokeConcessionAction} submitLabel="Take it off" submitVariant="danger" pendingText="Saving…" hidden={{ concessionId }}>
      <Alert tone="warning"><Words k="The rows it covered are due again, from what is still unpaid. Payments already made do not change. The record stays with your reason." /></Alert>
      <SArea name="reason" label="Reason" required placeholder="Example: given by mistake to the wrong student" />
    </SheetForm>
  );
}

/** Approve (one tap) and Decline (opens a sheet for the reason). Shown only to the person who may decide. */
export function ApproveButton({ kind, recordId }: { kind: "concession" | "refund"; recordId: string }) {
  const [state, action, pending] = useActionState<FormState<unknown>, FormData>(decideAction as never, null);
  if (state?.ok) return null;
  return (
    <form action={action} className="relative z-10 inline-flex flex-col">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="decision" value="approve" />
      <Button type="submit" size="sm" variant="soft" icon={Check} loading={pending}><Words k="Approve" /></Button>
      {state && !state.ok && <span className="text-[12px] text-bad max-w-[200px]" role="alert">{state.message}</span>}
    </form>
  );
}

export function RuleSheet({ closeHref, rule, heads }: {
  closeHref: string;
  rule: { id: string; name: string; minInstallments: number; percent: string; feeHeadIds: string[]; isActive: boolean } | null;
  heads: Option[];
}) {
  return (
    <SheetForm title={rule ? "Change discount rule" : "New discount rule"} sub="Example: pay 3 months, get 5% off. Applied by itself at Collect Fee."
      closeHref={closeHref} action={saveRuleAction} submitLabel="Save rule" pendingText="Saving…" hidden={rule ? { ruleId: rule.id } : undefined}>
      <SText name="name" label="Name" required start={rule?.name} placeholder="Example: Pay 3 months, get 5% off" maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <SText name="minInstallments" label="Installments paid together" required inputMode="numeric" start={rule?.minInstallments ?? 3} className="tnum" />
        <SText name="percent" label="Discount %" required inputMode="decimal" start={rule?.percent} placeholder="5" className="tnum" />
      </div>
      <SChips name="feeHeadId" label="Fee heads" options={heads} start={rule?.feeHeadIds ?? []} help="None chosen means every fee head." />
      <SSwitch name="isActive" title="On" sub="Off keeps the rule but stops applying it." start={rule ? rule.isActive : true} />
    </SheetForm>
  );
}

export function RuleSwitch({ ruleId, on, label }: { ruleId: string; on: boolean; label: string }) {
  const [v, setV] = useState(on);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex flex-col items-end gap-1">
      <Switch on={v} label={label} disabled={busy} onChange={async (next) => {
        setBusy(true); setErr(null); setV(next);
        const e = await run(toggleRuleAction, { ruleId, on: next ? "1" : "0" });
        if (e) { setV(!next); setErr(e); }
        setBusy(false);
      }} />
      {err && <span className="text-[12px] text-bad" role="alert">{err}</span>}
    </span>
  );
}

export function ArchiveRule({ ruleId, name }: { ruleId: string; name: string }) {
  return (
    <ConfirmButton trigger="Archive" triggerVariant="ghost" title={`Archive ${name}?`} confirmLabel="Archive rule" confirmVariant="danger"
      onConfirm={() => run(archiveRuleAction, { ruleId })}>
      <Words k="It stops applying at Collect Fee. Discounts it already gave stay on the receipts." />
    </ConfirmButton>
  );
}
