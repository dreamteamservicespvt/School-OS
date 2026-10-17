"use client";

// The sheets on the Student Fee Ledger (mod-fees.jsx LedgerPage): old dues,
// adjust an amount, add a charge, assign a fee plan, fee certificate and fee
// invoice. Each one checks on the server and is written to the audit log.

import { useActionState, useState } from "react";
import { Send } from "lucide-react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { Alert } from "@/components/ui/alert";
import { Pill } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/button";
import type { Option } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import { formatRupees } from "@/lib/format";
import { addChargeAction, addOldDuesAction, adjustAction, assignPlanAction, certificateAction, invoiceAction, resendInvoiceAction } from "./actions";

type Common = { studentId: string; closeHref: string };

export function OldDuesSheet({ studentId, closeHref, name, heads, start }: Common & { name: string; heads: Option[]; start: string }) {
  return (
    <SheetForm title="Add opening balance" sub={`Old dues for ${name} from before School OS. Nothing is added to the Day Book.`}
      closeHref={closeHref} action={addOldDuesAction} submitLabel="Add opening balance" pendingText="Adding…" hidden={{ studentId }}>
      <SMoney name="amount" label="Amount" required />
      <SSelect name="feeHeadId" label="Fee head" options={heads} start={heads[0]?.value} />
      <SDate name="dueDate" label="Due date" start={start} help="When it was due. Old dues are usually due before this year starts." />
      <SArea name="note" label="Note" placeholder="Example: from the 2025–26 register, page 44" />
    </SheetForm>
  );
}

export function AdjustSheet({ studentId, closeHref, rows, start }: Common & { rows: (Option & { removable: boolean; left: string })[]; start: string }) {
  const [how, setHow] = useState<"reduce" | "add" | "remove">("reduce");
  const [row, setRow] = useState(start || rows[0]?.value || "");
  const chosen = rows.find((r) => r.value === row);
  return (
    <SheetForm title="Adjust an amount" sub="Adds an adjustment row with a reason. Payments themselves never change."
      closeHref={closeHref} action={adjustAction} submitLabel={how === "remove" ? "Remove the row" : "Save adjustment"} submitVariant={how === "remove" ? "danger" : "primary"}
      pendingText="Saving…" hidden={{ studentId, how }}>
      {rows.length === 0 ? <Alert tone="info">This student has no open rows to adjust.</Alert> : (
        <>
          <SSelect name="dueId" label="Row" required options={rows} start={row} onChange={(e) => setRow(e.target.value)} help={chosen ? `${chosen.left} left on this row` : undefined} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink2">What to do</span>
            <Segmented label="What to do" value={how} onChange={(v) => setHow(v as typeof how)} options={[
              { value: "reduce", label: "Reduce" }, { value: "add", label: "Add" }, ...(chosen?.removable ? [{ value: "remove", label: "Remove the row" }] : []),
            ]} />
          </div>
          {how !== "remove" ? <SMoney name="amount" label={how === "add" ? "Amount to add" : "Amount to reduce"} required />
            : <Alert tone="warning">The row comes off the student’s fees. It stays on the ledger, struck through, with your reason.</Alert>}
          <SArea name="reason" label="Reason" required placeholder="Example: fee for the hostel was charged twice in June" />
        </>
      )}
    </SheetForm>
  );
}

export function ChargeSheet({ studentId, closeHref, heads, start }: Common & { heads: Option[]; start: string }) {
  return (
    <SheetForm title="Add a charge" sub="A one-off fee for this student only, like a fine, a lost library book or an extra activity."
      closeHref={closeHref} action={addChargeAction} submitLabel="Add charge" pendingText="Adding…" hidden={{ studentId }}>
      <SSelect name="feeHeadId" label="Fee head" required options={heads} placeholder="Choose" />
      <SText name="label" label="Name on the receipt" placeholder="Example: Lost library book" maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="amount" label="Amount" required />
        <SDate name="dueDate" label="Due date" required start={start} />
      </div>
      <SArea name="reason" label="Reason" required placeholder="Why this student pays it" />
    </SheetForm>
  );
}

export function AssignSheet({ studentId, closeHref, plans, own }: Common & { plans: Option[]; own: string | null }) {
  const [plan, setPlan] = useState(own ?? plans[0]?.value ?? "");
  return (
    <SheetForm title="Assign a fee plan" sub="Pick the class plan. A plan of another class is an exception and needs a reason."
      closeHref={closeHref} action={assignPlanAction} submitLabel="Assign fee plan" pendingText="Assigning…" hidden={{ studentId }} submitDisabled={!plans.length}>
      {plans.length === 0 ? <Alert tone="info">No fee structure is published for this year yet. Publish one in Fee Structure first.</Alert> : (
        <>
          <SSelect name="structureId" label="Fee plan" required options={plans} start={plan} onChange={(e) => setPlan(e.target.value)} />
          {plan !== own && <SArea name="reason" label="Reason" required placeholder="Why this student follows another plan" />}
        </>
      )}
    </SheetForm>
  );
}

export function CertificateSheet({ studentId, closeHref, years, start }: Common & { years: Option[]; start: string }) {
  return (
    <SheetForm title="Fee certificate" sub="For income tax: the fees paid in one financial year, with the tuition part shown on its own."
      closeHref={closeHref} action={certificateAction} submitLabel="Make certificate" pendingText="Making…" hidden={{ studentId }}>
      <SSelect name="financialYearId" label="Financial year" required options={years} start={start} />
    </SheetForm>
  );
}

export type InvoiceRow = { id: string; label: string; status: string; amount: string; paise: string; dueNow: boolean };

/** A fee invoice for the ticked rows: what is due now is ticked; rows not due yet can be ticked too. The total is what is ticked. */
export function InvoiceSheet({ studentId, closeHref, rows, father, canLink }: Common & { rows: InvoiceRow[]; father: string; canLink: boolean }) {
  const [ticked, setTicked] = useState(() => new Set(rows.filter((r) => r.dueNow).map((r) => r.id)));
  const total = rows.filter((r) => ticked.has(r.id)).reduce((s, r) => s + BigInt(r.paise), BigInt(0));
  const flip = (id: string) => setTicked((t) => {
    const next = new Set(t);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <SheetForm title="Fee invoice" sub="What is due now is ticked. Tick more rows to ask for them early. The invoice gets its own number." closeHref={closeHref} action={invoiceAction}
      submitLabel="Make invoice" pendingText="Making…" hidden={{ studentId }} submitDisabled={ticked.size === 0}>
      {rows.length === 0 ? <Alert tone="info">Nothing is left to pay, so there is nothing to invoice.</Alert> : (
        <>
          <ul className="rounded-xl border border-line divide-y divide-line/70 text-[14px]" aria-label="Rows on the invoice">
            {rows.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                  <input type="checkbox" name="dueId" value={r.id} checked={ticked.has(r.id)} onChange={() => flip(r.id)} className="size-4 accent-[var(--color-brand)] shrink-0" />
                  <span className="min-w-0 flex-1">{r.label} <span className="text-[12.5px] text-ink3">· {r.status}</span></span>
                  <span className="tnum shrink-0">{r.amount}</span>
                </label>
              </li>
            ))}
            <li className="flex justify-between gap-3 px-4 py-2.5 font-semibold"><span>Total on the invoice</span><span className="tnum">{formatRupees(total)}</span></li>
          </ul>
          {canLink ? <SSwitch name="send" title={`Send to ${father} on WhatsApp`} sub="With a Razorpay link to pay online. The link works for 7 days." start />
            : <p className="text-[13px] text-ink3">Online payment is not set up, so the invoice is made without a payment link. Set up Razorpay in Fee Settings.</p>}
        </>
      )}
    </SheetForm>
  );
}

/** "Send again" on an invoice: the parent gets its unpaid rows with a fresh payment link. */
export function ResendInvoice({ studentId, invoiceId }: { studentId: string; invoiceId: string }) {
  const [state, action, pending] = useActionState<FormState<unknown>, FormData>(resendInvoiceAction as never, null);
  if (state?.ok) return <Pill tone="ok" className="!h-6 !text-[11.5px] shrink-0">Sent</Pill>;
  return (
    <form action={action} className="shrink-0 flex items-center gap-1">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {state && !state.ok && <span className="text-[11.5px] text-bad max-w-[160px] text-right leading-snug" role="alert">{state.message}</span>}
      <button type="submit" aria-label="Send again" title="Send again" disabled={pending} className="w-9 h-9 rounded-lg grid place-items-center text-ink3 hover:bg-sunken disabled:opacity-60">
        {pending ? <Spinner size={15} /> : <Send size={16} aria-hidden="true" />}
      </button>
    </form>
  );
}
