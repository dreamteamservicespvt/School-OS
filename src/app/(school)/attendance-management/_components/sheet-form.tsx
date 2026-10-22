"use client";

// A short form in a sheet (dialog on a computer, bottom sheet on a phone),
// bound to a server action (design/ui-prototype/src/kit.jsx FormSheet). It
// keeps what was typed, shows each problem next to its field (P3, P7), and
// closes when the action saves; the toast says what happened (P15).

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Banner } from "@/components/ui/banner";
import { ErrorSummary } from "@/components/ui/field";
import { ProblemInView } from "@/components/ui/problem-in-view";
import type { FormState } from "@/lib/forms";

export type Action = (prev: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;

export type FormHelpers = {
  state: FormState<unknown>;
  err: (key: string) => string | undefined;
  val: (key: string, fallback?: string | null) => string | undefined;
  pending: boolean;
};

export function FormProblem({ state }: { state: FormState<unknown> }) {
  if (!state?.message || state.ok) return null;
  const link = (state.data as { link?: { href: string; label: string } } | undefined)?.link;
  if (state.errors && Object.keys(state.errors).length > 1) return <ErrorSummary errors={state.errors} />;
  return (
    <ProblemInView token={state}>
      <Banner tone="bad" role="alert" action={link ? <Link href={link.href} className="text-[13.5px] font-semibold text-brand hover:underline whitespace-nowrap">{link.label}</Link> : undefined}>
        {state.message}
      </Banner>
    </ProblemInView>
  );
}

function SheetBody({ action, hidden, submitLabel, submitIcon = Check, submitVariant = "primary", pendingText, onDone, onCancel, children, cancelLabel = "Cancel" }: {
  action: Action; hidden?: Record<string, string>; submitLabel: string; submitIcon?: LucideIcon | null; submitVariant?: ButtonVariant; pendingText?: string;
  onDone: (s: FormState<unknown>) => void; onCancel: () => void; children: (f: FormHelpers) => React.ReactNode; cancelLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const done = useRef(false);
  useEffect(() => {
    if (state?.ok && !done.current) { done.current = true; onDone(state); }
  }, [state, onDone]);
  const f: FormHelpers = { state, pending, err: (k) => state?.errors?.[k], val: (k, fb) => state?.values?.[k] ?? fb ?? undefined };
  const Ic = submitIcon;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <FormProblem state={state} />
      {children(f)}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>{cancelLabel}</Button>
        <SubmitButton variant={submitVariant} pendingText={pendingText ?? "Saving…"}>{Ic && <Ic size={17} strokeWidth={2.2} aria-hidden="true" />}{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** A sheet the parent opens and closes. */
export function ActionSheet({ open, onClose, title, sub, wide, onSaved, ...body }: {
  open: boolean; onClose: () => void; title: string; sub?: React.ReactNode; wide?: boolean; onSaved?: (s: FormState<unknown>) => void;
  action: Action; hidden?: Record<string, string>; submitLabel: string; submitIcon?: LucideIcon | null; submitVariant?: ButtonVariant; pendingText?: string; cancelLabel?: string;
  children: (f: FormHelpers) => React.ReactNode;
}) {
  // A fresh form each time it opens, so old problems do not show again.
  const [round, setRound] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) setRound((r) => r + 1); }
  return (
    <Dialog open={open} onClose={onClose} title={title} sub={sub} wide={wide}>
      <SheetBody key={round} {...body} onCancel={onClose} onDone={(s) => { onClose(); onSaved?.(s); }} />
    </Dialog>
  );
}

/** A button that opens an ActionSheet. */
export function SheetButton({ label, icon, variant = "secondary", size = "md", className, ...sheet }: {
  label: React.ReactNode; icon?: LucideIcon; variant?: ButtonVariant; size?: ButtonSize; className?: string;
} & Omit<React.ComponentProps<typeof ActionSheet>, "open" | "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} icon={icon} className={className} onClick={() => setOpen(true)}>{label}</Button>
      <ActionSheet {...sheet} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Quick-fill chips above a text box (design: reason and note chips). */
export function QuickChips({ items, onPick }: { items: string[]; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((x) => (
        <button key={x} type="button" onClick={() => onPick(x)} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line transition">{x}</button>
      ))}
    </div>
  );
}
