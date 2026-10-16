// Small shared pieces of the Finance pages (mod-finance.jsx): signed money,
// a mode with its icon, a reference, and a label-value line.
import { formatRupees } from "@/lib/format";
import { financeModeLabel } from "@/lib/finance/words";
import { cx } from "@/components/ui/cx";
import { ModeIcon } from "../../fee-management/_components/bits";

const ZERO = BigInt(0);

export const signed = (n: bigint) => (n < ZERO ? `−${formatRupees(-n)}` : formatRupees(n));

export function ModeCell({ mode }: { mode: string | null }) {
  if (!mode) return <span className="text-ink3">—</span>;
  return <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap"><ModeIcon mode={mode} />{financeModeLabel(mode)}</span>;
}

export function Ref({ v }: { v: string | null | undefined }) {
  return <span className="font-mono text-[12px] text-ink2">{v || "—"}</span>;
}

const TONE: Record<string, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info", brand: "text-brand" };

export function Line({ k, v, tone, bold }: { k: React.ReactNode; v: React.ReactNode; tone?: "ok" | "warn" | "bad" | "info" | "brand"; bold?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 border-t border-line/70 first:border-0 text-[14px]">
      <span className="text-ink2 min-w-0">{k}</span>
      <b className={cx("tnum shrink-0", bold ? "font-semibold" : "font-medium", tone && TONE[tone])}>{v}</b>
    </li>
  );
}
