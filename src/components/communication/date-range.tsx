"use client";

// From and to dates for a list, kept in the page address (P2).
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";

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
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-[13px] font-semibold text-ink3">
        <span>From</span>
        <input type="date" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} className={cx(inputCls(false), "h-11 w-[9.5rem] px-2.5 text-[14px] tnum")} />
      </label>
      <label className="flex items-center gap-1.5 text-[13px] font-semibold text-ink3">
        <span>To</span>
        <input type="date" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} className={cx(inputCls(false), "h-11 w-[9.5rem] px-2.5 text-[14px] tnum")} />
      </label>
    </div>
  );
}
