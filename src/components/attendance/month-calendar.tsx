"use client";

// One student's attendance month as a calendar that pages back to earlier
// months (and years, when the person may see them) and forward to this month.
// Each month loads its real marks, holidays and leave from the server. Used on
// the Student Profile and on Parent Link.

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

export type CalMonth = {
  label: string;
  month: string;
  summary: { percent: number | null; workingDays: number; countedDays: number; present: number; absent: number; late: number; leave: number };
  cells: { date: string; day: number; weekday: number; statusKey: string | null; off: string | null; future: boolean }[];
};
export type CalStatus = { key: string; name: string; letter: string; tone: string };
export type CalLoad = (month: string) => Promise<{ view: CalMonth } | { error: string }>;

const KEY_CELL: Record<string, string> = {
  present: "bg-ok/15 text-ok", absent: "bg-bad text-surface", late: "bg-warn/20 text-warn", "half-day": "bg-warn/12 text-warn",
  excused: "bg-sunken text-ink2", leave: "bg-info/15 text-info", medical: "bg-info/10 text-info",
};
const TONE_CELL: Record<string, string> = { success: "bg-ok/15 text-ok", danger: "bg-bad/15 text-bad", warning: "bg-warn/15 text-warn", info: "bg-info/10 text-info", brand: "bg-brand/12 text-brand", neutral: "bg-sunken text-ink2" };
const cellOf = (s: CalStatus | undefined) => (s ? KEY_CELL[s.key] ?? TONE_CELL[s.tone] ?? TONE_CELL.neutral : "");
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 10) / 10}%`);

const shift = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export function MonthCalendar({ initial, statuses, min, max, load, todayIso, threshold = 75, note, compact }: {
  initial: CalMonth; statuses: CalStatus[]; min: string; max: string; load?: CalLoad; todayIso: string; threshold?: number; note?: React.ReactNode; compact?: boolean;
}) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const go = (n: number) => {
    if (!load) return;
    const next = shift(view.month, n);
    if (next < min || next > max) return;
    setError(null);
    start(async () => {
      try {
        const r = await load(next);
        if ("error" in r) setError(r.error);
        else setView(r.view);
      } catch {
        setError("This month could not be loaded. Check the internet and try again.");
      }
    });
  };
  const canPrev = Boolean(load) && view.month > min;
  const canNext = Boolean(load) && view.month < max;
  const first = view.cells[0];
  const lead = first ? (first.weekday + 6) % 7 : 0;
  const s = view.summary;
  const used = new Set(view.cells.map((c) => c.statusKey).filter(Boolean));
  const legend = statuses.filter((x) => ["present", "absent", "late", "leave"].includes(x.key) || used.has(x.key));
  const btn = "grid size-9 place-items-center rounded-lg text-ink2 hover:bg-sunken hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent transition";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => go(-1)} disabled={!canPrev || pending} aria-label="Previous month"><ChevronLeft size={18} aria-hidden="true" /></button>
        <p className="flex-1 text-center font-semibold text-[15px]" aria-live="polite">
          {view.label}{pending && <Spinner size={14} className="inline-block ml-2 text-ink3 align-middle" />}
        </p>
        <button type="button" className={btn} onClick={() => go(1)} disabled={!canNext || pending} aria-label="Next month"><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-ink3 flex-wrap">
        <span><b className={cx("font-display text-[20px] font-semibold tnum", s.percent === null ? "text-ink" : s.percent < threshold ? "text-bad" : s.percent < 85 ? "text-warn" : "text-ok")}>{pct(s.percent)}</b> present</span>
        <span className="tnum">{s.workingDays} school days · {s.absent} absent · {s.late} late · {s.leave} leave</span>
      </div>
      {error && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">{error}</p>}
      <div role="grid" aria-label={`Attendance in ${view.label}`} aria-busy={pending} className={cx("grid grid-cols-7 text-center transition-opacity", compact ? "gap-1" : "gap-1.5", pending && "opacity-60")}>
        {WEEK.map((w) => <div key={w} role="columnheader" className="py-1 text-[11.5px] font-semibold text-ink3">{compact ? w.slice(0, 1) : w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} aria-hidden="true" />)}
        {view.cells.map((c) => {
          const st = c.statusKey ? byKey.get(c.statusKey) : undefined;
          const holiday = c.off && c.off !== "Sunday";
          const title = c.off ?? (c.future ? "" : st?.name ?? "Not marked");
          const cls = c.off ? (holiday ? "bg-info/10 text-info" : "text-ink3/70") : c.future ? "text-ink3/60" : st ? cellOf(st) : "border border-dashed border-line text-ink3";
          return (
            <div key={c.date} role="gridcell" title={title} aria-label={`${c.day}: ${title || "Not yet"}`}
              className={cx("rounded-lg flex flex-col items-center justify-center tnum", compact ? "aspect-square text-[12.5px]" : "h-12 sm:h-14", cls, c.date === todayIso && "ring-2 ring-brand/50")}>
              <span className={compact ? "" : "text-[11px] opacity-80"}>{c.day}</span>
              {!compact && <span className="text-[12.5px] font-bold leading-none mt-0.5">{holiday ? "H" : st && !c.off ? st.letter : ""}</span>}
            </div>
          );
        })}
      </div>
      <ul aria-label="Colour legend" className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink2">
        {legend.map((x) => <li key={x.key} className="flex items-center gap-1.5"><span aria-hidden="true" className={cx("min-w-4 h-4 px-0.5 rounded grid place-items-center text-[9px] font-bold", cellOf(x))}>{x.letter}</span>{x.name}</li>)}
        {view.cells.some((c) => c.off && c.off !== "Sunday") && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-4 h-4 rounded grid place-items-center text-[9px] font-bold bg-info/10 text-info">H</span>Holiday</li>}
      </ul>
      {note}
    </div>
  );
}
