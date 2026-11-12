"use client";

// Form fields (00-global.md P3, P7, P16) in the approved design: a label, one line
// of help, and the error next to the field in plain words. Required fields carry a star.
// Inside <FormProblems> (./form-problems.tsx) a field also shows the message found when
// Save or Next is pressed, and drops a message as soon as it holds a good value.

import { useId } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert } from "lucide-react";
import { cx } from "./cx";
import { KeepSelect } from "./keep-select";
import { PICKER_TYPES, PickerInput, type PickerProps } from "./date-input";
import { ProblemInView } from "./problem-in-view";
import { useFieldProblem } from "./form-problems";
import { inputCls } from "./input-style";
import { tx } from "@/lib/i18n/tx";
import { OptionList, Words } from "@/lib/i18n/client";

/** The shared look of a text box, select or text area (./input-style.ts). */
export { inputCls };

type FieldShell = { label: string; name: string; help?: React.ReactNode; error?: string; required?: boolean; className?: string };

export function FieldShell({ label, id, help, error, required, className = "", children, name }: Omit<FieldShell, "name"> & { id: string; children: React.ReactNode; name?: string }) {
  return (
    <div data-field={name} className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink2">
        {tx(label)}
        {required && <span className="text-bad" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[12.5px] text-bad flex items-center gap-1.5"><CircleAlert size={14} aria-hidden="true" className="shrink-0" />{tx(error)}</p>
      ) : help ? (
        <p id={`${id}-help`} className="text-[12.5px] text-ink3">{tx(help)}</p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, help?: React.ReactNode) {
  return error ? `${id}-error` : help ? `${id}-help` : undefined;
}

export function TextField({ label, name, help, error: given, required, className, ...rest }: FieldShell & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = `${useId()}-${name}`;
  const error = useFieldProblem(name, given);
  const { type, ...box } = rest;
  return (
    <FieldShell label={label} id={id} name={name} help={help} error={error} required={required} className={className}>
      {type && PICKER_TYPES.has(type) ? (
        // Dates and times use the shared picker; a date of birth opens on the years.
        <PickerInput type={type as "date" | "time" | "datetime-local"} id={id} name={name} required={required}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)} shownError={error}
          className={cx(inputCls(error), "h-11")} {...box as PickerProps}
          pickYearFirst={/birth/i.test(`${label} ${name}`)} weekdayHint={!/birth/i.test(`${label} ${name}`)} />
      ) : (
        <input id={id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
          className={cx(inputCls(error), "h-11")} {...rest} />
      )}
    </FieldShell>
  );
}

export function TextArea({ label, name, help, error: given, required, className, rows = 3, ...rest }: FieldShell & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const id = `${useId()}-${name}`;
  const error = useFieldProblem(name, given);
  return (
    <FieldShell label={label} id={id} name={name} help={help} error={error} required={required} className={className}>
      <textarea id={id} name={name} rows={rows} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={cx(inputCls(error), "py-2.5")} {...rest} />
    </FieldShell>
  );
}

export type Option = { value: string; label: string; /** Shown but cannot be chosen (say why in the label). */ disabled?: boolean };

export function SelectField({ label, name, help, error: given, required, className, options, placeholder, ...rest }: FieldShell & { options: readonly Option[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const id = `${useId()}-${name}`;
  const error = useFieldProblem(name, given);
  return (
    <FieldShell label={label} id={id} name={name} help={help} error={error} required={required} className={className}>
      <KeepSelect id={id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={cx(inputCls(error), "h-11 pr-9")} {...rest}>
        <OptionList options={options} placeholder={placeholder} />
      </KeepSelect>
    </FieldShell>
  );
}

export function CheckboxField({ label, name, help, className = "", ...rest }: { label: React.ReactNode; name: string; help?: React.ReactNode; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type">) {
  const id = `${useId()}-${name}`;
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <input id={id} type="checkbox" name={name} className="mt-0.5 size-5 shrink-0 rounded-md accent-brand" aria-describedby={help ? `${id}-help` : undefined} {...rest} />
      <div>
        <label htmlFor={id} className="text-[14.5px] font-semibold">{tx(label)}</label>
        {help && <p id={`${id}-help`} className="text-[13px] text-ink3">{tx(help)}</p>}
      </div>
    </div>
  );
}

/** One error summary at the top when there are several (P7). It brings itself into view when a save is refused. */
export function ErrorSummary({ errors }: { errors?: Record<string, string> }) {
  // While a new save is on its way the list is out of date (layman test LA2).
  const { pending } = useFormStatus();
  const list = Object.values(errors ?? {});
  if (list.length < 2 || pending) return null;
  return (
    <ProblemInView token={errors}>
      {/* data-error-summary: the form's own "Please fix 2 things" line is not shown again (./form-message.tsx). */}
      <div role="alert" data-error-summary="" className="rounded-xl bg-bad/10 p-3.5 text-sm text-bad">
        <p className="font-semibold flex items-center gap-2"><CircleAlert size={16} aria-hidden="true" /><Words k="Please fix {n} things before saving:" vars={{ n: list.length }} /></p>
        <ul className="mt-1 list-disc pl-10">{list.map((e) => <li key={e}>{tx(e)}</li>)}</ul>
      </div>
    </ProblemInView>
  );
}
