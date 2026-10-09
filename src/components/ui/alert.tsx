type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  info: "bg-info-soft text-ink border-line",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warn-bg text-warn-text border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/30",
};

export function Alert({ tone = "info", title, children, className = "", action }: { tone?: Tone; title?: string; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${TONES[tone]} ${className}`}>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** The result of a form or action, shown above the form (P7, P15). */
export function FormMessage({ state }: { state?: { ok: boolean; message?: string } | null }) {
  if (!state?.message) return null;
  return <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>;
}
