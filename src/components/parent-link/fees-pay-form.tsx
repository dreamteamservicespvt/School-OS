"use client";

// The fees due for one child on Parent Link: tick what to pay, see the total,
// and go to the payment page. Overdue and due rows are ticked to start with.
import { useActionState, useMemo, useState } from "react";
import { payFees, type PayState } from "@/app/p/[token]/fee-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { KeepCheck } from "@/components/ui/keep-select";
import { useT } from "@/lib/i18n/client";

export type PayRow = { id: string; head: string; label: string; dueDate: string; balance: string; balancePaise: string; status: { label: string; tone: BadgeTone }; ticked: boolean };

function rupees(paise: bigint) {
  const n = Number(paise) / 100;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: paise % BigInt(100) === BigInt(0) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function FeesPayForm({ token, studentId, rows, canPay, preview }: { token: string; studentId: string; rows: PayRow[]; canPay: boolean; preview: boolean }) {
  const t = useT();
  const [state, action] = useActionState<PayState, FormData>(payFees.bind(null, token), null);
  const [ticked, setTicked] = useState(() => new Set(rows.filter((r) => r.ticked).map((r) => r.id)));
  const total = useMemo(() => rows.filter((r) => ticked.has(r.id)).reduce((s, r) => s + BigInt(r.balancePaise), BigInt(0)), [rows, ticked]);
  const toggle = (id: string) => setTicked((t) => {
    const next = new Set(t);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <ul className="divide-y divide-line rounded-xl border border-line">
        {rows.map((r) => (
          <li key={r.id}>
            <label className="flex min-h-14 items-center gap-3 px-3 py-2">
              {canPay && (
                <KeepCheck type="checkbox" name="dueId" value={r.id} checked={ticked.has(r.id)} onChange={() => toggle(r.id)} className="size-5 shrink-0 accent-[var(--brand)]" aria-label={t("Pay {fee}", { fee: `${t.any(r.head)} ${r.label}` })} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.any(r.head)}{r.label ? `, ${r.label}` : ""}</span>
                <span className="block text-sm text-ink-2">{t("Due on {date}", { date: r.dueDate })}</span>
              </span>
              <span className="text-right">
                <span className="block font-semibold tabular-nums">{r.balance}</span>
                <Badge tone={r.status.tone}>{t.any(r.status.label)}</Badge>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {canPay ? (
        <div className="flex flex-wrap items-center gap-3">
          {preview || total <= BigInt(0) ? (
            <Button size="lg" disabled title={preview ? t("Preview only") : t("Tick a fee to pay")}>
              {total > BigInt(0) ? t("Pay {amount}", { amount: rupees(total) }) : t("Tick a fee to pay")}
            </Button>
          ) : (
            <SubmitButton size="lg" pendingText={t("Opening payment page")}>{t("Pay {amount}", { amount: rupees(total) })}</SubmitButton>
          )}
          <span className="text-sm text-ink-2">{t("UPI, card or net banking. Your receipt comes here once the payment is confirmed.")}</span>
        </div>
      ) : (
        <p className="text-sm text-ink-2">{t("Please pay at the school office. Online payment is not switched on for this class.")}</p>
      )}
      {state && !state.ok && <p role="alert" className="text-sm font-medium text-danger">{state.message}</p>}
    </form>
  );
}
