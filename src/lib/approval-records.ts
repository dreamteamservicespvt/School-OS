// Is the record a request in Approvals is about still in School OS? (QA SEED-03)
//
// A decision moves the request's record on (00-global.md §3.4). Records are
// archived, never deleted, so a request whose record cannot be found points at
// nothing: it was made wrongly (a demo row, an import) or belongs to no record
// of this school. Approving it would say "Approved. The person who asked has
// been told." while nothing moved. decide() in ./approvals.ts asks here first:
// such a request cannot be approved or sent back for a change, and the plain
// reason is shown; it can still be rejected (or withdrawn) to take it off the
// list, and then nothing else runs.
//
// One line per record type a module asks approvals about (the recordType given
// to requestApproval()). A record type not listed here is not checked.
import "server-only";

import type { Tx } from "./db";

type Kind = { words: string; find: (tx: Tx, id: string) => Promise<unknown> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = { id: true } as const;

const KINDS: Record<string, Kind> = {
  Application: { words: "application", find: (tx, id) => tx.application.findUnique({ where: { id }, select: ID }) },
  "Asset Disposal": { words: "asset disposal", find: (tx, id) => tx.assetDisposal.findUnique({ where: { id }, select: ID }) },
  "Attendance Correction": { words: "attendance correction", find: (tx, id) => tx.attendanceCorrection.findUnique({ where: { id }, select: ID }) },
  Certificate: { words: "certificate", find: (tx, id) => tx.certificate.findUnique({ where: { id }, select: ID }) },
  "Clearance Check": { words: "clearance check", find: (tx, id) => tx.studentClearanceCheck.findUnique({ where: { id }, select: ID }) },
  Concession: { words: "concession", find: (tx, id) => tx.concession.findUnique({ where: { id }, select: ID }) },
  "Deletion Request": { words: "data deletion request", find: (tx, id) => tx.deletionRequest.findUnique({ where: { id }, select: ID }) },
  "Exit Case": { words: "staff exit", find: (tx, id) => tx.exitCase.findUnique({ where: { id }, select: ID }) },
  Expense: { words: "expense", find: (tx, id) => tx.expense.findUnique({ where: { id }, select: ID }) },
  "Fee Structure": { words: "fee structure", find: (tx, id) => tx.feeStructure.findUnique({ where: { id }, select: ID }) },
  "Gate Pass": { words: "outing pass", find: (tx, id) => tx.gatePass.findUnique({ where: { id }, select: ID }) },
  "Leave Request": { words: "leave request", find: (tx, id) => tx.leaveRequest.findUnique({ where: { id }, select: ID }) },
  "Library Fine": { words: "library charge", find: (tx, id) => tx.libraryFine.findUnique({ where: { id }, select: ID }) },
  "Marks Moderation": { words: "marks change", find: (tx, id) => tx.marksModeration.findUnique({ where: { id }, select: ID }) },
  Notice: { words: "notice", find: (tx, id) => tx.notice.findUnique({ where: { id }, select: ID }) },
  "Opening Balance": { words: "opening balance", find: (tx, id) => tx.openingBalance.findUnique({ where: { id }, select: ID }) },
  Payment: { words: "fee payment", find: (tx, id) => tx.payment.findUnique({ where: { id }, select: ID }) },
  "Payroll Run": { words: "salary month", find: (tx, id) => tx.payrollRun.findUnique({ where: { id }, select: ID }) },
  "Purchase Order": { words: "purchase order", find: (tx, id) => tx.purchaseOrder.findUnique({ where: { id }, select: ID }) },
  "Purchase Request": { words: "purchase request", find: (tx, id) => tx.purchaseRequest.findUnique({ where: { id }, select: ID }) },
  Refund: { words: "refund", find: (tx, id) => tx.refund.findUnique({ where: { id }, select: ID }) },
  "Salary Advance": { words: "salary advance", find: (tx, id) => tx.salaryAdvance.findUnique({ where: { id }, select: ID }) },
  "Stock Audit": { words: "stock audit", find: (tx, id) => tx.stockAudit.findUnique({ where: { id }, select: ID }) },
  "Stock Transfer": { words: "stock transfer", find: (tx, id) => tx.stockTransfer.findUnique({ where: { id }, select: ID }) },
  Student: { words: "student", find: (tx, id) => tx.student.findUnique({ where: { id }, select: ID }) },
  "Transport Assignment": { words: "transport change", find: (tx, id) => tx.transportAssignment.findUnique({ where: { id }, select: ID }) },
};
// Names the demo seed gave requests before 22 October 2026, pointing at no record (QA SEED-03).
// Listed so a demo database seeded before then refuses them too; nothing in School OS asks with them.
KINDS["Staff Leave"] = KINDS["Leave Request"];
KINDS["Fee Payment"] = KINDS.Payment;

/** The record types checked here (for tests). */
export const CHECKED_RECORD_TYPES = Object.keys(KINDS);

/**
 * When the record a request is about cannot be found in this school: what it
 * is, in words ("leave request"). Null when it is there, or when its record
 * type is not one School OS checks.
 */
export async function missingRecordWords(tx: Tx, approval: { recordType: string; recordId: string }): Promise<string | null> {
  const kind = Object.hasOwn(KINDS, approval.recordType) ? KINDS[approval.recordType] : null;
  if (!kind) return null;
  if (!UUID.test(approval.recordId)) return kind.words;
  return (await kind.find(tx, approval.recordId)) ? null : kind.words;
}
