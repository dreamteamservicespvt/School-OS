// Status colours and letters for attendance (05 §2 "standard colour
// legend"). Colours only through theme tokens, so dark mode keeps working.

export type StatusView = { key: string; name: string; letter: string; tone: string };

export const TONE_CLASS: Record<string, string> = {
  success: "bg-success-soft text-success border-success/40",
  danger: "bg-danger-soft text-danger border-danger/40",
  warning: "bg-warn-bg text-warn-text border-warn/40",
  info: "bg-info-soft text-ink border-line-strong",
  brand: "bg-brand-soft text-brand-text border-brand/40",
  neutral: "bg-surface-3 text-ink border-line-strong",
};

export const toneClass = (tone: string | undefined) => TONE_CLASS[tone ?? "neutral"] ?? TONE_CLASS.neutral;

export function StatusChip({ status, size = "md" }: { status: StatusView | undefined; size?: "sm" | "md" }) {
  if (!status) return <span className="inline-flex items-center rounded-md border border-dashed border-line-strong px-2 py-0.5 text-xs text-ink-2">Not marked</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border font-medium ${size === "sm" ? "px-1.5 py-0 text-xs" : "px-2 py-0.5 text-sm"} ${toneClass(status.tone)}`}>
      <span aria-hidden="true" className="font-semibold">{status.letter}</span>
      <span>{status.name}</span>
    </span>
  );
}

/** The register cell: a coloured box with the status letter. */
export function Cell({ status, label }: { status: StatusView | undefined; label: string }) {
  if (!status) return <span className="sr-only">{label}: not marked</span>;
  return (
    <span title={`${label}: ${status.name}`} className={`inline-grid h-7 min-w-7 place-items-center rounded border px-0.5 text-xs font-semibold ${toneClass(status.tone)}`}>
      <span aria-hidden="true">{status.letter}</span>
      <span className="sr-only">{label}: {status.name}</span>
    </span>
  );
}

export function Legend({ statuses, extra }: { statuses: StatusView[]; extra?: React.ReactNode }) {
  return (
    <ul aria-label="Colour legend" className="flex flex-wrap items-center gap-2 text-sm">
      {statuses.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-grid h-6 min-w-6 place-items-center rounded border px-1 text-xs font-semibold ${toneClass(s.tone)}`}>{s.letter}</span>
          {s.name}
        </li>
      ))}
      {extra}
    </ul>
  );
}
