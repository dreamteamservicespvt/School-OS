"use client";

// Plans & Billing sheets (07-super-admin.md §8): choose or change a plan,
// send an invoice, mark one paid. The amounts shown are worked out again on
// the server when saved.

import { useState } from "react";
import { Award, CircleCheck } from "lucide-react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { FieldShell, type Option } from "@/components/ui/field";
import { Banner } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { KeepCheck } from "@/components/ui/keep-select";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
/** Prices in rupees for the sheet's own sums. */
export type Prices = { essential: number; complete: number; hostel: number; min: number };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const gst = (n: number) => Math.round(n * 0.18);
const yearly = (per: number, n: number, min: number) => { const k = Math.max(n, min); return Math.min(k, 1000) * per + Math.max(0, k - 1000) * (per / 2); };

function PlanCards({ plan, setPlan, prices }: { plan: string; setPlan: (p: string) => void; prices: Prices }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Plan">
      {(["essential", "complete"] as const).map((p) => (
        <button key={p} type="button" role="radio" aria-checked={plan === p} onClick={() => setPlan(p)}
          className={cx("rounded-2xl border-2 p-4 text-left transition", plan === p ? "border-brand bg-brand/5" : "border-line hover:border-ink3/40")}>
          <span className="flex items-center justify-between gap-2"><span className="font-semibold text-[15px]">{p === "essential" ? "Essential" : "Complete"}</span>{plan === p && <CircleCheck size={18} className="text-brand" aria-hidden="true" />}</span>
          <span className="block font-display text-[22px] font-semibold tnum mt-1">{inr(prices[p])}<span className="text-[12.5px] text-ink3 font-sans font-medium"> per student a year</span></span>
          <span className="block text-[12.5px] text-ink3 mt-1">{p === "essential" ? "Everyday school work" : "Every module"}</span>
        </button>
      ))}
    </div>
  );
}

function HostelBox({ on, setOn, price }: { on: boolean; setOn: (v: boolean) => void; price: number }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-line p-3.5 cursor-pointer">
      <KeepCheck type="checkbox" name="hostel" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-5 accent-brand" />
      <span className="flex-1 text-[14px]"><b className="font-semibold">Hostel add-on</b><span className="block text-[12.5px] text-ink3">{inr(price)} per school a year</span></span>
    </label>
  );
}

/** The first plan, alone (Choose plan) or with Activate. */
export function FirstPlanSheet({ closeHref, schoolId, schoolName, prices, students, groupPercent, activate, hostelStart, action }: {
  closeHref: string; schoolId: string; schoolName: string; prices: Prices; students: number; groupPercent: number; activate: boolean; hostelStart: boolean; action: Action;
}) {
  const [plan, setPlan] = useState("essential");
  const [hostel, setHostel] = useState(hostelStart);
  const [n, setN] = useState(String(students));
  const [payIn, setPayIn] = useState("YEARLY");
  const count = Number(n.replace(/\D/g, "")) || 0;
  const base = yearly(prices[plan as "essential" | "complete"], count, prices.min) + (hostel ? prices.hostel : 0);
  const part = payIn === "HALVES" ? base / 2 : base;
  const disc = Math.round((part * groupPercent) / 100);
  const taxable = part - disc;
  return (
    <SheetForm title={activate ? `Activate ${schoolName}?` : "Choose the school’s plan"} sub={activate ? "Trial → Active, with the first invoice" : `${schoolName} · sends the first invoice`} wide closeHref={closeHref} action={action}
      submitLabel={`${activate ? "Activate and send" : "Save and send"} ${inr(taxable + gst(taxable))} invoice`} pendingText="Saving…" hidden={{ schoolId, planKey: plan, payIn }}>
      <PlanCards plan={plan} setPlan={setPlan} prices={prices} />
      <HostelBox on={hostel} setOn={setHostel} price={prices.hostel} />
      <div className="grid sm:grid-cols-2 gap-4">
        <SText name="students" label="Students to bill" required start={students} inputMode="numeric" help={`At least ${prices.min}. Half price above 1,000.`} onChange={(e) => setN(e.target.value)} />
        <FieldShell label="Pays" id="payIn" required>
          <Segmented label="Pays" value={payIn} onChange={setPayIn} className="w-full" options={[{ value: "YEARLY", label: "Yearly" }, { value: "HALVES", label: "Two halves" }]} />
        </FieldShell>
      </div>
      <div className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
        <div className="flex justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2 min-w-0">{payIn === "HALVES" ? "First half" : "First year"}: {plan === "essential" ? "Essential" : "Complete"}, {Math.max(count, prices.min).toLocaleString("en-IN")} students{hostel ? ", Hostel" : ""}</span><span className="tnum shrink-0">{inr(part)}</span></div>
        {disc > 0 && <div className="flex justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2">Group discount {groupPercent}%</span><span className="tnum">−{inr(disc)}</span></div>}
        <div className="flex justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2">GST 18%</span><span className="tnum">{inr(gst(taxable))}</span></div>
        <div className="flex justify-between gap-3 px-3.5 py-2.5 font-semibold"><span>Total</span><span className="tnum">{inr(taxable + gst(taxable))}</span></div>
      </div>
      {activate && <SArea name="reason" label="Reason" rows={2} placeholder="The school chose its plan on a call, 9 Oct." help="Optional. Kept in the status history." />}
      <p className="text-[13px] text-ink3">The invoice goes to the School Admins and the Principal on WhatsApp and email, with a Razorpay payment link. It marks itself paid when the payment arrives.</p>
    </SheetForm>
  );
}

export function ChangePlanSheet({ closeHref, schoolId, schoolName, paidFor, prices, current, founding, monthsLeft, renewOn, perStudent, discountPercent, action }: {
  closeHref: string; schoolId: string; schoolName: string; paidFor: number; prices: Prices; current: { plan: string; hostel: boolean }; founding: { lockedUntil: string } | null; monthsLeft: number; renewOn: string; perStudent: number; discountPercent: number; action: Action;
}) {
  const [plan, setPlan] = useState(current.plan);
  const [hostel, setHostel] = useState(current.hostel);
  const per = (p: string) => (founding || p === current.plan ? perStudent : prices[p as "essential" | "complete"]);
  const year = (p: string, h: boolean) => { const b = yearly(per(p), paidFor, prices.min) + (h ? prices.hostel : 0); return b - Math.round((b * discountPercent) / 100); };
  const cur = year(current.plan, current.hostel);
  const next = year(founding ? current.plan : plan, hostel);
  const diff = Math.round(((next - cur) * monthsLeft) / 12);
  const up = next > cur;
  const down = next < cur;
  return (
    <SheetForm title="Change plan and add-ons" sub={`${schoolName} · ${paidFor.toLocaleString("en-IN")} students paid for`} wide closeHref={closeHref} action={action}
      submitLabel={up ? `Save and send ${inr(diff + gst(diff))} invoice` : down ? "Save for renewal" : "Save"} pendingText="Saving…" hidden={{ schoolId, planKey: founding ? current.plan : plan }}>
      {founding
        ? <Banner tone="brand" icon={Award} title="Founding school.">Essential price locked until {founding.lockedUntil}, and every new module is switched on free as it is built. Only add-ons can change.</Banner>
        : <PlanCards plan={plan} setPlan={setPlan} prices={prices} />}
      <HostelBox on={hostel} setOn={setHostel} price={prices.hostel} />
      <div className="rounded-xl bg-sunken p-3.5 text-[13.5px] text-ink2 leading-relaxed">
        {up ? <p><b className="font-semibold text-ink">Upgrade from today.</b> The school pays the difference for the rest of the year ({monthsLeft} months): {inr(diff)} + GST {inr(gst(diff))} = <b className="font-semibold text-ink">{inr(diff + gst(diff))}</b>. The invoice goes to the School Admin and Principal with a Razorpay link.</p>
          : down ? <p><b className="font-semibold text-ink">Downgrade at renewal.</b> The change starts on {renewOn}. Nothing changes before then.</p>
            : <p>No change. The school pays {inr(cur)} a year before GST.</p>}
      </div>
    </SheetForm>
  );
}

export function NewInvoiceSheet({ closeHref, schools, schoolId, packs, action }: {
  closeHref: string; schools: (Option & { year: { label: string; amount: number } | null; admin: string })[]; schoolId?: string; packs: { credits: number; rupees: number }[]; action: Action;
}) {
  const [sid, setSid] = useState(schoolId ?? schools[0]?.value ?? "");
  const [what, setWhat] = useState("credits");
  const [pack, setPack] = useState(String(packs[1]?.credits ?? packs[0]?.credits ?? ""));
  const s = schools.find((x) => x.value === sid) ?? schools[0];
  const p = packs.find((x) => String(x.credits) === pack);
  const base = what === "credits" ? (p?.rupees ?? 0) : (s?.year?.amount ?? 0);
  const items = what === "credits" ? `Message credits: ${(p?.credits ?? 0).toLocaleString("en-IN")}` : s?.year?.label ?? "No plan yet";
  return (
    <SheetForm title="Send an invoice" sub="A GST invoice from DREAM TEAM SERVICES, with a Razorpay payment link" closeHref={closeHref} action={action} pendingText="Sending…"
      submitLabel={base ? `Send invoice for ${inr(base + gst(base))}` : "Send invoice"} hidden={{ what, schoolId: sid }} submitDisabled={what === "year" && !s?.year}>
      {!schoolId && <SSelect name="schoolPick" label="School" required start={sid} options={schools} onChange={(e) => setSid(e.target.value)} />}
      <FieldShell label="What for" id="what" required>
        <Segmented label="What for" value={what} onChange={setWhat} className="w-full" options={[{ value: "credits", label: "Message credits" }, { value: "year", label: s?.year?.label.startsWith("Renewal") ? "Renewal" : "This year" }]} />
      </FieldShell>
      {what === "credits" && <SSelect name="pack" label="Credit pack" required start={pack} options={packs.map((k) => ({ value: String(k.credits), label: `${k.credits.toLocaleString("en-IN")} credits · ${inr(k.rupees)}` }))} onChange={(e) => setPack(e.target.value)} />}
      {what === "year" && !s?.year && <p className="text-[13px] text-warn font-semibold">This school has no plan yet. Choose its plan on the school’s page; that sends the first invoice.</p>}
      <div className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
        <div className="flex justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2 min-w-0">{items}</span><span className="tnum shrink-0">{inr(base)}</span></div>
        <div className="flex justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2">GST 18%</span><span className="tnum">{inr(gst(base))}</span></div>
        <div className="flex justify-between gap-3 px-3.5 py-2.5 font-semibold"><span>Total</span><span className="tnum">{inr(base + gst(base))}</span></div>
      </div>
      <p className="text-[13px] text-ink3">Goes to {s?.admin ?? "the School Admin"} and the Principal on WhatsApp and email. It marks itself paid when the Razorpay payment arrives.</p>
    </SheetForm>
  );
}

export function PricesSheet({ closeHref, now, minDate, action }: { closeHref: string; now: { essential: number; complete: number; hostel: number }; minDate: string; action: Action }) {
  return (
    <SheetForm title="Edit price list" sub="Owner only · affects renewals after the date below" closeHref={closeHref} action={action} submitLabel="Save prices" pendingText="Saving…">
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="essential" label="Essential, per student" required start={now.essential} />
        <SMoney name="complete" label="Complete, per student" required start={now.complete} />
        <SMoney name="hostel" label="Hostel, per school" required start={now.hostel} className="col-span-2 sm:col-span-1" />
      </div>
      <SDate name="validFrom" label="Valid for renewals from" required start={minDate} min={minDate} help="Schools mid-year keep their price." />
    </SheetForm>
  );
}

export function FoundingPickSheet({ closeHref, used, limit, schools, action }: { closeHref: string; used: number; limit: number; schools: Option[]; action: Action }) {
  return (
    <SheetForm title="Mark a founding school" sub={`${used} of ${limit} places used · Owner only`} closeHref={closeHref} action={action} submitLabel="Mark as founding school" pendingText="Saving…" submitDisabled={schools.length === 0}>
      {schools.length === 0 ? <p className="text-[14px] text-ink2">Every paying school is already a founding school.</p> : <SSelect name="schoolId" label="School" required options={schools} start={schools[0]?.value} />}
      <p className="text-[13px] text-ink3">Its Essential price is locked for 3 years from its start date, and every new module is switched on free as it is built.</p>
    </SheetForm>
  );
}

export function MarkPaidSheet({ closeHref, invoiceId, number, schoolName, total, reactivates, today, action }: { closeHref: string; invoiceId: string; number: string; schoolName: string; total: string; reactivates: boolean; today: string; action: Action }) {
  const [via, setVia] = useState("BANK");
  return (
    <SheetForm title={`Mark ${number} paid`} sub={`${schoolName} · ${total} with GST · Owner only`} closeHref={closeHref} action={action} submitLabel={`Mark ${total} paid`} pendingText="Saving…" hidden={{ invoiceId, via }}>
      <FieldShell label="Paid by" id="via" required>
        <Segmented label="Paid by" value={via} onChange={setVia} className="w-full" options={[{ value: "BANK", label: "Bank transfer" }, { value: "CHEQUE", label: "Cheque" }]} />
      </FieldShell>
      <SText name="ref" label={via === "CHEQUE" ? "Cheque number and bank" : "UTR (bank reference number)"} required className="font-mono" placeholder={via === "CHEQUE" ? "004517, Indian Bank" : "HDFCN26282104477"} />
      <SDate name="receivedOn" label="Date received" required start={today} max={today} />
      {reactivates && <Banner tone="ok" title="This reactivates the school.">Paying makes {schoolName} Active again at once, with everything unchanged.</Banner>}
    </SheetForm>
  );
}
