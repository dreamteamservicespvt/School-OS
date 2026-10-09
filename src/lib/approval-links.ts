// Where the record behind an approval opens (00-global.md §3.3: "a link to
// the record"). Each module registers its link next to its onDecision
// handler, in a file imported by src/lib/approval-handlers.ts:
//
//   registerApprovalLink("refund", (a) => `/fee-management/refunds/${a.recordId}`);
//
// Types with no link show the request without one.

type LinkMaker = (approval: { recordType: string; recordId: string }) => { href: string; label?: string } | string | null;
const makers = new Map<string, LinkMaker>();

export function registerApprovalLink(type: string, make: LinkMaker) {
  makers.set(type, make);
}

export function approvalRecordLink(approval: { type: string; recordType: string; recordId: string }): { href: string; label: string } | null {
  const make = makers.get(approval.type);
  const out = make?.(approval);
  if (!out) return null;
  return typeof out === "string" ? { href: out, label: `Open the ${approval.recordType.toLowerCase()}` } : { href: out.href, label: out.label ?? `Open the ${approval.recordType.toLowerCase()}` };
}
