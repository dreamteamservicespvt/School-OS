"use client";

import { useState } from "react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import type { Option } from "@/components/ui/field";
import { WarnCheck } from "../_components/forms";
import { addAccountAction, moveMoneyAction, openingAction } from "./actions";
import { Words } from "@/lib/i18n/client";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

export type AccountChoice = Option & { balance: number };

/** Move money (mod-finance.jsx MoveMoneySheet): between cash and bank, for example a cash deposit. */
export function MoveMoneySheet({ closeHref, accounts, from: start, to: startTo, amount: startAmt, today, hint }: {
  closeHref: string; accounts: AccountChoice[]; from: string; to: string; amount: number; today: string; hint?: string;
}) {
  const [from, setFrom] = useState(start);
  const [amt, setAmt] = useState(startAmt);
  const have = accounts.find((a) => a.value === from);
  return (
    <SheetForm title="Move money" sub="Between cash and bank, for example a cash deposit. Not income or expense." closeHref={closeHref} action={moveMoneyAction}
      submitLabel={amt ? `Move ${inr(amt)}` : "Move money"} pendingText="Saving…">
      <div className="grid grid-cols-2 gap-3">
        <SSelect name="fromId" label="From" required options={accounts} start={start} onChange={(e) => setFrom(e.target.value)} />
        <SSelect name="toId" label="To" required options={accounts} start={startTo} />
      </div>
      <SMoney name="amount" label="Amount" required start={startAmt ? String(startAmt) : ""} onValue={(v) => setAmt(num(v))}
        help={have ? `${have.label} has ${inr(have.balance)} now${hint ? ` · ${hint}` : ""}` : undefined} />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={today} max={today} />
        <SText name="reference" label="Reference" placeholder="Slip 220871" maxLength={60} help="Deposit slip number" />
      </div>
      <WarnCheck field="amount" name="confirmLowCash" title="Move it anyway" sub="The account goes below zero until money comes in." />
    </SheetForm>
  );
}

/** Add bank account (mod-finance.jsx AddAccountSheet). */
export function AddAccountSheet({ closeHref, today, hasMain }: { closeHref: string; today: string; hasMain: boolean }) {
  const [no, setNo] = useState("");
  const digits = no.replace(/\D/g, "");
  return (
    <SheetForm title="Add bank account" sub="Used in the bank book, on expenses and in Fee Settings" closeHref={closeHref} action={addAccountAction} submitLabel="Add account" pendingText="Saving…">
      <SText name="name" label="Account name" required placeholder="Building fund" maxLength={60} />
      <SText name="bankName" label="Bank and branch" required placeholder="Canara Bank, Kukatpally" maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <SText name="accountNo" label="Account number" required inputMode="numeric" className="tnum" onChange={(e) => setNo(e.target.value)} help={digits.length >= 4 ? `Shown as XXXX XXXX ${digits.slice(-4)}` : "Kept encrypted; screens show the last 4 digits"} />
        <SText name="ifsc" label="IFSC" required placeholder="CNRB0001234" maxLength={11} style={{ textTransform: "uppercase" }} />
        <SMoney name="opening" label="Opening balance" required help="0 if the account is new" />
        <SDate name="asOn" label="As on" required start={today} />
      </div>
      <SSwitch name="isMain" title="Main bank account" sub={hasMain ? "Fees with no account chosen go here instead of the current main account" : "Fees with no account chosen go here"} start={!hasMain} />
    </SheetForm>
  );
}

/** Set or change an opening balance (mod-finance.jsx OpeningSheet). A change needs approval. */
export function OpeningSheet({ closeHref, accounts, goLive, today }: { closeHref: string; accounts: (Option & { set: boolean; amount: number; pending: boolean })[]; goLive: string | null; today: string }) {
  const [acct, setAcct] = useState(accounts.find((a) => !a.pending)?.value ?? accounts[0]?.value ?? "");
  const cur = accounts.find((a) => a.value === acct);
  const change = Boolean(cur?.set);
  return (
    <SheetForm title={change ? "Change an opening balance" : "Set an opening balance"} closeHref={closeHref} action={openingAction} submitLabel={change ? "Send for approval" : "Set balance"} pendingText="Saving…"
      sub={change ? `Opening balances were set at go-live${goLive ? ` on ${goLive}` : ""}. A change needs approval.` : "The balance in the account on the day the school starts using School OS."}>
      <SSelect name="accountId" label="Account" required start={acct} onChange={(e) => setAcct(e.target.value)}
        options={accounts.map((a) => ({ value: a.value, label: `${a.label} · ${a.pending ? "change waiting" : a.set ? `now ${inr(a.amount)}` : "not set"}` }))} />
      {cur?.pending && <p className="text-[13px] text-warn font-semibold"><Words k="A change to this balance is already waiting for approval." /></p>}
      <SMoney name="amount" label={change ? `Right opening balance${goLive ? ` on ${goLive}` : ""}` : "Opening balance"} required placeholder={cur?.set ? String(cur.amount) : undefined} />
      {!change && <SDate name="date" label="As on" required start={today} />}
      {change && <SArea name="reason" label="Reason" required rows={2} placeholder="Example: bank statement shows ₹42,21,600, a cheque cleared on 31 Mar" />}
    </SheetForm>
  );
}
