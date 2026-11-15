"use client";

// The small due chip at the end of a student's row in search results and the
// student picker (adopt item 8). The server sends it only to people who may
// see fees (src/lib/fees/due-chips.ts); this only shows it.
import { cx } from "@/components/ui/cx";
import { useT } from "@/lib/i18n/client";

export type DueChip = { text: string; tone: "bad" | "warn" | "ok" };

const CHIP_TONE: Record<DueChip["tone"], string> = { bad: "bg-bad/12 text-bad", warn: "bg-warn/15 text-warn", ok: "bg-ok/12 text-ok" };

export function DueChipView({ due }: { due: DueChip }) {
  const t = useT();
  return <span className={cx("shrink-0 inline-flex items-center h-6 px-2 rounded-full text-[11.5px] font-semibold tnum whitespace-nowrap", CHIP_TONE[due.tone])}>{t.any(due.text)}</span>;
}
