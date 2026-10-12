"use client";

// Class (and period) and date for Take Attendance, in the page head. Choosing
// one opens it at once; everything lives in the page address (P2).

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Spinner } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { inputCls } from "@/components/ui/field";

export type PickerChoice = { value: string; label: string };

export function SheetPicker({ choices, value, date, maxDate, minDate, classLabel }: {
  choices: PickerChoice[]; value: string; date: string; maxDate: string; minDate?: string; classLabel: string;
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
    <div className="flex gap-2 w-full md:w-auto items-center">
      {choices.length > 1 && (
        <div className="relative flex-1 md:w-60 md:flex-none">
          <select aria-label={classLabel} value={value} onChange={(e) => go({ choice: e.target.value })}
            className={cx(inputCls(false), "h-10 appearance-none pr-9 cursor-pointer text-[14px] font-semibold")}>
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
        </div>
      )}
      <input type="date" aria-label="Date" value={date} max={maxDate} min={minDate} required
        onChange={(e) => { if (e.target.value) go({ date: e.target.value }); }}
        className={cx(inputCls(false), "h-10 w-40 text-[14px] font-semibold tnum")} />
      {pending && <Spinner className="text-ink3" />}
    </div>
  );
}
