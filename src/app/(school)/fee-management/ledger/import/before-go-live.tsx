"use client";

// Fees due before go-live (workflow 15; gap list G14): what the fee plan bills
// for the months before the go-live date that past receipts did not pay, and
// the school's choice to settle it as collected in the old software (or held in
// the old dues). Shown on Import old dues and receipts and on the go-live check.

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { settleBeforeGoLiveAction, undoSettleBeforeGoLiveAction } from "./actions";

import type { BeforeGoLiveView } from "@/lib/fees/before-go-live";
import { GO_LIVE_FORM_ANCHOR, goLiveDateHint, type GoLiveDatePlace } from "@/lib/fees/go-live-date-hint";
import { Words } from "@/lib/i18n/client";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function BeforeGoLivePanel({ view, canSettle, place = { on: "fee-import" } }: { view: BeforeGoLiveView; canSettle: boolean; place?: GoLiveDatePlace }) {
  const router = useRouter();
  if (!view.goLive) {
    // On the go-live check the date is typed on the same page; elsewhere, by its path in Settings.
    const hint = goLiveDateHint(place);
    return <p className="text-ink-2">{hint.before}{hint.here && <a href={`#${GO_LIVE_FORM_ANCHOR}`} className="font-medium text-brand-text underline">{hint.here}</a>}{hint.after}</p>;
  }
  const { owed, withOldDues: both, settled } = view;
  const run = async (action: (prev: null, fd: FormData) => Promise<{ ok: boolean; message?: string } | null>, scope?: string) => {
    const fd = new FormData();
    if (scope) fd.set("scope", scope);
    const r = await action(null, fd);
    if (r && !r.ok) return r.message ?? "That did not work. Nothing was changed.";
    router.refresh();
  };
  return (
    <div className="space-y-3">
      {owed.rows === 0 ? (
        <p><Words k="Nothing due before" /> {view.goLive} <Words k="is still owed on the fee plans." /></p>
      ) : (
        <p>
          <span className="font-semibold">{owed.amount}</span> <Words k="of fees due before" /> {view.goLive} <Words k="is still owed by" /> {plural(owed.students, "student")} ({plural(owed.rows, "installment")}<Words k="): no past receipt brought in paid it." />
          {both.rows > 0 && <> {both.students === owed.students ? "All of them" : plural(both.students, "of them", "of them")} <Words k="also" /> {both.students === 1 ? "has" : "have"} <Words k="old dues brought in (" />{both.amount} <Words k="on these installments). Old dues hold what was unpaid before School OS, so these months would be counted twice." /></>}
        </p>
      )}
      {owed.rows > 0 && <p className="text-sm text-ink-2"><Words k="If the old software collected it, or it is inside the old dues, settle it: the installments stay on each ledger, marked “Settled in the old software before go-live”, and are no longer owed. Nothing reaches the Day Book. Bring in past receipts first: a receipt brought in later cannot pay a settled month." /></p>}
      {settled.rows > 0 && <p className="text-sm">{settled.amount} <Words k="is settled in the old software for" /> {plural(settled.students, "student")} ({plural(settled.rows, "installment")}).</p>}
      {canSettle ? (
        <div className="flex flex-wrap gap-2">
          {both.rows > 0 && (
            <ConfirmButton trigger="Settle for students with old dues" triggerVariant="primary" title="Settle the fees due before go-live for students with old dues?" confirmLabel={`Settle ${both.amount}`}
              onConfirm={() => run(settleBeforeGoLiveAction, "old-dues")}>
              <p>{both.amount} <Words k="on" /> {plural(both.rows, "installment")} <Words k="of" /> {plural(both.students, "student")} <Words k="due before" /> {view.goLive} <Words k="is taken off as settled in the old software, because their old dues already hold it." /></p>
              <p className="mt-2"><Words k="Their old dues stay as they are. Undo puts the amounts back." /></p>
            </ConfirmButton>
          )}
          {owed.rows > 0 && (
            <ConfirmButton trigger="Settle for every student" triggerVariant={both.rows > 0 ? "secondary" : "primary"} title="Settle the fees due before go-live for every student?" confirmLabel={`Settle ${owed.amount}`}
              onConfirm={() => run(settleBeforeGoLiveAction, "all")}>
              <p>{owed.amount} <Words k="on" /> {plural(owed.rows, "installment")} <Words k="of" /> {plural(owed.students, "student")} <Words k="due before" /> {view.goLive} <Words k="is taken off as settled in the old software." /></p>
              <p className="mt-2"><Words k="Choose this only if the old software collected these fees, or the old dues brought in hold everything still unpaid on" /> {view.goLive}<Words k=". Undo puts the amounts back." /></p>
            </ConfirmButton>
          )}
          {settled.rows > 0 && (
            <ConfirmButton trigger="Undo settle" title="Put the settled fees back?" confirmLabel={`Make ${settled.amount} owed again`}
              onConfirm={() => run(undoSettleBeforeGoLiveAction)}>
              <p>{settled.amount} <Words k="on" /> {plural(settled.rows, "installment")} <Words k="of" /> {plural(settled.students, "student")} <Words k="is owed again, as before it was settled." /></p>
            </ConfirmButton>
          )}
        </div>
      ) : owed.rows > 0 || settled.rows > 0 ? <p className="text-sm text-ink-2"><Words k="The Accountant, Principal or School Admin settles these." /></p> : null}
    </div>
  );
}
