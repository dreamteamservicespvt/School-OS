"use client";

// One installment's timeline under its row (adopt item 4): "Bill made → Due →
// Late fee from", and the reminder plan as small chips. Built on the server
// from Fee Settings and the records (src/lib/fees/timeline.ts); here only shown.
import { ArrowRight, BellOff } from "lucide-react";
import type { FeeTimeline } from "@/lib/fees/timeline";
import { cx } from "@/components/ui/cx";
import { useT } from "@/lib/i18n/client";

const DOT = { done: "bg-ink3", today: "bg-warn", ahead: "bg-surface border border-ink3/60" } as const;

export function FeeTimelineLine({ t, className }: { t: FeeTimeline; className?: string }) {
  const tr = useT();
  // Each " · " part is said in the screen's language on its own ("Reminder 1 of 3", "3 days before", "sent").
  const say = (text: string) => text.split(" · ").map((p) => tr.any(p)).join(" · ");
  return (
    <div className={cx("mt-1 flex flex-col gap-1", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-5" aria-label={tr.any("Installment timeline")}>
        {t.steps.map((s, i) => (
          <li key={s.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {i > 0 && <ArrowRight size={12} className="text-ink3 shrink-0" aria-hidden="true" />}
            <span aria-hidden="true" className={cx("size-2 rounded-full shrink-0", s.key === "late" && s.state !== "ahead" ? "bg-bad" : DOT[s.state])} />
            <span className={cx(s.state === "ahead" ? "text-ink3" : s.key === "late" ? "text-bad font-medium" : s.state === "today" ? "text-warn font-medium" : "text-ink2")}>{say(s.text)}</span>
          </li>
        ))}
      </ol>
      {t.reminders.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={tr.any("Reminder plan")}>
          {t.reminders.map((r) => (
            <li key={r.n} className={cx("h-6 px-2 rounded-full text-[11.5px] font-medium inline-flex items-center border",
              r.state === "sent" ? "border-ok/30 bg-ok/10 text-ok" : r.state === "not-sent" ? "border-line text-ink3" : "border-line text-ink2")}>
              {say(r.text)}
            </li>
          ))}
        </ul>
      )}
      {t.paused && <p className="text-[12px] text-info inline-flex items-center gap-1.5"><BellOff size={13} aria-hidden="true" />{tr.any(t.paused)}</p>}
    </div>
  );
}
