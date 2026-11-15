// Fee Management's sections on Parent Link (D4): fees due with the Pay
// button, and receipts with tax invoices to download. Imported by
// src/lib/parent-link/section-list.ts. Only the child in view is read.
import "server-only";

import { registerSection, type GuardianView } from "../parent-link/sections";
import { formatDate, formatRupees } from "../format";
import { parentLinkFees, type ParentLinkFees } from "./parent-link";
import { DUE_STATUS_WORDS, modeLabel } from "./words";
import { Badge } from "@/components/ui/badge";
import { FeesPayForm, type PayRow } from "@/components/parent-link/fees-pay-form";
import { makeT } from "../i18n/server";
import { dayWords } from "../i18n/dates";
import type { T } from "../i18n/t";

type ChildFees = ParentLinkFees[number];
const ZERO = BigInt(0);

registerSection<ChildFees>({
  key: "fees",
  label: "Fees due",
  description: "Each installment due with the Pay button",
  order: 20,
  load: async (tx, ctx, view) => {
    const [child] = await parentLinkFees(tx, ctx, view.guardianId, [view.child.id]);
    if (!child || (child.dues.length === 0 && child.totals.total === ZERO)) return null;
    return child;
  },
  Render: FeesDue,
});

registerSection<ChildFees>({
  key: "fee-receipts",
  switchKey: "fees",
  label: "Fee receipts",
  description: "Receipts and tax invoices to download",
  order: 21,
  load: async (tx, ctx, view) => {
    const [child] = await parentLinkFees(tx, ctx, view.guardianId, [view.child.id]);
    return child && child.receipts.length ? child : null;
  },
  Render: Receipts,
});

/**
 * A fee row's period in the page's language: "Quarter 1 (Apr to Jun)", "Half 2 (Oct to Mar)",
 * "Year 2026-27", "Apr 2026" and "Term 1" are the words src/lib/fees/schedule.ts writes; a school's
 * own names stay as they are unless the word list has them.
 */
export function feePeriodWords(t: T, label: string): string {
  if (t.lang === "en" || !label) return label;
  const part = /^(Quarter|Half) (\d+) \((\w+) to (\w+)\)$/.exec(label);
  if (part) {
    const v = { n: part[2], from: dayWords(t, part[3]), to: dayWords(t, part[4]) };
    return part[1] === "Quarter" ? t("Quarter {n} ({from} to {to})", v) : t("Half {n} ({from} to {to})", v);
  }
  const year = /^Year (\d{4}-\d{2})$/.exec(label);
  if (year) return t("Year {name}", { name: year[1] });
  const term = /^Term (\d+)$/.exec(label);
  if (term) return t("Term {n}", { n: term[1] });
  return dayWords(t, t.any(label));
}

function FeesDue({ data, view }: { data: ChildFees; view: GuardianView }) {
  const t = makeT(view.lang);
  // Words in the page's language here, so the browser part needs no word list for them.
  const rows: PayRow[] = data.dues.map((d) => ({
    id: d.id,
    head: t.any(d.head),
    label: feePeriodWords(t, d.label),
    dueDate: formatDate(d.dueDate),
    balance: formatRupees(d.balancePaise),
    balancePaise: d.balancePaise.toString(),
    paid: d.paidPaise > ZERO ? t("{paid} paid of {total}", { paid: formatRupees(d.paidPaise), total: formatRupees(d.netPaise) }) : null,
    status: { label: t.any(DUE_STATUS_WORDS[d.status]?.label ?? d.status), tone: DUE_STATUS_WORDS[d.status]?.tone ?? "neutral" },
    ticked: d.status === "OVERDUE" || d.status === "DUE",
  }));
  // What to pay now (overdue and due soon) apart from what comes later, so the parent and the
  // office quote the same "fees due" (layman test loop 3).
  const now = data.dues.filter((d) => d.status === "OVERDUE" || d.status === "DUE").reduce((a, d) => a + d.balancePaise, ZERO);
  const later = data.totals.balance - now;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-ink-2">{t("Due now")}</dt>
          <dd className={`font-semibold tabular-nums text-[17px] ${now > ZERO ? "text-danger" : ""}`}>{formatRupees(now)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-ink-2">{t("Not due yet")}</dt>
          <dd className="font-semibold tabular-nums">{formatRupees(later > ZERO ? later : ZERO)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-ink-2">{t("Paid")}</dt>
          <dd className="font-semibold tabular-nums text-success">{formatRupees(data.totals.paid)}</dd>
        </div>
      </dl>
      {data.advance > ZERO && <p className="text-sm text-ink-2">{t("{amount} paid in advance is kept for the next fees.", { amount: formatRupees(data.advance) })}</p>}
      {rows.length ? (
        <FeesPayForm token={view.token} studentId={data.studentId} rows={rows} canPay={data.canPayOnline} preview={view.preview} />
      ) : (
        <p className="rounded-xl bg-success-soft p-3 font-medium text-success">{t("All fees are paid. Thank you.")}</p>
      )}
    </div>
  );
}

function Receipts({ data, view }: { data: ChildFees; view: GuardianView }) {
  const t = makeT(view.lang);
  const href = (paymentId: string, doc: string) => (view.preview ? undefined : `/p/${view.token}/fees/${paymentId}?doc=${doc}`);
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {data.receipts.slice(0, 20).map((r) => (
        <li key={r.paymentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block font-medium tabular-nums">{formatRupees(r.amountPaise)} <span className="font-normal text-ink-2">{t("on {date}", { date: formatDate(r.date) })}</span></span>
            <span className="block text-sm text-ink-2">{t("Receipt {number}", { number: r.number })} · {t.any(modeLabel(r.mode))}</span>
          </span>
          {r.cancelled && <Badge tone="neutral">{t("Cancelled")}</Badge>}
          {!r.broughtIn && (
            <span className="flex gap-1">
              <a href={href(r.paymentId, "receipt")} aria-disabled={view.preview || undefined} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">{t("Receipt")}</a>
              {r.taxInvoiceNo && <a href={href(r.paymentId, "tax-invoice")} aria-disabled={view.preview || undefined} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">{t("Tax invoice")}</a>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
