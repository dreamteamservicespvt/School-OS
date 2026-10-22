// Everything the payment sheet shows for one payment (Fee Dashboard, Student
// Fee Ledger): the receipt lines, tax invoice, who collected it, which bank
// account it goes to, the Day Book state, and why it was cancelled or failed.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { canDecide } from "../approvals";
import { formatDate, formatDateTime, formatRupees } from "../format";
import { canSeeStudent, type FeeViewer } from "./access";
import { studentCard } from "./dues";
import { featureOn } from "./settings";
import { cancelReasonLabel, percentWord } from "./words";

const ZERO = BigInt(0);

export type PaymentView = NonNullable<Awaited<ReturnType<typeof paymentView>>>;

export async function paymentView(tx: Tx, ctx: SchoolContext, viewer: FeeViewer, paymentId: string, tz: string) {
  const p = await tx.payment.findFirst({ where: { id: paymentId }, include: { allocations: { where: { fromAdvance: false } } } });
  if (!p || !(await canSeeStudent(tx, viewer, p.studentId))) return null;
  const [card, receipt, invoice, dues, heads, collector, canceller, entries, link, approval, cancelApproval] = await Promise.all([
    studentCard(tx, ctx, p.studentId, p.academicYearId),
    tx.receipt.findUnique({ where: { paymentId: p.id } }),
    tx.taxInvoice.findUnique({ where: { paymentId: p.id } }),
    tx.studentFeeDue.findMany({ where: { id: { in: p.allocations.map((a) => a.dueId) } } }),
    tx.feeHead.findMany({ where: { id: { in: p.allocations.map((a) => a.feeHeadId) } } }),
    p.collectedById ? tx.userLogin.findUnique({ where: { id: p.collectedById }, select: { displayName: true } }) : null,
    p.cancelledById ? tx.userLogin.findUnique({ where: { id: p.cancelledById }, select: { displayName: true } }) : null,
    tx.dayBookEntry.findMany({ where: { sourceId: p.id }, orderBy: { postedAt: "asc" } }),
    p.paymentLinkId ? tx.paymentLink.findFirst({ where: { id: p.paymentLinkId } }) : null,
    p.verifyApprovalId ? tx.approval.findFirst({ where: { id: p.verifyApprovalId } }) : null,
    p.cancelApprovalId ? tx.approval.findFirst({ where: { id: p.cancelApprovalId } }) : null,
  ]);
  const splitOn = await featureOn(tx, ctx, "fee-bank-accounts");
  const accountIds = [...new Set([...p.allocations.map((a) => a.bankAccountId), ...entries.map((e) => e.accountId)].filter((x): x is string => Boolean(x)))];
  const accounts = await tx.bankAccount.findMany({ where: { OR: [{ id: { in: accountIds } }, { isMain: true }] } });
  const main = accounts.find((a) => a.isMain && a.kind === "BANK") ?? null;
  const accountWord = (id: string | null) => {
    const a = accounts.find((x) => x.id === id) ?? null;
    return a ? `${a.name}${a.bankName ? ` · ${a.bankName}` : ""}${a.accountLast4 ? ` · XXXX ${a.accountLast4}` : ""}` : null;
  };
  const goesTo = [...new Set(entries.filter((e) => e.direction === "IN" && !e.reversesEntryId).map((e) => accountWord(e.accountId)).filter(Boolean))].join(", ")
    || (splitOn ? [...new Set(p.allocations.map((a) => accountWord(a.bankAccountId) ?? (main ? accountWord(main.id) : null)).filter(Boolean))].join(", ") : null)
    || (p.mode === "CASH" ? "Cash in hand" : main ? accountWord(main.id) : "Main bank account");
  const lines = p.allocations.filter((a) => a.amountPaise > ZERO).map((a) => {
    const d = dues.find((x) => x.id === a.dueId);
    const h = heads.find((x) => x.id === a.feeHeadId);
    return { label: d?.kind === "LATE_FEE" ? d.label : `${h?.name ?? "Fees"}${d ? ` · ${d.label}` : ""}`, amount: a.amountPaise, late: d?.kind === "LATE_FEE" };
  });
  if (p.advancePaise > ZERO) lines.push({ label: "Advance, held for the next installments", amount: p.advancePaise, late: false });
  const reversal = entries.find((e) => e.reversesEntryId);
  const posted = entries.find((e) => !e.reversesEntryId);
  const invLines = invoice ? (invoice.lines as { rateBp: number; taxPaise: string }[]) : [];
  const canVerify = approval && p.status === "WAITING" ? await canDecide(tx, ctx, approval) : false;
  return {
    id: p.id,
    studentId: p.studentId,
    student: card ? { name: card.name, classSection: card.classSection, parent: card.fatherName ?? card.primaryGuardian?.name ?? null, phone: card.primaryGuardian?.phone ?? null } : null,
    status: p.status,
    broughtIn: p.broughtIn,
    oldReceiptNo: p.oldReceiptNo,
    isPartial: p.isPartial,
    amount: p.amountPaise,
    discount: p.discountPaise,
    mode: p.mode,
    reference: p.mode === "CHEQUE" ? `Cheque ${p.chequeNo ?? ""} · ${p.chequeBank ?? ""}${p.chequeDate ? `, dated ${formatDate(p.chequeDate)}` : ""}` : p.reference ?? p.gatewayPaymentId ?? null,
    when: formatDateTime(p.paidAt, tz),
    date: p.paymentDate,
    receiptNo: receipt?.number ?? null,
    lines,
    tax: invoice ? {
      number: invoice.number,
      cancelled: invoice.status === "cancelled",
      text: `Taxable value ${formatRupees(invoice.taxablePaise)} · GST ${formatRupees(invoice.taxPaise)}${invLines.length ? ` (${[...new Set(invLines.map((l) => percentWord(l.rateBp)))].join(", ")}, CGST and SGST half each)` : ""} · GSTIN ${invoice.gstin}`,
    } : null,
    online: p.mode === "GATEWAY" || p.source !== "COUNTER",
    collectedBy: p.mode === "GATEWAY" ? "Razorpay, by itself after the bank confirmed" : p.broughtIn ? "Brought in from old software" : collector?.displayName ?? "School office",
    goesTo,
    dayBook: posted
      ? reversal ? `Original on ${formatDate(posted.date)} kept, reversal on ${formatDate(reversal.date)}` : `Entry on ${formatDate(posted.date)}`
      : p.broughtIn ? "Brought in, never in the Day Book" : "Not in the Day Book yet",
    cancel: p.status === "CANCELLED" ? {
      reason: p.cancelReason ? cancelReasonLabel(p.cancelReason) : p.rejectReason ? "Not verified" : "Cancelled",
      note: p.rejectReason ?? p.cancelNote,
      by: canceller?.displayName ?? "School office",
      when: p.cancelledAt ? formatDateTime(p.cancelledAt, tz) : "",
    } : null,
    cancelWaiting: Boolean(cancelApproval && (cancelApproval.status === "WAITING" || cancelApproval.status === "ESCALATED")),
    failure: p.failureReason,
    verify: approval && p.status === "WAITING" ? { approvalId: approval.id, canDecide: canVerify } : null,
    linkDueIds: link?.dueIds ?? [],
    note: p.note,
  };
}
