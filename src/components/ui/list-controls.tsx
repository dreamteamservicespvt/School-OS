"use client";

// Browser parts of a list in the approved design: the search box that keeps the
// search in the page address (P2), a select filter that does the same, and the
// bar of bulk actions that shows inside the list card once rows are ticked (P11).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cx } from "./cx";
import { inputCls } from "./field";
import { buttonClass, Spinner } from "./button";

function useUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (change: Record<string, string | null>, keep: string[] = []) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k); }
    for (const k of ["page", "n"]) if (!keep.includes(k) && !(k in change)) next.delete(k);
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };
  return { sp, go, pending };
}

/** The list's search box (kit.jsx SearchBox); what is typed goes into ?q= after a short pause. */
export function UrlSearch({ placeholder, id, param = "q", className }: { placeholder: string; id: string; param?: string; className?: string }) {
  const { sp, go, pending } = useUrl();
  const [q, setQ] = useState(sp.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = (v: string, now = false) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (now) go({ [param]: v.trim() || null });
    else timer.current = setTimeout(() => go({ [param]: v.trim() || null }), 300);
  };
  return (
    <div className={cx("relative flex-1 min-w-0", className)} role="search">
      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input id={id} type="search" value={q} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); set(q, true); } }}
        placeholder={placeholder} autoComplete="off" className={cx(inputCls(false), "h-11 pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none")} />
      {pending ? <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-ink3" />
        : q && <button type="button" onClick={() => set("", true)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label="Clear search"><X size={16} aria-hidden="true" /></button>}
    </div>
  );
}

/** A select that filters the list through the page address (kit.jsx Select). */
export function UrlSelect({ param, label, options, allLabel, className, id }: { param: string; label: string; options: { value: string; label: string }[]; allLabel: string; className?: string; id: string }) {
  const { sp, go } = useUrl();
  return (
    <div className={cx("relative", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} value={sp.get(param) ?? ""} onChange={(e) => go({ [param]: e.target.value || null })}
        className={cx(inputCls(false), "h-11 appearance-none pr-10 cursor-pointer")}>
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none"><path d="m6 9 6 6 6-6" /></svg>
    </div>
  );
}

/** A tick box that switches a filter on or off in the page address, e.g. "Archived". */
export function UrlToggle({ param, label, value = "1" }: { param: string; label: string; value?: string }) {
  const { sp, go } = useUrl();
  const on = sp.get(param) === value;
  return (
    <label className="inline-flex h-11 items-center gap-2 rounded-xl px-2 text-[14px] text-ink2 font-medium cursor-pointer whitespace-nowrap">
      <input type="checkbox" checked={on} onChange={(e) => go({ [param]: e.target.checked ? value : null })} className="size-5 accent-[rgb(var(--brand))]" />
      {label}
    </label>
  );
}

export type BulkAction = { label: string; href: string; icon?: React.ReactNode; /** A file (PDF, CSV): opened directly. */ file?: boolean; variant?: "primary" | "secondary" };

/**
 * The bulk bar inside a list card (kit.jsx BulkBar): "3 selected", the actions and Clear.
 * The rows' tick boxes carry form={form}; each action opens its own page with ?ids=,
 * where the change is previewed and confirmed. Nothing changes from this bar alone.
 */
export function InlineBulkBar({ form, actions }: { form: string; actions: BulkAction[] }) {
  const [count, setCount] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"]`)];
    const visible = () => rows().filter((i) => i.offsetParent !== null);
    const recount = () => {
      setCount(new Set(rows().filter((i) => i.checked).map((i) => i.value)).size);
      const v = visible();
      document.querySelectorAll<HTMLInputElement>("input[data-bulk-all]").forEach((all) => {
        all.checked = v.length > 0 && v.every((i) => i.checked);
        all.indeterminate = !all.checked && v.some((i) => i.checked);
      });
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("input[data-bulk-all]")) visible().forEach((i) => { i.checked = t.checked; rows().filter((x) => x.value === i.value).forEach((x) => { x.checked = t.checked; }); });
      if (t.matches(`input[data-bulk-row][form="${form}"]`)) rows().filter((i) => i.value === t.value).forEach((i) => { i.checked = t.checked; });
      recount();
    };
    document.addEventListener("change", onChange);
    recount();
    return () => document.removeEventListener("change", onChange);
  }, [form]);
  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"], input[data-bulk-all]`).forEach((i) => { i.checked = false; i.indeterminate = false; });
    setCount(0);
  };
  return (
    <form id={form} method="get" aria-hidden={count ? undefined : true}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const target = submitter?.dataset.href;
        if (!target) return;
        const ids = [...new Set([...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"]:checked`)].map((i) => i.value))];
        const url = `${target}${target.includes("?") ? "&" : "?"}ids=${ids.join(",")}`;
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if (submitter?.dataset.file) window.location.assign(url); else router.push(url);
      }}
      className={count ? "flex items-center gap-2 px-4 py-2.5 bg-brand/8 border-b border-brand/20 animate-fade flex-wrap" : "hidden"}>
      <p className="text-[13.5px] font-semibold text-brand mr-2" aria-live="polite">{count} selected</p>
      {actions.map((a) => (
        <button key={a.label} type="submit" data-href={a.href} data-file={a.file ? "1" : undefined} className={buttonClass(a.variant ?? "secondary", "sm")}>{a.icon}{a.label}</button>
      ))}
      <button type="button" onClick={clear} className={buttonClass("ghost", "sm")}>Clear</button>
    </form>
  );
}
