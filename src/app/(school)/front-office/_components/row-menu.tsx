"use client";

// The "..." menu on a Front Office row: items open a sheet (a link in the page
// address), dial a number, or run one server action straight away (Mark
// closed, Mark done). The server checks the role again on every action.

import { useState, useTransition } from "react";
import { BellPlus, CalendarClock, CircleCheck, CircleX, LogIn, PhoneOutgoing, UserX, type LucideIcon } from "lucide-react";
import type { FormState } from "@/lib/forms";
import { MoreMenu } from "@/components/ui/more-menu";

const ICONS = { bell: BellPlus, call: PhoneOutgoing, done: CircleCheck, cancel: CircleX, arrive: LogIn, noshow: UserX, move: CalendarClock } satisfies Record<string, LucideIcon>;
export type RowIcon = keyof typeof ICONS;

type Act = (prev: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;
export type RowItem = { label: string; icon: RowIcon; href?: string; action?: Act; fields?: Record<string, string>; tone?: "bad" };

export function RowMenu({ items, label }: { items: RowItem[]; label: string }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const run = (i: RowItem) => {
    if (!i.action) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(i.fields ?? {})) fd.set(k, v);
    setProblem(null);
    start(async () => {
      const r = await i.action!(null, fd);
      if (r && !r.ok) setProblem(r.message ?? "That did not work. Please try again.");
    });
  };
  if (!items.length) return null;
  return (
    <div className="relative z-[1] inline-flex flex-col items-end gap-1" aria-busy={pending || undefined}>
      <MoreMenu size="sm" label={label} items={items.map((i) => {
        const Ic = ICONS[i.icon];
        return { label: i.label, href: i.href, tone: i.tone, icon: <Ic size={16} aria-hidden="true" />, onClick: i.action ? () => run(i) : undefined };
      })} />
      {problem && <span className="text-[12px] text-bad max-w-[220px] text-right" role="alert">{problem}</span>}
    </div>
  );
}
