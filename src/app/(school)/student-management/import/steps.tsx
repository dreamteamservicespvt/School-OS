import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";

const STEPS = ["Template", "Upload", "Match columns", "Check", "Import"];

/** The five steps of an import (P10), with the current one marked. */
export function ImportSteps({ at }: { at: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <Card className="p-2.5 mb-4">
      <ol className="grid grid-cols-5 gap-1.5" aria-label="Steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <li key={s} aria-current={n === at ? "step" : undefined} className={cx("flex items-center gap-2 rounded-xl px-2 md:px-3 py-2 min-w-0", n === at && "bg-brand/10")}>
              <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold tnum", n < at ? "bg-ok text-white" : n === at ? "bg-brand text-brandink" : "bg-sunken text-ink2")}>{n < at ? <Check size={14} aria-hidden="true" /> : n}</span>
              <span className={cx("text-[13px] font-semibold truncate hidden sm:inline", n === at ? "text-ink" : "text-ink2")}>{s}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
