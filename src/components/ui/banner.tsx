import type { LucideIcon } from "lucide-react";
import { CircleCheck, Info, Sparkles, TriangleAlert } from "lucide-react";
import { cx } from "./cx";

// A calm message strip (design/ui-prototype/src/kit.jsx Banner).

type Tone = "info" | "ok" | "warn" | "bad" | "brand";
const BG: Record<Tone, string> = { info: "bg-info/8", ok: "bg-ok/10", warn: "bg-warn/12", bad: "bg-bad/10", brand: "bg-brand/8" };
const ICON: Record<Tone, LucideIcon> = { info: Info, ok: CircleCheck, warn: TriangleAlert, bad: TriangleAlert, brand: Sparkles };
const TEXT: Record<Tone, string> = { info: "text-info", ok: "text-ok", warn: "text-warn", bad: "text-bad", brand: "text-brand" };

export function Banner({ tone = "info", icon, title, children, action, className }: { tone?: Tone; icon?: LucideIcon; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const Ic = icon ?? ICON[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("rounded-2xl px-4 py-3 flex items-start md:items-center gap-3 text-[14px]", BG[tone], className)}>
      <Ic size={19} className={cx("shrink-0 mt-0.5 md:mt-0", TEXT[tone])} aria-hidden="true" />
      <p className="text-ink2 flex-1 min-w-0">{title && <b className="font-semibold text-ink">{title} </b>}{children}</p>
      {action}
    </div>
  );
}
