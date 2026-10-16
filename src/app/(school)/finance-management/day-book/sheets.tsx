"use client";

// Close the day (mod-finance.jsx CloseDaySheet): count the cash in the box
// against what the books expect; a difference needs a reason. And the
// Principal's Reopen, with a reason.
import { useState } from "react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SMoney } from "@/components/ui/sheet-fields";
import { Banner } from "@/components/money/kit";
import { ReasonSheet } from "../_components/forms";
import { Line } from "../_components/bits";
import { closeDayAction, reopenDayAction } from "./actions";

const inr = (paise: number) => `${paise < 0 ? "−" : ""}₹${(Math.abs(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const signedInr = (paise: number) => (paise > 0 ? `+${inr(paise)}` : inr(paise));
/** Typed rupees as paise, or null while the box is empty or not an amount. */
const toPaise = (s: string) => {
  const v = s.replace(/[,₹\s]/g, "");
  if (!v || !/^\d{1,10}(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
};

export function CloseDaySheet({ closeHref, date, dateWords, expectedPaise, incomePaise, expensePaise, entries, isToday, timeNow, problem }: {
  closeHref: string; date: string; dateWords: string; expectedPaise: number; incomePaise: number; expensePaise: number; entries: number; isToday: boolean; timeNow: string; problem: string | null;
}) {
  const [typed, setTyped] = useState("");
  const counted = toPaise(typed);
  const diff = counted === null ? null : counted - expectedPaise;
  return (
    <SheetForm title={`Close ${dateWords}`} sub="Count the cash in the box. After closing, nothing on this day, or before it, can change." closeHref={closeHref}
      action={closeDayAction} submitLabel="Close the day" pendingText="Closing…" hidden={{ date }} submitDisabled={Boolean(problem)}>
      {problem && <Banner tone="bad" title="This day cannot be closed now.">{problem}</Banner>}
      {!problem && isToday && <Banner tone="warn">It is {timeNow}. Anything recorded after closing goes into tomorrow’s Day Book.</Banner>}
      <ul className="rounded-2xl border border-line px-4">
        <Line k={`Income · ${entries} ${entries === 1 ? "entry" : "entries"} that day`} v={inr(incomePaise)} />
        <Line k="Expense" v={inr(expensePaise)} />
        <Line k="Cash the books expect" v={inr(expectedPaise)} bold />
        <Line k="You counted" v={counted === null ? "—" : inr(counted)} />
        <Line k="Difference" v={diff === null ? "—" : diff === 0 ? "None" : signedInr(diff)} tone={diff === null ? undefined : diff === 0 ? "ok" : "bad"} />
      </ul>
      <SMoney name="counted" label="Cash counted" required big placeholder={String(Math.max(0, expectedPaise) / 100)} onValue={setTyped}
        help="Notes and coins in the office cash box, in rupees" />
      {diff !== null && diff !== 0 && (
        <SArea name="reason" label="Why is it different?" required rows={2} placeholder="Example: ₹100 short, change given twice to a parent"
          help="The Principal is told, with this reason." />
      )}
    </SheetForm>
  );
}

export function ReopenDaySheet({ closeHref, closeId, dateWords, closedBy }: { closeHref: string; closeId: string; dateWords: string; closedBy: string }) {
  return (
    <ReasonSheet closeHref={closeHref} title={`Reopen ${dateWords}`} label="Reopen the day" action={reopenDayAction} hidden={{ closeId }}
      sub={`Closed by ${closedBy}. Its entries can change again until it is counted and closed again.`}
      placeholder="Example: a cheque entered on the wrong date has to be put right" />
  );
}
