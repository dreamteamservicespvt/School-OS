"use client";

// Choosers that live in the page address, so a view can be shared or bookmarked (P2).

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";

function useParam() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    start(() => router.push(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };
  return { sp, set, pending, pathname };
}

/** A select that sets one value in the page address. */
export function ParamSelect({ name, label, options, current, clear, placeholder, className = "" }: { name: string; label: string; options: { value: string; label: string; group?: string }[]; current: string; clear?: string[]; placeholder?: string; className?: string }) {
  const { set, pending } = useParam();
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2">
        <select value={current} onChange={(e) => set({ [name]: e.target.value || null, ...Object.fromEntries((clear ?? []).map((k) => [k, null])) })}
          className="h-11 min-w-48 max-w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px]">
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {groups.length > 1
            ? groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => (o.group ?? "") === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)
            : options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {pending && <Spinner className="size-4 text-ink-2" />}
      </span>
    </label>
  );
}

export function ClassPicker({ classes, current, view }: { classes: { id: string; name: string }[]; current: string; view?: string }) {
  void view;
  return <ParamSelect name="class" label="Class" current={current} options={classes.map((c) => ({ value: c.id, label: c.name }))} />;
}

/** Date chooser in the page address. */
export function DateParam({ name = "date", label = "Date", current }: { name?: string; label?: string; current: string }) {
  const { set, pending } = useParam();
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2">
        <DateInput value={current} onChange={(e) => e.target.value && set({ [name]: e.target.value })} className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px]" />
        {pending && <Spinner className="size-4 text-ink-2" />}
      </span>
    </label>
  );
}

/** A row of views on one page (Subject list, By class...), kept in ?view=. */
export function ViewSwitch({ views, current, param = "view", keep = [] }: { views: { value: string; label: string }[]; current: string; param?: string; keep?: string[] }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const href = (value: string) => {
    const next = new URLSearchParams();
    for (const k of ["year", ...keep]) { const x = sp.get(k); if (x) next.set(k, x); }
    if (value !== views[0].value) next.set(param, value);
    return next.toString() ? `${pathname}?${next}` : pathname;
  };
  return (
    <div role="tablist" aria-label="Views" className="no-print mb-4 flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {views.map((v) => (
        <Link key={v.value} role="tab" aria-selected={v.value === current} href={href(v.value)} scroll={false}
          className={`flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 text-[15px] ${v.value === current ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}>
          {v.label}
        </Link>
      ))}
    </div>
  );
}
