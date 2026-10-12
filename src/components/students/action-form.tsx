"use client";

// A form that runs a server action and shows the result in place (P7, P15):
// the message at the top, each problem next to its field, and what the person
// typed kept when a check fails. Fields inside read the result through context,
// so a page written on the server can lay out its own fields.

import { createContext, useActionState, useContext, useEffect, useRef } from "react";
import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, ErrorSummary, SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ButtonVariant } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const Ctx = createContext<FormState>(null);
const useFormResult = () => useContext(Ctx);

export function ActionForm({ action, children, submitLabel, pendingText, submitVariant = "primary", className = "space-y-4", footer, resetOnSuccess, id }: {
  action: Action;
  children: React.ReactNode;
  /** The main button's words; leave out to place your own SubmitButton. */
  submitLabel?: string;
  pendingText?: string;
  submitVariant?: ButtonVariant;
  className?: string;
  /** Shown next to the main button (for example a Cancel link). */
  footer?: React.ReactNode;
  resetOnSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state && !state.ok) ref.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [state, resetOnSuccess]);
  return (
    <Ctx.Provider value={state}>
      <form ref={ref} id={id} action={formAction} className={className} noValidate={false}>
        <FormMessage state={state} />
        <ErrorSummary errors={state?.errors} />
        {children}
        {(submitLabel || footer) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {submitLabel && <SubmitButton pendingText={pendingText} variant={submitVariant}>{submitLabel}</SubmitButton>}
            {footer}
          </div>
        )}
      </form>
    </Ctx.Provider>
  );
}

/** What the person typed last time (when a check failed), or the starting value. */
function useValue(name: string, defaultValue?: string | number | null) {
  const state = useFormResult();
  const typed = state && !state.ok ? state.values?.[name] : undefined;
  return { value: typed ?? (defaultValue == null ? "" : String(defaultValue)), error: state?.errors?.[name], key: state ? JSON.stringify(state.values?.[name] ?? "") + String(state.ok) : "first" };
}

type Common = { name: string; label: string; help?: React.ReactNode; required?: boolean; className?: string; defaultValue?: string | number | null };

export function FormText({ name, label, help, required, className, defaultValue, ...rest }: Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  const v = useValue(name, defaultValue);
  return <TextField key={v.key} name={name} label={label} help={help} required={required} className={className} error={v.error} defaultValue={v.value} {...rest} />;
}

export function FormArea({ name, label, help, required, className, defaultValue, ...rest }: Common & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "defaultValue">) {
  const v = useValue(name, defaultValue);
  return <TextArea key={v.key} name={name} label={label} help={help} required={required} className={className} error={v.error} defaultValue={v.value} {...rest} />;
}

export function FormSelect({ name, label, help, required, className, defaultValue, options, placeholder, ...rest }: Common & { options: readonly Option[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name" | "defaultValue">) {
  const v = useValue(name, defaultValue);
  return <SelectField key={v.key} name={name} label={label} help={help} required={required} className={className} error={v.error} defaultValue={v.value} options={options} placeholder={placeholder} {...rest} />;
}

export function FormCheck({ name, label, help, className, defaultChecked }: { name: string; label: React.ReactNode; help?: React.ReactNode; className?: string; defaultChecked?: boolean }) {
  const state = useFormResult();
  const checked = state && !state.ok && state.values ? state.values[name] === "on" : defaultChecked;
  const error = state?.errors?.[name];
  return (
    <div className={className}>
      <CheckboxField key={state ? String(checked) + String(state.ok) : "first"} name={name} label={label} help={help} defaultChecked={checked} />
      {error && <p className="mt-1 pl-8 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Radio choices shown as large tappable cards (phones first). */
export function FormChoice({ name, label, options, defaultValue, help, columns = 2 }: { name: string; label: string; options: { value: string; label: string; help?: string }[]; defaultValue?: string; help?: string; columns?: 2 | 3 | 5 }) {
  const v = useValue(name, defaultValue);
  const cols = columns === 5 ? "sm:grid-cols-5" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <fieldset key={v.key}>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className={`grid grid-cols-2 gap-2 ${cols}`}>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name={name} value={o.value} defaultChecked={v.value === o.value} className="mt-1 size-4 accent-brand" />
            <span><span className="font-medium">{o.label}</span>{o.help && <span className="block text-sm text-ink-2">{o.help}</span>}</span>
          </label>
        ))}
      </div>
      {v.error ? <p className="mt-1 text-sm text-danger">{v.error}</p> : help ? <p className="mt-1 text-sm text-ink-2">{help}</p> : null}
    </fieldset>
  );
}

/** A problem that is not tied to one field, shown where it belongs in the form. */
export function FormFieldError({ name }: { name: string }) {
  const state = useFormResult();
  const e = state?.errors?.[name];
  return e ? <p className="text-sm text-danger">{e}</p> : null;
}

/** Shows its children only after the form saved, for example a "Saved" link. */
export function WhenSaved({ children }: { children: React.ReactNode }) {
  const state = useFormResult();
  return state?.ok ? <>{children}</> : null;
}

/** After saving, a link the action sent back (for example a PDF to print), opened in a new tab. */
export function ResultLink({ label }: { label: string }) {
  const state = useFormResult();
  const href = state?.ok ? (state.data as { href?: string } | undefined)?.href : undefined;
  return href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-medium text-brand-text underline">{label}</a> : null;
}

export { useFormResult };
