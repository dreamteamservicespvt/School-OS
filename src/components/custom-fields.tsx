"use client";

// Shows a record's custom fields (or a custom form's fields) inside any form.
// Inputs are named "cf_<key>"; read them on the server with
// readCustomFieldForm() and validateCustomValues() from src/lib/custom-fields.ts.
// Fields with a "show only when" rule appear and disappear as the person
// answers, and each field is checked when the person leaves it (P3, P7).

import { useId, useMemo, useState } from "react";
import { type CustomFieldDef, type CustomValues, checkOne, isFieldShown, valueAsText } from "@/lib/custom-field-rules";
import { KeepCheck, KeepSelect } from "@/components/ui/keep-select";

const control = "w-full rounded-lg border bg-surface px-3 text-base text-ink placeholder:text-ink-2/70";

type Props = {
  fields: CustomFieldDef[];
  /** Saved values, or what the person typed before a failed save (strings by "cf_<key>" or by key). */
  values?: CustomValues | Record<string, string>;
  errors?: Record<string, string>;
  /** Links to open files already uploaded, by field key. */
  fileLinks?: Record<string, string>;
  disabled?: boolean;
};

function initial(fields: CustomFieldDef[], values: Props["values"]) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = (values as Record<string, unknown> | undefined)?.[`cf_${f.key}`] ?? (values as Record<string, unknown> | undefined)?.[f.key];
    out[f.key] = typeof v === "string" ? v : valueAsText(v as never);
  }
  return out;
}

export function CustomFieldInputs({ fields, values, errors = {}, fileLinks = {}, disabled }: Props) {
  const live = useMemo(() => fields.filter((f) => !f.archived), [fields]);
  const [typed, setTyped] = useState<Record<string, string>>(() => initial(live, values));
  const [local, setLocal] = useState<Record<string, string>>({});
  const baseId = useId();

  if (live.length === 0) return null;

  const set = (key: string, v: string) => setTyped((t) => ({ ...t, [key]: v }));
  const check = (f: CustomFieldDef) => {
    const v = typed[f.key] ?? "";
    const r = checkOne(f, v);
    let msg = "error" in r ? r.error : "";
    if (!msg && f.required && v.trim() === "" && f.fieldType !== "file") msg = f.fieldType === "choice" || f.fieldType === "yesno" ? `Choose ${f.label}.` : `${f.label} is needed.`;
    setLocal((l) => ({ ...l, [f.key]: msg }));
  };

  return (
    <div className="space-y-4">
      {live.map((f) => {
        if (!isFieldShown(f, typed, live)) return null;
        const id = `${baseId}-${f.key}`;
        const name = `cf_${f.key}`;
        const error = local[f.key] || (local[f.key] === undefined ? errors[name] : "") || "";
        const help = f.help ?? null;
        const described = error ? `${id}-error` : help ? `${id}-help` : undefined;
        const border = error ? "border-danger" : "border-line-strong";
        const label = (
          <>
            {f.label}
            {f.required && <span className="text-danger" aria-hidden="true"> *</span>}
          </>
        );
        let input: React.ReactNode;
        if (f.fieldType === "yesno") {
          input = (
            <fieldset aria-describedby={described} className="flex flex-wrap gap-2">
              <legend className="mb-1 block text-sm font-medium">{label}</legend>
              {(["yes", "no"] as const).map((v) => (
                <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 ${typed[f.key] === v ? "border-brand bg-brand-soft text-brand-text" : "border-line-strong"}`}>
                  <KeepCheck type="radio" name={name} value={v} checked={typed[f.key] === v} disabled={disabled} required={f.required}
                    onChange={() => { set(f.key, v); setLocal((l) => ({ ...l, [f.key]: "" })); }} className="size-4 accent-brand" />
                  {v === "yes" ? "Yes" : "No"}
                </label>
              ))}
            </fieldset>
          );
        } else {
          const common = {
            id, name, disabled, "aria-invalid": error ? true : undefined, "aria-describedby": described,
            onBlur: () => check(f),
          };
          if (f.fieldType === "choice") {
            input = (
              <KeepSelect {...common} value={typed[f.key] ?? ""} required={f.required} onChange={(e) => { set(f.key, e.target.value); setLocal((l) => ({ ...l, [f.key]: "" })); }} className={`${control} h-11 ${border}`}>
                <option value="">Choose</option>
                {f.choices.map((c) => <option key={c} value={c}>{c}</option>)}
              </KeepSelect>
            );
          } else if (f.fieldType === "file") {
            input = (
              <>
                {fileLinks[f.key] && (
                  <p className="mb-1 text-sm">
                    <a href={fileLinks[f.key]} target="_blank" rel="noreferrer" className="font-medium text-brand-text underline">Open the file already uploaded</a>
                    <span className="text-ink-2"> · choose a new one to replace it</span>
                  </p>
                )}
                <input {...common} type="file" accept="image/jpeg,image/png,application/pdf" required={f.required && !fileLinks[f.key]}
                  onChange={(e) => set(f.key, e.target.files?.[0]?.name ?? "")}
                  className={`${control} py-2 ${border} file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5`} />
              </>
            );
          } else {
            input = (
              <input {...common} type={f.fieldType === "date" ? "date" : "text"} inputMode={f.fieldType === "number" ? "decimal" : undefined}
                value={typed[f.key] ?? ""} required={f.required} maxLength={f.fieldType === "text" ? 500 : undefined}
                onChange={(e) => set(f.key, e.target.value)} className={`${control} h-11 ${border}`} />
            );
          }
        }
        return (
          <div key={f.key}>
            {f.fieldType !== "yesno" && (
              <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
            )}
            {input}
            {error ? <p id={`${id}-error`} className="mt-1 text-sm text-danger">{error}</p>
              : help ? <p id={`${id}-help`} className="mt-1 text-sm text-ink-2">{help}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Read-only view of a record's custom field answers, for profile pages. */
export function CustomFieldValues({ fields, values, fileLinks = {} }: { fields: CustomFieldDef[]; values: CustomValues; fileLinks?: Record<string, string> }) {
  const shown = fields.filter((f) => !f.archived && isFieldShown(f, values, fields));
  if (shown.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {shown.map((f) => {
        const v = values[f.key];
        let text: React.ReactNode = <span className="text-ink-2">Not added</span>;
        if (v !== undefined && v !== null && v !== "") {
          if (typeof v === "boolean") text = v ? "Yes" : "No";
          else if (typeof v === "object") text = fileLinks[f.key] ? <a className="text-brand-text underline" href={fileLinks[f.key]} target="_blank" rel="noreferrer">{v.name}</a> : v.name;
          else if (f.fieldType === "date" && typeof v === "string") text = v.split("-").reverse().join("-");
          else text = String(v);
        }
        return (
          <div key={f.key}>
            <dt className="text-sm text-ink-2">{f.label}</dt>
            <dd className="font-medium break-words">{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}
