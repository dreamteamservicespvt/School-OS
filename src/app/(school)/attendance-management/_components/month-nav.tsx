import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui/cx";

/** "‹ October 2026 ›" in one bordered control. Links keep everything in the page address (P2). */
export function MonthNav({ label, prev, next, className }: { label: string; prev: string | null; next: string | null; className?: string }) {
  const btn = "grid size-10 place-items-center text-ink2 hover:bg-sunken hover:text-ink transition";
  return (
    <div className={cx("inline-flex h-11 items-center rounded-xl border border-line bg-surface overflow-hidden", className)}>
      {prev ? <Link href={prev} scroll={false} className={btn} aria-label="Previous month"><ChevronLeft size={18} aria-hidden="true" /></Link>
        : <span className={cx(btn, "opacity-40")} aria-hidden="true"><ChevronLeft size={18} /></span>}
      <span className="px-2 min-w-32 text-center text-[14px] font-semibold tnum" aria-live="polite">{label}</span>
      {next ? <Link href={next} scroll={false} className={btn} aria-label="Next month"><ChevronRight size={18} aria-hidden="true" /></Link>
        : <span className={cx(btn, "opacity-40")} aria-hidden="true"><ChevronRight size={18} /></span>}
    </div>
  );
}
