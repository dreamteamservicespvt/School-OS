import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cx } from "./cx";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  info: "bg-info/10 text-ink",
  success: "bg-ok/10 text-ink",
  warning: "bg-warn/12 text-ink",
  danger: "bg-bad/10 text-ink",
};
const ICON = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };
const ICON_TONE = { info: "text-info", success: "text-ok", warning: "text-warn", danger: "text-bad" };

export function Alert({ tone = "info", title, children, className = "", action }: { tone?: Tone; title?: string; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const I = ICON[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3.5 text-sm", TONES[tone], className)}>
      <I size={19} className={cx("shrink-0 mt-px", ICON_TONE[tone])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-[14.5px]">{title}</p>}
        {children && <div className={cx("text-ink2", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** The result of a form or action, shown above the form (P7, P15). */
export function FormMessage({ state }: { state?: { ok: boolean; message?: string } | null }) {
  if (!state?.message) return null;
  return <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>;
}
