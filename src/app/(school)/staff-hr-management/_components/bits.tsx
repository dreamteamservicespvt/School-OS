// Small display pieces for Staff & HR screens. Colours only through tokens.
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { statusLabel } from "@/lib/staff/settings";

export function Avatar({ name, photoFileId, size = "md" }: { name: string; photoFileId: string | null; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "size-20 text-2xl" : size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (photoFileId) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/staff-hr-management/files/${photoFileId}`} alt="" className={`${cls} shrink-0 rounded-full border border-line object-cover`} />;
  }
  return <span aria-hidden="true" className={`${cls} grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand-text`}>{initials}</span>;
}

const STATUS_TONE: Record<string, BadgeTone> = { ACTIVE: "success", ON_LEAVE: "warning", SUSPENDED: "danger", RESIGNED: "neutral", RETIRED: "neutral", TERMINATED: "neutral" };

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{statusLabel(status)}</Badge>;
}

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

export function SubNav({ items, current }: { items: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Views" className="mb-4 flex flex-wrap gap-2">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] ${i.key === current ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line bg-surface text-ink-2 hover:text-ink"}`}>
          {i.label}
          {i.count !== undefined && i.count > 0 && <span className="rounded-full bg-surface-3 px-2 text-xs text-ink">{i.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Stat({ label, value, href, tone }: { label: string; value: React.ReactNode; href?: string; tone?: "warning" | "danger" }) {
  const body = (
    <>
      <p className="text-sm text-ink-2">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warn-text" : ""}`}>{value}</p>
    </>
  );
  const cls = "block rounded-2xl border border-line bg-surface p-4 shadow-card";
  return href ? <Link href={href} className={`${cls} hover:border-brand`}>{body}</Link> : <div className={cls}>{body}</div>;
}
