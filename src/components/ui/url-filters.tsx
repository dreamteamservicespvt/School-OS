"use client";

// Search box, filter selects and segmented choices that live in the page address,
// so a filtered list can be shared or bookmarked (00-global.md P2).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Download, Search, X } from "lucide-react";
import { Segmented, type SegOption } from "./controls";
import { Spinner } from "./button";
import { cx } from "./cx";
import { inputCls } from "./field";

function useGo() {
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
  return { go, sp, pending };
}

/** The search box at the top of a list card. */
export function UrlSearch({ placeholder, param = "q", className, label }: { placeholder: string; param?: string; className?: string; label?: string }) {
  const { go, sp, pending } = useGo();
  const [q, setQ] = useState(sp.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className={cx("relative flex-1 min-w-0", className)} role="search">
      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
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

/** A filter select; the first option is "all" (allLabel, or an option with an empty value in `options`). */
export function UrlSelect({ param, label, allLabel, options, className, value: fixed }: { param: string; label: string; allLabel?: string; options: { value: string; label: string }[]; className?: string; value?: string }) {
  const { go, sp } = useGo();
  return (
    <div className={cx("relative", className)}>
      <select aria-label={label} value={fixed ?? sp.get(param) ?? ""} onChange={(e) => go({ [param]: e.target.value || null })}
        className={cx(inputCls(false), "h-11 appearance-none pr-10 cursor-pointer")}>
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

/** Segmented choice kept in the page address. The first option is the default (no value in the address). */
export function UrlSegmented({ param, options, label, className, size, value: current }: { param: string; options: SegOption[]; label: string; className?: string; size?: "sm" | "md"; value?: string }) {
  const { go, sp } = useGo();
  const first = typeof options[0] === "string" ? options[0] : options[0].value;
  const value = current ?? sp.get(param) ?? first;
  return <Segmented label={label} className={className} size={size} value={value} options={options} onChange={(v) => go({ [param]: v === first ? null : v })} />;
}

/** Export menu (P8): Excel, CSV or PDF of what the list shows. */
export function ExportMenu({ href, className }: { href: string; className?: string }) {
  const join = href.includes("?") ? "&" : "?";
  return (
    <details className={cx("relative hidden md:block", className)}>
      <summary className="list-none inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold bg-surface text-ink border border-line hover:bg-sunken cursor-pointer [&::-webkit-details-marker]:hidden">
        <Download size={17} aria-hidden="true" />Export
      </summary>
      <div className="absolute right-0 top-11 z-40 w-48 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
        {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([f, l]) => (
          <a key={f} href={`${href}${join}format=${f}`} download className="flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken text-[14px]">{l}</a>
        ))}
      </div>
    </details>
  );
}

/** Small filter buttons in a row, like "Type: All, Query, Complaint". The first option is the default. */
export function UrlChips({ param, options, label }: { param: string; options: { value: string; label: string }[]; label: string }) {
  const { sp, go } = useGo();
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
