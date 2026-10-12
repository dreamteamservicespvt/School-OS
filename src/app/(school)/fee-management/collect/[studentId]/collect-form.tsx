"use client";

// Collect Fee (fees.jsx): tick the rows being paid, type what was received,
// choose how it was paid, collect. One step posts the payment, makes the
// receipt and tells the parent. Every rule is checked again on the server.

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Check, ChevronDown, CreditCard, Download, FileSignature, Info, Landmark, LoaderCircle, MessageCircle, PartyPopper, Printer, QrCode, Send, Smartphone, TriangleAlert, type LucideIcon } from "lucide-react";
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
import { askDiscountApproval, collectFee, qrPaid, resendReceipt, sendLink, showQr, type Collected, type QrLink } from "./actions";

export type DueRow = { id: string; head: string; label: string; due: string; net: number; paid: number; balance: number; status: DueStatus; lateFee: boolean };

const MODES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "CASH", label: "Cash", icon: Banknote },
  { id: "UPI", label: "UPI", icon: Smartphone },
  { id: "CARD", label: "Card", icon: CreditCard },
  { id: "CHEQUE", label: "Cheque", icon: FileSignature },
  { id: "BANK_TRANSFER", label: "Bank transfer", icon: Landmark },
];
const NEEDS_REF = ["UPI", "CARD", "BANK_TRANSFER"];

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const toPaise = (s: string) => {
  const v = s.replace(/[,₹\s]/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) return v ? NaN : 0;
  const [r, p = ""] = v.split(".");
  return Number(r) * 100 + Number((p + "00").slice(0, 2));
};
const rupeesText = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

type Problem = { link?: { href: string; label: string }; warning?: boolean; code?: string };

export function CollectForm({ studentId, studentName, firstName, father, rows, today, counter, advanceOn, advanceHeld, gateway, verifyModes, limit, nextDueText, studentCard }: {
  studentId: string; studentName: string; firstName: string; father: string; rows: DueRow[]; today: string;
  counter: { discount: boolean; waive: boolean; changeDate: boolean };
  advanceOn: boolean; advanceHeld: string | null; gateway: boolean; verifyModes: string[]; limit: string; nextDueText: string;
  studentCard: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, busy] = useActionState<FormState<Collected | Problem>, FormData>(collectFee as never, null);
  const [askState, askAction] = useActionState<FormState<unknown>, FormData>(askDiscountApproval as never, null);
  const [linkState, linkAction, linkBusy] = useActionState<FormState<unknown>, FormData>(sendLink as never, null);
  const [qrState, qrAction, qrBusy] = useActionState<FormState<QrLink>, FormData>(showQr as never, null);
  const open = rows.filter((r) => r.status !== "PAID");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(rows.filter((r) => r.status === "OVERDUE" || r.status === "DUE").map((r) => r.id)));
  const [showPaid, setShowPaid] = useState(false);
  const selTotal = rows.filter((r) => ticked.has(r.id)).reduce((a, r) => a + r.balance, 0);
  const [edited, setEdited] = useState<string | null>(null);
  const amount = edited ?? (selTotal ? rupeesText(selTotal) : "");
  const [mode, setMode] = useState("CASH");
  const [ref, setRef] = useState("");
  const [chq, setChq] = useState({ no: "", bank: "", date: today });
  const [tried, setTried] = useState(false);
  const [more, setMore] = useState(false);
  const [discount, setDiscount] = useState("");
  const [waive, setWaive] = useState<Set<string>>(new Set());
  const [receipt, setReceipt] = useState<Collected | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dupRef = useRef<HTMLInputElement>(null);

  const amt = toPaise(amount);
  const discountPaise = toPaise(discount) || 0;
  const waiveTotal = rows.filter((r) => waive.has(r.id) && ticked.has(r.id)).reduce((a, r) => a + r.balance, 0);
  const owed = Math.max(0, selTotal - discountPaise - waiveTotal);
  const errAmt = Number.isNaN(amt) ? "Type the amount in rupees, like 4500 or 4500.50." : amt <= 0 ? "Enter an amount" : amt > owed && !advanceOn && owed > 0 ? `More than the ${inr(owed)} ticked. Tick more rows, or advance payment is off for this school.` : "";
  const needRef = NEEDS_REF.includes(mode);
  const refText = ref.trim();
  const errRef = needRef && !/^[A-Za-z0-9]{6,22}$/.test(refText) ? (refText ? "This doesn’t look like a transaction number. It has 6 to 22 letters or digits." : `Enter the ${mode === "UPI" ? "UPI transaction (UTR) number" : "transaction number"}`) : "";
  const errChqNo = mode === "CHEQUE" && !/^\d{6}$/.test(chq.no) ? "Cheque number has 6 digits" : "";
  const errChqBank = mode === "CHEQUE" && !chq.bank.trim() ? "Enter the bank name" : "";
  const valid = (selTotal > 0 || (advanceOn && open.length === 0)) && !errAmt && !errRef && !errChqNo && !errChqBank;
  const partial = amt > 0 && amt < owed;
  const extra = amt > owed && advanceOn ? amt - owed : 0;

  const server = state && !state.ok ? state : null;
  const serverErr = (k: string) => server?.errors?.[k];
  const problem = server?.data as Problem | undefined;

  useEffect(() => {
    if (state?.ok && state.data) {
      setReceipt(state.data as Collected);
      setTicked(new Set());
      setEdited(null);
      setRef("");
      setDiscount("");
      setWaive(new Set());
      setTried(false);
      if (dupRef.current) dupRef.current.value = "";
    }
  }, [state]);
  useEffect(() => { if (qrState?.ok) setQrOpen(true); }, [qrState]);

  const toggle = (id: string) => { setEdited(null); setTicked((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const visible = rows.filter((r) => showPaid || r.status !== "PAID");
  const paidCount = rows.filter((r) => r.status === "PAID").length;
  const tickedIds = [...ticked];
  const lateTicked = rows.filter((r) => r.lateFee && ticked.has(r.id));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    const target = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (target?.dataset.plain) return; // link, QR and approval buttons check on the server only
    setTried(true);
    if (!valid) e.preventDefault();
  };

  return (
    <>
    <form ref={formRef} action={formAction} onSubmit={submit} noValidate className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <input type="hidden" name="studentId" value={studentId} />
      {tickedIds.map((id) => <input key={id} type="hidden" name="dueId" value={id} />)}
      <input type="hidden" name="mode" value={mode} />
      <input ref={dupRef} type="hidden" name="confirmDuplicate" defaultValue="" />
      <div className="flex flex-col gap-5 min-w-0">
        {studentCard}
        <Card className="overflow-hidden">
          <CardHeader title="What is being paid" description="Overdue and due rows are ticked for you"
            action={paidCount > 0 ? <button type="button" onClick={() => setShowPaid(!showPaid)} className="text-[13px] font-semibold text-brand h-8 px-2 rounded-lg hover:bg-brand/8">{showPaid ? "Hide" : "Show"} {paidCount} paid</button> : null} />
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
                        <p className="font-semibold text-[14.5px]">{r.head} <span className="text-ink3 font-normal">· {r.label}</span></p>
                        <p className="text-[12.5px] text-ink3">Due {r.due}{r.paid > 0 && !isPaid ? ` · ${inr(r.paid)} already paid` : ""}{r.lateFee && !isPaid ? <span className="text-bad"> · late fee</span> : null}</p>
                      </div>
                      <Pill tone={DUE_WORD[r.status].tone} className="hidden sm:inline-flex">{DUE_WORD[r.status].label}</Pill>
                      <span className="w-24 text-right font-semibold tnum text-[15px]">{inr(isPaid ? r.net : r.balance)}</span>
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
            <h2 className="font-semibold text-[15px]">Payment</h2>
            <span className="text-[13px] text-ink3 tnum">{ticked.size} {ticked.size === 1 ? "row" : "rows"} · {inr(selTotal)}</span>
          </div>
          {advanceHeld && <p className="text-[12.5px] text-info flex gap-1.5 -mt-2"><Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />{advanceHeld} advance is held. It is used for the next installments by itself.</p>}
          <FieldShell label="Amount received" id="pay-amt" error={(tried && errAmt) || serverErr("amount")}
            help={extra ? `${inr(extra)} more than the dues. It is held as advance.` : partial ? `Part payment. ${inr(owed - amt)} stays due on the latest row.` : "Change it for a part payment"}>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[22px] font-semibold text-ink3" aria-hidden="true">₹</span>
              <input id="pay-amt" name="amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setEdited(e.target.value)} placeholder="0"
                aria-invalid={Boolean((tried && errAmt) || serverErr("amount")) || undefined}
                className={cx(inputCls((tried && errAmt) || serverErr("amount")), "!h-14 pl-10 !text-[24px] font-semibold tnum font-display")} />
            </div>
          </FieldShell>
          <div>
            <p className="text-[13px] font-semibold text-ink2 mb-1.5" id="mode-label">How is it paid?</p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="mode-label">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => { setMode(m.id); setTried(false); }}
                  className={cx("h-[58px] rounded-xl border flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold transition",
                    mode === m.id ? "border-brand bg-brand/8 text-brand ring-1 ring-brand" : "border-line text-ink2 hover:border-ink3/50")}>
                  <m.icon size={18} aria-hidden="true" />{m.label}
                </button>
              ))}
              <button type="submit" formAction={qrAction} data-plain="1" disabled={!gateway || selTotal === 0 || qrBusy}
                title={gateway ? "A QR the parent scans with any UPI app" : "Connect Razorpay in Settings, Payment Gateways"}
                className="h-[58px] rounded-xl border border-dashed border-line flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold text-ink2 hover:border-brand hover:text-brand disabled:opacity-50 disabled:pointer-events-none">
                {qrBusy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <QrCode size={18} aria-hidden="true" />}Show QR
              </button>
            </div>
          </div>
          {needRef && (
            <FieldShell label={mode === "UPI" ? "UPI transaction number (UTR)" : "Transaction number"} required id="pay-ref" error={(tried && errRef) || serverErr("reference")}>
              <input id="pay-ref" name="reference" value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off"
                placeholder={mode === "UPI" ? "12-digit UTR, like 428391027714" : mode === "CARD" ? "From the card machine slip" : "UTR from the bank statement"}
                aria-invalid={Boolean((tried && errRef) || serverErr("reference")) || undefined}
                className={cx(inputCls((tried && errRef) || serverErr("reference")), "h-11 font-mono")} />
            </FieldShell>
          )}
          {mode === "CHEQUE" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FieldShell label="Cheque no." required id="chq-no" error={(tried && errChqNo) || serverErr("chequeNo")}>
                  <input id="chq-no" name="chequeNo" inputMode="numeric" value={chq.no} onChange={(e) => setChq({ ...chq, no: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="004512"
                    className={cx(inputCls((tried && errChqNo) || serverErr("chequeNo")), "h-11 font-mono")} />
                </FieldShell>
                <FieldShell label="Bank" required id="chq-bank" error={(tried && errChqBank) || serverErr("chequeBank")}>
                  <input id="chq-bank" name="chequeBank" value={chq.bank} onChange={(e) => setChq({ ...chq, bank: e.target.value })} placeholder="SBI, Kukatpally"
                    className={cx(inputCls((tried && errChqBank) || serverErr("chequeBank")), "h-11")} />
                </FieldShell>
              </div>
              <FieldShell label="Cheque date" required id="chq-date" error={serverErr("chequeDate")}>
                <input id="chq-date" name="chequeDate" type="date" value={chq.date} onChange={(e) => setChq({ ...chq, date: e.target.value })} className={cx(inputCls(serverErr("chequeDate")), "h-11 tnum")} />
              </FieldShell>
            </>
          )}
          {verifyModes.includes(mode) && <p className="text-[12.5px] text-ink3 -mt-2 flex gap-1.5"><Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />{mode === "CHEQUE" ? "Cheques wait" : `${MODES.find((m) => m.id === mode)?.label} payments wait`} for the accountant to verify before the receipt is final.</p>}

          <div>
            <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
              <ChevronDown size={15} className={cx("transition", more && "rotate-180")} aria-hidden="true" />
              {counter.discount || counter.waive ? "Discount, waiver, date or note" : "Date or note"}
            </button>
            <div className={cx("flex flex-col gap-3 mt-3", !more && "hidden")}>
              {counter.discount && (
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <FieldShell label="Discount" id="pay-disc" error={serverErr("discount")} help={`Up to ${limit}`}>
                    <input id="pay-disc" name="discount" inputMode="decimal" value={discount} onChange={(e) => { setDiscount(e.target.value); setEdited(null); }} placeholder="₹ 0" className={cx(inputCls(serverErr("discount")), "h-11 tnum")} />
                  </FieldShell>
                  <FieldShell label="Reason" id="pay-disc-why" error={serverErr("discountReason")}>
                    <input id="pay-disc-why" name="discountReason" className={cx(inputCls(serverErr("discountReason")), "h-11")} placeholder="Example: father’s job loss" />
                  </FieldShell>
                </div>
              )}
              {counter.waive && lateTicked.length > 0 && (
                <div className="rounded-xl border border-line p-3 flex flex-col gap-2">
                  <p className="text-[13px] font-semibold text-ink2">Waive the late fee</p>
                  {lateTicked.map((r) => (
                    <label key={r.id} className="flex items-center gap-2.5 text-[13.5px]">
                      <input type="checkbox" name="waiveDueId" value={r.id} checked={waive.has(r.id)} onChange={(e) => { setEdited(null); setWaive((x) => { const n = new Set(x); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; }); }} className="size-4 accent-[rgb(var(--brand))]" />
                      <span className="flex-1">{r.label}</span><span className="tnum font-semibold">{inr(r.balance)}</span>
                    </label>
                  ))}
                  {waive.size > 0 && <input name="waiveReason" aria-label="Reason for the waiver" placeholder="Reason, like: in hospital in July" className={cx(inputCls(serverErr("waiveReason")), "h-10 text-[14px]")} />}
                  {serverErr("waiveReason") && <p className="text-[12.5px] text-bad">{serverErr("waiveReason")}</p>}
                </div>
              )}
              {counter.changeDate && (
                <FieldShell label="Paid on" id="pay-when" error={serverErr("paidAt")} help="Leave empty for now. Never before a closed day.">
                  <input id="pay-when" name="paidAt" type="datetime-local" max={`${today}T23:59`} className={cx(inputCls(serverErr("paidAt")), "h-11 tnum")} />
                </FieldShell>
              )}
              <FieldShell label="Note" id="pay-note" help="On the office copy of the receipt">
                <input id="pay-note" name="note" maxLength={300} className={cx(inputCls(false), "h-11")} placeholder="Optional" />
              </FieldShell>
            </div>
          </div>

          {problem?.warning && (
            <Alert tone="warning" title="Same payment again?" action={
              <Button size="sm" variant="secondary" type="submit" onClick={() => { if (dupRef.current) dupRef.current.value = "1"; }}>Collect again</Button>
            }>{server?.message}</Alert>
          )}
          {problem?.code === "needs-approval" && (
            <Alert tone="warning" title="Above your discount limit." action={<Button size="sm" variant="secondary" type="submit" formAction={askAction} data-plain="1">Ask for approval</Button>}>{server?.message}</Alert>
          )}
          {askState && !askState.ok && <Alert tone="danger">{askState.message}</Alert>}
          {server && !problem?.warning && problem?.code !== "needs-approval" && !Object.keys(server.errors ?? {}).length && (
            <Alert tone="danger" action={problem?.link ? <Link href={problem.link.href} className={buttonClass("secondary", "sm")}>{problem.link.label}</Link> : undefined}>{server.message}</Alert>
          )}
          {linkState && !linkState.ok && <Alert tone="danger">{linkState.message}</Alert>}
          {qrState && !qrState.ok && <Alert tone="danger">{qrState.message}</Alert>}
        </div>
        <div className="border-t border-line p-4 bg-sunken/50 flex flex-col gap-2">
          <Button type="submit" variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={Check} loading={busy} disabled={selTotal === 0 && !(advanceOn && open.length === 0)}>
            {busy ? "Saving payment…" : `Collect ${inr(Number.isNaN(amt) ? 0 : amt)}`}
          </Button>
          <Button type="submit" formAction={linkAction} data-plain="1" variant="ghost" className="w-full" icon={Send} loading={linkBusy} disabled={selTotal === 0 || !gateway}
            title={gateway ? undefined : "Connect Razorpay in Settings, Payment Gateways"}>Send payment link instead</Button>
        </div>
      </Card>
    </form>
      {qrOpen && qrState?.ok && qrState.data && (
        <QrSheet qr={qrState.data} father={father} onClose={() => { setQrOpen(false); router.refresh(); }} />
      )}
      {receipt && (
        <ReceiptSheet r={receipt} studentName={studentName} onClose={() => { setReceipt(null); router.refresh(); }} />
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
          <p className="text-[14px] text-ok font-semibold flex items-center gap-2"><Check size={17} aria-hidden="true" />Paid{paid.receiptNo ? ` · receipt ${paid.receiptNo}` : ""}</p>
        ) : (
          <p className="text-[13px] text-ink3 flex items-center gap-2"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />Waiting for {father} to pay…</p>
        )}
        <p className="text-[12px] text-ink3 break-all text-center">{qr.url}</p>
      </div>
    </Dialog>
  );
}

function ReceiptSheet({ r, studentName, onClose }: { r: Collected; studentName: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [resent, resend, resending] = useActionState<FormState<unknown>, FormData>(resendReceipt as never, null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
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
              {r.waiting ? "It waits for verification. The receipt is made once the accountant approves it." : r.sent ? `${studentName}’s parents got the receipt on WhatsApp.` : "The receipt is ready to print. No message was sent to the parents."}
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
                <a href={pdf} target="_blank" rel="noopener" className={buttonClass("secondary")}><Printer size={17} aria-hidden="true" />Print</a>
                <a href={`${pdf}?download=1`} className={buttonClass("secondary")}><Download size={17} aria-hidden="true" />PDF</a>
                <form action={resend} className="contents">
                  <input type="hidden" name="paymentId" value={r.paymentId} />
                  <Button type="submit" variant="secondary" icon={MessageCircle} loading={resending}>Resend</Button>
                </form>
              </div>
            )}
            {resent && !resent.ok && <Alert tone="danger" className="w-full mt-3 text-left">{resent.message}</Alert>}
            {resent?.ok && <p className="text-[13px] text-ok mt-3">{resent.message}</p>}
            <div className="flex gap-2 w-full mt-2">
              <Link href="/fee-management" className={buttonClass("primary", "md", "flex-1")}>Collect another fee</Link>
              <Button variant="ghost" onClick={onClose}>Done</Button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
