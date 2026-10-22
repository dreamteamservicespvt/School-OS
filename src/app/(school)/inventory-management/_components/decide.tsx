"use client";

// Approve or do not approve, on the record's own page, for the person whose
// approval it waits for. "Do not approve" needs a reason.

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import { Words } from "@/lib/i18n/client";

type Act = (p: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;

export function DecideBox({ action, approvalId, question }: { action: Act; approvalId: string; question: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action, null);
  const [rejecting, setRejecting] = useState(false);
  return (
    <form action={run} className="rounded-2xl border border-info/40 bg-info/5 p-4 flex flex-col gap-3">
      <input type="hidden" name="approvalId" value={approvalId} />
      <p className="text-[14px] font-semibold">{question}</p>
      {rejecting && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`reason-${approvalId}`} className="text-[13px] font-semibold text-ink2"><Words k="Reason" /> <span className="text-bad" aria-hidden="true">*</span></label>
          <textarea id={`reason-${approvalId}`} name="note" rows={2} maxLength={300} required className="rounded-xl border border-line bg-surface px-3 py-2 text-[14px]" placeholder="For example: buy from the usual vendor at the lower price" />
        </div>
      )}
      {state && !state.ok && <p className="text-[13px] text-bad" role="alert">{state.message}</p>}
      <div className="flex gap-2 flex-wrap">
        {rejecting ? (
          <>
            <Button type="submit" name="decision" value="reject" variant="danger" loading={pending}><Words k="Do not approve" /></Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}><Words k="Back" /></Button>
          </>
        ) : (
          <>
            <Button type="submit" name="decision" value="approve" variant="primary" icon={Check} loading={pending}><Words k="Approve" /></Button>
            <Button variant="secondary" icon={X} onClick={() => setRejecting(true)}><Words k="Do not approve" /></Button>
          </>
        )}
      </div>
    </form>
  );
}
