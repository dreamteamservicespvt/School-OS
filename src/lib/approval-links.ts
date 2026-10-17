// Where the record behind an approval opens (00-global.md §3.3: "a link to
// the record"). Each module lists its links next to its follow-ups, and
// ./approval-handlers.ts gathers them; this file imports that list itself, so
// the link is there whichever page asks first.
//
//   export const approvalLinks = { refund: (a) => ({ href: `/fee-management/refunds/${a.recordId}`, label: "Open the refund" }) };
//
// Types with no link show the request without one.
import { approvalLinkOf } from "./approval-handlers";

export type LinkMaker = (approval: { recordType: string; recordId: string }) => { href: string; label?: string } | string | null;

export function approvalRecordLink(approval: { type: string; recordType: string; recordId: string }): { href: string; label: string } | null {
  const make = approvalLinkOf(approval.type);
  const out = make?.(approval);
  if (!out) return null;
  return typeof out === "string" ? { href: out, label: `Open the ${approval.recordType.toLowerCase()}` } : { href: out.href, label: out.label ?? `Open the ${approval.recordType.toLowerCase()}` };
}
