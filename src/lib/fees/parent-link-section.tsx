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

function FeesDue({ data, view }: { data: ChildFees; view: GuardianView }) {
  const rows: PayRow[] = data.dues.map((d) => ({
    id: d.id,
    head: d.head,
    label: d.label,
    dueDate: formatDate(d.dueDate),
    balance: formatRupees(d.balancePaise),
    balancePaise: d.balancePaise.toString(),
    status: { label: DUE_STATUS_WORDS[d.status]?.label ?? d.status, tone: DUE_STATUS_WORDS[d.status]?.tone ?? "neutral" },
    ticked: d.status === "OVERDUE" || d.status === "DUE",
  }));
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-ink-2">Total fees</dt>
          <dd className="font-semibold tabular-nums">{formatRupees(data.totals.total)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-ink-2">Paid</dt>
          <dd className="font-semibold tabular-nums text-success">{formatRupees(data.totals.paid)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-xs text-ink-2">Balance</dt>
          <dd className="font-semibold tabular-nums">{formatRupees(data.totals.balance)}</dd>
        </div>
      </dl>
      {data.advance > ZERO && <p className="text-sm text-ink-2">{formatRupees(data.advance)} paid in advance is kept for the next fees.</p>}
      {rows.length ? (
        <FeesPayForm token={view.token} studentId={data.studentId} rows={rows} canPay={data.canPayOnline} preview={view.preview} />
      ) : (
        <p className="rounded-xl bg-success-soft p-3 font-medium text-success">All fees are paid. Thank you.</p>
      )}
    </div>
  );
}

function Receipts({ data, view }: { data: ChildFees; view: GuardianView }) {
  const href = (paymentId: string, doc: string) => (view.preview ? undefined : `/p/${view.token}/fees/${paymentId}?doc=${doc}`);
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {data.receipts.slice(0, 20).map((r) => (
        <li key={r.paymentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block font-medium tabular-nums">{formatRupees(r.amountPaise)} <span className="font-normal text-ink-2">on {formatDate(r.date)}</span></span>
            <span className="block text-sm text-ink-2">Receipt {r.number} · {modeLabel(r.mode)}</span>
          </span>
          {r.cancelled && <Badge tone="neutral">Cancelled</Badge>}
          {!r.broughtIn && (
            <span className="flex gap-1">
              <a href={href(r.paymentId, "receipt")} aria-disabled={view.preview || undefined} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Receipt</a>
              {r.taxInvoiceNo && <a href={href(r.paymentId, "tax-invoice")} aria-disabled={view.preview || undefined} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2">Tax invoice</a>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
