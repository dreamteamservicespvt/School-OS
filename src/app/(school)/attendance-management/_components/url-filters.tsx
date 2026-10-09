"use client";

// Filters that live in the page address (P2): choosing one updates the page
// at once, so a filtered view can be shared or bookmarked.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/button";

export type UrlField =
  | { name: string; label: string; type: "select"; value: string; options: { value: string; label: string }[]; allLabel?: string }
  | { name: string; label: string; type: "month" | "date"; value: string; min?: string; max?: string };

export function UrlFilters({ fields, reset = [], children }: { fields: UrlField[]; /** Params cleared when any filter changes (like page). */ reset?: string[]; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (name: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    for (const r of reset) if (r !== name) next.delete(r);
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {fields.map((f) => (
        <label key={f.name} className="block min-w-0 flex-1 basis-40 sm:flex-none">
          <span className="mb-1 block text-sm font-medium">{f.label}</span>
          {f.type === "select" ? (
            <select value={f.value} onChange={(e) => go(f.name, e.target.value)}
              className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] sm:w-auto sm:min-w-44">
              {f.allLabel !== undefined && <option value="">{f.allLabel}</option>}
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input type={f.type} value={f.value} min={f.min} max={f.max} onChange={(e) => { if (e.target.value) go(f.name, e.target.value); }}
              className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] sm:w-44" />
          )}
        </label>
      ))}
      {pending && <Spinner className="mb-3.5 size-4 text-ink-2" />}
      {children}
    </div>
  );
}
