"use client";

// The parts of the approved design kit (design/ui-prototype/src/kit.jsx) that
// need browser code: a search box and selects that live in the page address
// (P2), the "..." menu, and the bar shown when rows are chosen (P11).

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, Ellipsis, FileSpreadsheet, FileText, Search, Sheet, X } from "lucide-react";
import { Button, Spinner } from "./button";
import { inputCls } from "./field";
import { cx } from "./cx";
import { useT } from "@/lib/i18n/client";

function useAddress() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (change: Record<string, string | null>, drop: string[] = []) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k); }
    for (const k of ["page", ...drop]) next.delete(k);
    const s = next.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };
  return { sp, go, pending };
}

/** A search box kept in the page address as `name` (default "q"). */
export function UrlSearch({ placeholder, name = "q", className, label }: { placeholder: string; name?: string; className?: string; label?: string }) {
  const tr = useT();
  const { sp, go, pending } = useAddress();
  const [value, setValue] = useState(sp.get(name) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const change = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ [name]: v.trim() || null }), 300);
  };
  return (
    <div className={cx("relative flex-1 min-w-0", className)}>
      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => change(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder}
        className={cx(inputCls(false), "h-11 pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden")} />
      {pending ? <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        : value && <button type="button" onClick={() => change("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label={tr.any("Clear search")}><X size={16} aria-hidden="true" /></button>}
    </div>
  );
}

export type UrlOption = { value: string; label: string };

/** A select kept in the page address. The empty value removes it. `reset` lists other keys cleared on change. */
export function UrlSelect({ name, options, label, className, value: forced, reset = [] }: { name: string; options: UrlOption[]; label: string; className?: string; value?: string; reset?: string[] }) {
  const { sp, go, pending } = useAddress();
  const value = forced ?? sp.get(name) ?? "";
  return (
    <div className={cx("relative", className)}>
      <select aria-label={label} value={value} onChange={(e) => go({ [name]: e.target.value || null }, reset)}
        className={cx(inputCls(false), "h-11 appearance-none pr-10 cursor-pointer")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {pending ? <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        : <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />}
    </div>
  );
}

/** The "..." menu on a record. Put MenuLink or MenuItem parts inside. */
export function MoreMenu({ children, label = "More actions", size = "md", align = "right" }: { children: React.ReactNode; label?: string; size?: "sm" | "md"; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" size={size} icon={Ellipsis} aria-label={label} title={label} aria-expanded={open} aria-haspopup="menu"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="!px-3 relative z-[1]" />
      {open && (
        <div role="menu" onClick={() => setOpen(false)}
          className={cx("absolute top-11 z-40 w-60 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise", align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      )}
    </div>
  );
}

const itemCls = (tone?: "bad") => cx("w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken text-[14px] text-left", tone === "bad" && "text-bad");

export function MenuLink({ href, icon, children, tone, external }: { href: string; icon?: React.ReactNode; children: React.ReactNode; tone?: "bad"; external?: boolean }) {
  const body = <><span className={cx("shrink-0", tone !== "bad" && "text-ink3")} aria-hidden="true">{icon}</span>{children}</>;
  return external
    ? <a role="menuitem" href={href} className={itemCls(tone)} target="_blank" rel="noopener">{body}</a>
    : <Link role="menuitem" href={href} className={itemCls(tone)}>{body}</Link>;
}

export function MenuItem({ onSelect, icon, children, tone, disabled }: { onSelect: () => void; icon?: React.ReactNode; children: React.ReactNode; tone?: "bad"; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} className={cx(itemCls(tone), "disabled:opacity-50")}>
      <span className={cx("shrink-0", tone !== "bad" && "text-ink3")} aria-hidden="true">{icon}</span>{children}
    </button>
  );
}

/**
 * The bar shown when rows are chosen with DataList's tick boxes (P11). The
 * chosen values go to `onRun` as a list; it returns a message when it failed.
 */
export function SelectBar({ form, children }: { form: string; children: (ids: string[], clear: () => void) => React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"]`)];
    const visible = () => rows().filter((i) => i.offsetParent !== null && !i.disabled);
    const recount = () => {
      setIds([...new Set(rows().filter((i) => i.checked).map((i) => i.value))]);
      document.querySelectorAll<HTMLInputElement>("input[data-bulk-all]").forEach((all) => {
        const v = visible();
        all.checked = v.length > 0 && v.every((i) => i.checked);
        all.indeterminate = !all.checked && v.some((i) => i.checked);
      });
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("input[data-bulk-all]")) visible().forEach((i) => { i.checked = t.checked; });
      if (t.matches(`input[data-bulk-row][form="${form}"]`)) rows().filter((i) => i.value === t.value).forEach((i) => { i.checked = t.checked; });
      recount();
    };
    document.addEventListener("change", onChange);
    recount();
    return () => document.removeEventListener("change", onChange);
  }, [form]);
  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row][form="${form}"], input[data-bulk-all]`).forEach((i) => { i.checked = false; i.indeterminate = false; });
    setIds([]);
  };
  return (
    <form id={form} onSubmit={(e) => e.preventDefault()}>
      {ids.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-brand/8 border-b border-brand/20 animate-fade flex-wrap" role="status">
          <p className="text-[13.5px] font-semibold text-brand mr-2">{ids.length} selected</p>
          {children(ids, clear)}
          <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
        </div>
      )}
    </form>
  );
}

/** "Export": Excel, CSV or PDF of the list with the filters on screen (P8). `href` is the export address without a format. */
export function ExportMenu({ href, className, label = "Export" }: { href: string; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const join = href.includes("?") ? "&" : "?";
  return (
    <div ref={ref} className={cx("relative shrink-0", className)}>
      <Button variant="secondary" icon={Download} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} className="w-full">{label}</Button>
      {open && (
        <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 top-11 z-40 w-56 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
          <a role="menuitem" download href={`${href}${join}format=xlsx`} className={itemCls()}><FileSpreadsheet size={17} className="text-ink3" aria-hidden="true" />Excel</a>
          <a role="menuitem" download href={`${href}${join}format=csv`} className={itemCls()}><Sheet size={17} className="text-ink3" aria-hidden="true" />CSV</a>
          <a role="menuitem" download href={`${href}${join}format=pdf`} className={itemCls()}><FileText size={17} className="text-ink3" aria-hidden="true" />PDF</a>
        </div>
      )}
    </div>
  );
}
