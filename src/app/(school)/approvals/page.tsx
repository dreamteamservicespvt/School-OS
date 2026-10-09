import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { ApprovalIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Approvals" };

/** One list of everything waiting for this person's yes or no (00-global.md §3). */
export default async function ApprovalsPage() {
  const current = await requireCurrent();
  const waiting = await withSchool(current.ctx, (tx) =>
    tx.approval.findMany({
      where: { status: "WAITING", currentApproverId: current.user.id },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
  );
  return (
    <>
      <PageHeader title="Approvals" href="/approvals" userId={current.user.id} />
      {waiting.length === 0 ? (
        <EmptyState title="Nothing is waiting for you" icon={<ApprovalIcon className="size-6" />}>
          Leave, refunds, discounts, admissions, certificates and other requests that need your yes or no will appear here, with a count on the top bar.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {waiting.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-medium">{a.summary}</p>
                <p className="text-sm text-ink-2">Asked {formatDateTime(a.createdAt, current.school.timeZone)}</p>
              </div>
              {a.amountPaise !== null && <span className="font-medium">{formatRupees(a.amountPaise)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-ink-2">
        Approve and reject buttons arrive with the first module that sends requests here. Who approves what is set in{" "}
        <Link href="/settings" className="underline">Settings, Forms &amp; Approvals</Link>.
      </p>
    </>
  );
}
