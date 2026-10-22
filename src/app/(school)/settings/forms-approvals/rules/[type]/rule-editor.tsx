"use client";

// The approval rule editor, with the plain-words summary updating as the person changes steps.
import Link from "next/link";
import { useActionState, useState } from "react";
import { TextField } from "@/components/ui/field";
import { Alert, FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ruleSummary, type StepDraft } from "@/lib/settings/approval-rule-words";
import { saveRuleAction } from "../../actions";
import { KeepSelect } from "@/components/ui/keep-select";

type Option = { value: string; label: string };
type Step = { approver: string; upTo: string };

const MAX_STEPS = 5;

function toPaise(rupees: string): string | null {
  const v = rupees.replace(/[₹,\s]/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) return null;
  const [r, p = ""] = v.split(".");
  return (BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2))).toString();
}

/** Problems with the steps, by step index, checked in the browser before saving. */
function checkSteps(steps: Step[]): Record<string, string> {
  const errors: Record<string, string> = {};
  let last: bigint | null = null;
  let open = false;
  steps.forEach((s, i) => {
    if (!s.approver) { errors[`step${i}`] = "Choose who approves."; return; }
    if (!s.upTo.trim()) { open = true; return; }
    const p = toPaise(s.upTo);
    if (p === null || BigInt(p) <= BigInt(0)) { errors[`step${i}`] = "Type the amount in rupees, more than 0, like 5000."; return; }
    if (open) { errors[`step${i}`] = "Steps with an amount limit must come before steps with no limit."; return; }
    if (last !== null && BigInt(p) <= last) { errors[`step${i}`] = "The amount limit must be higher than the step before it."; return; }
    last = BigInt(p);
  });
  return errors;
}

export function RuleEditor({ type, label, steps: start, escalateAfterDays, roles, people }: {
  type: string; label: string; steps: Step[]; escalateAfterDays: number; roles: Option[]; people: Option[];
}) {
  const [state, action] = useActionState(saveRuleAction, null);
  const [steps, setSteps] = useState<Step[]>(start.length ? start : [{ approver: "role:principal", upTo: "" }]);
  const [days, setDays] = useState(String(escalateAfterDays));
  const [checked, setChecked] = useState<Record<string, string>>({});
  const errors = { ...checked, ...(state?.errors ?? {}) };
  const names = {
    role: (k: string) => roles.find((r) => r.value === `role:${k}`)?.label ?? "removed role",
    person: (id: string) => people.find((p) => p.value === `user:${id}`)?.label ?? "a person no longer here",
  };
  const drafts: StepDraft[] = steps.map((s) => ({
    approverRole: s.approver.startsWith("role:") ? s.approver.slice(5) : null,
    approverUserId: s.approver.startsWith("user:") ? s.approver.slice(5) : null,
    upToPaise: s.upTo.trim() ? toPaise(s.upTo) : null,
  }));
  const daysNum = Number(days);
  const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 30;
  const summary = ruleSummary(label, drafts, daysOk ? daysNum : 2, names);
  const set = (i: number, patch: Partial<Step>) => { setSteps(steps.map((s, k) => (k === i ? { ...s, ...patch } : s))); setChecked({}); };

  return (
    <form action={action} className="space-y-5" noValidate onSubmit={(e) => {
      const found = checkSteps(steps);
      if (!daysOk) found.escalateAfterDays = "Escalate after must be between 1 and 30 working days.";
      setChecked(found);
      if (Object.keys(found).length) e.preventDefault();
    }}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="stepCount" value={steps.length} />
      <FormMessage state={state} />
      <Alert tone="info" title="In plain words">{summary}</Alert>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className={`rounded-xl border p-4 ${errors[`step${i}`] ? "border-danger" : "border-line"}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="font-medium">Step {i + 1}</p>
              <div className="flex gap-1">
                {i > 0 && <Button size="sm" variant="ghost" onClick={() => { const n = [...steps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSteps(n); }}><span aria-hidden="true">↑</span><span className="sr-only">Move step {i + 1} up</span></Button>}
                {i < steps.length - 1 && <Button size="sm" variant="ghost" onClick={() => { const n = [...steps]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSteps(n); }}><span aria-hidden="true">↓</span><span className="sr-only">Move step {i + 1} down</span></Button>}
                {steps.length > 1 && <Button size="sm" variant="ghost" onClick={() => { setSteps(steps.filter((_, k) => k !== i)); setChecked({}); }}>Remove</Button>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`approver${i}`} className="mb-1 block text-sm font-medium">Who approves <span className="text-danger" aria-hidden="true">*</span></label>
                <KeepSelect id={`approver${i}`} name={`approver${i}`} value={s.approver} onChange={(e) => set(i, { approver: e.target.value })} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3">
                  <option value="">Choose</option>
                  <optgroup label="A role (anyone with it)">{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</optgroup>
                  {people.length > 0 && <optgroup label="A named person">{people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup>}
                </KeepSelect>
              </div>
              <TextField label="Up to amount (₹)" name={`upTo${i}`} inputMode="decimal" value={s.upTo} placeholder="No limit" onChange={(e) => set(i, { upTo: e.target.value })}
                help="Leave blank for no limit. Requests with no amount go to step 1." />
            </div>
            {errors[`step${i}`] && <p role="alert" className="mt-2 text-sm text-danger">{errors[`step${i}`]}</p>}
          </li>
        ))}
      </ol>
      {errors.steps && <p className="text-sm text-danger">{errors.steps}</p>}
      {steps.length < MAX_STEPS && <Button variant="secondary" onClick={() => setSteps([...steps, { approver: "", upTo: "" }])}>Add a step</Button>}

      <TextField label="Escalate after (working days)" name="escalateAfterDays" required inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="max-w-xs"
        error={errors.escalateAfterDays} help="If nobody decides in time, the request moves to the next step, or to the Principal." />

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <SubmitButton pendingText="Saving…">Save rule</SubmitButton>
        <Link href="/settings/forms-approvals" className="min-h-11 rounded-lg px-3 py-2.5 font-medium text-ink-2 hover:bg-surface-2">Cancel</Link>
      </div>
    </form>
  );
}
