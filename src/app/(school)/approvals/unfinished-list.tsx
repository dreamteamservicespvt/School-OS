"use client";

// "Approved, but not finished" at the top of Approvals (gap list G01,
// follow-up): requests that were decided while their record never moved on.
// Shown to the person who decided each one and to the Principal and School
// Admin, with Finish now. Nothing is finished by itself.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Pill } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm";
import { finishFollowUpAction } from "./actions";

export type UnfinishedItem = {
  id: string;
  summary: string;
  typeLabel: string;
  /** "Approved", "Not approved" or "Sent back for a change" */
  decided: string;
  /** "approved", "not approved", "sent back for a change" */
  decidedWords: string;
  by: string;
  when: string;
  /** "leave request", "payment" */
  record: string;
  link: { href: string; label: string } | null;
};

export function UnfinishedList({ items }: { items: UnfinishedItem[] }) {
  const router = useRouter();
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null);

  const finish = async (id: string) => {
    setProblem(null);
    const p = await finishFollowUpAction(id);
    if (p) setProblem({ id, text: p });
    router.refresh();
  };

  return (
    <section aria-labelledby="unfinished-head" className="mb-5 rounded-2xl border border-warn/40 bg-surface shadow-card overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span className="w-10 h-10 rounded-xl bg-warn/15 text-warn grid place-items-center shrink-0"><CircleAlert size={19} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="unfinished-head" className="font-semibold text-[15px]">Approved, but not finished</h2>
          <p className="text-[13px] text-ink2">These requests were decided, but their record never moved on, because of a fault in School OS that is now fixed. Open each one to check, then tap Finish now to do what the decision should have done. Nothing is finished by itself.</p>
        </div>
      </div>
      <ul className="divide-y divide-line/70 border-t border-line/70">
        {items.map((r) => (
          <li key={r.id} className="p-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[14.5px] break-words">{r.summary}</p>
              <Pill tone="warn">{r.decided} · not finished</Pill>
            </div>
            <p className="text-[12.5px] text-ink3">{r.typeLabel} · {r.decidedWords} by {r.by}, {r.when} · the {r.record} still shows as waiting</p>
            {problem?.id === r.id && <Alert tone="danger" title={problem.text} />}
            <div className="flex gap-2 flex-wrap items-center">
              <ConfirmButton trigger="Finish now" triggerVariant="primary" title="Finish this request now?" confirmLabel="Finish now"
                onConfirm={async () => { await finish(r.id); }}>
                <p>School OS does now what the decision should have done: the {r.record} is {r.decidedWords}, as {r.by} decided. It is written in the Audit Log with your name. If something has changed since, for example the class is now full, you will see why and nothing changes.</p>
              </ConfirmButton>
              {r.link && <Link href={r.link.href} className="text-[13.5px] font-semibold text-brand hover:underline">{r.link.label}</Link>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
