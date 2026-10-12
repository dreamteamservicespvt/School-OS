"use client";

// Forms for Admission screens, in the approved design's sheet (dialog on a
// computer, bottom sheet on a phone). Each form is bound to a server action,
// keeps typed values and shows each problem next to its field (P3, P7).

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Check, CircleAlert } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
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
  return { state, pending, err: (k) => state?.errors?.[k], val: (k, fallback) => state?.values?.[k] ?? fallback ?? undefined };
}

export function FormProblem({ state }: { state: FormState<unknown> }) {
  if (!state?.message || state.ok) return null;
  const link = (state.data as { link?: { href: string; label: string } } | undefined)?.link;
  if (state.errors && Object.keys(state.errors).length > 1) return <ErrorSummary errors={state.errors} />;
  return (
    <div role="alert" className="rounded-xl bg-bad/10 px-3.5 py-3 text-[14px] text-bad flex items-start gap-2">
      <CircleAlert size={17} className="shrink-0 mt-0.5" aria-hidden="true" />
      <p className="flex-1">{state.message}{link && <> <Link href={link.href} className="font-semibold underline">{link.label}</Link></>}</p>
    </div>
  );
}

/** The form's main button: shows it is working and cannot be pressed twice. */
export function Submit({ children, busyLabel = "Saving…", variant = "primary", icon = Check, className, disabled }: { children: React.ReactNode; busyLabel?: string; variant?: ButtonVariant; icon?: LucideIcon | null; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} icon={icon ?? undefined} loading={pending} loadingText={busyLabel} disabled={disabled} className={className}>{children}</Button>;
}

function Body({ action, hidden, submitLabel, busyLabel, onDone, onCancel, children, submitVariant, submitIcon }: {
  action: Action; hidden?: Record<string, string>; submitLabel: string; busyLabel?: string; onDone: (s: FormState<unknown>) => void; onCancel?: () => void;
  children: (f: FormHelpers) => React.ReactNode; submitVariant?: ButtonVariant; submitIcon?: LucideIcon | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const done = useRef(false);
  useEffect(() => {
    if (state?.ok && !done.current) { done.current = true; onDone(state); }
  }, [state, onDone]);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <FormProblem state={state} />
      {children(helpers(state, pending))}
      <div className="flex gap-2 justify-end pt-1">
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>}
        <Submit variant={submitVariant} busyLabel={busyLabel} icon={submitIcon === undefined ? Check : submitIcon}>{submitLabel}</Submit>
      </div>
    </form>
  );
}

/** A form in a sheet, opened by its parent. */
export function FormSheet({ open, onClose, title, sub, wide, action, hidden, submitLabel, busyLabel, submitVariant, submitIcon, onSaved, children }: {
  open: boolean; onClose: () => void; title: string; sub?: React.ReactNode; wide?: boolean; action: Action; hidden?: Record<string, string>; submitLabel: string; busyLabel?: string;
  submitVariant?: ButtonVariant; submitIcon?: LucideIcon | null; onSaved?: (s: FormState<unknown>) => void; children: (f: FormHelpers) => React.ReactNode;
}) {
  const [round, setRound] = useState(0);
  const wasOpen = useRef(open);
  useEffect(() => { if (open && !wasOpen.current) setRound((r) => r + 1); wasOpen.current = open; }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title} sub={sub} wide={wide}>
      <Body key={round} action={action} hidden={hidden} submitLabel={submitLabel} busyLabel={busyLabel} submitVariant={submitVariant} submitIcon={submitIcon}
        onCancel={onClose} onDone={(s) => { onClose(); onSaved?.(s); }}>
        {children}
      </Body>
    </Dialog>
  );
}

/** A button that opens a short form in a sheet; the sheet closes when it saves. */
export function FormDialog({ trigger, triggerVariant = "secondary", triggerSize = "md", triggerIcon, triggerClassName = "", ...rest }: {
  trigger: React.ReactNode; triggerVariant?: ButtonVariant; triggerSize?: ButtonSize; triggerIcon?: LucideIcon; triggerClassName?: string;
} & Omit<React.ComponentProps<typeof FormSheet>, "open" | "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} icon={triggerIcon} className={triggerClassName} onClick={() => setOpen(true)}>{trigger}</Button>
      <FormSheet open={open} onClose={() => setOpen(false)} {...rest} />
    </>
  );
}

/** A form on the page (not in a sheet). After saving it starts empty again, unless keep is set. */
export function ActionForm({ action, submitLabel, busyLabel, hidden, children, keep, submitVariant, onSaved }: {
  action: Action; submitLabel: string; busyLabel?: string; hidden?: Record<string, string>; children: (f: FormHelpers) => React.ReactNode; keep?: boolean;
  submitVariant?: ButtonVariant; onSaved?: (s: FormState<unknown>) => void;
}) {
  const [round, setRound] = useState(0);
  return (
    <Body key={round} action={action} hidden={hidden} submitLabel={submitLabel} busyLabel={busyLabel} submitVariant={submitVariant}
      onDone={(s) => { onSaved?.(s); if (!keep) setRound((r) => r + 1); }}>
      {children}
    </Body>
  );
}

/** A one-button action (no fields) that reports its problem in place. */
export function ActionButton({ action, hidden, children, variant = "secondary", size = "sm", icon, busyLabel, className }: {
  action: Action; hidden: Record<string, string>; children: React.ReactNode; variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; busyLabel?: string; className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "inline-flex flex-col items-start gap-1"}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitInline variant={variant} size={size} icon={icon} busyLabel={busyLabel}>{children}</SubmitInline>
      {state && !state.ok && state.message && <span role="alert" className="max-w-xs text-[12.5px] text-bad">{state.message}</span>}
    </form>
  );
}

function SubmitInline({ children, variant, size, icon, busyLabel }: { children: React.ReactNode; variant: ButtonVariant; size: ButtonSize; icon?: LucideIcon; busyLabel?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} size={size} icon={icon} loading={pending} loadingText={busyLabel} className="w-full">{children}</Button>;
}
