"use client";

import { useState } from "react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented, Switch } from "@/components/ui/controls";
import type { Option } from "@/components/ui/field";
import { recordIncomeAction } from "./actions";

const MODES = [{ value: "CASH", label: "Cash" }, { value: "UPI", label: "UPI" }, { value: "BANK_TRANSFER", label: "Bank transfer" }, { value: "CHEQUE", label: "Cheque" }];

/** Record income (mod-finance.jsx RecordIncomeSheet): for money other than fees. */
export function RecordIncomeSheet({ closeHref, today, heads, payers, cash, banks, mainBank }: {
  closeHref: string; today: string; heads: Option[]; payers: string[]; cash: Option[]; banks: Option[]; mainBank: string;
}) {
  const [mode, setMode] = useState("CASH");
  const [post, setPost] = useState(true);
  const accounts = mode === "CASH" ? cash : banks;
  return (
    <SheetForm title="Record income" sub="For money other than fees" closeHref={closeHref} action={recordIncomeAction}
      submitLabel={post ? "Post to Day Book" : "Save as draft"} pendingText="Saving…" hidden={{ mode, post: post ? "on" : "" }}>
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={today} />
        <SMoney name="amount" label="Amount" required />
      </div>
      <SSelect name="accountHeadId" label="Income head" required options={heads} placeholder="Choose a head" help="From the chart of accounts" />
      <SText name="receivedFrom" label="Received from" required placeholder="Example: Annapurna Caterers" list="ri-from-list" maxLength={120} />
      <datalist id="ri-from-list">{payers.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Mode<span className="text-bad" aria-hidden="true"> *</span></span>
        <Segmented label="Mode" value={mode} onChange={setMode} className="w-full" options={MODES} />
      </div>
      {mode !== "CASH" && <SText name="reference" label="Reference" required placeholder={mode === "CHEQUE" ? "Cheque 118204 · Canara Bank" : "UTR 4283…"} maxLength={80} />}
      <SSelect key={mode} name="accountId" label="Into" required options={accounts} start={mode === "CASH" ? accounts[0]?.value : mainBank}
        help={mode === "CASH" ? "Cash goes into the office cash box" : "The main bank account unless you choose another"} />
      <SArea name="note" label="Note" placeholder="Optional" />
      <div className="flex items-center gap-3 rounded-xl bg-sunken/70 px-3.5 py-3">
        <Switch id="ri-post" on={post} label="Post now" onChange={setPost} />
        <label htmlFor="ri-post" className="text-[14px]"><b className="font-semibold">Post now</b><span className="block text-[12.5px] text-ink3">{post ? "Goes into the Day Book straight away" : "Kept as a draft, for example until a cheque clears"}</span></label>
      </div>
    </SheetForm>
  );
}
