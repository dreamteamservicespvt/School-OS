"use client";

// Search, quick filter chips and "Reset" for a list. Everything lives in the
// page address, so a filtered list can be shared or bookmarked (P2).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SearchIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/button";

export type FilterDef = { key: string; label: string; options: { value: string; label: string }[] };

export function ListToolbar({ placeholder = "Search", filters = [], showArchived = true, children }: {
  placeholder?: string; filters?: FilterDef[]; showArchived?: boolean; children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const active = filters.filter((f) => sp.get(f.key));
  const anything = active.length > 0 || sp.get("q") || sp.get("archived");

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <SearchIcon className="pointer-events-none absolute left-3 top-3 size-5 text-ink-2" />
          <input type="search" value={q} placeholder={placeholder} aria-label={placeholder}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => go({ q: v.trim() || null }), 300);
            }}
            className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-10 pr-10 text-base" />
          {pending && <Spinner className="absolute right-3 top-3.5 size-4 text-ink-2" />}
        </div>
        {filters.map((f) => (
          <label key={f.key}>
            <span className="sr-only">{f.label}</span>
            <select value={sp.get(f.key) ?? ""} onChange={(e) => go({ [f.key]: e.target.value || null })}
              className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px]">
              <option value="">{f.label}: all</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
        {showArchived && (
          <label className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px]">
            <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={sp.get("archived") === "1"} onChange={(e) => go({ archived: e.target.checked ? "1" : null })} />
            Archived
          </label>
        )}
        {children}
      </div>
      {anything && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {sp.get("q") && <Chip label={`“${sp.get("q")}”`} onRemove={() => { setQ(""); go({ q: null }); }} />}
          {active.map((f) => (
            <Chip key={f.key} label={`${f.label}: ${f.options.find((o) => o.value === sp.get(f.key))?.label ?? sp.get(f.key)}`} onRemove={() => go({ [f.key]: null })} />
          ))}
          {sp.get("archived") && <Chip label="Showing archived" onRemove={() => go({ archived: null })} />}
          <button type="button" className="min-h-9 rounded-lg px-2 font-medium text-brand-text hover:underline"
            onClick={() => { setQ(""); start(() => router.replace(pathname, { scroll: false })); }}>Reset</button>
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1 text-brand-text">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid size-7 place-items-center rounded-full hover:bg-surface">×</button>
    </span>
  );
}
