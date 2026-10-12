import type { LucideIcon } from "lucide-react";
import { Circle } from "lucide-react";
import { cx } from "./cx";
import { TONE_SOFT, type Tone } from "./stats";

// A history, newest first (design/ui-prototype/src/kit.jsx Timeline).

export type TimelineItem = { icon?: LucideIcon; tone?: Tone | "neutral"; what: React.ReactNode; when: React.ReactNode };

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((t, i) => {
        const Ic = t.icon ?? Circle;
        return (
          <li key={i} className="grid grid-cols-[36px_1fr] gap-3">
            <span className="flex flex-col items-center">
              <span className={cx("w-9 h-9 rounded-full grid place-items-center", TONE_SOFT[t.tone || "neutral"])}><Ic size={16} aria-hidden="true" /></span>
              {i < items.length - 1 && <span className="w-px flex-1 bg-line my-1" aria-hidden="true" />}
            </span>
            <div className="pb-5 pt-1.5 min-w-0">
              <p className="text-[14.5px] leading-snug break-words">{t.what}</p>
              <p className="text-[12.5px] text-ink3 mt-0.5">{t.when}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
