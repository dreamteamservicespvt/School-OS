"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import type { FormState } from "@/lib/forms";
import { newLinkForFailed, newLinkForStuck } from "../payments/actions";

/** "New link" on a failed or stuck online payment: sends the parent a fresh Razorpay link. */
export function FailedLinkButton({ kind, id }: { kind: "payment" | "link"; id: string }) {
  const [state, action, pending] = useActionState<FormState<unknown>, FormData>((kind === "payment" ? newLinkForFailed : newLinkForStuck) as never, null);
  if (state?.ok) return <Pill tone="ok">Link sent</Pill>;
  return (
    <form action={action} className="shrink-0 relative z-10 flex flex-col items-end gap-1 max-w-[180px]">
      <input type="hidden" name={kind === "payment" ? "paymentId" : "linkId"} value={id} />
      <Button type="submit" size="sm" variant={state && !state.ok ? "danger-soft" : "soft"} icon={Send} loading={pending}>{state && !state.ok ? "Try again" : "New link"}</Button>
      {state && !state.ok && <span className="text-[11.5px] text-bad text-right leading-snug" role="alert">{state.message}</span>}
    </form>
  );
}
