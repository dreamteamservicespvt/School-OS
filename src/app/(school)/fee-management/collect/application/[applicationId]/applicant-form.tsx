"use client";

// Collect Fee for an applicant: amount, how it was paid and the reference.
// The receipt is made when the money is in hand; the page refreshes with it.

import { useActionState } from "react";
import Link from "next/link";
import { IndianRupee, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField, type Option } from "@/components/ui/field";
import { Banner } from "@/components/money/kit";
import type { FormState } from "@/lib/forms";
import { collectApplicationFeeAction, type ApplicationFeeTaken } from "./actions";
import { Words } from "@/lib/i18n/client";

export function ApplicantFeeForm({ applicationId, left, modes }: { applicationId: string; left: string; modes: Option[] }) {
  const [state, action, pending] = useActionState<FormState<ApplicationFeeTaken>, FormData>(collectApplicationFeeAction as never, null);
  const val = (k: string, fallback = "") => state?.values?.[k] ?? fallback;
  const err = (k: string) => state?.errors?.[k];
  const done = state?.ok ? state.data : null;
  return (
    <div className="flex flex-col gap-3">
      {done && (
        <Banner tone="ok" title={`Receipt ${done.receiptNo}`}
          action={<Link href={`/fee-management/collect/application/${done.applicationId}/receipt/${done.paymentId}`} target="_blank" className="inline-flex items-center gap-1.5 font-semibold underline"><Printer size={15} aria-hidden="true" /><Words k="Print receipt" /></Link>}>
          {done.amount} <Words k="received. It is in the Day Book under Other fee types, Application fee." />
        </Banner>
      )}
      {state && !state.ok && state.message && !state.errors && <Banner tone="bad">{state.message}</Banner>}
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="applicationId" value={applicationId} />
        <TextField label="Amount received (₹)" name="amount" required inputMode="decimal" className="tnum" defaultValue={val("amount", left.replace(/[^\d.]/g, ""))} error={err("amount")} key={`a-${done?.paymentId ?? ""}`} />
        <SelectField label="Paid by" name="mode" required options={modes} defaultValue={val("mode", "cash")} error={err("mode")} />
        <TextField label="Reference" name="reference" maxLength={80} defaultValue={val("reference")} error={err("reference")} help="Cheque number or UPI / card transaction ID. Not needed for cash." key={`r-${done?.paymentId ?? ""}`} />
        <p className="text-[13px] text-ink3"><Words k="A receipt is made only after the money is received." /></p>
        <div><Button type="submit" variant="primary" icon={IndianRupee} loading={pending} loadingText="Saving…"><Words k="Record payment" /></Button></div>
      </form>
    </div>
  );
}
