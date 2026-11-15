"use client";

// Class (and period) and date for Take Attendance, in the page head. Choosing
// one opens it at once; everything lives in the page address (P2).

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Spinner } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { inputCls } from "@/components/ui/field";
import { DateInput } from "@/components/ui/date-input";
import { Words } from "@/lib/i18n/client";

export type PickerChoice = { value: string; label: string };

export function SheetPicker({ choices, value, date, maxDate, minDate, classLabel, lastDay }: {
  choices: PickerChoice[]; value: string; date: string; maxDate: string; minDate?: string; classLabel: string;
  /** The last school day before today: a one-tap chip, so a missed day needs no calendar (layman loop 5). */
  lastDay?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const go = (next: { choice?: string; date?: string }) => {
    const sp = new URLSearchParams();
    const choice = next.choice ?? value;
    const [section, period] = choice.split(":");
    const d = next.date ?? date;
    if (d && d !== maxDate) sp.set("date", d);
    if (section) sp.set("section", section);
    if (period && period !== "0" && next.date === undefined) sp.set("period", period);
    start(() => router.push(sp.toString() ? `${pathname}?${sp}` : pathname, { scroll: false }));
  };
  return (
    <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
      {choices.length > 1 && (
        <div className="relative flex-1 md:w-60 md:flex-none">
          <select aria-label={classLabel} value={value} onChange={(e) => go({ choice: e.target.value })}
            className={cx(inputCls(false), "h-10 appearance-none pr-9 cursor-pointer text-[14px] font-semibold")}>
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
        </div>
      )}
      <DateInput aria-label="Date" value={date} max={maxDate} min={minDate} required
        onChange={(e) => { if (e.target.value) go({ date: e.target.value }); }}
        className={cx(inputCls(false), "h-10 w-40 text-[14px] font-semibold tnum")} />
      {date === maxDate ? lastDay && (
        <button type="button" onClick={() => go({ date: lastDay })} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink2 hover:bg-sunken">
          <Words k="Last school day" />
        </button>
      ) : (
        <button type="button" onClick={() => go({ date: maxDate })} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink2 hover:bg-sunken">
          <Words k="Today" />
        </button>
      )}
      {pending && <Spinner className="text-ink3" />}
    </div>
  );
}
