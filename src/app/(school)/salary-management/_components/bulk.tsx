"use client";

// Ticked rows and the bar of bulk actions above them (kit.jsx BulkBar). Each
// action opens a sheet by the page's address with the ticked ids, so the
// server checks them again; a download action opens a file with them.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, MessageCircle, Printer, TrendingUp, type LucideIcon } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

const ICONS = { revise: TrendingUp, whatsapp: MessageCircle, email: Mail, print: Printer } satisfies Record<string, LucideIcon>;
type Item = { label: string; icon: keyof typeof ICONS; set?: Record<string, string>; file?: string };

const rows = (group: string) => [...document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row="${group}"]`)];

/** The tick box on one row. */
export function RowTick({ group, id, label }: { group: string; id: string; label: string }) {
  return <input type="checkbox" data-bulk-row={group} value={id} aria-label={label} className="relative z-10 w-[18px] h-[18px] accent-[var(--color-brand)] cursor-pointer" />;
}

/** The tick box in the heading: ticks every row shown. */
export function AllTick({ group }: { group: string }) {
  return <input type="checkbox" data-bulk-all={group} aria-label="Tick every row" className="w-[18px] h-[18px] accent-[var(--color-brand)] cursor-pointer" />;
}

export function BulkBar({ group, items }: { group: string; items: Item[] }) {
  const sp = useSearchParams();
  const [ids, setIds] = useState<string[]>([]);
  const refresh = useCallback(() => {
    const r = rows(group);
    const on = [...new Set(r.filter((i) => i.checked).map((i) => i.value))];
    setIds(on);
    document.querySelectorAll<HTMLInputElement>(`input[data-bulk-all="${group}"]`).forEach((all) => {
      const shown = r.filter((i) => i.offsetParent !== null);
      all.checked = shown.length > 0 && shown.every((i) => i.checked);
      all.indeterminate = !all.checked && shown.some((i) => i.checked);
    });
  }, [group]);
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches?.(`input[data-bulk-all="${group}"]`)) rows(group).forEach((i) => { i.checked = t.checked; });
      else if (t.matches?.(`input[data-bulk-row="${group}"]`)) rows(group).filter((i) => i.value === t.value).forEach((i) => { i.checked = t.checked; });
      else return;
      refresh();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [group, refresh]);
  const clear = () => { document.querySelectorAll<HTMLInputElement>(`input[data-bulk-row="${group}"], input[data-bulk-all="${group}"]`).forEach((i) => { i.checked = false; i.indeterminate = false; }); setIds([]); };
  if (!ids.length) return null;
  const href = (set: Record<string, string>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(set)) n.set(k, v);
    n.set("ids", ids.join(","));
    return `?${n}`;
  };
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand/8 px-4 py-2.5 animate-fade">
      <p className="mr-2 text-[13.5px] font-semibold text-brand" aria-live="polite">{ids.length} selected</p>
      {items.map((it) => {
        const Ic = ICONS[it.icon];
        const inner = <><Ic size={15} aria-hidden="true" />{it.label}</>;
        return it.file
          ? <a key={it.label} href={`${it.file}${it.file.includes("?") ? "&" : "?"}ids=${ids.join(",")}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>{inner}</a>
          : <Link key={it.label} href={href(it.set ?? {})} scroll={false} className={buttonClass("secondary", "sm")}>{inner}</Link>;
      })}
      <button type="button" className={buttonClass("ghost", "sm")} onClick={clear}>Clear</button>
    </div>
  );
}
