"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Check } from "lucide-react";
import { Pill, type BadgeTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { ConfirmButton } from "@/components/ui/confirm";
import { bulkApproveAction, decideAction } from "./actions";

export type ApprovalRow = {
  id: string; summary: string; typeLabel: string; amount: string | null; amountPaise: string | null; askedBy: string; askedByName: string; asked: string;
  status: { label: string; tone: BadgeTone }; waitingFor: string | null; decidable: boolean; overdue: boolean;
  /** The asker's job ("Teacher, Science · Class teacher, Class 5 A") and the reason they gave. */
  job: string | null; reason: string | null;
  /** What the approver needs to see before deciding (the leave balance, the change asked for). */
  facts?: { label: string; value: string }[];
};

export function ApprovalList({ rows }: { rows: ApprovalRow[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ tone: "success" | "warning" | "danger"; text: string; skipped: { summary: string; reason: string }[] } | null>(null);
  const decidable = rows.filter((r) => r.decidable);
  const [busy, setBusy] = useState<string | null>(null);
  const approve = async (r: ApprovalRow) => {
    setBusy(r.id);
    const problem = await decideAction(r.id, "approve", null);
    setBusy(null);
    if (problem) setResult({ tone: "danger", text: problem, skipped: [] });
    router.refresh();
  };
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
        <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface/95 backdrop-blur px-4 py-2 shadow-card">
          <label className="flex min-h-11 items-center gap-3 text-[14px] font-medium">
            <Checkbox checked={picked.length === decidable.length} indeterminate={picked.length > 0 && picked.length < decidable.length} label="Choose all"
              onChange={(on) => setPicked(on ? decidable.map((r) => r.id) : [])} />
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
      <ul className="divide-y divide-line/70 bg-surface rounded-2xl border border-line/70 shadow-card overflow-hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col md:flex-row md:items-center gap-3 p-4 hover:bg-sunken/40 transition">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {decidable.length > 1 && (
                <span className="flex h-[42px] w-6 items-center shrink-0">
                  {r.decidable && <Checkbox checked={picked.includes(r.id)} label={`Choose ${r.summary}`} onChange={(on) => setPicked(on ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />}
                </span>
              )}
              <Avatar name={r.askedBy === "you" ? r.askedByName : r.askedBy} size={42} />
              <Link href={`/approvals/${r.id}`} className="min-w-0 flex-1 group">
                <p className="font-semibold text-[15px] group-hover:text-brand transition">{r.summary}</p>
                <p className="text-[13px] text-ink2">Asked by {r.askedBy}{r.job ? <span className="text-ink3">, {r.job}</span> : null}</p>
                {r.reason && <p className="text-[13px] text-ink2 line-clamp-2 mt-0.5">“{r.reason}”</p>}
                {r.facts?.map((f) => <p key={f.label} className="text-[13px] text-ink2 mt-0.5"><span className="text-ink3">{f.label}:</span> {f.value}</p>)}
                <p className="text-[12.5px] text-ink3 mt-0.5">{r.typeLabel} · {r.asked}{r.waitingFor ? ` · waiting for ${r.waitingFor}` : ""}</p>
                <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {r.amount && <span className="font-display font-semibold text-[14px] tnum mr-1">{r.amount}</span>}
                  {r.overdue && <Pill tone="bad">Overdue</Pill>}
                  <Pill tone={r.status.tone}>{r.status.label}</Pill>
                </span>
              </Link>
            </div>
            {r.decidable && (
              <div className="flex gap-2 md:shrink-0 pl-[54px] md:pl-0">
                <Button variant="soft" icon={Check} loading={busy === r.id} onClick={() => approve(r)}>Approve</Button>
                <ButtonLink href={`/approvals/${r.id}`} variant="ghost">Decline</ButtonLink>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
