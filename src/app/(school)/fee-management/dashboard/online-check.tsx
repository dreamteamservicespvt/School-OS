"use client";

// Online payments to check (Fee Dashboard, A8): a payment Razorpay confirmed
// that matched no student is posted to the student the office chooses; a
// refund or dispute made at Razorpay is asked to be cancelled through
// Approvals. Both are checked again on the server.

import { useActionState } from "react";
import { Ban } from "lucide-react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SText } from "@/components/ui/sheet-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import type { FormState } from "@/lib/forms";
import { askCancelReversedAction, postUnmatchedAction } from "../payments/actions";

export function MatchSheet({ closeHref, transactionId, amount, when, payer, reference, suggested }: {
  closeHref: string; transactionId: string; amount: string; when: string; payer: string | null; reference: string;
  suggested: { id: string; name: string; admissionNo: string }[];
}) {
  return (
    <SheetForm title={`Post ${amount} to a student`} sub={`Paid on Razorpay on ${when}${payer ? ` by ${payer}` : ""}. It could not be matched to a payment link.`}
      closeHref={closeHref} action={postUnmatchedAction} submitLabel="Post and make the receipt" pendingText="Posting…" hidden={{ transactionId }}>
      <Alert tone="info">It pays the student’s oldest dues first; anything over is held as advance. The parent gets the receipt message, and the Day Book has it today. Razorpay reference {reference}.</Alert>
      {suggested.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-[13px] font-semibold text-ink2">Students whose parent paid from this phone</legend>
          <ul className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
            {suggested.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-3 px-4 min-h-11 cursor-pointer">
                  <input type="radio" name="studentId" value={s.id} className="size-4 accent-[var(--color-brand)]" />
                  <span>{s.name} <span className="text-[12.5px] text-ink3">· {s.admissionNo}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <SText name="admissionNo" label={suggested.length ? "Or the admission number" : "Admission number"} help="Find it on Collect Fee by the student’s name or the parent’s phone." autoComplete="off" />
    </SheetForm>
  );
}

/** "Ask to cancel" a payment Razorpay refunded or a bank disputed: it goes to Approvals. */
export function AskCancelButton({ transactionId }: { transactionId: string }) {
  const [state, action, pending] = useActionState<FormState<unknown>, FormData>(askCancelReversedAction as never, null);
  if (state?.ok) return <Pill tone="info">Sent for approval</Pill>;
  return (
    <form action={action} className="shrink-0 relative z-10 flex flex-col items-end gap-1 max-w-[180px]">
      <input type="hidden" name="transactionId" value={transactionId} />
      <Button type="submit" size="sm" variant={state && !state.ok ? "danger-soft" : "soft"} icon={Ban} loading={pending}>{state && !state.ok ? "Try again" : "Ask to cancel"}</Button>
      {state && !state.ok && <span className="text-[11.5px] text-bad text-right leading-snug" role="alert">{state.message}</span>}
    </form>
  );
}
