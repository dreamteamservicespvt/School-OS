"use client";

// The result of a form or action, shown above the form (P7, P15). A problem brings itself into
// view (QA ADMIT-02).
// - While a new save is on its way, the last problem is out of date and is not shown: after a
//   refused save and a second press, the old "already exists" stayed on screen until the slow
//   answer came, and read as if the save had failed (layman test LA2).
// - "Please fix 2 things before saving." is not shown when the form's error summary
//   (<ErrorSummary>, which says the same above its list) is on screen (layman test LE7).
import { useFormStatus } from "react-dom";
import { Alert } from "./alert";
import { ProblemInView } from "./problem-in-view";
import { isSummaryMessage } from "@/lib/form-problems";

/** Hides its children while the form it is in is saving. */
export function HideWhileSaving({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return pending ? null : children;
}

export function FormMessage({ state }: { state?: { ok: boolean; message?: string } | null }) {
  const { pending } = useFormStatus();
  if (!state?.message) return null;
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  if (pending) return null;
  return (
    <ProblemInView token={state} className={isSummaryMessage(state.message) ? "[form:has([data-error-summary])_&]:hidden" : undefined}>
      <Alert tone="danger">{state.message}</Alert>
    </ProblemInView>
  );
}
