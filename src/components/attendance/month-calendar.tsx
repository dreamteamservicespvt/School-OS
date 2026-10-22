// One student's attendance month as a calendar that pages back to earlier
// months (from the previous academic year, or the first record) and forward
// to this month, with the approved month control. The month is in the page
// address; the page loads its real marks, holidays and leave from the
// database. Used on the Student Profile and on Parent Link.

import { cx } from "@/components/ui/cx";
import { MonthSelect } from "./month-select";
import { englishT, type T } from "@/lib/i18n/t";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "October 2026" with the month in the page's language. */
export function monthWords(t: T, label: string) {
  return label.replace(new RegExp(`^(${MONTHS.join("|")})`), (m) => t.any(m));
}

export type CalMonth = {
  label: string;
  month: string;
  summary: { percent: number | null; workingDays: number; countedDays: number; present: number; absent: number; late: number; leave: number };
  cells: { date: string; day: number; weekday: number; statusKey: string | null; off: string | null; future: boolean }[];
};
export type CalStatus = { key: string; name: string; letter: string; tone: string };

const KEY_CELL: Record<string, string> = {
  present: "bg-ok/15 text-ok", absent: "bg-bad text-surface", late: "bg-warn/20 text-warn", "half-day": "bg-warn/12 text-warn",
  excused: "bg-sunken text-ink2", leave: "bg-info/15 text-info", medical: "bg-info/10 text-info",
};
const TONE_CELL: Record<string, string> = { success: "bg-ok/15 text-ok", danger: "bg-bad/15 text-bad", warning: "bg-warn/15 text-warn", info: "bg-info/10 text-info", brand: "bg-brand/12 text-brand", neutral: "bg-sunken text-ink2" };
export const calendarCell = (s: CalStatus | undefined) => (s ? KEY_CELL[s.key] ?? TONE_CELL[s.tone] ?? TONE_CELL.neutral : "");
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 10) / 10}%`);

export function MonthCalendar({ view, statuses, min, max, param = "month", todayIso, threshold = 75, note, compact, t = englishT }: {
  view: CalMonth; statuses: CalStatus[]; min: string; max: string; param?: string; todayIso: string; threshold?: number; note?: React.ReactNode; compact?: boolean;
  /** The page's language (Parent Link); staff screens are in English until they are translated. */
  t?: T;
}) {
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const first = view.cells[0];
  const lead = first ? (first.weekday + 6) % 7 : 0;
  const s = view.summary;
  const used = new Set(view.cells.map((c) => c.statusKey).filter(Boolean));
  const legend = statuses.filter((x) => ["present", "absent", "late", "leave"].includes(x.key) || used.has(x.key));
  return (
    <div className="flex flex-col gap-3">
      <MonthSelect value={view.month} min={min} max={max} param={param} />
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-ink3 flex-wrap">
        <span><b className={cx("font-display text-[20px] font-semibold tnum", s.percent === null ? "text-ink" : s.percent < threshold ? "text-bad" : s.percent < 85 ? "text-warn" : "text-ok")}>{pct(s.percent)}</b> {t("present")}</span>
        <span className="tnum">{t("{days} school days · {absent} absent · {late} late · {leave} leave", { days: s.workingDays, absent: s.absent, late: s.late, leave: s.leave })}</span>
      </div>
      <div role="grid" aria-label={t("Attendance in {month}", { month: monthWords(t, view.label) })} className={cx("grid grid-cols-7 text-center", compact ? "gap-1" : "gap-1.5")}>
        {WEEK.map((w) => <div key={w} role="columnheader" className="py-1 text-[11.5px] font-semibold text-ink3">{compact && t.lang === "en" ? w.slice(0, 1) : t.any(w)}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} aria-hidden="true" />)}
        {view.cells.map((c) => {
          const st = c.statusKey ? byKey.get(c.statusKey) : undefined;
          const holiday = c.off && c.off !== "Sunday";
          const title = c.off ? t.any(c.off) : c.future ? "" : st ? t.any(st.name) : t("Not marked");
          const cls = c.off ? (holiday ? "bg-info/10 text-info" : "text-ink3/70") : c.future ? "text-ink3/60" : st ? calendarCell(st) : "border border-dashed border-line text-ink3";
          return (
            <div key={c.date} role="gridcell" title={title} aria-label={`${c.day}: ${title || t("Not yet")}`}
              className={cx("rounded-lg flex flex-col items-center justify-center tnum", compact ? "aspect-square text-[12.5px]" : "h-12 sm:h-14", cls, c.date === todayIso && "ring-2 ring-brand/50")}>
              <span className={compact ? "" : "text-[11px] opacity-80"}>{c.day}</span>
              {!compact && <span className="text-[12.5px] font-bold leading-none mt-0.5">{holiday ? "H" : st && !c.off ? st.letter : ""}</span>}
            </div>
          );
        })}
      </div>
      <ul aria-label={t("Colour legend")} className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink2">
        {legend.map((x) => <li key={x.key} className="flex items-center gap-1.5"><span aria-hidden="true" className={cx("min-w-4 h-4 px-0.5 rounded grid place-items-center text-[9px] font-bold", calendarCell(x))}>{x.letter}</span>{t.any(x.name)}</li>)}
        {view.cells.some((c) => c.off && c.off !== "Sunday") && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-4 h-4 rounded grid place-items-center text-[9px] font-bold bg-info/10 text-info">H</span>{t("Holiday")}</li>}
      </ul>
      {note}
    </div>
  );
}
