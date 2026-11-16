"use client";

// Collect Fee (fees.jsx): tick the rows being paid, type what was received,
// choose how it was paid, collect. One step posts the payment, makes the
// receipt and tells the parent. Every rule is checked again on the server.

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CalendarDays, Check, ChevronDown, CreditCard, Download, FileSignature, Info, Landmark, LoaderCircle, MessageCircle, PartyPopper, Printer, QrCode, Send, Smartphone, TriangleAlert, type LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Pill } from "@/components/ui/badge";
import { Dialog, SheetHead, sheetCls } from "@/components/ui/dialog";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Empty } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import type { DueStatus } from "@/lib/fees/dues";
import { DUE_WORD } from "../../_components/bits";
import { askDiscountApproval, collectFee, qrPaid, receiptDelivery, resendReceipt, sendLink, showQr, type Collected, type QrLink } from "./actions";
import { KeepCheck } from "@/components/ui/keep-select";
import { Words, useT } from "@/lib/i18n/client";
import { screenLine } from "@/lib/i18n/messages";
import { FormProblems, bringToBox } from "@/components/ui/form-problems";
import { DateInput, DateTimeInput } from "@/components/ui/date-input";
import { UTR_LENGTH, paymentRefProblem, upiTyping } from "@/lib/payment-ref";
import type { FeeTimeline } from "@/lib/fees/timeline";
import { FeeTimelineLine } from "../../ledger/[studentId]/timeline";
import { quickAmounts, staysDue } from "./quick-amounts";

export type DueRow = { id: string; head: string; label: string; due: string; net: number; paid: number; balance: number; status: DueStatus; lateFee: boolean; timeline?: FeeTimeline | null };

const MODES: { id: string; label: string; short: string; icon: LucideIcon }[] = [
  { id: "CASH", label: "Cash", short: "Cash", icon: Banknote },
  { id: "UPI", label: "UPI", short: "UPI", icon: Smartphone },
  { id: "CARD", label: "Card", short: "Card", icon: CreditCard },
  { id: "CHEQUE", label: "Cheque", short: "Cheque", icon: FileSignature },
  { id: "BANK_TRANSFER", label: "Bank transfer", short: "Bank", icon: Landmark },
];
const NEEDS_REF = ["UPI", "CARD", "BANK_TRANSFER"];
// The big button names the amount AND the mode, so a mis-tap is seen before it is a receipt (L6-18).
const BY_MODE: Record<string, string> = { CASH: "in cash", UPI: "by UPI", CARD: "by card", CHEQUE: "by cheque", BANK_TRANSFER: "by bank transfer" };

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const toPaise = (s: string) => {
  const v = s.replace(/[,₹\s]/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) return v ? NaN : 0;
  const [r, p = ""] = v.split(".");
  return Number(r) * 100 + Number((p + "00").slice(0, 2));
};
const rupeesText = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

type Problem = { link?: { href: string; label: string }; warning?: boolean; code?: string };

export function CollectForm({ studentId, studentName, firstName, father, rows, today, todayText, counter, advanceOn, advanceHeld, gateway, verifyModes, limit, limitPaise, nextDueText, studentCard, receiptOff = null }: {
  studentId: string; studentName: string; firstName: string; father: string; rows: DueRow[]; today: string;
  /** Today as the screen shows dates ("15-11-2026"): the payment date unless changed. */
  todayText?: string;
  counter: { discount: boolean; waive: boolean; changeDate: boolean };
  advanceOn: boolean; advanceHeld: string | null; gateway: boolean; verifyModes: string[]; limit: string; limitPaise: number; nextDueText: string;
  studentCard: React.ReactNode;
  /** Why the parents' "Fee received" message would not go (messages off, no channel, not live), or null. */
  receiptOff?: string | null;
}) {
  const router = useRouter();
  const tr = useT();
  const [state, formAction, busy] = useActionState<FormState<Collected | Problem>, FormData>(collectFee as never, null);
  const [askState, askAction, askBusy] = useActionState<FormState<unknown>, FormData>(askDiscountApproval as never, null);
  const [linkState, linkAction, linkBusy] = useActionState<FormState<unknown>, FormData>(sendLink as never, null);
  const [qrState, qrAction, qrBusy] = useActionState<FormState<QrLink>, FormData>(showQr as never, null);
  const open = rows.filter((r) => r.status !== "PAID");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(rows.filter((r) => r.status === "OVERDUE" || r.status === "DUE").map((r) => r.id)));
  const [showPaid, setShowPaid] = useState(false);
  const selTotal = rows.filter((r) => ticked.has(r.id)).reduce((a, r) => a + r.balance, 0);
  const [edited, setEdited] = useState<string | null>(null);
  const [discount, setDiscount] = useState("");
  const [waive, setWaive] = useState<Set<string>>(new Set());
  const discountPaise0 = toPaise(discount) || 0;
  const waiveTotal0 = rows.filter((r) => waive.has(r.id) && ticked.has(r.id)).reduce((a, r) => a + r.balance, 0);
  // What is payable after a typed discount or waiver.
  const payable = Math.max(0, selTotal - (Number.isNaN(discountPaise0) ? 0 : discountPaise0) - waiveTotal0);
  // The amount starts EMPTY (layman loop 6, L6-18): a pre-filled full due let one mis-tap post a big
  // cash receipt that never happened. "Full" is one tap and then follows a discount or a ticked row.
  const [followFull, setFollowFull] = useState(false);
  const amount = edited ?? (followFull && payable ? rupeesText(payable) : "");
  const [mode, setMode] = useState("CASH");
  const [ref, setRef] = useState("");
  const [chq, setChq] = useState({ no: "", bank: "", date: today });
  const [tried, setTried] = useState(false);
  const [more, setMore] = useState(false);
  const [reason, setReason] = useState("");
  const [asked, setAsked] = useState(false);
  const [receipt, setReceipt] = useState<Collected | null>(null);
  // The last payment stays named on the card after its receipt sheet is closed, to print again (layman loop 3).
  const [last, setLast] = useState<Collected | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  // The payment date: empty means now (today); the chip says which day the receipt will carry.
  const [paidOn, setPaidOn] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const dupRef = useRef<HTMLInputElement>(null);

  const amt = toPaise(amount);
  const discountPaise = toPaise(discount) || 0;
  const waiveTotal = rows.filter((r) => waive.has(r.id) && ticked.has(r.id)).reduce((a, r) => a + r.balance, 0);
  const owed = Math.max(0, selTotal - discountPaise - waiveTotal);
  const errAmt = Number.isNaN(amt) ? "Type the amount in rupees, like 4500 or 4500.50." : amt <= 0 ? "Enter an amount" : amt > owed && !advanceOn && owed > 0 ? `More than the ${inr(owed)} ticked. Lower the amount or tick more rows. Advance payments are off in Fee Settings.` : "";
  const needRef = NEEDS_REF.includes(mode);
  const refText = ref.trim();
  const errRef = needRef && mode === "UPI" ? (!refText ? "Enter the UPI transaction (UTR) number" : paymentRefProblem(mode, refText) ?? "")
    : needRef && !/^[A-Za-z0-9]{6,22}$/.test(refText) ? (refText ? "This doesn’t look like a transaction number. It has 6 to 22 letters or digits." : `Enter the ${mode === "UPI" ? "UPI transaction (UTR) number" : "transaction number"}`) : "";
  // Said as what to do: an empty box is not "has 6 digits" (layman loop 3: the grey example looked typed).
  const errChqNo = mode === "CHEQUE" && !/^\d{6}$/.test(chq.no) ? (chq.no ? "Cheque number has 6 digits" : "Type the cheque number (6 digits)") : "";
  const errChqBank = mode === "CHEQUE" && !chq.bank.trim() ? "Type the bank name" : "";
  // Above the counter limit the box turns red at once, not only after Collect (layman loop 3).
  const errDisc = discountPaise + waiveTotal > limitPaise && discountPaise > 0 ? `More than ${limit} needs the principal’s approval` : "";
  const valid = (selTotal > 0 || (advanceOn && open.length === 0)) && !errAmt && !errRef && !errChqNo && !errChqBank;
  const partial = amt > 0 && amt < owed;
  const extra = amt > owed && advanceOn ? amt - owed : 0;
  // The fee a part payment leaves unpaid: rows are paid oldest first, so it is the last ticked one when the rest fits on it.
  const lastTicked = [...rows].reverse().find((r) => ticked.has(r.id) && !waive.has(r.id));
  const leftOn = partial && lastTicked && owed - amt + discountPaise <= lastTicked.balance ? `${lastTicked.head} · ${lastTicked.label}` : null;
  // Quick amounts and the live "stays due" line (whole paise; never more than what is ticked).
  const quick = quickAmounts(owed);
  const stays = staysDue(owed, Number.isNaN(amt) ? 0 : amt);
  // A part payment's split on the rows before saving, oldest first (layman loop 2). Only without a discount or waiver, where the split is plain.
  const split = new Map<string, number>();
  if (partial && discountPaise === 0 && waiveTotal === 0) {
    let left = amt;
    for (const r of rows) if (ticked.has(r.id)) { const take = Math.min(left, r.balance); split.set(r.id, take); left -= take; }
  }

  // A refusal stops showing once the discount it was about changes (QA issue 30).
  const [hideFor, setHideFor] = useState<unknown>(null);
  const server = state && !state.ok && hideFor !== state ? state : null;
  const problem = server?.data as Problem | undefined;
  // A "same payment again?" warning is said once, in its box, not also in red under the amount (layman loop 3).
  const fieldErrors = problem?.warning ? undefined : server?.errors;
  const serverErr = (k: string) => fieldErrors?.[k];

  // A new result from the server: reset the form after a payment is saved (state adjusted while rendering, not in an effect).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok && state.data) {
      setReceipt(state.data as Collected);
      setLast(state.data as Collected);
      setTicked(new Set());
      setEdited(null);
      setFollowFull(false);
      setRef("");
      setDiscount("");
      setReason("");
      setWaive(new Set());
      setTried(false);
      setPaidOn("");
    }
    setAsked(false);
  }
  const [seenAsk, setSeenAsk] = useState(askState);
  if (askState !== seenAsk) {
    setSeenAsk(askState);
    if (askState?.ok) setAsked(true);
  }
  useEffect(() => { if (state?.ok && dupRef.current) dupRef.current.value = ""; }, [state]);
  const [seenQr, setSeenQr] = useState(qrState);
  if (qrState !== seenQr) {
    setSeenQr(qrState);
    if (qrState?.ok) setQrOpen(true);
  }

  const toggle = (id: string) => { setEdited(null); setTicked((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const visible = rows.filter((r) => showPaid || r.status !== "PAID");
  const paidCount = rows.filter((r) => r.status === "PAID").length;
  const tickedIds = [...ticked];
  const lateTicked = rows.filter((r) => r.lateFee && ticked.has(r.id));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    const target = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (target?.dataset.plain) return; // link, QR and approval buttons check on the server only
    setTried(true);
    if (!valid) {
      e.preventDefault();
      // Every bad box is marked (tried); the first one comes into view with the cursor in it.
      requestAnimationFrame(() => { const bad = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]"); if (bad) bringToBox(bad); });
    }
  };

  return (
    <>
    <form ref={formRef} action={formAction} onSubmit={submit} noValidate className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <FormProblems errors={fieldErrors}>
      <input type="hidden" name="studentId" value={studentId} />
      {tickedIds.map((id) => <input key={id} type="hidden" name="dueId" value={id} />)}
      <input type="hidden" name="mode" value={mode} />
      <input ref={dupRef} type="hidden" name="confirmDuplicate" defaultValue="" />
      <div className="flex flex-col gap-5 min-w-0">
        {studentCard}
        <Card className="overflow-hidden">
          <CardHeader title="What is being paid" description={ticked.size ? "Due rows are ticked for you" : "Tick the rows being paid"}
            action={paidCount > 0 ? <button type="button" onClick={() => setShowPaid(!showPaid)} className="text-[13px] font-semibold text-brand h-8 max-md:h-10 px-2 rounded-lg hover:bg-brand/8">{showPaid ? tr("Hide {n} paid", { n: paidCount }) : tr("Show {n} paid", { n: paidCount })}</button> : null} />
          {open.length === 0 ? (
            <Empty icon={PartyPopper} title="All fees paid for this year" body={`${firstName} has nothing due. ${nextDueText}`} />
          ) : (
            <ul className="border-t border-line">
              {visible.map((r) => {
                const isPaid = r.status === "PAID";
                const on = ticked.has(r.id);
                return (
                  <li key={r.id}>
                    <div onClick={() => !isPaid && toggle(r.id)}
                      className={cx("flex items-center gap-3.5 px-4 md:px-5 py-3 border-b border-line/70 transition", isPaid ? "opacity-60" : "cursor-pointer hover:bg-sunken/60", on && "bg-brand/5", r.status === "OVERDUE" && "shadow-[inset_3px_0_0_rgb(var(--bad))]")}>
                      {isPaid ? <span className="w-5 h-5 rounded-md bg-ok/15 text-ok grid place-items-center"><Check size={13} strokeWidth={3} aria-hidden="true" /></span>
                        : <Checkbox checked={on} onChange={() => toggle(r.id)} label={`${r.head} ${r.label}`} />}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14.5px]">{tr.any(r.head)} <span className="text-ink3 font-normal">· {screenLine(tr, r.label)}</span></p>
                        {r.timeline && !isPaid
                          ? <>{r.paid > 0 && <p className="text-[12.5px] text-ink3 tnum">{tr.any(`${inr(r.paid)} already paid`)}</p>}<FeeTimelineLine t={r.timeline} className="!mt-0.5" /></>
                          : <p className="text-[12.5px] text-ink3">{tr("Due {date}", { date: r.due })}{r.paid > 0 && !isPaid ? ` · ${inr(r.paid)} already paid` : ""}{r.lateFee && !isPaid ? <span className="text-bad"> <Words k="· late fee" /></span> : null}</p>}
                      </div>
                      <Pill tone={DUE_WORD[r.status].tone} className="hidden sm:inline-flex">{DUE_WORD[r.status].label}</Pill>
                      <span className="w-24 text-right tnum">
                        <span className="block font-semibold text-[15px]">{inr(isPaid ? r.net : r.balance)}</span>
                        {on && split.has(r.id) && <span className={cx("block text-[12px]", split.get(r.id)! >= r.balance ? "text-ok" : "text-warn")}>{split.get(r.id)! >= r.balance ? <Words k="paid in full" /> : split.get(r.id)! > 0 ? <>{inr(split.get(r.id)!)} <Words k="now" /></> : <Words k="stays due" />}</span>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {serverErr("dueIds") && <p className="px-5 py-3 text-[13px] text-bad">{serverErr("dueIds")}</p>}
        </Card>
      </div>

      {/* Payment panel */}
      <Card className="xl:sticky xl:top-4 overflow-hidden">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-[15px]"><Words k="Payment" /></h2>
            <span className="text-[13px] text-ink3 tnum">{tr.any(ticked.size === 1 ? "1 row" : `${ticked.size} rows`)} · {inr(selTotal)}</span>
          </div>
          {last && !receipt && (
            <div className="rounded-xl bg-ok/10 px-3.5 py-2.5 text-[13.5px] flex flex-wrap items-center gap-x-3 gap-y-1.5 -mt-1" role="status">
              <span className="flex items-center gap-1.5 min-w-0"><Check size={15} className="text-ok shrink-0" aria-hidden="true" />
                <span><Words k="Just collected" /> <b className="tnum">{last.amount}</b>{last.receiptNo && <> · <span className="font-mono">{last.receiptNo}</span></>}</span></span>
              {!last.waiting && (
                <span className="flex gap-3 ml-auto">
                  <a href={`/fee-management/payments/${last.paymentId}/receipt`} target="_blank" rel="noopener" className="font-semibold text-brand hover:underline inline-flex items-center gap-1"><Printer size={14} aria-hidden="true" /><Words k="Print" /></a>
                  <a href={`/fee-management/payments/${last.paymentId}/receipt?download=1`} className="font-semibold text-brand hover:underline inline-flex items-center gap-1"><Download size={14} aria-hidden="true" /><Words k="PDF" /></a>
                </span>
              )}
            </div>
          )}
          {advanceHeld && <p className="text-[12.5px] text-info flex gap-1.5 -mt-2"><Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />{advanceHeld} <Words k="advance is held. It is used for the next installments by itself." /></p>}
          <FieldShell label="Amount received" id="pay-amt" error={(tried && errAmt) || serverErr("amount")}
            help={discountPaise > 0 && !Number.isNaN(amt) && amt === owed ? `Fees ${inr(selTotal)} − discount ${inr(discountPaise)} = ${inr(owed)}` : extra ? `${inr(extra)} more than the dues${discountPaise > 0 ? " after the discount" : ""}. It is held as advance.` : quick.length ? "Tap Full, or type what the parent gave" : "Type the amount received"}>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[22px] font-semibold text-ink3" aria-hidden="true">₹</span>
              <input id="pay-amt" name="amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => { setFollowFull(false); setEdited(e.target.value); }} placeholder="0"
                aria-invalid={Boolean((tried && errAmt) || serverErr("amount")) || undefined}
                className={cx(inputCls((tried && errAmt) || serverErr("amount")), "!h-14 pl-10 !text-[24px] font-semibold tnum font-display")} />
            </div>
          </FieldShell>
          {/* Quick amounts (adopt item 7): Full, Half or Quarter of what is ticked, and what stays due. */}
          {quick.length > 0 && (
            <div className="-mt-1 flex flex-col gap-1.5">
              <div className="flex gap-1.5" role="group" aria-label={tr.any("Quick amount")}>
                {quick.map((qa) => {
                  const on = !Number.isNaN(amt) && amt === qa.paise;
                  return (
                    <button key={qa.key} type="button" aria-pressed={on} onClick={() => { if (qa.key === "full") { setEdited(null); setFollowFull(true); } else { setFollowFull(false); setEdited(rupeesText(qa.paise)); } }}
                      className={cx("flex-1 min-w-0 h-11 rounded-xl border px-2 text-[13px] font-semibold transition flex flex-col items-center justify-center leading-tight",
                        on ? "border-brand bg-brand/8 text-brand ring-1 ring-brand" : "border-line text-ink2 hover:border-ink3/50")}>
                      <span>{tr.any(qa.label)}</span><span className="text-[11.5px] font-medium tnum opacity-80">{inr(qa.paise)}</span>
                    </button>
                  );
                })}
              </div>
              {!Number.isNaN(amt) && amt > 0 && amt <= owed && (
                <p className={cx("text-[13px] font-semibold tnum", stays > 0 ? "text-warn" : "text-ok")} aria-live="polite" data-testid="stays-due">
                  {stays > 0 ? <>{tr.any(`${inr(stays)} stays due`)}{leftOn ? <span className="font-normal text-ink3"> · {leftOn}</span> : null}</> : tr.any("Settles everything ticked")}
                </p>
              )}
            </div>
          )}
          <div>
            <p className="text-[13px] font-semibold text-ink2 mb-1.5" id="mode-label"><Words k="How is it paid?" /></p>
            {/* One segmented row: every mode one tap away, at least 44 px tall. */}
            <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-sunken" role="radiogroup" aria-labelledby="mode-label">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} aria-label={tr.any(m.label)} onClick={() => { setMode(m.id); setTried(false); if (m.id === "UPI") setRef((r) => upiTyping(r)); }}
                  className={cx("min-w-0 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold transition",
                    mode === m.id ? "bg-surface text-brand shadow-card ring-1 ring-brand/40" : "text-ink2 hover:text-ink")}>
                  <m.icon size={17} aria-hidden="true" /><span className="truncate max-w-full px-0.5">{tr.any(m.short)}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* The day the receipt carries: today unless changed under "Date or note". */}
              <button type="button" disabled={!counter.changeDate} onClick={() => { setMore(true); requestAnimationFrame(() => document.getElementById("pay-when")?.focus()); }}
                className="h-11 px-3 rounded-xl border border-line text-[13px] font-semibold text-ink2 inline-flex items-center gap-1.5 enabled:hover:border-ink3/50 disabled:cursor-default tnum">
                <CalendarDays size={15} aria-hidden="true" />{paidOn ? tr("Paid on {date}", { date: `${paidOn.slice(8, 10)}-${paidOn.slice(5, 7)}-${paidOn.slice(0, 4)}` }) : tr("Today, {date}", { date: todayText ?? today })}
              </button>
              <button type="submit" formAction={qrAction} data-plain="1" disabled={!gateway || selTotal === 0 || qrBusy}
                title={gateway ? "A QR the parent scans with any UPI app" : "Online payment is not set up yet. Ask your School Admin to set it up with the School OS support team."}
                className="h-11 px-3 rounded-xl border border-dashed border-line inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink2 hover:border-brand hover:text-brand disabled:opacity-50 disabled:pointer-events-none">
                {qrBusy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <QrCode size={16} aria-hidden="true" />}<Words k="Show QR" />
              </button>
            </div>
          </div>
          {needRef && (
            <FieldShell label={mode === "UPI" ? "UPI transaction number (UTR)" : "Transaction number"} required id="pay-ref" error={(tried && errRef) || serverErr("reference")}>
              <input id="pay-ref" name="reference" value={ref} autoComplete="off"
                onChange={(e) => setRef(mode === "UPI" ? upiTyping(e.target.value) : e.target.value)}
                inputMode={mode === "UPI" ? "numeric" : undefined} maxLength={mode === "UPI" ? UTR_LENGTH : 22} pattern={mode === "UPI" ? "[0-9]{12}" : undefined}
                placeholder={mode === "UPI" ? "12 digits, like 428391027714" : mode === "CARD" ? "From the card machine slip" : "UTR from the bank statement"}
                aria-invalid={Boolean((tried && errRef) || serverErr("reference")) || undefined}
                className={cx(inputCls((tried && errRef) || serverErr("reference")), "h-11 font-mono")} />
              {serverErr("reference") && problem?.link && <a href={problem.link.href} target="_blank" rel="noopener" className={cx(buttonClass("secondary", "sm"), "mt-2 self-start")}><Words k="Open receipt" /></a>}
            </FieldShell>
          )}
          {mode === "CHEQUE" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FieldShell label="Cheque no." required id="chq-no" error={(tried && errChqNo) || serverErr("chequeNo")}>
                  <input id="chq-no" name="chequeNo" inputMode="numeric" value={chq.no} onChange={(e) => setChq({ ...chq, no: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6 digits"
                    className={cx(inputCls((tried && errChqNo) || serverErr("chequeNo")), "h-11 font-mono")} />
                </FieldShell>
                <FieldShell label="Bank" required id="chq-bank" error={(tried && errChqBank) || serverErr("chequeBank")}>
                  <input id="chq-bank" name="chequeBank" value={chq.bank} onChange={(e) => setChq({ ...chq, bank: e.target.value })} placeholder="Bank and branch"
                    className={cx(inputCls((tried && errChqBank) || serverErr("chequeBank")), "h-11")} />
                </FieldShell>
              </div>
              <FieldShell label="Cheque date" required id="chq-date" error={serverErr("chequeDate")}>
                <DateInput id="chq-date" name="chequeDate" value={chq.date} onChange={(e) => setChq({ ...chq, date: e.target.value })} className={cx(inputCls(serverErr("chequeDate")), "h-11 tnum")} />
              </FieldShell>
            </>
          )}
          {verifyModes.includes(mode) && <p className="text-[12.5px] text-ink3 -mt-2 flex gap-1.5"><Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />{mode === "CHEQUE" ? "Cheques wait" : `${MODES.find((m) => m.id === mode)?.label} payments wait`} <Words k="for the accountant to verify before the receipt is final." /></p>}

          <div>
            <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="inline-flex items-center gap-1.5 min-h-10 text-[13px] font-semibold text-brand hover:underline">
              <ChevronDown size={15} className={cx("transition", more && "rotate-180")} aria-hidden="true" />
              {tr.any(counter.discount || counter.waive ? "Discount, waiver, date or note" : "Date or note")}
            </button>
            <div className={cx("flex flex-col gap-3 mt-3", !more && "hidden")}>
              {counter.discount && (
                /* Below 400 px the reason takes its own line, so its example is not cut ("Example: father’s", PW-10). */
                <div className="grid grid-cols-1 min-[400px]:grid-cols-[120px_1fr] gap-3">
                  <FieldShell label="Discount" id="pay-disc" error={serverErr("discount") || errDisc || undefined} help={`Up to ${limit}`}>
                    <input id="pay-disc" name="discount" inputMode="decimal" value={discount} onChange={(e) => { setDiscount(e.target.value); setHideFor(state); }} placeholder="₹ 0"
                      aria-invalid={Boolean(serverErr("discount") || errDisc) || undefined} className={cx(inputCls(serverErr("discount") || errDisc), "h-11 tnum")} />
                  </FieldShell>
                  <FieldShell label="Reason" id="pay-disc-why" error={serverErr("discountReason")}>
                    <input id="pay-disc-why" name="discountReason" value={reason} onChange={(e) => setReason(e.target.value)} className={cx(inputCls(serverErr("discountReason")), "h-11")} placeholder="Example: father’s job loss" />
                  </FieldShell>
                </div>
              )}
              {counter.waive && lateTicked.length > 0 && (
                <div className="rounded-xl border border-line p-3 flex flex-col gap-2">
                  <p className="text-[13px] font-semibold text-ink2"><Words k="Waive the late fee" /></p>
                  {lateTicked.map((r) => (
                    <label key={r.id} className="flex items-center gap-2.5 text-[13.5px]">
                      <KeepCheck type="checkbox" name="waiveDueId" value={r.id} checked={waive.has(r.id)} onChange={(e) => { setHideFor(state); setWaive((x) => { const n = new Set(x); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; }); }} className="size-4 accent-[rgb(var(--brand))]" />
                      <span className="flex-1">{r.label}</span><span className="tnum font-semibold">{inr(r.balance)}</span>
                    </label>
                  ))}
                  {waive.size > 0 && <input name="waiveReason" aria-label="Reason for the waiver" placeholder="Reason, like: in hospital in July" className={cx(inputCls(serverErr("waiveReason")), "h-10 text-[14px]")} />}
                  {serverErr("waiveReason") && <p className="text-[12.5px] text-bad">{serverErr("waiveReason")}</p>}
                </div>
              )}
              {counter.changeDate && (
                <FieldShell label="Paid on" id="pay-when" error={serverErr("paidAt")} help="Leave empty for now. Never before a closed day.">
                  <DateTimeInput id="pay-when" name="paidAt" max={`${today}T23:59`} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={cx(inputCls(serverErr("paidAt")), "h-11 tnum")} />
                </FieldShell>
              )}
              <FieldShell label="Note" id="pay-note" help="On the office copy of the receipt">
                <input id="pay-note" name="note" maxLength={300} className={cx(inputCls(false), "h-11")} placeholder="Optional" />
              </FieldShell>
            </div>
          </div>

          {problem?.warning && (
            <Alert tone="warning" title="Same payment again?" action={
              <Button size="sm" variant="secondary" type="submit" onClick={() => { if (dupRef.current) dupRef.current.value = "1"; }}><Words k="Collect again" /></Button>
            }>{server?.message}</Alert>
          )}
          {asked && askState?.ok && (
            <Alert tone="success" title="Sent to the principal" action={<Link href="/approvals" className={buttonClass("secondary", "sm")}>Open Approvals</Link>}>{askState.message}</Alert>
          )}
          {!asked && problem?.code === "needs-approval" && (
            <Alert tone="warning" title="Above your discount limit." action={<Button size="sm" variant="secondary" type="submit" formAction={askAction} data-plain="1" loading={askBusy}><Words k="Ask for approval" /></Button>}>{server?.message}</Alert>
          )}
          {!asked && askState && !askState.ok && <Alert tone="danger">{askState.message}</Alert>}
          {!asked && server && !problem?.warning && problem?.code !== "needs-approval" && !Object.keys(server.errors ?? {}).length && (
            <Alert tone="danger" action={problem?.link ? <Link href={problem.link.href} className={buttonClass("secondary", "sm")}>{problem.link.label}</Link> : undefined}>{server.message}</Alert>
          )}
          {linkState && !linkState.ok && <Alert tone="danger">{linkState.message}</Alert>}
          {qrState && !qrState.ok && <Alert tone="danger">{qrState.message}</Alert>}
        </div>
        <div className="border-t border-line p-4 bg-sunken/50 flex flex-col gap-2">
          {/* With no amount it looks switched off and says what to do; pressing it still names the empty box (self-test B3).
              scroll-mb keeps it clear of the phone's bottom Quick menu when brought into view. */}
          <Button type="submit" variant="primary" size="lg" className={cx("w-full !h-14 !text-[16px] scroll-mb-28", !busy && !(amt > 0) && "opacity-50")} icon={Check} loading={busy} disabled={selTotal === 0 && !(advanceOn && open.length === 0)}>
            {tr.any(busy ? "Saving payment…" : amt > 0 ? `Collect ${inr(amt)} ${BY_MODE[mode] ?? ""}`.trim() : "Enter the amount")}
          </Button>
          <Button type="submit" formAction={linkAction} data-plain="1" variant="ghost" className="w-full" icon={Send} loading={linkBusy} disabled={selTotal === 0 || !gateway}
            title={gateway ? undefined : "Online payment is not set up yet. Ask your School Admin to set it up with the School OS support team."}><Words k="Send payment link instead" /></Button>
          {!gateway && <p className="text-[12.5px] text-ink3 text-center">{tr.any("Show QR and the payment link are off: online payment is not set up yet. Ask your School Admin to set it up with the School OS support team.")}</p>}
        </div>
      </Card>
      </FormProblems>
    </form>
      {qrOpen && qrState?.ok && qrState.data && (
        <QrSheet qr={qrState.data} father={father} onClose={() => { setQrOpen(false); router.refresh(); }} />
      )}
      {receipt && (
        <ReceiptSheet r={receipt} studentName={studentName} receiptOff={receiptOff} onClose={() => { setReceipt(null); router.refresh(); }} />
      )}
    </>
  );
}

function QrSheet({ qr, father, onClose }: { qr: QrLink; father: string; onClose: () => void }) {
  const [paid, setPaid] = useState<{ receiptNo: string | null } | null>(null);
  useEffect(() => {
    if (paid) return;
    const t = setInterval(async () => {
      const r = await qrPaid(qr.linkId);
      if (r.paid) setPaid({ receiptNo: r.receiptNo });
    }, 4000);
    return () => clearInterval(t);
  }, [qr.linkId, paid]);
  return (
    <Dialog open onClose={onClose} title={`Scan to pay ${qr.amount}`} sub="Any UPI app works. The payment shows up here by itself.">
      <div className="flex flex-col items-center gap-4 pb-2">
        <div className="p-4 rounded-2xl bg-white shadow-card border border-line [&_svg]:w-[200px] [&_svg]:h-[200px]" role="img" aria-label="Payment QR code" dangerouslySetInnerHTML={{ __html: qr.svg }} />
        {paid ? (
          <p className="text-[14px] text-ok font-semibold flex items-center gap-2"><Check size={17} aria-hidden="true" /><Words k="Paid" />{paid.receiptNo ? ` · receipt ${paid.receiptNo}` : ""}</p>
        ) : (
          <p className="text-[13px] text-ink3 flex items-center gap-2"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" /><Words k="Waiting for" /> {father} <Words k="to pay…" /></p>
        )}
        <p className="text-[12px] text-ink3 break-all text-center">{qr.url}</p>
      </div>
    </Dialog>
  );
}

function ReceiptSheet({ r, studentName, receiptOff, onClose }: { r: Collected; studentName: string; receiptOff: string | null; onClose: () => void }) {
  const tr = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [resent, resend, resending] = useActionState<FormState<unknown>, FormData>(resendReceipt as never, null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  // Say what really happened to the parents' message (Test mode or still queued is never "got it").
  // Each answer is kept with the request it answers, so an earlier answer never shows for a new one.
  const [answer, setAnswer] = useState<{ key: string; text: string } | null>(null);
  const resentOk = resent?.ok ?? false;
  const askKey = `${r.paymentId}|${r.messageId ?? ""}|${resent ? JSON.stringify(resent) : ""}`;
  const told = answer?.key === askKey ? answer.text : null;
  useEffect(() => {
    if (r.waiting || (!r.messageId && !resentOk)) return;
    let live = true;
    receiptDelivery(r.paymentId, studentName)
      .then((w) => { if (live) setAnswer({ key: askKey, text: w }); })
      .catch(() => { if (live) setAnswer({ key: askKey, text: "Could not check the parents' message. See Message History." }); });
    return () => { live = false; };
  }, [r.paymentId, r.messageId, r.waiting, studentName, resentOk, askKey]);
  const total = useMemo(() => r.amount, [r]);
  const pdf = `/fee-management/payments/${r.paymentId}/receipt`;
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} className={sheetCls(true)} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[inherit] flex-col">
        <SheetHead titleId={`${titleId}-x`} title="" onClose={onClose} />
        <div className="overflow-y-auto scroll-thin px-5 pb-5">
          <div className="flex flex-col items-center text-center pt-2">
            <span className={cx("w-16 h-16 rounded-full text-surface grid place-items-center animate-pop shadow-pop", r.waiting ? "bg-warn" : "bg-ok")}>
              {r.waiting ? <TriangleAlert size={30} aria-hidden="true" /> : <Check size={34} strokeWidth={3} aria-hidden="true" />}
            </span>
            <h2 id={titleId} className="font-display text-[26px] font-semibold mt-4 tnum">{r.waiting ? `${total} saved` : `${total} received`}</h2>
            <p className="text-ink3 text-[14px] mt-1">
              {r.waiting ? "It waits for verification. The receipt is made once the accountant approves it." : !r.messageId && !resentOk ? (receiptOff ? tr.any(`The receipt is ready to print. Not sent to the parents: ${receiptOff}`) : "The receipt is ready to print. No message was sent to the parents.") : told ?? "Sending the receipt to the parents…"}
            </p>
            <div className="w-full mt-5 text-left rounded-2xl border border-line overflow-hidden">
              <div className="flex justify-between items-center px-4 py-3 bg-sunken/60 text-[13px]">
                <span className="font-mono font-semibold">{r.receiptNo ?? "Waiting for verification"}</span><span className="text-ink3">{r.when}</span>
              </div>
              <ul className="px-4 py-2 text-[14px]">
                {r.items.map((it, i) => <li key={i} className="flex justify-between py-1.5 gap-3"><span>{it.label}</span><span className="tnum font-medium">{it.amount}</span></li>)}
              </ul>
              <div className="flex justify-between px-4 py-3 border-t border-line text-[14px]">
                <span className="text-ink3">{r.mode}</span><b className="tnum">{total}</b>
              </div>
            </div>
            {!r.waiting && (
              <div className="grid grid-cols-3 gap-2 w-full mt-4">
                <a href={pdf} target="_blank" rel="noopener" className={buttonClass("secondary")}><Printer size={17} aria-hidden="true" /><Words k="Print" /></a>
                <a href={`${pdf}?download=1`} className={buttonClass("secondary")}><Download size={17} aria-hidden="true" /><Words k="PDF" /></a>
                <form action={resend} className="contents">
                  <input type="hidden" name="paymentId" value={r.paymentId} />
                  <Button type="submit" variant="secondary" icon={MessageCircle} loading={resending}><Words k="Send to parent again" /></Button>
                </form>
              </div>
            )}
            {resent && !resent.ok && <Alert tone="danger" className="w-full mt-3 text-left">{resent.message}</Alert>}
            {resent?.ok && <p className="text-[13px] text-ok mt-3">{resent.message}</p>}
            <div className="flex gap-2 w-full mt-2">
              <Link href="/fee-management" className={buttonClass("primary", "md", "flex-1")}><Words k="Collect another fee" /></Link>
              <Button variant="ghost" onClick={onClose}><Words k="Done" /></Button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
