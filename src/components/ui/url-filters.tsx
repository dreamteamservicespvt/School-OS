"use client";

// Search boxes, selects and segmented choices that keep their value in the page
// address (?q=, ?status=...), so a filtered list can be refreshed, shared and
// exported with the same filters. The server reads the address and filters.

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import { inputCls } from "./field";
import { Segmented, type SegOption } from "./controls";
import { Spinner } from "./button";
import { cx } from "./cx";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const s = next.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };
  return { set, pending, params };
}

/** A search box that filters the list as you type. */
export function UrlSearch({ param = "q", placeholder, id, className, big, autoFocus, label = "Search" }: { param?: string; placeholder: string; id: string; className?: string; big?: boolean; autoFocus?: boolean; label?: string }) {
  const { set, pending, params } = useSetParam();
  const [value, setValue] = useState(params.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const change = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ [param]: v.trim() || null }), 250);
  };
  return (
    <div className={cx("relative flex-1 min-w-0", className)} role="search">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search size={big ? 22 : 18} className={cx("absolute top-1/2 -translate-y-1/2 text-ink3", big ? "left-4" : "left-3.5")} aria-hidden="true" />
      <input id={id} type="search" value={value} onChange={(e) => change(e.target.value)} placeholder={placeholder} autoComplete="off" autoFocus={autoFocus}
        className={big
          ? "w-full h-14 rounded-2xl bg-surface border border-line pl-12 pr-12 text-[16px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 shadow-card placeholder:text-ink3 [&::-webkit-search-cancel-button]:hidden"
          : cx(inputCls(false), "h-11 pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden")} />
      {pending ? <Spinner className={cx("absolute top-1/2 -translate-y-1/2 size-4 text-ink3", big ? "right-5" : "right-3.5")} />
        : value && (
          <button type="button" onClick={() => change("")} aria-label="Clear search"
            className={cx("absolute top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken", big ? "right-3" : "right-2")}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
    </div>
  );
}

export type UrlOption = { value: string; label: string };

/** A filter select. The first option is usually "All ..." with the value "all". */
export function UrlSelect({ param, options, id, className, label }: { param: string; options: readonly UrlOption[]; id: string; className?: string; label: string }) {
  const { set, params } = useSetParam();
  const value = params.get(param) ?? options[0]?.value ?? "";
  return (
    <div className={cx("relative", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} value={value} onChange={(e) => set({ [param]: e.target.value })} className={cx(inputCls(false), "h-11 appearance-none pr-10 cursor-pointer")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

/** A segmented choice kept in the address. */
export function UrlSegmented({ param, options, fallback, className, size, label }: { param: string; options: readonly SegOption[]; fallback: string; className?: string; size?: "sm" | "md"; label: string }) {
  const { set, params } = useSetParam();
  const value = params.get(param) ?? fallback;
  return <Segmented value={value} onChange={(v) => set({ [param]: v === fallback ? null : v })} options={options} className={className} size={size} label={label} />;
}

/** A date range kept in the address as ?from=YYYY-MM-DD&to=YYYY-MM-DD. */
export function UrlDates({ from, to, className }: { from: string; to: string; className?: string }) {
  const { set } = useSetParam();
  return (
    <div className={cx("grid grid-cols-2 gap-2.5", className)}>
      <label className="relative">
        <span className="sr-only">From</span>
        <input type="date" defaultValue={from} onChange={(e) => e.target.value && set({ from: e.target.value })} className={cx(inputCls(false), "tnum")} aria-label="From" />
      </label>
      <label className="relative">
        <span className="sr-only">To</span>
        <input type="date" defaultValue={to} onChange={(e) => e.target.value && set({ to: e.target.value })} className={cx(inputCls(false), "tnum")} aria-label="To" />
      </label>
    </div>
  );
}
