"use client";

import { useState } from "react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import type { Option } from "@/components/ui/field";
import { copyBudgetsAction, reviseBudgetAction, setBudgetAction } from "./actions";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
const SPLITS = [{ value: "month", label: "Equal by month" }, { value: "term", label: "Equal by term" }, { value: "year", label: "Whole year" }];

export function BudgetSheet({ closeHref, year, yearLabel, heads, centres, taken }: { closeHref: string; year: string; yearLabel: string; heads: Option[]; centres: Option[] | null; taken: string[] }) {
  const [amt, setAmt] = useState(0);
  const [split, setSplit] = useState("month");
  const [head, setHead] = useState("");
  const [dept, setDept] = useState("");
  const clash = head && taken.includes(`${head}:${dept}`);
  return (
    <SheetForm title="Set a budget" sub={`For the financial year ${yearLabel}`} closeHref={closeHref} action={setBudgetAction} submitLabel="Set budget" pendingText="Saving…" hidden={{ financialYearId: year, period: split }}>
      <SSelect name="accountHeadId" label="Expense head" required options={heads} placeholder="Choose a head" onChange={(e) => setHead(e.target.value)} />
      {centres && <SSelect name="costCentreId" label="Department" options={centres} placeholder="All departments" help="Optional. Leave it for the whole head." onChange={(e) => setDept(e.target.value)} />}
      {clash && <p className="text-[13px] text-warn font-semibold -mt-2">This head already has a budget for {yearLabel}. Use Revise to change it.</p>}
      <SMoney name="amount" label="Amount for the year" required onValue={(v) => setAmt(num(v))} help={amt ? `${inr(amt / 12)} a month, ${inr(amt / 3)} a term` : undefined} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Split</span>
        <Segmented label="Split" value={split} onChange={setSplit} className="w-full" options={SPLITS} />
      </div>
    </SheetForm>
  );
}

export function ReviseSheet({ closeHref, budgetId, title, sub, now, used }: { closeHref: string; budgetId: string; title: string; sub: string; now: number; used: number }) {
  const [amt, setAmt] = useState(0);
  const help = amt && amt !== now ? `${amt > now ? "+" : "−"}${inr(Math.abs(amt - now))} · ${Math.round((used * 100) / amt)}% used after this` : undefined;
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} action={reviseBudgetAction} submitLabel="Save revision" pendingText="Saving…" hidden={{ budgetId }}>
      <SMoney name="amount" label="New budget for the year" required placeholder={String(now)} onValue={(v) => setAmt(num(v))} help={help} />
      {amt > 0 && amt < used && <p className="text-[13px] text-warn font-semibold -mt-2">Already {inr(used)} spent or committed. The head shows as over budget.</p>}
      <SArea name="reason" label="Reason" required rows={2} placeholder="Example: Annual Day moved to December" help="Kept with the revision." />
    </SheetForm>
  );
}

export function CopySheet({ closeHref, fromYear, nextLabel, total }: { closeHref: string; fromYear: string; nextLabel: string; total: number }) {
  const [p, setP] = useState("8");
  const v = Number(p) || 0;
  return (
    <SheetForm title={`Plan ${nextLabel}`} sub="Copy this year’s budget with a change. You can change each head afterwards." closeHref={closeHref} action={copyBudgetsAction} submitLabel="Make next year’s budget" pendingText="Saving…" hidden={{ fromYearId: fromYear }}>
      <div className="flex items-end gap-2">
        <SText name="percent" label="Change on every head" required start="8" inputMode="numeric" className="w-28" onChange={(e) => setP(e.target.value)} />
        <span className="text-[15px] text-ink2 pb-2.5">% more</span>
      </div>
      <p className="text-[13px] text-ink3 -mt-1">This year {inr(total)} → next year {inr(total * (1 + v / 100))}. Heads that already have a budget next year are left as they are.</p>
    </SheetForm>
  );
}
