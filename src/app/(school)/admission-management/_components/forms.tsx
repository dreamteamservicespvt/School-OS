"use client";

// Forms for Admission screens, in the approved design's sheet (dialog on a
// computer, bottom sheet on a phone). Each form is bound to a server action,
// keeps typed values and shows each problem next to its field (P3, P7).

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, CircleAlert } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ErrorSummary, FieldShell, inputCls } from "@/components/ui/field";
import { ProblemInView } from "@/components/ui/problem-in-view";
import { Segmented, type SegOption } from "@/components/ui/controls";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { KeepSelect } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

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
    <ProblemInView token={state}>
      <div role="alert" className="rounded-xl bg-bad/10 px-3.5 py-3 text-[14px] text-bad flex items-start gap-2">
        <CircleAlert size={17} className="shrink-0 mt-0.5" aria-hidden="true" />
        <p className="flex-1">{state.message}{link && <> <Link href={link.href} className="font-semibold underline">{link.label}</Link></>}</p>
      </div>
    </ProblemInView>
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
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={pending}><Words k="Cancel" /></Button>}
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

/** Segmented choice inside a form: the chosen value goes in with the form. */
export function SegField({ name, label, options, defaultValue, help, size, onChange, required }: { name: string; label: string; options: SegOption[]; defaultValue: string; help?: React.ReactNode; size?: "sm" | "md"; onChange?: (v: string) => void; required?: boolean }) {
  const [v, setV] = useState(defaultValue);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-semibold text-ink2">{label}{required && <span className="text-bad" aria-hidden="true"> *</span>}</p>
      <Segmented label={label} value={v} onChange={(x) => { setV(x); onChange?.(x); }} options={options} className="w-full" size={size} />
      <input type="hidden" name={name} value={v} />
      {help && <p className="text-[12.5px] text-ink3">{help}</p>}
    </div>
  );
}

/** Indian mobile number with +91 in front (design: PhoneInput). */
export function PhoneField({ name, label, defaultValue, error, help, required, onBlur, onValue }: { name: string; label: string; defaultValue?: string; error?: string; help?: React.ReactNode; required?: boolean; onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void; onValue?: (v: string) => void }) {
  const id = `${useId()}-${name}`;
  return (
    <FieldShell label={label} id={id} error={error} help={help} required={required}>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]" aria-hidden="true">+91</span>
        <input id={id} name={name} inputMode="numeric" autoComplete="tel-national" placeholder="98480 12345" defaultValue={defaultValue} onBlur={onBlur}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
          onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/[^\d ]/g, "").slice(0, 11); onValue?.(t.value); }}
          className={cx(inputCls(error), "h-11 pl-12 tnum")} />
      </div>
    </FieldShell>
  );
}

/** Extra fields folded away. The fields stay in the form when folded. */
export function MoreDetails({ label = "More details", defaultOpen = false, children }: { label?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3.5 h-11 text-[14px] font-semibold text-ink2 hover:text-ink">
        {label}<ChevronDown size={17} className={cx("transition", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div hidden={!open} className="px-3.5 pb-4 pt-3.5 flex flex-col gap-4 border-t border-line">{children}</div>
    </div>
  );
}

const TIMES = Array.from({ length: 24 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const m = i % 2 ? "30" : "00";
  return { value: `${String(h).padStart(2, "0")}:${m}`, label: `${h > 12 ? h - 12 : h}:${m} ${h >= 12 ? "PM" : "AM"}` };
});

/** A date and a time, sent together as "YYYY-MM-DDTHH:mm" in the school's time. */
export function WhenField({ name, label, defaultValue, error, required, timeLabel = "Time", min }: { name: string; label: string; defaultValue?: string; error?: string; required?: boolean; timeLabel?: string; min?: string }) {
  const [date, setDate] = useState(defaultValue?.slice(0, 10) ?? "");
  const [time, setTime] = useState(defaultValue?.slice(11, 16) || "11:00");
  const id = useId();
  const times = TIMES.some((t) => t.value === time) ? TIMES : [...TIMES, { value: time, label: time }].sort((a, b) => a.value.localeCompare(b.value));
  return (
    <div className="grid grid-cols-2 gap-3">
      <FieldShell label={label} id={`${id}-d`} error={error} required={required}>
        <input id={`${id}-d`} type="date" value={date} min={min} onChange={(e) => setDate(e.target.value)} aria-invalid={error ? true : undefined} className={cx(inputCls(error), "h-11 tnum")} />
      </FieldShell>
      <FieldShell label={timeLabel} id={`${id}-t`} required={required}>
        <KeepSelect id={`${id}-t`} value={time} onChange={(e) => setTime(e.target.value)} className={cx(inputCls(false), "h-11 pr-9")}>
          {times.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </KeepSelect>
      </FieldShell>
      <input type="hidden" name={name} value={date ? `${date}T${time}` : ""} />
    </div>
  );
}

/** A label-less heading inside a long form. */
export const SubHead = ({ children }: { children: React.ReactNode }) => <p className="eyebrow text-ink3 -mb-1 pt-1">{children}</p>;

function SubmitInline({ children, variant, size, icon, busyLabel }: { children: React.ReactNode; variant: ButtonVariant; size: ButtonSize; icon?: LucideIcon; busyLabel?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} size={size} icon={icon} loading={pending} loadingText={busyLabel} className="w-full">{children}</Button>;
}
