"use client";

// Form fields (00-global.md P3, P7, P16) in the approved design: a label, one line
// of help, and the error next to the field in plain words. Required fields carry a star.
// Inside <FormProblems> (./form-problems.tsx) a field also shows the message found when
// Save or Next is pressed, and drops a message as soon as it holds a good value.

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert } from "lucide-react";
import { cx } from "./cx";
import { KeepSelect } from "./keep-select";
import { PICKER_TYPES, PickerInput, type PickerProps } from "./date-input";
import { ProblemInView } from "./problem-in-view";
import { useFieldProblem } from "./form-problems";
import { inputCls } from "./input-style";
import { tx } from "@/lib/i18n/tx";
import { OptionList, Words, useT } from "@/lib/i18n/client";

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
  const t = useT();
  // The hint inside the box in the screen's language too (layman loop 3: "First and last name" stayed English).
  if (typeof rest.placeholder === "string") rest.placeholder = t.any(rest.placeholder);
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
  const t = useT();
  if (typeof rest.placeholder === "string") rest.placeholder = t.any(rest.placeholder);
  return (
    <FieldShell label={label} id={id} name={name} help={help} error={error} required={required} className={className}>
      <textarea id={id} name={name} rows={rows} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={cx(inputCls(error), "py-2.5")} {...rest} />
    </FieldShell>
  );
}

export type Option = { value: string; label: string; /** Shown but cannot be chosen (say why in the label). */ disabled?: boolean };

/** Lists longer than this get a "Type to find" box above them. */
const LONG_LIST = 12;
/** Every typed word is in the label, ignoring case, dots and extra spaces ("ram k" finds "Ram Kumar"). */
export function matchesFind(label: string, words: string): boolean {
  const l = label.toLowerCase().replace(/\./g, " ");
  return words.replace(/\./g, " ").split(/\s+/).filter(Boolean).every((w) => l.includes(w));
}

export function SelectField({ label, name, help, error: given, required, className, options, placeholder, ...rest }: FieldShell & { options: readonly Option[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const id = `${useId()}-${name}`;
  const error = useFieldProblem(name, given);
  const t = useT();
  // A long list (staff, books, items) gets a box to type a few letters in: on a phone a 40-name wheel
  // is slow to scroll (layman loop 2: "staff type-to-search picker"). The chosen one always stays in the list.
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState(String(rest.value ?? rest.defaultValue ?? ""));
  const long = options.length > LONG_LIST && !rest.multiple;
  const chosen = rest.value !== undefined ? String(rest.value) : picked;
  const words = find.trim().toLowerCase();
  const shown = long && words ? options.filter((o) => o.value === chosen || matchesFind(o.label, words) || matchesFind(t.any(o.label), words)) : options;
  // Owner, 15 Nov: a list with one choice is not a choice (opened, it looked broken). When the field is not driven by
  // the page (no value/onChange) and has no "Choose…" line, the one choice shows as plain text and is still sent.
  const only = !placeholder && rest.value === undefined && rest.onChange === undefined && options.length === 1 && !options[0].disabled ? options[0] : null;
  if (only) {
    return (
      <FieldShell label={label} id={id} name={name} help={help} error={error} required={required} className={className}>
        <input type="hidden" name={name} value={only.value} />
        <p id={id} className="h-11 flex items-center rounded-xl bg-sunken/60 px-3.5 text-[14.5px] font-medium text-ink" aria-describedby={describedBy(id, error, help)}>{tx(only.label)}</p>
      </FieldShell>
    );
  }
  return (
    <FieldShell label={label} id={id} name={name} help={help} error={error} required={required} className={className}>
      {long && (
        <input type="search" value={find} onChange={(e) => setFind(e.target.value)} autoComplete="off" enterKeyHint="done"
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder={t("Type to find")} aria-label={`${t("Type to find")}: ${t.any(label)}`}
          className="mb-1.5 h-10 w-full rounded-xl border border-line bg-surface px-3 text-[14.5px] placeholder:text-ink3" />
      )}
      <KeepSelect id={id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={cx(inputCls(error), "h-11 pr-9")} {...rest}
        onChange={long ? (e) => { setPicked(e.target.value); rest.onChange?.(e); } : rest.onChange}>
        <OptionList options={shown} placeholder={placeholder} />
      </KeepSelect>
      {long && words && shown.every((o) => o.value === chosen) && (
        <p className="mt-1 text-[13px] text-ink3">{t("No match. Clear the box to see all.")}</p>
      )}
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
