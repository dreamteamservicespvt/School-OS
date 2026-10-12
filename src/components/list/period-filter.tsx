"use client";

// The date filter for any list or report: quick periods (Today, Yesterday,
// Last 2, 3, 7 or 30 days, this or last week, month, quarter, year,
// financial year) or From and To dates. Kept in the page address (P2).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import * as I from "lucide-react";
import { cx } from "@/components/ui/cx";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { PERIODS, periodRange, type PeriodKey } from "@/lib/periods";

const QUICK: PeriodKey[] = ["today", "yesterday", "2d", "3d", "7d", "30d"];
const LONGER: PeriodKey[] = ["week", "lastweek", "month", "lastmonth", "quarter", "year", "lastyear", "fy", "lastfy"];
const label = (k: PeriodKey) => PERIODS.find((p) => p.key === k)!.label;

export function PeriodFilter({ timeZone = "Asia/Kolkata", weekStart = "monday", fallback = null, allLabel = "All dates", prefix = "", className }: {
  timeZone?: string;
  weekStart?: "monday" | "sunday";
  /** The period shown when none is chosen; null means "All dates". */
  fallback?: PeriodKey | null;
  allLabel?: string;
  /** For a second date filter on the same page, e.g. "due" gives dueperiod, duefrom, dueto. */
  prefix?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const keys = { period: `${prefix}period`, from: `${prefix}from`, to: `${prefix}to` };
  const range = periodRange({ period: sp.get(keys.period), from: sp.get(keys.from), to: sp.get(keys.to) }, { timeZone, weekStart, fallback });
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range?.from ?? "");
  const [to, setTo] = useState(range?.to ?? "");
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const go = (change: { period?: string | null; from?: string | null; to?: string | null }) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) {
      const name = keys[k as keyof typeof keys];
      if (v) next.set(name, v); else next.delete(name);
    }
    next.delete("page");
    setOpen(false);
    start(() => router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false }));
  };
  const pick = (k: PeriodKey) => go({ period: k, from: null, to: null });
  const badDates = Boolean(from && to && from > to);

  const chip = (k: PeriodKey) => (
    <button key={k} type="button" onClick={() => pick(k)} aria-pressed={range?.period === k}
      className={cx("h-9 px-3 rounded-xl text-[13px] font-semibold border transition text-left whitespace-nowrap",
        range?.period === k ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink")}>
      {label(k)}
    </button>
  );

  return (
    <div ref={box} className={cx("relative", className)}>
      <button type="button" onClick={() => { setFrom(range?.from ?? ""); setTo(range?.to ?? ""); setOpen((v) => !v); }} aria-expanded={open} aria-controls={id}
        className={cx("h-11 w-full md:w-auto inline-flex items-center gap-2 rounded-xl border px-3.5 text-[14.5px] font-semibold transition whitespace-nowrap",
          range ? "border-brand/40 bg-brand/5 text-ink" : "border-line bg-surface text-ink2 hover:border-ink3/50")}>
        {pending ? <I.LoaderCircle size={17} className="animate-spin text-ink3" aria-hidden="true" /> : <I.CalendarRange size={17} className={range ? "text-brand" : "text-ink3"} aria-hidden="true" />}
        <span className="truncate">{range ? range.label : allLabel}</span>
        {range && range.period !== "custom" && range.period !== "today" && range.period !== "yesterday" && (
          <span className="hidden lg:inline text-[12.5px] font-medium text-ink3">{range.from === range.to ? "" : `${fmt(range.from)} – ${fmt(range.to)}`}</span>
        )}
        <I.ChevronDown size={16} className="ml-auto text-ink3" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-shade/40 md:hidden animate-fade" aria-hidden="true" onClick={() => setOpen(false)} />
          <div id={id} role="dialog" aria-label="Choose dates"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-pop animate-sheet md:absolute md:inset-x-auto md:bottom-auto md:left-0 md:top-12 md:w-[25rem] md:rounded-2xl md:animate-rise md:border md:border-line">
            <div className="md:hidden mx-auto -mt-2 mb-3 w-10 h-1.5 rounded-full bg-line" aria-hidden="true" />
            <p className="eyebrow text-ink3 mb-2">Quick</p>
            <div className="grid grid-cols-3 gap-2">{QUICK.map(chip)}</div>
            <p className="eyebrow text-ink3 mt-4 mb-2">Longer</p>
            <div className="grid grid-cols-2 gap-2">{LONGER.map(chip)}</div>
            <p className="eyebrow text-ink3 mt-4 mb-2">From date to date</p>
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (!badDates && (from || to)) go({ period: "custom", from: from || to, to: to || from }); }}>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink2">From
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cx(inputCls(badDates), "h-11")} />
                </label>
                <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink2">To
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cx(inputCls(badDates), "h-11")} />
                </label>
              </div>
              {badDates && <p role="alert" className="text-[12.5px] text-bad">The From date is after the To date.</p>}
              <div className="flex gap-2 mt-1">
                {(range || fallback === null) && (
                  <Button variant="ghost" onClick={() => go({ period: null, from: null, to: null })} className="mr-auto">
                    {fallback ? `Back to ${label(fallback).toLowerCase()}` : allLabel}
                  </Button>
                )}
                <Button type="submit" variant="primary" disabled={badDates || (!from && !to)} className="ml-auto">Show these dates</Button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
