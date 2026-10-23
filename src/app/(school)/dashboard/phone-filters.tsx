"use client";

// On a phone the Dashboard's four filters (campus, year, dates, class) filled the
// first screen, so the day's numbers started below it. There they fold behind one
// "Filters" button that says what is chosen; on a computer they always show.
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";

export function PhoneFilters({ summary, children }: { /** Words for the filters in use; empty means today, everything. */ summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={cx("sm:hidden h-11 w-full inline-flex items-center gap-2 rounded-xl border px-3.5 text-[14.5px] font-semibold transition text-left",
          summary ? "border-brand/40 bg-brand/5 text-ink" : "border-line bg-surface text-ink2")}>
        <SlidersHorizontal size={16} aria-hidden="true" className="shrink-0" />
        <Words k="Filters" />
        <span className="min-w-0 flex-1 truncate font-medium text-ink3">{summary || <Words k="Today" />}</span>
      </button>
      <div className={cx(open ? "flex" : "hidden", "sm:flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap")}>{children}</div>
    </>
  );
}
