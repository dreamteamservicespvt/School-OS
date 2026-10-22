"use client";

// Finance Settings sheets and switches (mod-finance.jsx SettingsPage, AddHeadSheet).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SheetForm } from "@/components/ui/url-sheet";
import { SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented, Switch } from "@/components/ui/controls";
import type { Option } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import Link from "next/link";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { addHeadAction, billsAction, closeMonthAction, closeYearAction, costCentreAction, featureAction, headShownAction, tallyAction, yearAction } from "./actions";

const MONTHS = [{ value: "4", label: "April" }, { value: "1", label: "January" }, { value: "6", label: "June" }];
const END: Record<string, string> = { "4": "March", "1": "December", "6": "May" };

export function YearSheet({ closeHref, start, goLive }: { closeHref: string; start: string; goLive: string }) {
  const [m, setM] = useState(start);
  return (
    <SheetForm title="Financial year" sub="Kept apart from the academic year" closeHref={closeHref} action={yearAction} submitLabel="Save" pendingText="Saving…">
      <SSelect name="fyStartMonth" label="Year starts in" options={MONTHS} start={start} onChange={(e) => setM(e.target.value)}
        help={`So the year runs ${MONTHS.find((x) => x.value === m)?.label} to ${END[m]}. A change takes effect from the next financial year.`} />
      <SDate name="goLiveDate" label="Go-live date" required start={goLive}
        help="The first day the school keeps fees and accounts in School OS. Earlier records stay in the old software." />
    </SheetForm>
  );
}

export function BillsSheet({ closeHref, billAbove, atOnce, incomePrefix, journalPrefix }: { closeHref: string; billAbove: string; atOnce: string; incomePrefix: string; journalPrefix: string }) {
  return (
    <SheetForm title="Bills and cash" sub="Limits for recording expenses, and numbering" closeHref={closeHref} action={billsAction} submitLabel="Save" pendingText="Saving…">
      <SMoney name="billRequiredAbove" label="Bill photo needed above" required start={billAbove} help="Expenses above this cannot be paid without a photo of the bill." />
      <SMoney name="expenseApproveUpTo" label="Approved at once up to" required start={atOnce} help="Bigger expenses go to Approvals. Who approves is set in Settings, Forms & Approvals." />
      <div className="grid grid-cols-2 gap-3">
        <SText name="incomeReceiptPrefix" label="Income receipt prefix" required start={incomePrefix} maxLength={12} className="font-mono" />
        <SText name="journalPrefix" label="Journal entry prefix" required start={journalPrefix} maxLength={12} className="font-mono" />
      </div>
    </SheetForm>
  );
}

export function AddHeadSheet({ closeHref, groups }: { closeHref: string; groups: { INCOME: string[]; EXPENSE: string[] } }) {
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const opts = (k: "INCOME" | "EXPENSE"): Option[] => groups[k].map((g) => ({ value: g, label: g }));
  return (
    <SheetForm title="Add head" sub="To the chart of accounts" closeHref={closeHref} action={addHeadAction} submitLabel="Add head" pendingText="Adding…" hidden={{ kind }}>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Type</span>
        <Segmented label="Type" value={kind} onChange={(v) => setKind(v as "INCOME" | "EXPENSE")} className="w-full" options={[{ value: "INCOME", label: "Income" }, { value: "EXPENSE", label: "Expense" }]} />
      </div>
      <SText name="name" label="Name" required placeholder={kind === "EXPENSE" ? "Science fair" : "Summer camp fees"} />
      <div className="grid grid-cols-2 gap-3">
        <SText name="code" label="Code" required inputMode="numeric" maxLength={4} placeholder={kind === "EXPENSE" ? "5350" : "4280"} help={`4 digits, starting with ${kind === "INCOME" ? 4 : 5}`} />
        <SSelect key={kind} name="group" label="Group" required options={opts(kind)} start={groups[kind][0]} />
      </div>
    </SheetForm>
  );
}

export function CostCentreSheet({ closeHref }: { closeHref: string }) {
  return (
    <SheetForm title="Add department" sub="A cost centre that expenses and budgets are tagged to" closeHref={closeHref} action={costCentreAction} submitLabel="Add" pendingText="Adding…">
      <SText name="name" label="Name" required placeholder="Science labs" maxLength={60} />
    </SheetForm>
  );
}

export function TallySheet({ closeHref, heads }: { closeHref: string; heads: { id: string; name: string; ledger: string }[] }) {
  return (
    <SheetForm title="Tally ledger names" sub="The ledger each head goes to in Tally. Leave a name blank to use the head’s own name." closeHref={closeHref} action={tallyAction} submitLabel="Save" pendingText="Saving…" wide>
      <ul className="flex flex-col gap-2.5">
        {heads.map((h) => (
          <li key={h.id} className="grid grid-cols-[1fr_1.2fr] gap-3 items-center">
            <input type="hidden" name="headId" value={h.id} />
            <label htmlFor={`tl-${h.id}`} className="text-[14px] min-w-0 truncate">{h.name}</label>
            <input id={`tl-${h.id}`} name="ledger" defaultValue={h.ledger} placeholder={h.name} maxLength={80}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-[13.5px] font-mono focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </li>
        ))}
      </ul>
    </SheetForm>
  );
}

export function CloseMonthSheet({ closeHref, month, label, open }: { closeHref: string; month: string; label: string; open: string[] }) {
  return (
    <SheetForm title={`Close ${label}?`} closeHref={closeHref} action={closeMonthAction} submitLabel={`Close ${label}`} pendingText="Closing…" hidden={{ month }}
      sub="After this, nothing dated in the month can be added, changed or cancelled. Mistakes go in as adjustments in an open month.">
      {open.length > 0 && <p className="text-[13.5px] text-warn font-semibold">Close {open.join(", ")} first: months close in order.</p>}
    </SheetForm>
  );
}

export type YearCheckRow = { key: string; tone: "stop" | "look" | "ok"; text: string; href?: string };

const CHECK_ICON = { stop: [CircleX, "text-bad"], look: [CircleAlert, "text-warn"], ok: [CircleCheck, "text-ok"] } as const;

/** Close a financial year: the check list first, then what closing does. Refused on the server while anything stops it. */
export function CloseYearSheet({ closeHref, yearId, name, checks, carried, result, nextName, nextStart, canClose }: {
  closeHref: string; yearId: string; name: string; checks: YearCheckRow[]; carried: { name: string; amount: string }[]; result: string; nextName: string; nextStart: string; canClose: boolean;
}) {
  return (
    <SheetForm title={`Close ${name}?`} closeHref={closeHref} action={closeYearAction} submitLabel={`Close ${name}`} pendingText="Closing…" hidden={{ yearId }} submitDisabled={!canClose}
      sub="Check the list, then close. Closing cannot be undone.">
      <div>
        <p className="eyebrow text-ink3 mb-2">Before closing</p>
        <ul className="flex flex-col gap-2.5">
          {checks.map((c) => {
            const [Icon, tone] = CHECK_ICON[c.tone];
            return (
              <li key={c.key} className="flex gap-2.5 text-[13.5px] leading-snug">
                <Icon size={17} className={`shrink-0 mt-0.5 ${tone}`} aria-hidden="true" />
                <span><span className="sr-only">{c.tone === "stop" ? "Must be done first: " : c.tone === "look" ? "Worth a look: " : "Done: "}</span>{c.text}{c.href && <> <Link href={c.href} className="font-semibold text-brand underline-offset-2 hover:underline">Open</Link></>}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <p className="eyebrow text-ink3 mb-2">What closing does</p>
        <ul className="flex flex-col gap-2 text-[13.5px] text-ink2 list-disc pl-5">
          <li>Nothing dated in {name} can be added, changed or cancelled any more: no fee payment, income, expense, salary payment, journal entry or money move. A mistake found later goes in as an adjustment in {nextName}.</li>
          <li>Each account&apos;s closing balance is its opening balance on {nextStart}{carried.length ? ":" : "."}
            {carried.length > 0 && <ul className="mt-1 list-none pl-0">{carried.map((a) => <li key={a.name} className="flex justify-between gap-3"><span>{a.name}</span><b className="font-semibold tnum text-ink">{a.amount}</b></li>)}</ul>}
          </li>
          <li>Income and expense heads start {nextName} at ₹0. {result}</li>
        </ul>
      </div>
    </SheetForm>
  );
}

type Act = (prev: unknown, fd: FormData) => Promise<FormState<unknown>>;

/** An on/off switch that saves at once, and says so if it did not work. */
function SaveSwitch({ on, label, action, fields }: { on: boolean; label: string; action: Act; fields: (next: boolean) => Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState(on);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1 shrink-0">
      <Switch on={v} label={label} disabled={busy} onChange={async (next) => {
        setBusy(true); setErr(null); setV(next);
        const fd = new FormData();
        for (const [k, val] of Object.entries(fields(next))) fd.set(k, val);
        const r = await action(null, fd);
        if (r && !r.ok) { setV(!next); setErr(r.message || "That did not work."); } else router.refresh();
        setBusy(false);
      }} />
      {err && <span className="text-[12px] text-bad max-w-[220px] text-right" role="alert">{err}</span>}
    </span>
  );
}

export function FeatureSwitch({ featureKey, on, label }: { featureKey: string; on: boolean; label: string }) {
  return <SaveSwitch on={on} label={label} action={featureAction} fields={(next) => ({ key: featureKey, on: next ? "1" : "0" })} />;
}

/** A head on the Record expense form: tap to show or hide (mod-finance.jsx "Expense categories"). */
export function HeadChip({ id, name, shown, locked }: { id: string; name: string; shown: boolean; locked: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(shown);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button type="button" aria-pressed={on} disabled={busy || locked} title={locked ? "Filled in by the software, so it always shows" : undefined}
        onClick={async () => {
          setBusy(true); setErr(null); const next = !on; setOn(next);
          const fd = new FormData(); fd.set("headId", id); fd.set("shown", next ? "1" : "0");
          const r = await headShownAction(null, fd);
          if (r && !r.ok) { setOn(!next); setErr(r.message || "That did not work."); } else router.refresh();
          setBusy(false);
        }}
        className={`inline-flex items-center h-8 px-3 rounded-full text-[13px] font-semibold transition border ${on ? "bg-brand/10 text-brand border-brand/25" : "bg-sunken text-ink3 border-transparent line-through"} ${locked ? "cursor-default" : "hover:border-brand/40"}`}>
        {name}
      </button>
      {err && <span className="text-[11.5px] text-bad mt-0.5" role="alert">{err}</span>}
    </span>
  );
}
