"use client";

// From and to dates for a list, kept in the page address (P2).
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function DateRange() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const set = (key: "from" | "to", v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(key, v); else next.delete(key);
    next.delete("page");
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-sm">
        <span className="text-ink-2">From</span>
        <input type="date" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} className="h-11 rounded-lg border border-line-strong bg-surface px-2 text-[15px]" />
      </label>
      <label className="flex items-center gap-1 text-sm">
        <span className="text-ink-2">To</span>
        <input type="date" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} className="h-11 rounded-lg border border-line-strong bg-surface px-2 text-[15px]" />
      </label>
    </div>
  );
}
