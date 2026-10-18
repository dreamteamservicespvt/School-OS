// What an approver needs to see on the request itself, before deciding
// (00-global.md §3.3, P-patterns: show what will change). Each module lists
// its facts next to its follow-ups (handlers file), and ./approval-handlers.ts
// gathers them. Read live, so they are true when the request is opened: a
// staff leave shows the leave balance and the periods to cover (workflow 7
// step 3), an attendance correction shows each change ("Present → Absent").
//
//   export const approvalFacts = { "staff-leave": async (tx, ctx, list) => new Map([[approvalId, [{ label, value }]]]) };
//
// Types with no facts show the request as before.
import "server-only";

import type { SchoolContext, Tx } from "./db";
import { approvalFactsOf } from "./approval-handlers";

export type ApprovalFact = { label: string; value: string };
export type FactsMaker = (tx: Tx, ctx: SchoolContext, approvals: { id: string; recordType: string; recordId: string }[]) => Promise<Map<string, ApprovalFact[]>>;

/** The facts for each request, by approval id; none for a type without facts. */
export async function approvalFacts(tx: Tx, ctx: SchoolContext, approvals: { id: string; type: string; recordType: string; recordId: string }[]): Promise<Map<string, ApprovalFact[]>> {
  const out = new Map<string, ApprovalFact[]>();
  const byType = new Map<string, typeof approvals>();
  for (const a of approvals) byType.set(a.type, [...(byType.get(a.type) ?? []), a]);
  for (const [type, list] of byType) {
    const make = approvalFactsOf(type);
    if (!make) continue;
    for (const [id, facts] of await make(tx, ctx, list)) if (facts.length) out.set(id, facts);
  }
  return out;
}
