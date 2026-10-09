"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm";
import { bulkApproveAction } from "./actions";

export type ApprovalRow = {
  id: string; summary: string; typeLabel: string; amount: string | null; amountPaise: string | null; askedBy: string; asked: string;
  status: { label: string; tone: BadgeTone }; waitingFor: string | null; decidable: boolean; overdue: boolean;
};

export function ApprovalList({ rows }: { rows: ApprovalRow[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ tone: "success" | "warning" | "danger"; text: string; skipped: { summary: string; reason: string }[] } | null>(null);
  const decidable = rows.filter((r) => r.decidable);
  const chosen = rows.filter((r) => picked.includes(r.id));
  const total = chosen.reduce((s, r) => s + (r.amountPaise ? BigInt(r.amountPaise) : BigInt(0)), BigInt(0));
  const totalWords = total > BigInt(0) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(total / BigInt(100))) : null;

  return (
    <div className="space-y-3">
      {result && (
        <Alert tone={result.tone} title={result.text}>
          {result.skipped.length > 0 && <ul className="mt-1 list-disc pl-5">{result.skipped.map((s, i) => <li key={i}>{s.summary}: {s.reason}</li>)}</ul>}
        </Alert>
      )}
      {decidable.length > 1 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={picked.length === decidable.length}
              onChange={(e) => setPicked(e.target.checked ? decidable.map((r) => r.id) : [])} />
            {picked.length ? `${picked.length} chosen${totalWords ? `, ${totalWords} in all` : ""}` : `Choose all ${decidable.length} you can decide`}
          </label>
          {picked.length > 0 && (
            <ConfirmButton trigger={`Approve ${picked.length}`} triggerVariant="primary" title={`Approve ${picked.length} request${picked.length === 1 ? "" : "s"}?`}
              confirmLabel={`Approve ${picked.length}`} onConfirm={async () => {
                const r = await bulkApproveAction(picked);
                if ("error" in r) return r.error;
                setPicked([]);
                setResult({
                  tone: r.skipped.length === 0 ? "success" : r.approved ? "warning" : "danger",
                  text: `${r.approved} approved${r.skipped.length ? `, ${r.skipped.length} not approved` : ""}. Each person who asked has been told.`,
                  skipped: r.skipped,
                });
                router.refresh();
              }}>
              <ul className="max-h-60 list-disc overflow-y-auto pl-5 text-sm">{chosen.map((r) => <li key={r.id}>{r.summary}{r.amount ? `: ${r.amount}` : ""}</li>)}</ul>
              <p className="mt-2">{totalWords ? `Total ${totalWords}. ` : ""}Each is checked on its own; any that cannot be approved are listed after.</p>
            </ConfirmButton>
          )}
        </div>
      )}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 p-4">
            {decidable.length > 1 && (
              <span className="flex min-h-11 w-6 items-start pt-0.5">
                {r.decidable && (
                  <input type="checkbox" aria-label={`Choose ${r.summary}`} className="size-5 accent-[var(--brand)]" checked={picked.includes(r.id)}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />
                )}
              </span>
            )}
            <Link href={`/approvals/${r.id}`} className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 hover:opacity-90">
              <span className="min-w-0">
                <span className="block font-medium text-brand-text">{r.summary}</span>
                <span className="block text-sm text-ink-2">{r.typeLabel} · asked by {r.askedBy} · {r.asked}{r.waitingFor ? ` · waiting for ${r.waitingFor}` : ""}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {r.amount && <span className="font-medium">{r.amount}</span>}
                {r.overdue && <Badge tone="danger">Overdue</Badge>}
                <Badge tone={r.status.tone}>{r.status.label}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
