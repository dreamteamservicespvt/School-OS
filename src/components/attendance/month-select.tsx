"use client";

// The month control of every attendance and leave calendar (approved
// CalendarMonth): Earlier month, a month list newest first, Later month.
// The month lives in the page address (?month=2026-08) so the view can be
// shared; the page loads that month's real data from the database.

import { useId, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";

const NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const idx = (m: string) => { const [y, mo] = m.split("-").map(Number); return y * 12 + (mo - 1); };
const key = (k: number) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;

/** Months from max back to min, newest first: [{ value: "2026-10", label: "October 2026" }]. */
export function monthOptions(min: string, max: string) {
  const out: { value: string; label: string }[] = [];
  for (let k = idx(max); k >= idx(min); k--) out.push({ value: key(k), label: `${NAMES[k % 12]} ${Math.floor(k / 12)}` });
  return out;
}

export function MonthSelect({ value, min, max, param = "month", keep, className }: {
  value: string; min: string; max: string; param?: string;
  /** Other params to drop when the month changes (for example a selected day). */
  keep?: (name: string) => boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const id = useId();
  const [pending, start] = useTransition();
  const k = idx(value);
  const canBack = k > idx(min), canNext = k < idx(max);
  const go = (month: string) => {
    const next = new URLSearchParams();
    sp.forEach((v, n) => { if (n !== param && (!keep || keep(n))) next.set(n, v); });
    next.set(param, month);
    start(() => router.push(`${pathname}?${next}`, { scroll: false }));
  };
  return (
    <div className={cx("flex items-center gap-2", className)} aria-busy={pending}>
      <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="Earlier month" disabled={!canBack || pending} onClick={() => go(key(k - 1))} className="!px-2.5" />
      <div className="relative flex-1 min-w-0">
        <label htmlFor={id} className="sr-only"><Words k="Month" /></label>
        <select id={id} value={value} onChange={(e) => go(e.target.value)} disabled={pending}
          className="appearance-none w-full h-9 pl-3 pr-8 rounded-xl bg-sunken/70 hover:bg-sunken text-[14px] font-semibold text-center outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-brand/40">
          {monthOptions(min, max).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {pending
          ? <Spinner size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink3" />
          : <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />}
      </div>
      <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="Later month" disabled={!canNext || pending} onClick={() => go(key(k + 1))} className="!px-2.5" />
    </div>
  );
}
