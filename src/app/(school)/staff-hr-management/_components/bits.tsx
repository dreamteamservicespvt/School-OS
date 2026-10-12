// Small display pieces for Staff & HR screens, in the approved design
// (design/ui-prototype/src/kit.jsx). Colours only through tokens.
import Link from "next/link";
import { Download } from "lucide-react";
import { Pill, type BadgeTone } from "@/components/ui/badge";
import { Avatar as Face } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { statusLabel } from "@/lib/staff/settings";

/** The staff photo address; photos are served only to people who may open the record. */
export const staffPhoto = (photoFileId: string | null) => (photoFileId ? `/staff-hr-management/files/${photoFileId}` : null);

const SIZE = { sm: 38, md: 44, lg: 88 } as const;

export function Avatar({ name, photoFileId, size = "md" }: { name: string; photoFileId: string | null; size?: keyof typeof SIZE | number }) {
  return <Face name={name} src={staffPhoto(photoFileId)} size={typeof size === "number" ? size : SIZE[size]} />;
}

const STATUS_TONE: Record<string, BadgeTone> = { ACTIVE: "ok", ON_LEAVE: "warn", SUSPENDED: "bad", RESIGNED: "neutral", RETIRED: "neutral", TERMINATED: "neutral" };

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Pill tone={STATUS_TONE[status] ?? "neutral"} dot className={className}>{statusLabel(status)}</Pill>;
}

export function ExportLinks({ href, label = "Export", className }: { href: string; label?: string; className?: string }) {
  const join = href.includes("?") ? "&" : "?";
  return (
    <details className={cx("relative", className)}>
      <summary className={buttonClass("secondary", "md", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
        <Download size={17} aria-hidden="true" />{label}
      </summary>
      <div className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop animate-rise">
        {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([f, l]) => (
          <a key={f} href={`${href}${join}format=${f}`} className="flex h-10 items-center rounded-xl px-3 text-[14px] font-medium hover:bg-sunken" download>{l}</a>
        ))}
      </div>
    </details>
  );
}

/** The views inside one page (?view=), drawn as the design's segmented control. */
export function SubNav({ items, current }: { items: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
      <nav aria-label="Views" className="inline-flex gap-1 rounded-xl bg-sunken p-1">
        {items.map((i) => {
          const on = i.key === current;
          return (
            <Link key={i.key} href={i.href} scroll={false} aria-current={on ? "page" : undefined}
              className={cx("inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[13px] font-semibold transition",
                on ? "bg-surface text-ink shadow-card" : "text-ink2 hover:text-ink")}>
              {i.label}
              {i.count !== undefined && i.count > 0 && <span className="text-[11.5px] tnum text-warn">{i.count.toLocaleString("en-IN")}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
