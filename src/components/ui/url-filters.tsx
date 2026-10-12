"use client";

// Search box and filters at the top of a list card (design/ui-prototype/src/kit.jsx SearchBox, Select,
// Segmented), kept in the page address so a filtered list can be shared or bookmarked (P2).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Spinner } from "./button";
import { cx } from "./cx";
import { inputCls } from "./field";

function useUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };
  return { sp, go, pending };
}

export function UrlSearch({ placeholder, param = "q", className, label }: { placeholder: string; param?: string; className?: string; label?: string }) {
  const { sp, go, pending } = useUrl();
  const [q, setQ] = useState(sp.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className={cx("relative flex-1 min-w-0", className)}>
      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
      <input type="search" value={q} placeholder={placeholder} aria-label={label ?? placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => go({ [param]: v.trim() || null }), 300);
        }}
        className={cx(inputCls(false), "h-11 pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden")} />
      {pending ? <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        : q && <button type="button" onClick={() => { setQ(""); go({ [param]: null }); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label="Clear search"><X size={16} aria-hidden="true" /></button>}
    </div>
  );
}

export function UrlSelect({ param, options, label, className }: { param: string; options: { value: string; label: string }[]; label: string; className?: string }) {
  const { sp, go } = useUrl();
  return (
    <div className={cx("relative", className)}>
      <select aria-label={label} value={sp.get(param) ?? options[0]?.value ?? ""} onChange={(e) => go({ [param]: e.target.value === options[0]?.value ? null : e.target.value })}
        className={cx(inputCls(false), "h-11 appearance-none pr-10 cursor-pointer")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

/** Segmented choice kept in the page address. The first option is the default (no parameter). */
export function UrlSegmented({ param, options, label, className, size = "md" }: { param: string; options: { value: string; label: React.ReactNode }[]; label: string; className?: string; size?: "sm" | "md" }) {
  const { sp, go } = useUrl();
  const value = sp.get(param) ?? options[0]?.value;
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex p-1 rounded-xl bg-sunken gap-1 max-w-full overflow-x-auto no-scrollbar shrink-0", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => go({ [param]: i === 0 ? null : o.value })}
            className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition whitespace-nowrap flex-1",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-[13px]",
              on ? "bg-surface text-ink shadow-card" : "text-ink2 hover:text-ink")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small filter buttons in a row, like "Type: All, Query, Complaint". */
export function UrlChips({ param, options, label }: { param: string; options: { value: string; label: string }[]; label: string }) {
  const { sp, go } = useUrl();
  const value = sp.get(param) ?? options[0]?.value;
  return (
    <>
      <span className="text-[12.5px] text-ink3 font-semibold mr-1">{label}</span>
      {options.map((o, i) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => go({ [param]: i === 0 ? null : o.value })}
          className={cx("h-8 px-3 rounded-lg text-[13px] font-semibold transition", o.value === value ? "bg-ink text-bg" : "text-ink2 hover:bg-sunken")}>{o.label}</button>
      ))}
    </>
  );
}
