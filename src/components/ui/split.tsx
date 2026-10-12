import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cx } from "./cx";

// Page layout parts (design/ui-prototype/src/kit.jsx): a main column with a side column, a stack of cards,
// a label-above-value list, and a back link to the list a record came from.

export function Split({ children, side = 340, className }: { children: React.ReactNode; side?: 300 | 340 | 380; className?: string }) {
  const cols = side === 380 ? "xl:grid-cols-[minmax(0,1fr)_380px]" : side === 300 ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "xl:grid-cols-[minmax(0,1fr)_340px]";
  return <div className={cx("grid gap-5 lg:gap-6 items-start", cols, className)}>{children}</div>;
}

export function Col({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col gap-5 lg:gap-6 min-w-0", className)}>{children}</div>;
}

export function DL({ rows, cols = 2, className }: { rows: [string, React.ReactNode][]; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3.5 px-5 pb-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-2 xl:grid-cols-3", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-ink3 font-semibold">{k}</dt>
          <dd className="text-[14.5px] mt-0.5 break-words">{v ?? <span className="text-ink3">Not added</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BackLink({ href, label, sub }: { href: string; label: string; sub?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <ArrowLeft size={17} aria-hidden="true" />{label}{sub && <span className="text-ink3 font-normal">/ {sub}</span>}
    </Link>
  );
}

/** The big title block of a record page: title, one line or pills under it, and actions. */
export function RecordHead({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight leading-tight break-words">{title}</h1>
        {sub && <div className="text-[14px] text-ink3 mt-1 flex items-center gap-2 flex-wrap">{sub}</div>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
