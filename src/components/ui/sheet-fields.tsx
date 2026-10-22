"use client";

// Fields for a SheetForm: each shows its own problem in plain words and keeps
// what was typed when a check fails (P7).

import { useState } from "react";
import { FieldShell, inputCls, SelectField, TextArea, TextField, type Option } from "./field";
import { Switch } from "./controls";
import { useTyped } from "./url-sheet";
import { cx } from "./cx";
import { tx } from "@/lib/i18n/tx";

type Base = { name: string; label: string; help?: React.ReactNode; required?: boolean; className?: string; start?: string | number | null };

export function SText({ name, label, help, required, className, start, ...rest }: Base & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  const t = useTyped(name, start);
  return <TextField key={t.key} name={name} label={label} help={help} required={required} className={className} error={t.error} defaultValue={t.value} {...rest} />;
}

export function SArea({ name, label, help, required, className, start, rows = 2, ...rest }: Base & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "defaultValue">) {
  const t = useTyped(name, start);
  return <TextArea key={t.key} name={name} label={label} help={help} required={required} className={className} rows={rows} error={t.error} defaultValue={t.value} {...rest} />;
}

export function SSelect({ name, label, help, required, className, start, options, placeholder, ...rest }: Base & { options: readonly Option[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name" | "defaultValue">) {
  const t = useTyped(name, start);
  return <SelectField key={t.key} name={name} label={label} help={help} required={required} className={className} options={options} placeholder={placeholder} error={t.error} defaultValue={t.value} {...rest} />;
}

export function SDate({ name, label, help, required, className, start, ...rest }: Base & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue" | "type">) {
  const t = useTyped(name, start);
  return <TextField key={t.key} type="date" name={name} label={label} help={help} required={required} className={className} error={t.error} defaultValue={t.value} {...rest} />;
}

/** An amount in rupees with the ₹ sign inside the box. */
export function SMoney({ name, label, help, required, className, start, big, onValue, ...rest }: Base & { big?: boolean; onValue?: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  const t = useTyped(name, start);
  const id = `money-${name}`;
  return (
    <FieldShell label={label} id={id} help={help} error={t.error} required={required} className={className}>
      <div className="relative">
        <span className={cx("absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-ink3", big ? "text-[22px] left-4" : "text-[15px]")} aria-hidden="true">₹</span>
        <input key={t.key} id={id} name={name} inputMode="decimal" autoComplete="off" defaultValue={t.value} aria-invalid={t.error ? true : undefined}
          aria-describedby={t.error ? `${id}-error` : help ? `${id}-help` : undefined} onChange={onValue ? (e) => onValue(e.target.value) : undefined}
          className={cx(inputCls(t.error), big ? "h-14 pl-10 text-[24px] font-semibold tnum font-display" : "h-11 pl-8 tnum")} {...rest} />
      </div>
    </FieldShell>
  );
}

/** A switch with its words, sent as "on" when on. */
export function SSwitch({ name, title, sub, start = false }: { name: string; title: string; sub?: React.ReactNode; start?: boolean }) {
  const t = useTyped(name, start ? "on" : "");
  const [on, setOn] = useState(t.value === "on");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block">{tx(title)}</b>
        {sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{tx(sub)}</span>}
      </div>
      <Switch on={on} onChange={setOn} label={title} name={name} />
    </div>
  );
}

/** Choice chips (several may be on), sent as repeated values of one name. */
export function SChips({ name, label, options, start = [], required, help }: { name: string; label: string; options: readonly Option[]; start?: string[]; required?: boolean; help?: React.ReactNode }) {
  const t = useTyped(name, null);
  const [on, setOn] = useState<Set<string>>(new Set(start));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[13px] font-semibold text-ink2 mb-1.5">{tx(label)}{required && <span className="text-bad" aria-hidden="true"> *</span>}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const sel = on.has(o.value);
          return (
            <button key={o.value} type="button" aria-pressed={sel} onClick={() => setOn((x) => { const n = new Set(x); if (n.has(o.value)) n.delete(o.value); else n.add(o.value); return n; })}
              className={cx("h-9 px-3 rounded-xl border text-[13.5px] font-semibold transition", sel ? "bg-brand/10 border-brand text-brand" : "border-line text-ink2 hover:border-ink3/50")}>
              {tx(o.label)}
            </button>
          );
        })}
      </div>
      {[...on].map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      {t.error ? <p className="text-[12.5px] text-bad">{tx(t.error)}</p> : help ? <p className="text-[12.5px] text-ink3">{tx(help)}</p> : null}
    </fieldset>
  );
}
