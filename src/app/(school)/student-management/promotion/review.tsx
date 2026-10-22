"use client";

// Step 2 and 3 of Promotion (03 §2): every student with result, attendance
// and fee dues, the suggested decision, changes with a reason, then a summary
// to confirm.

import { useActionState, useMemo, useRef, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { confirmPromotionAction } from "../_actions/promotion";
import { KeepSelect } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

type Kind = "PROMOTE" | "DETAIN" | "LEAVING";
export type ReviewRow = {
  studentId: string; fullName: string; admissionNo: string; rollNo: number | null; suggested: Kind; why: string;
  result: string | null; attendance: string | null; feeDue: string | null; alreadyIn: string | null;
};
type Section = { id: string; name: string };

const LABEL: Record<Kind, string> = { PROMOTE: "Promote", DETAIN: "Detain", LEAVING: "Leaving" };
const TONE: Record<Kind, "success" | "warning" | "neutral"> = { PROMOTE: "success", DETAIN: "warning", LEAVING: "neutral" };

export function PromotionReview({ rows, fromSectionId, fromLabel, fromYear, toYearId, toYearName, toClassId, toClassName, targetSections, detainSections, defaultSectionName, finalClass }: {
  rows: ReviewRow[]; fromSectionId: string; fromLabel: string; fromYear: string; toYearId: string; toYearName: string;
  toClassId: string | null; toClassName: string | null; targetSections: Section[]; detainSections: Section[]; defaultSectionName: string; finalClass: boolean;
}) {
  const open = rows.filter((r) => !r.alreadyIn);
  const [state, action] = useActionState<FormState, FormData>(confirmPromotionAction, null);
  const [dec, setDec] = useState<Record<string, { decision: Kind; toSectionId: string; reason: string }>>(
    () => Object.fromEntries(open.map((r) => [r.studentId, { decision: r.suggested, toSectionId: "", reason: "" }])),
  );
  const [step, setStep] = useState<"review" | "confirm">("review");
  const top = useRef<HTMLDivElement>(null);
  const set = (id: string, patch: Partial<{ decision: Kind; toSectionId: string; reason: string }>) => setDec((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const defaultName = (kind: Kind) => {
    const list = kind === "PROMOTE" ? targetSections : detainSections;
    const same = list.find((s) => s.name === defaultSectionName);
    return same ? same.name : `${defaultSectionName} (new)`;
  };
  const missingReason = open.filter((r) => dec[r.studentId].decision !== r.suggested && dec[r.studentId].reason.trim().length < 3);

  const summary = useMemo(() => {
    const promoted = new Map<string, number>();
    let detained = 0, leaving = 0;
    for (const r of open) {
      const d = dec[r.studentId];
      if (d.decision === "PROMOTE") {
        const name = targetSections.find((s) => s.id === d.toSectionId)?.name ?? defaultSectionName;
        promoted.set(name, (promoted.get(name) ?? 0) + 1);
      } else if (d.decision === "DETAIN") detained++;
      else leaving++;
    }
    const parts = [...promoted.entries()].map(([n, c]) => `${c} promoted to ${toClassName ?? ""} ${n}`.replace(/\s+/g, " "));
    if (detained) parts.push(`${detained} detained`);
    if (leaving) parts.push(`${leaving} leaving`);
    return parts.join(", ");
  }, [open, dec, targetSections, defaultSectionName, toClassName]);

  if (open.length === 0) return <p className="rounded-xl border border-line bg-surface p-4"><Words k="Everyone in" /> {fromLabel} <Words k="is already in" /> {toYearName}<Words k=". See the batch below to undo it." /></p>;

  return (
    <div ref={top} className="space-y-4">
      <FormMessage state={state} />
      {step === "review" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDec((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, decision: open.find((r) => r.studentId === k)!.suggested, reason: "" }])))}><Words k="Use every suggestion" /></Button>
            {!finalClass && <Button size="sm" variant="secondary" onClick={() => setDec((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, decision: "PROMOTE" as Kind }])))}><Words k="Promote everyone" /></Button>}
          </div>
          <ul className="space-y-2">
            {rows.map((r) => {
              const d = dec[r.studentId];
              const changed = d && d.decision !== r.suggested;
              return (
                <li key={r.studentId} className={`rounded-xl border bg-surface p-3 ${r.alreadyIn ? "border-line opacity-70" : changed ? "border-warn" : "border-line"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r.rollNo ? `${r.rollNo}. ` : ""}{r.fullName} <span className="text-[13.5px] font-normal text-ink2">{r.admissionNo}</span></p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13.5px] text-ink2">
                        {r.result && <span><Words k="Result:" /> <strong className="text-ink">{r.result}</strong></span>}
                        {r.attendance && <span><Words k="Attendance:" /> <strong className="text-ink">{r.attendance}</strong></span>}
                        {r.feeDue && <span className="text-ink"><Words k="Fees due:" /> {r.feeDue}</span>}
                      </p>
                      <p className="mt-1 text-[13.5px]"><Words k="Suggested:" /> <Badge tone={TONE[r.suggested]}>{LABEL[r.suggested]}</Badge> <span className="text-ink2">({r.why})</span></p>
                    </div>
                    {r.alreadyIn ? <Badge><Words k="Already in" /> {r.alreadyIn}</Badge> : (
                      <div className="flex flex-wrap gap-2">
                        <label><span className="sr-only"><Words k="Decision for" /> {r.fullName}</span>
                          <KeepSelect value={d.decision} onChange={(e) => set(r.studentId, { decision: e.target.value as Kind, toSectionId: "" })} className="h-11 rounded-xl border border-line bg-surface px-2">
                            {(["PROMOTE", "DETAIN", "LEAVING"] as Kind[]).filter((k) => k !== "PROMOTE" || !finalClass).map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}
                          </KeepSelect>
                        </label>
                        {d.decision !== "LEAVING" && (
                          <label><span className="sr-only"><Words k="Section for" /> {r.fullName}</span>
                            <KeepSelect value={d.toSectionId} onChange={(e) => set(r.studentId, { toSectionId: e.target.value })} className="h-11 rounded-xl border border-line bg-surface px-2">
                              <option value="">{d.decision === "PROMOTE" ? toClassName : fromLabel.split(" ").slice(0, -1).join(" ")} {defaultName(d.decision)}</option>
                              {(d.decision === "PROMOTE" ? targetSections : detainSections).filter((s) => s.name !== defaultSectionName).map((s) => <option key={s.id} value={s.id}>{d.decision === "PROMOTE" ? toClassName : ""} {s.name}</option>)}
                            </KeepSelect>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                  {changed && (
                    <label className="mt-2 block">
                      <span className="mb-1 block text-[13px] font-semibold text-ink2"><Words k="Reason for the change" /><span className="text-bad" aria-hidden="true"> *</span></span>
                      <input value={d.reason} onChange={(e) => set(r.studentId, { reason: e.target.value })} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base" />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          {missingReason.length > 0 && <p className="text-[13.5px] text-bad" role="alert"><Words k="Give a reason for" /> {missingReason.length} <Words k="changed" /> {missingReason.length === 1 ? "decision" : "decisions"} ({missingReason.slice(0, 3).map((r) => r.fullName).join(", ")}{missingReason.length > 3 ? "…" : ""}).</p>}
          <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-pop md:bottom-4">
            <p className="flex-1 font-medium">{summary}</p>
            <Button disabled={missingReason.length > 0} onClick={() => { setStep("confirm"); top.current?.scrollIntoView({ behavior: "smooth" }); }}><Words k="Review and confirm" /></Button>
          </div>
        </>
      ) : (
        <form action={action} className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="text-lg font-semibold"><Words k="Promote" /> {open.length} <Words k="students from" /> {fromLabel} ({fromYear}<Words k=") to" /> {toYearName}?</h2>
          <p className="text-lg">{summary}</p>
          <ul className="list-disc space-y-1 pl-5 text-ink2">
            <li><Words k="Each student gets a new class for" /> {toYearName} <Words k="with the new year's fee plan." /></li>
            <li>{fromLabel} <Words k="in" /> {fromYear} <Words k="keeps the same students, roll numbers and marks." /></li>
            <li><Words k={"Students marked Leaving go to the Leaving & Alumni list."} /></li>
            <li><Words k="You can undo the batch while nothing is recorded for these students in the new year." /></li>
          </ul>
          <input type="hidden" name="fromSectionId" value={fromSectionId} />
          <input type="hidden" name="toYearId" value={toYearId} />
          <input type="hidden" name="toClassId" value={toClassId ?? ""} />
          <input type="hidden" name="decisions" value={JSON.stringify(open.map((r) => ({ studentId: r.studentId, ...dec[r.studentId] })))} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Saving…"><Words k="Confirm and save" /></SubmitButton>
            <Button variant="secondary" onClick={() => setStep("review")}><Words k="Back to the list" /></Button>
          </div>
        </form>
      )}
    </div>
  );
}
