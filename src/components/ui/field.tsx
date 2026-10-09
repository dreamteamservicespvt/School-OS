// Form fields (00-global.md P3, P7, P16): a label, one line of help, and the
// error next to the field in plain words. Required fields carry a star.

import { useId } from "react";

const control =
  "w-full rounded-lg border bg-surface px-3 text-base text-ink placeholder:text-ink-2/70 disabled:bg-surface-2 disabled:text-ink-2";

function borderFor(error?: string) {
  return error ? "border-danger" : "border-line-strong";
}

type FieldShell = { label: string; name: string; help?: React.ReactNode; error?: string; required?: boolean; className?: string };

function Shell({ label, id, help, error, required, className = "", children }: Omit<FieldShell, "name"> & { id: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="text-danger" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">{error}</p>
      ) : help ? (
        <p id={`${id}-help`} className="mt-1 text-sm text-ink-2">{help}</p>
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
    <Shell label={label} id={id} help={help} error={error} required={required} className={className}>
      <input id={id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={`${control} h-11 ${borderFor(error)}`} {...rest} />
    </Shell>
  );
}

export function TextArea({ label, name, help, error, required, className, rows = 3, ...rest }: FieldShell & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const id = `${useId()}-${name}`;
  return (
    <Shell label={label} id={id} help={help} error={error} required={required} className={className}>
      <textarea id={id} name={name} rows={rows} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={`${control} py-2 ${borderFor(error)}`} {...rest} />
    </Shell>
  );
}

export type Option = { value: string; label: string };

export function SelectField({ label, name, help, error, required, className, options, placeholder, ...rest }: FieldShell & { options: readonly Option[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const id = `${useId()}-${name}`;
  return (
    <Shell label={label} id={id} help={help} error={error} required={required} className={className}>
      <select id={id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, help)}
        className={`${control} h-11 ${borderFor(error)}`} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Shell>
  );
}

export function CheckboxField({ label, name, help, className = "", ...rest }: { label: React.ReactNode; name: string; help?: React.ReactNode; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type">) {
  const id = `${useId()}-${name}`;
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <input id={id} type="checkbox" name={name} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" aria-describedby={help ? `${id}-help` : undefined} {...rest} />
      <div>
        <label htmlFor={id} className="font-medium">{label}</label>
        {help && <p id={`${id}-help`} className="text-sm text-ink-2">{help}</p>}
      </div>
    </div>
  );
}

/** One error summary at the top when there are several (P7). */
export function ErrorSummary({ errors }: { errors?: Record<string, string> }) {
  const list = Object.values(errors ?? {});
  if (list.length < 2) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
      <p className="font-medium">Please fix {list.length} things before saving:</p>
      <ul className="mt-1 list-disc pl-5">{list.map((e) => <li key={e}>{e}</li>)}</ul>
    </div>
  );
}
