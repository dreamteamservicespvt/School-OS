"use client";

// List controls that keep their value in the page address (P2), in the approved
// look (design/ui-prototype/src/kit.jsx SearchBox, Select, Segmented, Sheet).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { buttonClass, Spinner } from "./button";
import { Segmented, type SegOption } from "./controls";
import { Dialog } from "./dialog";
import { cx } from "./cx";
import { inputCls } from "./field";

function useUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const go = (change: Record<string, string | null>, opts: { keepPage?: boolean } = {}) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k); }
    if (!opts.keepPage) next.delete("page");
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };
  return { sp, go, pending };
}

export function UrlSearch({ param = "q", placeholder, label, className, id }: { param?: string; placeholder: string; label?: string; className?: string; id?: string }) {
  const { sp, go, pending } = useUrl();
  const [q, setQ] = useState(sp.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const change = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ [param]: v.trim() || null }), 300);
  };
  return (
    <div className={cx("relative flex-1 min-w-0", className)}>
      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
      <input id={id} type="search" value={q} onChange={(e) => change(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder}
        className={cx(inputCls(false), "h-11 pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden")} />
      {pending ? <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3" />
        : q && <button type="button" onClick={() => change("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label="Clear search"><X size={16} aria-hidden="true" /></button>}
    </div>
  );
}

export function UrlSelect({ param, options, label, className, value: fallback = "" }: { param: string; options: { value: string; label: string }[]; label: string; className?: string; value?: string }) {
  const { sp, go } = useUrl();
  return (
    <div className={cx("relative", className)}>
      <select aria-label={label} value={sp.get(param) ?? fallback} onChange={(e) => go({ [param]: e.target.value === fallback ? null : e.target.value || null })}
        className={cx(inputCls(false), "h-11 appearance-none pr-10 cursor-pointer")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

export function UrlSegmented({ param, options, value, label, className, size, fallback }: { param: string; options: readonly SegOption[]; value: string; label: string; className?: string; size?: "sm" | "md"; fallback?: string }) {
  const { go } = useUrl();
  return <Segmented label={label} value={value} onChange={(v) => go({ [param]: v === fallback ? null : v })} options={options} className={className} size={size} />;
}

/** A sheet that is open while the page address has the param; closing removes it. */
export function UrlSheet({ param = "open", title, sub, children, footer, wide }: { param?: string | string[]; title: string; sub?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const { go } = useUrl();
  const [open, setOpen] = useState(true);
  const keys = Array.isArray(param) ? param : [param];
  return (
    <Dialog open={open} wide={wide} title={title} sub={sub} footer={footer}
      onClose={() => { setOpen(false); go(Object.fromEntries(keys.map((k) => [k, null])), { keepPage: true }); }}>
      {children}
    </Dialog>
  );
}

/** Closes the nearest UrlSheet from inside it (e.g. a Close button). */
export function useCloseUrlSheet(param: string | string[] = "open") {
  const { go } = useUrl();
  const keys = Array.isArray(param) ? param : [param];
  return () => go(Object.fromEntries(keys.map((k) => [k, null])), { keepPage: true });
}

/** A "Close" button for a UrlSheet's footer. */
export function CloseSheetButton({ param = "open", label = "Close", variant = "secondary" }: { param?: string | string[]; label?: string; variant?: "secondary" | "ghost" }) {
  const close = useCloseUrlSheet(param);
  return <button type="button" onClick={close} className={buttonClass(variant, "md")}>{label}</button>;
}
