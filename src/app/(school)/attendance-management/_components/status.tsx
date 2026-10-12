// Status colours and letters for attendance (05 §2 "standard colour legend",
// design/ui-prototype/src/attendance.jsx). Colours only through theme tokens,
// so dark mode and the school's colour keep working.

import { cx } from "@/components/ui/cx";

export type StatusView = { key: string; name: string; letter: string; tone: string };

/** The chosen button in Take Attendance. */
export const STATUS_ON: Record<string, string> = {
  success: "bg-ok text-surface border-ok",
  danger: "bg-bad text-surface border-bad",
  warning: "bg-warn text-surface border-warn",
  info: "bg-info/15 text-info border-info/30",
  brand: "bg-brand/12 text-brand border-brand/30",
  neutral: "bg-sunken text-ink border-ink3/40",
};

/** Text colour of a status (count tiles). */
export const STATUS_SOFT: Record<string, string> = {
  success: "text-ok", danger: "text-bad", warning: "text-warn", info: "text-info", brand: "text-brand", neutral: "text-ink2",
};

/** Register cells: the standard statuses have their own shade; the school's own follow their colour. */
const CELL_KEY: Record<string, string> = {
  present: "bg-ok/15 text-ok",
  absent: "bg-bad text-surface",
  late: "bg-warn/20 text-warn",
  "half-day": "bg-warn/12 text-warn",
  excused: "bg-sunken text-ink2",
  leave: "bg-info/15 text-info",
  medical: "bg-info/10 text-info",
};
const CELL_TONE: Record<string, string> = {
  success: "bg-ok/15 text-ok", danger: "bg-bad/15 text-bad", warning: "bg-warn/15 text-warn", info: "bg-info/10 text-info", brand: "bg-brand/12 text-brand", neutral: "bg-sunken text-ink2",
};
export const cellClass = (s: Pick<StatusView, "key" | "tone"> | undefined) => (s ? CELL_KEY[s.key] ?? CELL_TONE[s.tone] ?? CELL_TONE.neutral : "");

/** Pill tone for a status. */
export const pillTone = (tone: string | undefined) => (({ success: "ok", danger: "bad", warning: "warn", info: "info", brand: "brand" }) as Record<string, "ok" | "bad" | "warn" | "info" | "brand">)[tone ?? ""] ?? "neutral";

/** Kept for the older forms: a soft coloured box. */
export const toneClass = (tone: string | undefined) => cx(CELL_TONE[tone ?? "neutral"] ?? CELL_TONE.neutral, "border-transparent");

export function StatusChip({ status, size = "md" }: { status: StatusView | undefined; size?: "sm" | "md" }) {
  if (!status) return <span className="inline-flex items-center rounded-full border border-dashed border-line px-2.5 h-6 text-xs font-semibold text-ink3">Not marked</span>;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap", size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs", cellClass(status))}>
      <span aria-hidden="true" className="font-bold">{status.letter}</span>
      <span>{status.name}</span>
    </span>
  );
}

/** The register cell: a coloured box with the status letter. */
export function Cell({ status, label, size = 28 }: { status: StatusView | undefined; label: string; size?: number }) {
  if (!status) return <span className="text-ink3/50" aria-label={`${label}: not marked`}>·</span>;
  return (
    <span title={`${label}: ${status.name}`} style={{ minWidth: size, height: size }}
      className={cx("inline-grid place-items-center rounded-md px-0.5 text-[10.5px] font-bold", cellClass(status))}>
      <span aria-hidden="true">{status.letter}</span>
      <span className="sr-only">{label}: {status.name}</span>
    </span>
  );
}

export function Legend({ statuses, extra }: { statuses: StatusView[]; extra?: React.ReactNode }) {
  return (
    <ul aria-label="Colour legend" className="flex gap-3 text-[12px] text-ink2 flex-wrap">
      {statuses.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cx("min-w-4 h-4 px-0.5 rounded grid place-items-center text-[9px] font-bold", cellClass(s))}>{s.letter}</span>
          {s.name}
        </li>
      ))}
      {extra}
    </ul>
  );
}
