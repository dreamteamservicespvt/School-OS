"use client";

// Class (and period) and date at the top of Take Attendance. Choosing one
// opens it at once; everything lives in the page address (P2).

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/button";

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
    if (d) sp.set("date", d);
    if (section) sp.set("section", section);
    if (period && period !== "0" && next.date === undefined) sp.set("period", period);
    start(() => router.push(`${pathname}?${sp}`, { scroll: false }));
  };
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{classLabel}</span>
        <select value={value} onChange={(e) => go({ choice: e.target.value })} disabled={choices.length === 0}
          className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base">
          {choices.length === 0 && <option value="">No classes</option>}
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 flex items-center gap-2 text-sm font-medium">Date {pending && <Spinner className="size-3.5 text-ink-2" />}</span>
        <input type="date" value={date} max={maxDate} min={minDate} required
          onChange={(e) => { if (e.target.value) go({ date: e.target.value }); }}
          className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base sm:w-48" />
      </label>
    </div>
  );
}
