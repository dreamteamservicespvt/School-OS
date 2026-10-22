import type { LucideIcon } from "lucide-react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cx } from "./cx";
import { tx } from "@/lib/i18n/tx";

// A calm message strip (design/ui-prototype/src/kit.jsx Banner).

export type BannerTone = "info" | "ok" | "warn" | "bad" | "brand";
const BG: Record<BannerTone, string> = { info: "bg-info/8", ok: "bg-ok/10", warn: "bg-warn/12", bad: "bg-bad/10", brand: "bg-brand/8" };
const TEXT: Record<BannerTone, string> = { info: "text-info", ok: "text-ok", warn: "text-warn", bad: "text-bad", brand: "text-brand" };
const ICON: Record<BannerTone, LucideIcon> = { info: Info, ok: CircleCheck, warn: TriangleAlert, bad: TriangleAlert, brand: Info };

export function Banner({ tone = "info", icon, title, children, action, className, role }: {
  tone?: BannerTone; icon?: LucideIcon; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string; role?: "status" | "alert";
}) {
  const Ic = icon ?? ICON[tone];
  return (
    <div role={role ?? (tone === "bad" ? "alert" : "status")} className={cx("rounded-2xl px-4 py-3 flex flex-wrap sm:flex-nowrap items-start md:items-center gap-x-3 gap-y-2 text-[14px]", BG[tone], className)}>
      <Ic size={19} className={cx("shrink-0 mt-0.5 md:mt-0", TEXT[tone])} aria-hidden="true" />
      <p className="text-ink2 flex-1 min-w-0 basis-[calc(100%-2rem)] sm:basis-auto">{title && <b className="font-semibold text-ink">{tx(title)} </b>}{tx(children)}</p>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}
