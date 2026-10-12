"use client";

// The date filter for any list or report, the same on every page (kit.jsx
// DatePeriod): a button that names the period and its dates, opening "Pick
// dates" with ready ranges in groups, one month, one year, or your own From
// and To dates. Kept in the page address (P2).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import * as I from "lucide-react";
import { cx } from "@/components/ui/cx";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inputCls } from "@/components/ui/field";
import {
  AHEAD_GROUP, PERIOD_GROUPS, MONTH_NAMES, dayCount, periodAvailable, periodLabel, periodRange, rangeWords, todayFor,
  type PeriodKey, type SchoolCalendar,
} from "@/lib/periods";

export type PeriodFilterProps = {
  timeZone?: string;
  weekStart?: "monday" | "sunday";
  /** The period shown when none is chosen; null means "All dates". */
  fallback?: PeriodKey | null;
  allLabel?: string;
  /** For a second date filter on the same page, e.g. "due" gives dueperiod, duefrom, dueto. */
  prefix?: string;
  /** The school's terms and academic years, from periodSetup() on the server. */
  calendar?: SchoolCalendar | null;
  /** Pages that look ahead (datesheets, events, due dates) also offer Tomorrow, Next 7 days and so on. */
  ahead?: boolean;
  /** The first day records can start; default two years before this year's start. */
  earliest?: string;
  size?: "sm" | "md";
  className?: string;
};

const yearSpan = (from: string, to: string) => `${from.slice(0, 4)}–${to.slice(2, 4)}`;

export function PeriodFilter({
  timeZone = "Asia/Kolkata", weekStart = "monday", fallback = null, allLabel = "All dates", prefix = "",
  calendar = null, ahead = false, earliest, size = "md", className,
}: PeriodFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const id = useId();
  const keys = { period: `${prefix}period`, from: `${prefix}from`, to: `${prefix}to` };
  const opts = { timeZone, weekStart, fallback, calendar };
  const range = periodRange({ period: sp.get(keys.period), from: sp.get(keys.from), to: sp.get(keys.to) }, opts);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tried, setTried] = useState(false);
  const [pending, start] = useTransition();

  const today = todayFor(timeZone).toISOString().slice(0, 10);
  const first = earliest ?? calendar?.lastYear?.from ?? `${Number(today.slice(0, 4)) - 2}-06-01`;
  const max = ahead ? undefined : today;
  const err = !from || !to ? "Pick both dates." : from > to ? "The From date is after the To date."
    : max && to > max ? "You cannot pick a date after today." : from < first ? `Records start from ${rangeWords(first, first)}.` : "";

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
  const openIt = () => { setFrom(range?.from ?? ""); setTo(range?.to ?? ""); setTried(false); setOpen(true); };

  // Months from this one (or five ahead) back to the first records.
  const months: { value: string; label: string }[] = [];
  const top = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 + (ahead ? 5 : 0);
  const bottom = Number(first.slice(0, 4)) * 12 + Number(first.slice(5, 7)) - 1;
  for (let k = top; k >= bottom; k--) {
    const y = Math.floor(k / 12), m = k % 12;
    months.push({ value: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MONTH_NAMES[m]} ${y}` });
  }
  const yearOf = (k: PeriodKey) => periodRange({ period: k }, opts)!;
  const ac = yearOf("acyear"), lastAc = yearOf("lastacyear"), fin = yearOf("finyear"), lastFin = yearOf("lastfinyear");
  const years = [
    { value: "acyear", label: `Academic year ${calendar?.year?.name ?? yearSpan(ac.from, ac.to)}` },
    { value: "lastacyear", label: `Academic year ${calendar?.lastYear?.name ?? yearSpan(lastAc.from, lastAc.to)}` },
    { value: "finyear", label: `Financial year ${yearSpan(fin.from, fin.to)}` },
    { value: "lastfinyear", label: `Financial year ${yearSpan(lastFin.from, lastFin.to)}` },
    { value: "calyear", label: `Calendar year ${today.slice(0, 4)}` },
    { value: "lastcalyear", label: `Calendar year ${Number(today.slice(0, 4)) - 1}` },
  ];
  const groups = (ahead ? [AHEAD_GROUP, ...PERIOD_GROUPS] : PERIOD_GROUPS)
    .map((g) => ({ ...g, keys: g.keys.filter((k) => periodAvailable(k, calendar)) }));

  const datesOnly = range?.period === "custom";
  const chip = (k: PeriodKey) => {
    const on = range?.period === k;
    const r = periodRange({ period: k }, opts);
    return (
      <button key={k} type="button" onClick={() => pick(k)} aria-pressed={on} title={r ? rangeWords(r.from, r.to) : undefined}
        className={cx("h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition",
          on ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink")}>
        {periodLabel(k, calendar)}
      </button>
    );
  };
  const selectCls = cx(inputCls(), "h-11 appearance-none pr-10 cursor-pointer");

  return (
    <>
      <button type="button" onClick={openIt} aria-haspopup="dialog"
        className={cx("inline-flex items-center gap-2 rounded-xl border transition min-w-0 max-w-full whitespace-nowrap",
          size === "sm" ? "h-9 px-3 text-[13.5px]" : "h-11 px-3.5 text-[14.5px]",
          range ? "border-brand/40 bg-brand/5 text-ink" : "border-line bg-surface text-ink2 hover:border-ink3/50", className)}>
        {pending ? <I.LoaderCircle size={17} className="animate-spin text-ink3 shrink-0" aria-hidden="true" />
          : <I.CalendarRange size={17} className={cx("shrink-0", range ? "text-brand" : "text-ink3")} aria-hidden="true" />}
        {!range && <span className="font-semibold truncate">{allLabel}</span>}
        {range && !datesOnly && <span className="font-semibold shrink-0">{range.label}</span>}
        {range && (datesOnly || range.period !== "month") && (
          <span className={cx("tnum truncate", datesOnly ? "font-semibold text-ink" : "hidden md:inline text-ink3")}>{rangeWords(range.from, range.to)}</span>
        )}
        <I.ChevronDown size={16} className="ml-auto text-ink3 shrink-0" aria-hidden="true" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Pick dates" sub="Choose a ready range, a month, or your own From and To dates." wide>
        <div className="flex flex-col gap-5">
          {(range || fallback === null) && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-sunken/60 px-3.5 py-2.5 text-[13.5px]">
              <span className="text-ink2 min-w-0 truncate">
                {range ? <>Showing <b className="text-ink font-semibold">{range.period === "custom" || range.period === "month" ? rangeWords(range.from, range.to) : range.label}</b></> : <>Showing <b className="text-ink font-semibold">{allLabel.toLowerCase()}</b></>}
              </span>
              {range && (
                <button type="button" onClick={() => go({ period: null, from: null, to: null })} className="shrink-0 font-semibold text-brand hover:underline">
                  {fallback ? `Back to ${periodLabel(fallback, calendar).toLowerCase()}` : `Show ${allLabel.toLowerCase()}`}
                </button>
              )}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.title}>
              <p className="eyebrow text-ink3 mb-2">{g.title}</p>
              <div className="flex flex-wrap gap-2">{g.keys.map(chip)}</div>
            </div>
          ))}
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="eyebrow text-ink3 mb-2 block">One month</span>
              <span className="relative block">
                <select id={`${id}-month`} value={range?.period === "month" ? range.month : ""} className={selectCls}
                  onChange={(e) => e.target.value && go({ period: "month", from: e.target.value, to: null })}>
                  <option value="">Pick a month</option>
                  {months.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <I.ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
              </span>
            </label>
            <label className="block">
              <span className="eyebrow text-ink3 mb-2 block">One year</span>
              <span className="relative block">
                <select id={`${id}-year`} value={years.some((y) => y.value === range?.period) ? range!.period : ""} className={selectCls}
                  onChange={(e) => e.target.value && pick(e.target.value as PeriodKey)}>
                  <option value="">Pick a year</option>
                  {years.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <I.ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
              </span>
            </label>
          </div>
          <form className="rounded-2xl border border-line p-4" noValidate
            onSubmit={(e) => { e.preventDefault(); setTried(true); if (!err) go({ period: "custom", from, to }); }}>
            <p className="eyebrow text-ink3 mb-3">From date to To date</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-from`} className="text-[13px] font-semibold text-ink2">From</label>
                <input id={`${id}-from`} type="date" value={from} min={first} max={max} onChange={(e) => setFrom(e.target.value)}
                  aria-invalid={Boolean(tried && err)} aria-describedby={tried && err ? `${id}-err` : undefined} className={cx(inputCls(Boolean(tried && err)), "h-11")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-to`} className="text-[13px] font-semibold text-ink2">To</label>
                <input id={`${id}-to`} type="date" value={to} min={first} max={max} onChange={(e) => setTo(e.target.value)}
                  aria-invalid={Boolean(tried && err)} aria-describedby={tried && err ? `${id}-err` : undefined} className={cx(inputCls(Boolean(tried && err)), "h-11")} />
              </div>
            </div>
            {tried && err && <p id={`${id}-err`} role="alert" className="text-[13px] text-bad font-medium mt-2 flex items-center gap-1.5"><I.CircleAlert size={14} aria-hidden="true" />{err}</p>}
            <div className="flex items-center gap-3 mt-3">
              <p className="text-[12.5px] text-ink3 flex-1 tnum">{!err ? `${rangeWords(from, to)} · ${dayCount(from, to)} ${dayCount(from, to) === 1 ? "day" : "days"}` : ""}</p>
              <Button type="submit" variant="primary" icon={I.Check}>Apply</Button>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}
