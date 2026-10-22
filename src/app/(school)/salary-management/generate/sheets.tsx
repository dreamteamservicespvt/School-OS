"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, type Option } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { ProblemLink } from "../_components/forms";
import { addAdjustmentAction, markPaidAction, openMonthAction, payStatutoryAction, tdsAction } from "./actions";

/** A choice of a few words, sent as a hidden field. */
function SegField({ name, label, options, start, onValue }: { name: string; label: string; options: readonly Option[]; start: string; onValue?: (v: string) => void }) {
  const t = useTyped(name, start);
  const [v, setV] = useState(t.value || start);
  return (
    <FieldShell label={label} id={`seg-${name}`} required error={t.error}>
      <input type="hidden" name={name} value={v} />
      <Segmented value={v} onChange={(x) => { setV(x); onValue?.(x); }} options={options} className="w-full" label={label} />
    </FieldShell>
  );
}

export function OpenMonthSheet({ closeHref, months, campuses, campusId, start }: { closeHref: string; months: Option[]; campuses: Option[]; campusId: string; start: string }) {
  return (
    <SheetForm title="Open a month" sub="One salary run a month for each campus." closeHref={closeHref} action={openMonthAction} submitLabel="Open month" pendingText="Opening…">
      <SSelect name="month" label="Month" required options={months} start={start} help="It also opens by itself on the 1st of the month." />
      <ProblemLink />
      {campuses.length > 1 ? <SSelect name="campusId" label="Campus" options={campuses} start={campusId} /> : <input type="hidden" name="campusId" value={campusId} />}
    </SheetForm>
  );
}

const TYPES = [{ value: "BONUS", label: "Bonus" }, { value: "ARREARS", label: "Arrears" }, { value: "DEDUCTION", label: "Deduction" }, { value: "OTHER", label: "Other" }];

export function AdjustmentSheet({ closeHref, runId, month, staff, staffId }: { closeHref: string; runId: string; month: string; staff: Option[]; staffId: string }) {
  const [type, setType] = useState("BONUS");
  return (
    <SheetForm title="Add adjustment" sub={`For ${month} only. Every adjustment keeps its reason.`} closeHref={closeHref} action={addAdjustmentAction} submitLabel="Add adjustment" pendingText="Saving…" hidden={{ runId }}>
      <SSelect name="staffId" label="Staff member" required options={staff} start={staffId} placeholder="Choose" />
      <SegField name="type" label="Type" options={TYPES} start="BONUS" onValue={setType} />
      <SMoney name="amount" label="Amount" required placeholder="2,000" />
      <SArea name="reason" label="Reason" required placeholder={type === "ARREARS" ? "Like: increment from 1 Sep paid late" : "Like: science fair coordination"} />
    </SheetForm>
  );
}

const MODES = [{ value: "BANK_TRANSFER", label: "Bank transfer" }, { value: "CHEQUE", label: "Cheque" }, { value: "CASH", label: "Cash" }];

export function PayRunSheet({ closeHref, runId, title, net, today, banks, mainBank, bankFileHref }: { closeHref: string; runId: string; title: string; net: string; today: string; banks: Option[]; mainBank: string; bankFileHref: string }) {
  const [mode, setMode] = useState("BANK_TRANSFER");
  return (
    <SheetForm title={title} sub="Only now the salary goes into the Day Book, on the date paid." closeHref={closeHref} action={markPaidAction} submitLabel={`Mark paid · ${net}`} pendingText="Saving…" hidden={{ runId }}>
      <SDate name="date" label="Paid on" required start={today} max={today} />
      <SegField name="mode" label="How was it paid?" options={MODES} start="BANK_TRANSFER" onValue={setMode} />
      {mode !== "CASH" && <SText name="reference" label={mode === "CHEQUE" ? "Cheque numbers" : "Bank batch reference or UTR"} required className="font-mono" placeholder={mode === "CHEQUE" ? "004581-004584" : "HDFCB26100941"} />}
      {mode !== "CASH" && banks.length > 0 && <SSelect name="accountId" label="From account" options={banks} start={mainBank} />}
      {mode === "BANK_TRANSFER" && <a href={bankFileHref} download className={buttonClass("ghost", "md", "self-start -ml-2")}><FileDown size={17} aria-hidden="true" />Download bank transfer file</a>}
    </SheetForm>
  );
}

const GOV_MODES: Option[] = [{ value: "BANK_TRANSFER", label: "Online or bank" }, { value: "CHEQUE", label: "Cheque" }, { value: "CASH", label: "Cash" }];

/** PF, ESI, Professional Tax or TDS of one paid month, recorded paid to the government. It goes into the Day Book on the date paid. */
export function StatutoryPaySheet({ closeHref, runId, kind, title, sub, left, today, earliest, banks, mainBank }: {
  closeHref: string; runId: string; kind: string; title: string; sub: string; left: string; today: string; earliest: string; banks: Option[]; mainBank: string;
}) {
  const [mode, setMode] = useState("BANK_TRANSFER");
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} action={payStatutoryAction} submitLabel="Record paid" pendingText="Saving…" hidden={{ runId, kind }}>
      <SMoney name="amount" label="Amount paid" required start={left} help="All that is to pay. Change it to record part of it." />
      <SDate name="date" label="Paid on" required start={today} min={earliest} max={today} />
      <SegField name="mode" label="How was it paid?" options={GOV_MODES} start="BANK_TRANSFER" onValue={setMode} />
      {mode !== "CASH" && <SText name="reference" label="Challan or reference number" required className="font-mono" placeholder="Like: TRRN 1234567890123" />}
      {mode !== "CASH" && banks.length > 0 && <SSelect name="accountId" label="From account" options={banks} start={mainBank} />}
    </SheetForm>
  );
}

export function TdsSheet({ closeHref, runId, staffId, name, months, start, current }: { closeHref: string; runId: string; staffId: string; name: string; months: Option[]; start: string; current: string }) {
  return (
    <SheetForm title={`TDS for ${name}`} sub="Typed in, not worked out by School OS. Saved on the salary structure." closeHref={closeHref} action={tdsAction} submitLabel="Save TDS" pendingText="Saving…" hidden={{ runId, staffId }}>
      <SMoney name="tds" label="TDS per month" required start={current} help="From the tax declaration for the year" />
      <SSelect name="from" label="From" options={months} start={start} />
      <SText name="reason" label="Reason" placeholder="Like: tax declaration 2026-27" />
    </SheetForm>
  );
}
