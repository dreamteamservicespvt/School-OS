"use client";

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cx } from "./cx";

// Small shared controls of the approved design (design/ui-prototype/src/ui.jsx).

export type SegOption = string | { value: string; label: React.ReactNode; icon?: LucideIcon };

export function Segmented({ value, onChange, options, className, size = "md", label }: { value: string; onChange: (v: string) => void; options: readonly SegOption[]; className?: string; size?: "sm" | "md"; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex p-1 rounded-xl bg-sunken gap-1", className)}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        const Ic = typeof o === "string" ? undefined : o.icon;
        const on = v === value;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition whitespace-nowrap flex-1",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-[13px]",
              on ? "bg-surface text-ink shadow-card" : "text-ink2 hover:text-ink")}>
            {Ic && <Ic size={15} aria-hidden="true" />}{l}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ on, onChange, label, id, name, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; id?: string; name?: string; disabled?: boolean }) {
  return (
    <>
      <button type="button" role="switch" aria-checked={on} aria-label={label} id={id} disabled={disabled} onClick={() => onChange(!on)}
        className={cx("relative w-11 h-6 rounded-full transition shrink-0 disabled:opacity-50", on ? "bg-brand" : "bg-line")}>
        <span className={cx("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
      </button>
      {name && <input type="hidden" name={name} value={on ? "on" : ""} />}
    </>
  );
}

export function Checkbox({ checked, onChange, label, id, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; indeterminate?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={indeterminate ? "mixed" : checked} aria-label={label} id={id}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cx("w-5 h-5 rounded-md border-2 grid place-items-center transition shrink-0",
        checked || indeterminate ? "bg-brand border-brand text-brandink" : "border-line bg-surface hover:border-ink3")}>
      {indeterminate ? <span className="w-2.5 h-0.5 bg-current rounded" /> : checked && <Check size={13} strokeWidth={3.5} aria-hidden="true" />}
    </button>
  );
}
