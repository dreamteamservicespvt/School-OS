"use client";

// Small form helpers for Admission screens: a form bound to a server
// action that keeps typed values and shows each problem next to its field
// (P3, P7), in a panel (FormDialog) or on the page (ActionForm).

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { ErrorSummary } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";

export type Action = (prev: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;

export type FormHelpers = {
  state: FormState<unknown>;
  /** The problem for one field, if any. */
  err: (key: string) => string | undefined;
  /** What was typed, or the default. */
  val: (key: string, fallback?: string | null) => string | undefined;
  pending: boolean;
};

function helpers(state: FormState<unknown>, pending: boolean): FormHelpers {
  return {
    state,
    pending,
    err: (k) => state?.errors?.[k],
    val: (k, fallback) => state?.values?.[k] ?? fallback ?? undefined,
  };
}

function Message({ state }: { state: FormState<unknown> }) {
  if (!state?.message || state.ok) return null;
  const link = (state.data as { link?: { href: string; label: string } } | undefined)?.link;
  if (state.errors && Object.keys(state.errors).length > 1) return <ErrorSummary errors={state.errors} />;
  return (
    <Alert tone="danger" action={link ? <Link href={link.href} className="font-medium underline">{link.label}</Link> : undefined}>
      {state.message}
    </Alert>
  );
}

function Body({ action, hidden, submitLabel, pendingText, onDone, onCancel, children, submitVariant, multipart }: {
  action: Action; hidden?: Record<string, string>; submitLabel: string; pendingText?: string; onDone: (s: FormState<unknown>) => void; onCancel?: () => void;
  children: (f: FormHelpers) => React.ReactNode; submitVariant?: ButtonVariant; multipart?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const done = useRef(false);
  useEffect(() => {
    if (state?.ok && !done.current) { done.current = true; onDone(state); }
  }, [state, onDone]);
  return (
    <form action={formAction} className="space-y-4" data-multipart={multipart ? "" : undefined}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Message state={state} />
      {children(helpers(state, pending))}
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {onCancel && <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>}
        <SubmitButton variant={submitVariant} pendingText={pendingText ?? "Saving…"}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** A button that opens a short form in a panel; the panel closes when it saves. */
export function FormDialog({ trigger, triggerVariant = "secondary", triggerSize = "md", triggerClassName = "", title, action, submitLabel, pendingText, wide, hidden, children, submitVariant, multipart, onSaved, defaultOpen }: {
  trigger: React.ReactNode; triggerVariant?: ButtonVariant; triggerSize?: ButtonSize; triggerClassName?: string; title: string; action: Action; submitLabel: string;
  pendingText?: string; wide?: boolean; hidden?: Record<string, string>; children: (f: FormHelpers) => React.ReactNode; submitVariant?: ButtonVariant; multipart?: boolean;
  onSaved?: (s: FormState<unknown>) => void; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [round, setRound] = useState(0);
  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} className={triggerClassName} onClick={() => { setRound((r) => r + 1); setOpen(true); }}>{trigger}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        <Body key={round} action={action} hidden={hidden} submitLabel={submitLabel} pendingText={pendingText} submitVariant={submitVariant} multipart={multipart}
          onCancel={() => setOpen(false)} onDone={(s) => { setOpen(false); onSaved?.(s); }}>
          {children}
        </Body>
      </Dialog>
    </>
  );
}

/** A form on the page. After saving it starts empty again, unless keep is set. */
export function ActionForm({ action, submitLabel, pendingText, hidden, children, keep, submitVariant, multipart, onSaved }: {
  action: Action; submitLabel: string; pendingText?: string; hidden?: Record<string, string>; children: (f: FormHelpers) => React.ReactNode; keep?: boolean;
  submitVariant?: ButtonVariant; multipart?: boolean; onSaved?: (s: FormState<unknown>) => void;
}) {
  const [round, setRound] = useState(0);
  return (
    <Body key={round} action={action} hidden={hidden} submitLabel={submitLabel} pendingText={pendingText} submitVariant={submitVariant} multipart={multipart}
      onDone={(s) => { onSaved?.(s); if (!keep) setRound((r) => r + 1); }}>
      {children}
    </Body>
  );
}

/** A one-button action (no fields) that reports its problem in place. */
export function ActionButton({ action, hidden, children, variant = "secondary", size = "sm", pendingText }: {
  action: Action; hidden: Record<string, string>; children: React.ReactNode; variant?: ButtonVariant; size?: ButtonSize; pendingText?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} size={size} pendingText={pendingText}>{children}</SubmitButton>
      {state && !state.ok && state.message && <span role="alert" className="max-w-xs text-right text-sm text-danger">{state.message}</span>}
    </form>
  );
}
