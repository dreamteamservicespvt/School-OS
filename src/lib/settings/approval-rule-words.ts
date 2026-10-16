// The plain-words summary of an approval rule (Settings, Forms & Approvals),
// with no database, so the editor can show it live as the person changes steps:
// "Refunds: up to ₹5,000 the Accountant approves; above that, the Principal. Escalate after 2 days."
import { formatRupees } from "../format";

export type StepDraft = { approverRole?: string | null; approverUserId?: string | null; upToPaise?: string | null };

export type Namer = { role: (key: string) => string; person: (id: string) => string };

function approver(step: StepDraft, names: Namer) {
  if (step.approverUserId) return names.person(step.approverUserId);
  if (step.approverRole) return `the ${names.role(step.approverRole)}`;
  return "nobody yet";
}

/** Plural, capitalised name of the request type: "Refund" -> "Refunds", "Student leave" stays. */
export function requestHeading(label: string) {
  return /^[A-Za-z]+$/.test(label) && !label.endsWith("s") ? `${label}s` : label;
}

export function ruleSummary(requestLabel: string, steps: StepDraft[], escalateAfterDays: number, names: Namer) {
  const heading = requestHeading(requestLabel);
  if (steps.length === 0) return `${heading}: nobody is set to approve yet.`;
  const limited: StepDraft[] = [];
  let i = 0;
  while (i < steps.length && steps[i].upToPaise) limited.push(steps[i++]);
  const rest = steps.slice(i);
  const parts: string[] = [];
  if (limited.length === 0) {
    parts.push(`${approver(rest[0], names)} approves`);
  } else {
    limited.forEach((s, k) => {
      const amount = formatRupees(BigInt(s.upToPaise!));
      parts.push(k === 0 ? `up to ${amount} ${approver(s, names)} approves` : `up to ${amount}, ${approver(s, names)}`);
    });
    parts.push(`above that, ${approver(rest[0] ?? limited[limited.length - 1], names)}`);
  }
  const later = limited.length === 0 ? rest.slice(1) : rest.slice(1);
  if (later.length) parts.push(`if not decided in time, it moves to ${later.map((s) => approver(s, names)).join(", then ")}`);
  const days = `${escalateAfterDays} day${escalateAfterDays === 1 ? "" : "s"}`;
  return `${heading}: ${parts.join("; ")}. Escalate after ${days}.`;
}
