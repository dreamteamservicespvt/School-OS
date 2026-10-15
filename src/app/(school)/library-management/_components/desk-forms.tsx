"use client";

// The two desk forms: Issue (member and copy chosen, due date from the
// settings, a reason when it is changed) and Return (condition, damage
// charge, what is to pay now). After a success the desk is ready for the
// next scan; the toast says what happened.

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CircleCheck, CornerDownLeft, Info, TriangleAlert } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import type { IssueDone, ReturnDone } from "../actions";

type IssueAct = (p: FormState<IssueDone>, fd: FormData) => Promise<FormState<IssueDone>>;
type ReturnAct = (p: FormState<ReturnDone>, fd: FormData) => Promise<FormState<ReturnDone>>;

export function IssueForm({ action, memberKey, copyId, title, defaultDue, minDue, dueHint, nextHref }: { action: IssueAct; memberKey: string; copyId: string; title: string; defaultDue: string; minDue: string; dueHint: string; nextHref: string }) {
  const router = useRouter();
  const [state, run, pending] = useActionState<FormState<IssueDone>, FormData>(action, null);
  const [due, setDue] = useState(state && !state.ok ? state.values?.dueOn ?? defaultDue : defaultDue);
  useEffect(() => {
    if (state?.ok) router.replace(nextHref, { scroll: false });
  }, [state, nextHref, router]);
  const changed = due !== defaultDue;
  const err = (k: string) => state?.errors?.[k];
  return (
    <form action={run} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="member" value={memberKey} />
      <input type="hidden" name="copyId" value={copyId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="issue-due" className="text-[13px] font-semibold text-ink2">Due date <span className="text-bad" aria-hidden="true">*</span></label>
        <input id="issue-due" name="dueOn" type="date" value={due} min={minDue} onChange={(e) => setDue(e.target.value)} required
          aria-invalid={err("dueOn") ? true : undefined} aria-describedby="issue-due-help" className={cx(inputCls(err("dueOn")), "h-11 tnum")} />
        <p id="issue-due-help" className={cx("text-[12.5px]", err("dueOn") ? "text-bad" : "text-ink3")}>{err("dueOn") ?? dueHint}</p>
      </div>
      {changed && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="issue-reason" className="text-[13px] font-semibold text-ink2">Why a different due date? <span className="text-bad" aria-hidden="true">*</span></label>
          <input id="issue-reason" name="dueReason" defaultValue={state && !state.ok ? state.values?.dueReason ?? "" : ""} maxLength={200} placeholder="For example: project work over the holidays"
            aria-invalid={err("dueReason") ? true : undefined} className={cx(inputCls(err("dueReason")), "h-11")} />
          {err("dueReason") && <p className="text-[12.5px] text-bad">{err("dueReason")}</p>}
        </div>
      )}
      {state && !state.ok && !err("dueOn") && !err("dueReason") && (
        <Alert tone="danger">
          {state.message}
          {(state.data as { link?: { href: string; label: string } } | undefined)?.link && <> <Link className="font-semibold underline" href={(state.data as unknown as { link: { href: string; label: string } }).link.href}>{(state.data as unknown as { link: { href: string; label: string } }).link.label}</Link></>}
        </Alert>
      )}
      <Button type="submit" variant="primary" size="lg" icon={ArrowRightLeft} loading={pending} loadingText="Issuing…" className="w-full">Issue “{title.length > 40 ? `${title.slice(0, 40)}…` : title}”</Button>
    </form>
  );
}

export function ReturnForm({ action, copyId, title, lateWords, fineWords, fineToFees, defaultCharge, approvalAbove, nextInQueue, againHref }: {
  action: ReturnAct; copyId: string; title: string; lateWords: string | null; fineWords: string | null; fineToFees: boolean; defaultCharge: string; approvalAbove: number; nextInQueue: string | null; againHref: string;
}) {
  const [state, run, pending] = useActionState<FormState<ReturnDone>, FormData>(action, null);
  const [cond, setCond] = useState(state && !state.ok ? state.values?.condition ?? "good" : "good");
  const [charge, setCharge] = useState(state && !state.ok ? state.values?.charge ?? defaultCharge : defaultCharge);
  const chargeNum = Number(charge.replace(/[₹,\s]/g, "")) || 0;
  const needsApproval = cond === "damaged" && chargeNum > approvalAbove;
  if (state?.ok && state.data) {
    const d = state.data;
    return (
      <div className="flex flex-col gap-3" role="status">
        <div className="flex items-start gap-3 rounded-2xl bg-ok/10 p-4">
          <CircleCheck size={22} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 text-[14px]">
            <p className="font-semibold">“{d.title}” returned by {d.member}</p>
            <p className="text-ink2 mt-0.5">
              {d.fine ? <>Fine {d.fine} for {d.lateDays} day{d.lateDays === 1 ? "" : "s"} late, {d.fineWhere}. </> : d.lateDays > 0 ? "Late, within the days of grace: no fine. " : "On time. "}
              {d.damage && (d.damageWaiting ? `Damage charge ${d.damage} waits for approval.` : `Damage charge ${d.damage} added.`)}
            </p>
          </div>
        </div>
        {d.next && (
          <div className="flex items-start gap-3 rounded-2xl bg-brand/10 p-4">
            <Info size={20} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[14px]"><b className="font-semibold">Next in queue: {d.next}.</b> Keep copy <span className="font-mono">{d.accessionNo}</span> at the desk; they have been told.</p>
          </div>
        )}
        <Link href={againHref} replace scroll={false} className={buttonClass("primary", "lg", "w-full")}><CornerDownLeft size={18} aria-hidden="true" />Return another book</Link>
      </div>
    );
  }
  const err = (k: string) => state?.errors?.[k];
  return (
    <form action={run} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="copyId" value={copyId} />
      <input type="hidden" name="condition" value={cond} />
      {nextInQueue && (
        <div className="flex items-start gap-2.5 rounded-xl bg-brand/10 px-3.5 py-3 text-[13.5px]">
          <Info size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
          <span><b className="font-semibold">Next in queue: {nextInQueue}.</b> The copy is kept for them when returned in good condition.</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Condition</span>
        <Segmented label="Condition" value={cond} onChange={setCond} className="w-full" options={[{ value: "good", label: "Good" }, { value: "damaged", label: "Damaged" }]} />
      </div>
      {cond === "damaged" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ret-charge" className="text-[13px] font-semibold text-ink2">Damage charge</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-ink3" aria-hidden="true">₹</span>
              <input id="ret-charge" name="charge" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} aria-invalid={err("charge") ? true : undefined}
                aria-describedby="ret-charge-help" className={cx(inputCls(err("charge")), "h-11 pl-8 tnum")} />
            </div>
            <p id="ret-charge-help" className={cx("text-[12.5px]", err("charge") ? "text-bad" : "text-ink3")}>
              {err("charge") ?? (needsApproval ? `Above ₹${approvalAbove.toLocaleString("en-IN")}, so it goes to Approvals and is added only when approved.` : "The book's price. Change it for small damage; 0 charges nothing.")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ret-note" className="text-[13px] font-semibold text-ink2">What is damaged</label>
            <input id="ret-note" name="note" maxLength={300} defaultValue={state && !state.ok ? state.values?.note ?? "" : ""} placeholder="For example: cover torn, pages 12 to 18 wet" className={cx(inputCls(false), "h-11")} />
          </div>
        </>
      )}
      {(lateWords || cond === "damaged") && (
        <div className="rounded-xl border border-line px-4 py-3 text-[14px] flex flex-col gap-1">
          <p className="eyebrow text-ink3">To pay</p>
          {lateWords && <div className="flex justify-between gap-3"><span className="text-ink2">{lateWords}</span><b className="font-semibold tnum">{fineWords ?? "No fine"}</b></div>}
          {cond === "damaged" && <div className="flex justify-between gap-3"><span className="text-ink2">Damage charge</span><b className={cx("font-semibold tnum", needsApproval && "text-ink3")}>{needsApproval ? "Waiting approval" : chargeNum > 0 ? `₹${chargeNum.toLocaleString("en-IN")}` : "None"}</b></div>}
          <p className="text-[12.5px] text-ink3 mt-1">{fineToFees ? "Added to the student's fees, paid with the other fees." : "Collected at the library desk (Fines & Stock Check)."}</p>
        </div>
      )}
      {state && !state.ok && !err("charge") && <Alert tone="danger">{state.message}</Alert>}
      {cond === "damaged" && needsApproval && <p className="text-[12.5px] text-warn flex items-center gap-1.5"><TriangleAlert size={14} aria-hidden="true" />₹{chargeNum.toLocaleString("en-IN")} charge needs approval</p>}
      <Button type="submit" variant="primary" size="lg" icon={CornerDownLeft} loading={pending} loadingText="Returning…" className="w-full">Return “{title.length > 40 ? `${title.slice(0, 40)}…` : title}”</Button>
    </form>
  );
}
