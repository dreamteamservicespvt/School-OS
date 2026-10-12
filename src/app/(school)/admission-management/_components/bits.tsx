// Small display pieces for Admission screens. Colours only through tokens.
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { stageLabel } from "@/lib/admission/applications";

export function ExportLinks({ href, label = "Export" }: { href: string; label?: string }) {
  const join = href.includes("?") ? "&" : "?";
  return (
    <details className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2">
        {label} <span aria-hidden="true">▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([f, l]) => (
          <a key={f} href={`${href}${join}format=${f}`} className="block min-h-11 px-4 py-2.5 hover:bg-surface-2" download>{l}</a>
        ))}
      </div>
    </details>
  );
}

export function SubNav({ items, current, label = "Views" }: { items: { key: string; label: string; href: string; count?: number; tone?: "danger" }[]; current: string; label?: string }) {
  return (
    <nav aria-label={label} className="mb-4 flex flex-wrap gap-2">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] ${i.key === current ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line bg-surface text-ink-2 hover:text-ink"}`}>
          {i.label}
          {i.count !== undefined && i.count > 0 && <span className={`rounded-full px-2 text-xs ${i.tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-3 text-ink"}`}>{i.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Stat({ label, value, href, tone, note }: { label: string; value: React.ReactNode; href?: string; tone?: "warning" | "danger"; note?: React.ReactNode }) {
  const body = (
    <>
      <p className="text-sm text-ink-2">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warn-text" : ""}`}>{value}</p>
      {note && <p className="mt-1 text-sm text-ink-2">{note}</p>}
    </>
  );
  const cls = "block rounded-2xl border border-line bg-surface p-4 shadow-card";
  return href ? <Link href={href} className={`${cls} hover:border-brand`}>{body}</Link> : <div className={cls}>{body}</div>;
}

const STAGE_TONE: Record<string, BadgeTone> = {
  SUBMITTED: "brand", SUBMITTED_ONLINE: "brand", REVIEWED: "neutral", DOCUMENTS: "neutral", TEST_INTERVIEW: "neutral",
  DECISION: "warning", APPROVED: "success", WAITING_LIST: "warning", REJECTED: "danger", ADMITTED: "success", WITHDRAWN: "neutral",
};

export function StageBadge({ stage }: { stage: string }) {
  return <Badge tone={STAGE_TONE[stage] ?? "neutral"}>{stageLabel(stage)}</Badge>;
}

const STATUS_TONE: Record<string, BadgeTone> = { new: "brand", applied: "success", admitted: "success", lost: "danger" };

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label}</Badge>;
}

/** "4 of 6 verified", as words and a bar. */
export function DocProgress({ verified, required, missing }: { verified: number; required: number; missing?: string[] }) {
  const pct = required === 0 ? 100 : Math.round((verified / required) * 100);
  return (
    <span className="inline-flex min-w-32 flex-col gap-1">
      <span className="text-sm">{required === 0 ? "None needed" : `${verified} of ${required} verified`}</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <span className={`block h-full rounded-full ${pct === 100 ? "bg-success" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </span>
      {missing && missing.length > 0 && <span className="text-xs text-ink-2">Missing: {missing.join(", ")}</span>}
    </span>
  );
}

export function FeeBadge({ status }: { status: { key: string; label: string } }) {
  const tone: BadgeTone = status.key === "paid" ? "success" : status.key === "due" ? "danger" : status.key === "waiting" ? "warning" : "neutral";
  return <Badge tone={tone}>{status.label}</Badge>;
}

/** A small "label: value" list for detail panels. */
export function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
        <div key={k}>
          <dt className="text-sm text-ink-2">{k}</dt>
          <dd className="mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const linkClass = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2";
