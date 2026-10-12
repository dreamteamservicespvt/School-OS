"use client";

// Search, filters, the date filter and "Reset" for a list, in the approved
// design (kit.jsx SearchBox, Select, Chips). Everything lives in the page
// address, so a filtered list can be shared or bookmarked (P2).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import * as I from "lucide-react";
import { cx } from "@/components/ui/cx";
import { inputCls } from "@/components/ui/field";
import { PeriodFilter, type PeriodFilterProps } from "./period-filter";

export type FilterDef = { key: string; label: string; options: { value: string; label: string }[]; /** Words for the empty choice; default "{label}: all". */ allLabel?: string };

/** A date filter on the list; the page reads it with periodRange(). */
export type PeriodDef = Omit<PeriodFilterProps, "className" | "size">;

export function ListToolbar({ placeholder = "Search", filters = [], more = [], showArchived = true, period, children }: {
  placeholder?: string; filters?: FilterDef[]; /** Less used filters, behind "More filters". */ more?: FilterDef[]; showArchived?: boolean;
  period?: PeriodDef; children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  const [moreOpen, setMoreOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const all = [...filters, ...more];
  const active = all.filter((f) => sp.get(f.key));
  const moreOn = more.filter((f) => sp.get(f.key)).length;
  const select = (f: FilterDef) => (
    <label key={f.key} className="relative min-w-0 md:w-auto">
      <span className="sr-only">{f.label}</span>
      <select value={sp.get(f.key) ?? ""} onChange={(e) => go({ [f.key]: e.target.value || null })}
        className={cx(inputCls(), "h-11 appearance-none pr-10 cursor-pointer font-medium", sp.get(f.key) && "border-brand/40 bg-brand/5")}>
        <option value="">{f.allLabel ?? `${f.label}: all`}</option>
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <I.ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
    </label>
  );
  const datesOn = Boolean(sp.get("period") || sp.get("from") || sp.get("to"));
  const anything = active.length > 0 || sp.get("q") || sp.get("archived") || (datesOn && period?.fallback == null && period);

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-2.5">
        <div className="relative min-w-0 flex-1 md:basis-64">
          <I.Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <input type="search" value={q} placeholder={placeholder} aria-label={placeholder}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => go({ q: v.trim() || null }), 300);
            }}
            className={cx(inputCls(), "h-11 pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden")} />
          {pending ? <I.LoaderCircle size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-ink3" aria-label="Loading" />
            : q && (
              <button type="button" onClick={() => { setQ(""); go({ q: null }); }} aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken"><I.X size={16} aria-hidden="true" /></button>
            )}
        </div>
        <div className={cx("grid gap-2.5 md:flex md:flex-wrap md:items-center", (filters.length + (period ? 1 : 0)) > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {period && <PeriodFilter {...period} className={cx("w-full md:w-auto", filters.length % 2 === 0 && "col-span-2 md:col-span-1")} />}
          {filters.map(select)}
        </div>
        {(more.length > 0 || showArchived || children) && (
          <div className="flex flex-wrap items-center gap-2.5">
            {more.length > 0 && (
              <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
                className={cx("h-11 inline-flex items-center gap-2 rounded-xl border px-3.5 text-[14.5px] font-semibold transition",
                  moreOn ? "border-brand/40 bg-brand/5 text-ink" : "border-line bg-surface text-ink2 hover:border-ink3/50")}>
                <I.SlidersHorizontal size={16} aria-hidden="true" />More filters{moreOn ? <span className="tnum text-brand">{moreOn}</span> : null}
              </button>
            )}
            {showArchived && (
              <label className="h-11 inline-flex items-center gap-2 rounded-xl px-2 text-[14px] font-medium text-ink2 cursor-pointer">
                <input type="checkbox" className="size-[18px] accent-brand" checked={sp.get("archived") === "1"} onChange={(e) => go({ archived: e.target.checked ? "1" : null })} />
                Show archived
              </label>
            )}
            {children}
          </div>
        )}
      </div>
      {moreOpen && more.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2.5 rounded-2xl border border-line bg-sunken/50 p-3 animate-rise">
          {more.map(select)}
        </div>
      )}
      {anything && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {sp.get("q") && <Chip label={`“${sp.get("q")}”`} onRemove={() => { setQ(""); go({ q: null }); }} />}
          {active.map((f) => (
            <Chip key={f.key} label={`${f.label}: ${f.options.find((o) => o.value === sp.get(f.key))?.label ?? sp.get(f.key)}`} onRemove={() => go({ [f.key]: null })} />
          ))}
          {sp.get("archived") && <Chip label="Showing archived" onRemove={() => go({ archived: null })} />}
          <button type="button" className="h-8 rounded-lg px-2 font-semibold text-brand hover:underline"
            onClick={() => { setQ(""); start(() => router.replace(pathname, { scroll: false })); }}>Reset all</button>
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 h-8 rounded-full bg-brand/10 pl-3 pr-1 font-semibold text-brand">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid size-6 place-items-center rounded-full hover:bg-brand/15"><I.X size={13} aria-hidden="true" /></button>
    </span>
  );
}
