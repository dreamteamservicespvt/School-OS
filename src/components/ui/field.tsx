// Form fields (00-global.md P3, P7, P16) in the approved design: a label, one line
// of help, and the error next to the field in plain words. Required fields carry a star.

import { useId } from "react";
import { CircleAlert } from "lucide-react";
import { cx } from "./cx";
import { KeepSelect } from "./keep-select";
import { ProblemInView } from "./problem-in-view";

/** The shared look of a text box, select or text area. */
export const inputCls = (error?: unknown) => cx(
  "w-full rounded-xl bg-surface border px-3.5 text-[15px] text-ink placeholder:text-ink3 outline-none transition disabled:bg-sunken disabled:text-ink3",
  error ? "border-bad ring-4 ring-bad/10" : "border-line hover:border-ink3/50 focus:border-brand focus:ring-4 focus:ring-brand/15",
);

type FieldShell = { label: string; name: string; help?: React.ReactNode; error?: string; required?: boolean; className?: string };

export function FieldShell({ label, id, help, error, required, className = "", children }: Omit<FieldShell, "name"> & { id: string; children: React.ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink2">
        {label}
        {required && <span className="text-bad" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[12.5px] text-bad flex items-center gap-1.5"><CircleAlert size={14} aria-hidden="true" className="shrink-0" />{error}</p>
      ) : help ? (
        <p id={`${id}-help`} className="text-[12.5px] text-ink3">{help}</p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, help?: React.ReactNode) {
  return error ? `${id}-error` : help ? `${id}-help` : undefined;
}

export function TextField({ label, name, help, error, required, className, ...rest }: FieldShell & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = `${useId()}-${name}`;
  return (
    <FieldShell label={label} id={id} help={help} error={error} required={required} className={className}>
      <input id={id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={cx(inputCls(error), "h-11")} {...rest} />
    </FieldShell>
  );
}

export function TextArea({ label, name, help, error, required, className, rows = 3, ...rest }: FieldShell & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const id = `${useId()}-${name}`;
  return (
    <FieldShell label={label} id={id} help={help} error={error} required={required} className={className}>
      <textarea id={id} name={name} rows={rows} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={cx(inputCls(error), "py-2.5")} {...rest} />
    </FieldShell>
  );
}

export type Option = { value: string; label: string };

export function SelectField({ label, name, help, error, required, className, options, placeholder, ...rest }: FieldShell & { options: readonly Option[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const id = `${useId()}-${name}`;
  return (
    <FieldShell label={label} id={id} help={help} error={error} required={required} className={className}>
      <KeepSelect id={id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={cx(inputCls(error), "h-11 pr-9")} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        <label htmlFor={id} className="text-[14.5px] font-semibold">{label}</label>
        {help && <p id={`${id}-help`} className="text-[13px] text-ink3">{help}</p>}
      </div>
    </div>
  );
}

/** One error summary at the top when there are several (P7). It brings itself into view when a save is refused. */
export function ErrorSummary({ errors }: { errors?: Record<string, string> }) {
  const list = Object.values(errors ?? {});
  if (list.length < 2) return null;
  return (
    <ProblemInView token={errors}>
      <div role="alert" className="rounded-xl bg-bad/10 p-3.5 text-sm text-bad">
        <p className="font-semibold flex items-center gap-2"><CircleAlert size={16} aria-hidden="true" />Please fix {list.length} things before saving:</p>
        <ul className="mt-1 list-disc pl-10">{list.map((e) => <li key={e}>{e}</li>)}</ul>
      </div>
    </ProblemInView>
  );
}
