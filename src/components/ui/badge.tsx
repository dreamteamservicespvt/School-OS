import { cx } from "./cx";

export type PillTone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";
/** Older tone names, kept so every screen uses the same pills. */
export type BadgeTone = PillTone | "success" | "warning" | "danger";

const TONE: Record<PillTone, string> = {
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/12 text-warn",
  bad: "bg-bad/10 text-bad",
  info: "bg-info/10 text-info",
  brand: "bg-brand/10 text-brand",
  neutral: "bg-sunken text-ink2",
};
const ALIAS: Record<string, PillTone> = { success: "ok", warning: "warn", danger: "bad" };

/** A status pill (design/ui-prototype/src/ui.jsx). */
export function Pill({ tone = "neutral", dot, children, className = "" }: { tone?: BadgeTone; dot?: boolean; children: React.ReactNode; className?: string }) {
  const t = (ALIAS[tone] ?? tone) as PillTone;
  // "hidden sm:inline-flex" hides it on phones: the base inline-flex must not win over hidden.
  const hidden = className.split(/\s+/).includes("hidden");
  return (
    <span className={cx(!hidden && "inline-flex", "items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap", TONE[t], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export const Badge = Pill;
