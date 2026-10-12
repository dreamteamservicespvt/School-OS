// Fee Management's tab on the Student Profile (03 §2): totals, each row's
// status, recent payments, and "Collect fee" in the profile header. Imported
// by src/lib/students/profile-tab-modules.ts. A class teacher sees only the
// students of their own sections (feeViewer).
import "server-only";

import Link from "next/link";
import { withSchool } from "../db";
import { can } from "../permissions";
import { formatDate, formatRupees } from "../format";
import { registerProfileTab, type ProfileTabArgs } from "../students/profile-tabs";
import { admissionOnly, admissionOnlyFor, canSeeStudent, feeViewer } from "./access";
import { studentFeeTab } from "./profile";
import { DUE_STATUS_WORDS, PAYMENT_STATUS_WORDS, modeLabel } from "./words";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

const ZERO = BigInt(0);

async function load({ current, studentId }: ProfileTabArgs) {
  return withSchool(current.ctx, async (tx) => {
    const viewer = await feeViewer(tx, current.ctx, current);
    if (admissionOnly(viewer) || !(await canSeeStudent(tx, viewer, studentId))) return null;
    return { tab: await studentFeeTab(tx, current.ctx, studentId), canCollect: viewer.change === "all" && can(current.permissions, "fee-management", "create") };
  });
}

registerProfileTab({
  key: "fees",
  label: "Fees",
  module: "fee-management",
  order: 40,
  // The Admission Counsellor sees only admission fee status, never a student's fees.
  allowed: (current) => !admissionOnlyFor(current),
  load: async (args) => {
    const data = await load(args);
    if (!data) return <p className="text-ink-2">You can see fees only for students in your own sections.</p>;
    return <FeesTab {...data} />;
  },
  summary: async (args) => {
    const data = await load(args);
    if (!data || !data.tab.hasPlan) return [];
    const t = data.tab;
    if (t.totals.balance <= ZERO) return [{ label: "Fees", value: "All paid", tone: "success", href: t.ledgerLink }];
    return [{ label: "Fees due", value: formatRupees(t.totals.balance), tone: t.overduePaise > ZERO ? "danger" : "warning", href: t.ledgerLink }];
  },
  today: async (args) => {
    const data = await load(args);
    if (!data || data.tab.overduePaise <= ZERO) return [];
    return [{ label: "Fees overdue", value: formatRupees(data.tab.overduePaise), tone: "danger", href: data.tab.collectLink }];
  },
  headerActions: async (args) => {
    const data = await load(args);
    return data?.canCollect ? [{ label: "Collect fee", href: data.tab.collectLink }] : [];
  },
});

function FeesTab({ tab, canCollect }: { tab: Awaited<ReturnType<typeof studentFeeTab>>; canCollect: boolean }) {
  if (!tab.hasPlan && !tab.rows.length && !tab.payments.length) {
    return (
      <div className="space-y-3">
        <p className="text-ink-2">No fees are assigned to this student yet. Assign the class fee structure in Fee Management, Fee Structure.</p>
        {canCollect && <Link href="/fee-management/structure" className={buttonClass("secondary")}>Open Fee Structure</Link>}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Total fees", tab.totals.total, ""],
          ["Paid", tab.totals.paid, "text-success"],
          ["Balance", tab.totals.balance, ""],
          ["Overdue", tab.overduePaise, tab.overduePaise > ZERO ? "text-danger" : ""],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-xl bg-surface-2 p-3">
            <dt className="text-sm text-ink-2">{label as string}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${tone}`}>{formatRupees(value as bigint)}</dd>
          </div>
        ))}
      </dl>
      {tab.advancePaise > ZERO && <p className="text-sm text-ink-2">Advance held: {formatRupees(tab.advancePaise)}. It is used for the next fees as they fall due.</p>}

      <section aria-labelledby="fee-rows">
        <h3 id="fee-rows" className="mb-2 font-semibold">Fees</h3>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr><th className="px-3 py-2 font-medium">Fee head</th><th className="px-3 py-2 font-medium">Due date</th><th className="px-3 py-2 text-right font-medium">Amount</th><th className="px-3 py-2 text-right font-medium">Paid</th><th className="px-3 py-2 text-right font-medium">Balance</th><th className="px-3 py-2 font-medium">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tab.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.head}{r.label ? <span className="text-ink-2">, {r.label}</span> : null}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDate(r.dueDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRupees(r.amountPaise)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRupees(r.paidPaise)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRupees(r.balancePaise > ZERO ? r.balancePaise : ZERO)}</td>
                  <td className="px-3 py-2"><Badge tone={DUE_STATUS_WORDS[r.status]?.tone ?? "neutral"}>{DUE_STATUS_WORDS[r.status]?.label ?? r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="fee-payments">
        <h3 id="fee-payments" className="mb-2 font-semibold">Recent payments</h3>
        {tab.payments.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {tab.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Link href={`/fee-management/payments/${p.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="font-medium tabular-nums">{formatRupees(p.amountPaise)}</span> <span className="text-ink-2">on {formatDate(p.date)} · {modeLabel(p.mode)}{p.receiptNo ? ` · Receipt ${p.receiptNo}` : ""}{p.broughtIn ? " · Brought in" : ""}</span>
                </Link>
                <Badge tone={PAYMENT_STATUS_WORDS[p.status]?.tone ?? "neutral"}>{PAYMENT_STATUS_WORDS[p.status]?.label ?? p.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-2">No payments yet.</p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {canCollect && <Link href={tab.collectLink} className={buttonClass("primary")}>Collect fee</Link>}
        <Link href={tab.ledgerLink} className={buttonClass("secondary")}>Open fee ledger</Link>
      </div>
    </div>
  );
}
