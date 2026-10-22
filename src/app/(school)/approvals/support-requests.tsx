"use client";

// DREAM TEAM's requests to look inside this school (07-super-admin.md §3.4),
// at the top of Approvals for the School Admin and the Principal: Allow or
// Decline a waiting one, End now while one is open, and the history.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, LifeBuoy, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Pill, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { answerSupportAction, endSupportNowAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export type SupportItem = {
  id: string;
  /** "Ravi Kumar of DREAM TEAM" */
  who: string;
  reason: string;
  length: string;
  asked: string;
  status: "WAITING" | "ALLOWED" | "DECLINED" | "ENDED" | "EXPIRED";
  live: boolean;
  /** "Allowed by Anita Sharma until 3:40 PM", "Ended at the time given, 3:40 PM" */
  detail: string | null;
  /** Opened from its notification. */
  focus: boolean;
};

const TONE: Record<SupportItem["status"], BadgeTone> = { WAITING: "warn", ALLOWED: "ok", DECLINED: "neutral", ENDED: "neutral", EXPIRED: "neutral" };
const WORDS: Record<SupportItem["status"], string> = { WAITING: "Waiting for you", ALLOWED: "Open now", DECLINED: "Declined", ENDED: "Ended", EXPIRED: "Expired" };

export function SupportRequests({ items, schoolName }: { items: SupportItem[]; schoolName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (id: string, work: () => Promise<string | void>) => {
    setBusy(id);
    setProblem(null);
    const p = await work();
    setBusy(null);
    if (p) setProblem(p);
    else { setDeclining(null); setWhy(""); }
    router.refresh();
  };

  return (
    <section aria-labelledby="support-head" className="mb-5 rounded-2xl border border-line/70 bg-surface shadow-card overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span className="w-10 h-10 rounded-xl bg-info/10 text-info grid place-items-center shrink-0"><LifeBuoy size={19} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="support-head" className="font-semibold text-[15px]"><Words k="DREAM TEAM support access" /></h2>
          <p className="text-[13px] text-ink2"><Words k="DREAM TEAM can look inside" /> {schoolName}<Words k="’s School OS only when you allow it, for the time they asked. They cannot change anything, export, print or cancel payments, and never see Aadhaar and other ID numbers, salaries or counselling notes. Everything they open is in your Audit Log." /></p>
        </div>
      </div>
      {problem && <div className="px-4 pb-3"><Alert tone="danger" title={problem} /></div>}
      <ul className="divide-y divide-line/70 border-t border-line/70">
        {items.map((r) => (
          <li key={r.id} id={`support-${r.id}`} className={cx("p-4 flex flex-col gap-2 scroll-mt-24", r.focus && "bg-info/5")}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[14.5px]">{r.who} <Words k="asks to look inside for" /> {r.length}</p>
              <Pill tone={TONE[r.status]}>{r.live ? WORDS.ALLOWED : r.status === "ALLOWED" ? "Ended" : WORDS[r.status]}</Pill>
            </div>
            <p className="text-[13.5px] text-ink2 break-words">“{r.reason}”</p>
            <p className="text-[12.5px] text-ink3"><Words k="Asked" /> {r.asked}{r.detail ? ` · ${r.detail}` : ""}</p>
            {r.status === "WAITING" && declining !== r.id && (
              <div className="flex gap-2 flex-wrap">
                <ConfirmButton trigger={<><Check size={16} aria-hidden="true" /><Words k="Allow" /></>} triggerVariant="primary" title={`Allow DREAM TEAM to look inside for ${r.length}?`}
                  confirmLabel={`Allow for ${r.length}`} onConfirm={async () => { await run(r.id, () => answerSupportAction(r.id, "allow", null)); }}>
                  <p>{r.who} <Words k="can open" /> {schoolName}<Words k="’s School OS from now, for" /> {r.length}<Words k=", to look only. A coloured bar shows them it is DREAM TEAM support and when it ends. You can end it earlier here." /></p>
                </ConfirmButton>
                <Button variant="ghost" icon={X} onClick={() => { setDeclining(r.id); setWhy(""); }}><Words k="Decline" /></Button>
              </div>
            )}
            {r.status === "WAITING" && declining === r.id && (
              <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run(r.id, () => answerSupportAction(r.id, "decline", why)); }}>
                <label htmlFor={`why-${r.id}`} className="text-[13px] font-semibold text-ink2"><Words k="Why you decline (DREAM TEAM sees this)" /></label>
                <textarea id={`why-${r.id}`} rows={2} value={why} onChange={(e) => setWhy(e.target.value)} className={cx(inputCls(), "py-2")} placeholder="Please call the office first." />
                <div className="flex gap-2">
                  <Button type="submit" variant="danger" loading={busy === r.id} disabled={why.trim().length < 5}><Words k="Decline" /></Button>
                  <Button variant="secondary" onClick={() => setDeclining(null)}><Words k="Back" /></Button>
                </div>
              </form>
            )}
            {r.live && (
              <div>
                <ConfirmButton trigger="End now" triggerVariant="secondary" title="End DREAM TEAM’s access now?" confirmLabel="End now" confirmVariant="danger"
                  onConfirm={async () => { await run(r.id, () => endSupportNowAction(r.id)); }}>
                  <p>{r.who} <Words k="can no longer look inside" /> {schoolName}<Words k="’s School OS, from this moment." /></p>
                </ConfirmButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
