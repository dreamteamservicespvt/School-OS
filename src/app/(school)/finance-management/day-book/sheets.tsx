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
import { Words, useT } from "@/lib/i18n/client";

const inr = (paise: number) => `${paise < 0 ? "−" : ""}₹${(Math.abs(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
/** Typed rupees as paise, or null while the box is empty or not an amount. */
const toPaise = (s: string) => {
  const v = s.replace(/[,₹\s]/g, "");
  if (!v || !/^\d{1,10}(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
};

export function CloseDaySheet({ closeHref, date, dateWords, expectedPaise, incomePaise, expensePaise, entries, isToday, timeNow, problem }: {
  closeHref: string; date: string; dateWords: string; expectedPaise: number; incomePaise: number; expensePaise: number; entries: number; isToday: boolean; timeNow: string; problem: string | null;
}) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const counted = toPaise(typed);
  const diff = counted === null ? null : counted - expectedPaise;
  return (
    <SheetForm title={`Close ${dateWords}`} sub="Count the cash in the box. After closing, nothing on this day, or before it, can change." closeHref={closeHref}
      action={closeDayAction} submitLabel="Close the day" pendingText="Closing…" hidden={{ date }} submitDisabled={Boolean(problem)}>
      {problem && <Banner tone="bad" title="This day cannot be closed now.">{problem}</Banner>}
      {!problem && isToday && <Banner tone="warn"><Words k="It is" /> {timeNow}<Words k=". Anything recorded after closing goes into tomorrow’s Day Book." /></Banner>}
      <ul className="rounded-2xl border border-line px-4">
        <Line k={t(entries === 1 ? "Income that day, cash, UPI and bank · 1 entry" : "Income that day, cash, UPI and bank · {n} entries", { n: entries })} v={inr(incomePaise)} />
        <Line k={<Words k="Expense that day, all modes" />} v={inr(expensePaise)} />
        <Line k={<Words k="Cash that should be in the box now (cash only, all days)" />} v={inr(expectedPaise)} bold />
        <Line k={<Words k="You counted" />} v={counted === null ? "—" : inr(counted)} />
        <Line k={<Words k="Difference" />} v={diff === null ? "—" : diff === 0 ? t("None") : `${inr(Math.abs(diff))} ${t(diff < 0 ? "short" : "extra")}`} tone={diff === null ? undefined : diff === 0 ? "ok" : "bad"} />
      </ul>
      <p className="text-[12.5px] text-ink3 -mt-2"><Words k="UPI, card and bank money is not in the box, so it is not counted here." /></p>
      <SMoney name="counted" label="Cash counted" required big placeholder="0" onValue={setTyped}
        help="Notes and coins in the office cash box, in rupees" />
      {diff !== null && diff !== 0 && (
        // Not "required" in the browser: the server says what is wrong in words ("The count is ₹100 less than the books. Say why…"), loop 4.
        <SArea name="reason" label="Why is the cash different?" rows={2} placeholder="Example: ₹100 short, change given twice to a parent"
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
