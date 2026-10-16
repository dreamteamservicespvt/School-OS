// Fines (13 Fines & Stock Check): late fines worked out on return, lost and
// damaged charges, and what happens to them. A student's fine is added to
// their fees in Fee Management (one place to pay) when Library Settings say
// so; a staff member's is collected at the desk and recorded as income in
// Finance Management, or taken from their next salary (salary.ts). A lost or damaged charge above the set amount waits in
// Approvals and is added only when approved. Fines are never deleted: they
// are paid, waived with a reason, or not approved.
import "server-only";

import type { Book, LibraryFine, LibraryFineReason } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { requestApproval } from "../approvals";
import { addCharge, removeDue } from "../fees/structure";
import { currentYear } from "../academic/years";
import { ensureFinanceDefaults } from "../finance/settings";
import { recordIncome } from "../finance/income";
import { calculateRun } from "../salary/payroll";
import { LibraryProblem } from "./problem";
import { stopFineFromSalary } from "./salary";
import { librarySettings, type LibrarySettings } from "./settings";
import { memberByKey, memberFields, type Member } from "./members";
import { FINE_REASON } from "./words";

export const FEE_HEAD_KEY = "library-fine";
const ZERO = BigInt(0);

/** The default charge for a lost (or damaged) copy: the book's price, plus the fee when the rule says so. */
export function lostDefaultCharge(s: Pick<LibrarySettings, "lostCharge" | "lostExtraPaise">, book: Pick<Book, "pricePaise">, kind: "LOST" | "DAMAGED") {
  const price = book.pricePaise ?? ZERO;
  if (kind === "LOST" && s.lostCharge === "price-plus") return price + s.lostExtraPaise;
  return price;
}

/** The "Library fines" fee head (made the first time a fine goes to fees). */
export async function libraryFeeHead(tx: Tx, ctx: SchoolContext) {
  const found = await tx.feeHead.findFirst({ where: { OR: [{ systemKey: FEE_HEAD_KEY }, { name: { equals: "Library fines", mode: "insensitive" } }] } });
  if (found) {
    if (found.archivedAt || found.systemKey !== FEE_HEAD_KEY) await tx.feeHead.update({ where: { id: found.id }, data: { archivedAt: null, systemKey: FEE_HEAD_KEY } });
    return found;
  }
  return tx.feeHead.create({ data: { schoolId: ctx.schoolId, name: "Library fines", kind: "library", systemKey: FEE_HEAD_KEY, lateFeeApplies: false, sortOrder: 910, createdById: ctx.userId } });
}

/** The income head desk collections go to (made the first time). */
async function libraryIncomeHead(tx: Tx, ctx: SchoolContext) {
  await ensureFinanceDefaults(tx, ctx);
  const found = await tx.accountHead.findFirst({ where: { kind: "INCOME", systemKey: FEE_HEAD_KEY } });
  if (found) return found;
  const byName = await tx.accountHead.findFirst({ where: { kind: "INCOME", name: { equals: "Library fines", mode: "insensitive" }, archivedAt: null } });
  if (byName) return tx.accountHead.update({ where: { id: byName.id }, data: { systemKey: FEE_HEAD_KEY } });
  const codes = new Set((await tx.accountHead.findMany({ select: { code: true } })).map((h) => h.code));
  let code = 4010;
  while (codes.has(String(code)) && code < 4999) code++;
  return tx.accountHead.create({ data: { schoolId: ctx.schoolId, kind: "INCOME", code: String(code), name: "Library fines", groupName: "Other income", systemKey: FEE_HEAD_KEY, createdById: ctx.userId } });
}

const reasonWords = (f: { reason: LibraryFineReason; lateDays: number | null }) => (f.reason === "LATE" ? `Late return${f.lateDays ? ` (${f.lateDays} day${f.lateDays === 1 ? "" : "s"})` : ""}` : `${FINE_REASON[f.reason]} book`);

/** Adds a due fine to the student's fees (Fee Management), when the settings send student fines there. */
async function postToFees(tx: Tx, ctx: SchoolContext, s: LibrarySettings, fine: LibraryFine, title: string, today: Date) {
  if (!fine.studentId || !s.finesToFees || fine.status !== "DUE" || fine.feeDueId) return fine;
  const head = await libraryFeeHead(tx, ctx);
  // The fine belongs to this year's fees when the student is enrolled this year.
  const year = await currentYear(tx, ctx);
  const enrolled = year ? await tx.enrolment.findFirst({ where: { studentId: fine.studentId, academicYearId: year.id, archivedAt: null }, select: { id: true } }) : null;
  const due = await addCharge(tx, ctx, {
    studentId: fine.studentId, feeHeadId: head.id, amountPaise: fine.amountPaise, dueDate: today, ...(enrolled && year ? { academicYearId: year.id } : {}),
    label: `Library: ${reasonWords(fine).toLowerCase()} · ${title}`.slice(0, 120),
    reason: `Library fine ${fine.fineNo}: ${reasonWords(fine)}, “${title}”`,
  });
  return tx.libraryFine.update({ where: { id: fine.id }, data: { feeDueId: due.id } });
}

export type NewFine = { member: Member; reason: LibraryFineReason; issueId: string | null; copyId: string; bookId: string; lateDays: number | null; amountPaise: bigint; note: string | null; book: Pick<Book, "title">; today?: Date };

/**
 * Records a fine or charge. A lost or damaged charge above the set amount goes
 * to Approvals first; everything else is due now (and a student's goes to fees).
 */
export async function createFine(tx: Tx, ctx: SchoolContext, s: LibrarySettings, f: NewFine) {
  if (f.amountPaise <= ZERO) throw new LibraryProblem("The charge must be more than ₹0.", "charge");
  const n = await nextNumber(tx, ctx, "library-fine");
  const needsApproval = f.reason !== "LATE" && f.amountPaise > s.approvalAbovePaise;
  let fine = await tx.libraryFine.create({
    data: {
      schoolId: ctx.schoolId, fineNo: formatNumber("LF-", n, 4), issueId: f.issueId, copyId: f.copyId, bookId: f.bookId, ...memberFields(f.member),
      reason: f.reason, lateDays: f.lateDays, amountPaise: f.amountPaise, status: needsApproval ? "WAITING" : "DUE", note: f.note, createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Library Fine", recordId: fine.id, after: { fineNo: fine.fineNo, member: f.member.name, reason: FINE_REASON[f.reason], amount: formatRupees(f.amountPaise), book: f.book.title, status: fine.status } });
  if (needsApproval) {
    const approval = await requestApproval(tx, ctx, {
      type: "library-charge", recordType: "Library Fine", recordId: fine.id,
      summary: `${formatRupees(f.amountPaise)} ${FINE_REASON[f.reason].toLowerCase()} book charge for ${f.member.name} (${f.member.kind === "STUDENT" ? f.member.short : "staff"}): “${f.book.title}”`,
      amountPaise: f.amountPaise, reason: f.note, aboutUserIds: [f.member.userLoginId],
    });
    fine = await tx.libraryFine.update({ where: { id: fine.id }, data: { approvalId: approval.id } });
    return fine;
  }
  return postToFees(tx, ctx, s, fine, f.book.title, f.today ?? todayUtc());
}

const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

/* ---------- Lost or damaged ---------- */

export type LostInput = { copyId: string; kind: "LOST" | "DAMAGED"; chargePaise: bigint | null; note: string | null; today: Date };

/**
 * Marks a copy lost or damaged (13 Lost or damaged). If a member has it, the
 * issue closes and the charge is theirs; above the set amount it waits for
 * approval. A copy nobody has changes status only.
 */
export async function markLostOrDamaged(tx: Tx, ctx: SchoolContext, input: LostInput) {
  const s = await librarySettings(tx, ctx);
  const copy = await tx.bookCopy.findFirst({ where: { id: input.copyId }, include: { book: true } });
  if (!copy) throw new LibraryProblem("This copy was not found.", "copy");
  if (copy.status === "WITHDRAWN") throw new LibraryProblem(`Copy ${copy.accessionNo} is withdrawn.`, "copy");
  if (copy.status === input.kind) throw new LibraryProblem(`Copy ${copy.accessionNo} is already marked ${input.kind === "LOST" ? "lost" : "damaged"}.`, "copy");
  if (copy.status === "RESERVED") throw new LibraryProblem(`Copy ${copy.accessionNo} is kept for a member's reservation. Cancel the reservation first.`, "copy");
  const issue = await tx.bookIssue.findFirst({ where: { copyId: copy.id, returnedAt: null } });
  const charge = input.chargePaise ?? lostDefaultCharge(s, copy.book, input.kind);
  if (issue && charge < ZERO) throw new LibraryProblem("The charge cannot be below ₹0.", "charge");
  await tx.bookCopy.update({ where: { id: copy.id }, data: { status: input.kind, statusNote: input.note?.trim() || null, statusAt: new Date() } });
  let member: Member | null = null;
  let fine: LibraryFine | null = null;
  if (issue) {
    member = await memberByKey(tx, ctx, s, issue.studentId ? `S:${issue.studentId}` : `T:${issue.staffId}`);
    await tx.bookIssue.update({ where: { id: issue.id }, data: { returnedOn: input.today, returnedAt: new Date(), returnedById: ctx.userId, outcome: input.kind } });
    if (member && charge > ZERO) {
      fine = await createFine(tx, ctx, s, { member, reason: input.kind, issueId: issue.id, copyId: copy.id, bookId: copy.bookId, lateDays: null, amountPaise: charge, note: input.note?.trim() || null, book: copy.book, today: input.today });
    }
  }
  await writeAudit(tx, ctx, {
    action: input.kind === "LOST" ? "marked-lost" : "marked-damaged", recordType: "Book Copy", recordId: copy.id,
    before: { status: copy.status }, after: { status: input.kind, accession: copy.accessionNo, book: copy.book.title, member: member?.name ?? null, charge: fine ? formatRupees(charge) : null, note: input.note },
  });
  return { copy, issue, member, fine, charge };
}

/* ---------- Paying, waiving, approving ---------- */

/**
 * Student fines added to fees are paid in Fee Management: a fine is Paid when
 * its fee row has nothing left to pay, and Waived when the fee row was
 * removed there. Run before fines are shown or counted.
 */
export async function syncFeeFines(tx: Tx, ctx: SchoolContext) {
  void ctx; // The school is the transaction's own (row-level security).
  const open = await tx.libraryFine.findMany({ where: { status: "DUE", feeDueId: { not: null } }, select: { id: true, feeDueId: true, fineNo: true } });
  if (!open.length) return 0;
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: open.map((f) => f.feeDueId!) } }, select: { id: true, balancePaise: true, state: true, removedReason: true } });
  let changed = 0;
  for (const f of open) {
    const d = dues.find((x) => x.id === f.feeDueId);
    if (!d) continue;
    if (d.state === "REMOVED") {
      await tx.libraryFine.update({ where: { id: f.id }, data: { status: "WAIVED", waivedAt: new Date(), waiveReason: `Removed from fees: ${d.removedReason ?? "no reason given"}` } });
      changed++;
    } else if (d.balancePaise <= ZERO) {
      await tx.libraryFine.update({ where: { id: f.id }, data: { status: "PAID", paidHow: "fees", paidAt: new Date() } });
      changed++;
    }
  }
  return changed;
}

export async function waiveFine(tx: Tx, ctx: SchoolContext, fineId: string, reason: string) {
  if (reason.trim().length < 5) throw new LibraryProblem("Give a reason of at least 5 characters.", "reason");
  const f = await tx.libraryFine.findFirst({ where: { id: fineId } });
  if (!f) throw new LibraryProblem("This fine was not found.");
  if (f.status === "WAITING") throw new LibraryProblem("This charge is waiting in Approvals. The approver decides it there.");
  if (f.status !== "DUE") throw new LibraryProblem(`This fine is already ${f.status === "PAID" ? "paid" : f.status === "WAIVED" ? "waived" : "closed"}.`);
  // On its way to salary: taken off the salary first (refused once that salary is sent for approval).
  if (f.salaryAt) await stopFineFromSalary(tx, ctx, f.id, `Waived: ${reason.trim()}`, (runId) => calculateRun(tx, ctx, runId, todayUtc()));
  if (f.feeDueId) {
    const d = await tx.studentFeeDue.findFirst({ where: { id: f.feeDueId } });
    if (d && d.state === "OPEN") {
      if (d.paidPaise > ZERO) throw new LibraryProblem(`${formatRupees(d.paidPaise)} of this fine is already paid in fees, so it cannot be waived here. Ask the accountant to adjust the fee row.`);
      await removeDue(tx, ctx, d.id, `Library fine ${f.fineNo} waived: ${reason.trim()}`);
    }
  }
  await tx.libraryFine.update({ where: { id: f.id }, data: { status: "WAIVED", waivedAt: new Date(), waivedById: ctx.userId, waiveReason: reason.trim() } });
  await writeAudit(tx, ctx, { action: "waived", recordType: "Library Fine", recordId: f.id, before: { status: f.status, amount: formatRupees(f.amountPaise) }, after: { status: "WAIVED", reason: reason.trim() } });
}

export type CollectInput = { mode: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE"; reference: string | null; today: Date };

/** Collects a fine at the desk (staff, or students when fines do not go to fees): recorded as income with a receipt. */
export async function collectAtDesk(tx: Tx, ctx: SchoolContext, fineId: string, input: CollectInput) {
  const f = await tx.libraryFine.findFirst({ where: { id: fineId } });
  if (!f) throw new LibraryProblem("This fine was not found.");
  if (f.status !== "DUE") throw new LibraryProblem(f.status === "WAITING" ? "This charge is waiting for approval." : "This fine is not due.");
  if (f.feeDueId) throw new LibraryProblem("This fine is in the student's fees. It is paid in Fee Management, with the other fees.");
  if (f.salaryAt) throw new LibraryProblem("This fine is going to be taken from salary. Choose “Collect here instead” first, so it is not taken twice.");
  const s = await librarySettings(tx, ctx);
  const member = await memberByKey(tx, ctx, s, f.studentId ? `S:${f.studentId}` : `T:${f.staffId}`);
  const book = await tx.book.findFirst({ where: { id: f.bookId }, select: { title: true } });
  const head = await libraryIncomeHead(tx, ctx);
  const income = await recordIncome(tx, ctx, {
    date: input.today, accountHeadId: head.id, amountPaise: f.amountPaise, receivedFrom: member?.name ?? "Library member", vendorId: null,
    mode: input.mode, reference: input.reference?.trim() || null, accountId: null, note: `Library fine ${f.fineNo}: ${reasonWords(f)}, “${book?.title ?? ""}”`,
  }, true);
  const receiptNo = "receiptNo" in income ? (income.receiptNo as string | null) : null;
  await tx.libraryFine.update({ where: { id: f.id }, data: { status: "PAID", paidHow: "desk", paidAt: new Date(), incomeId: income.id, receiptNo } });
  await writeAudit(tx, ctx, { action: "collected", recordType: "Library Fine", recordId: f.id, before: { status: "DUE" }, after: { status: "PAID", amount: formatRupees(f.amountPaise), mode: input.mode, receiptNo } });
  return { receiptNo, amountPaise: f.amountPaise, member };
}

/**
 * After the approver decides a large lost or damaged charge (Approvals):
 * approved, it is due (and added to the student's fees); not approved or sent
 * back, nothing is charged and the librarian can correct the amount.
 */
export async function decideCharge(tx: Tx, ctx: SchoolContext, fineId: string, decision: "approve" | "reject" | "ask-change" | "withdraw", note: string | null) {
  const f = await tx.libraryFine.findFirst({ where: { id: fineId } });
  if (!f || f.status !== "WAITING") return;
  if (decision === "approve") {
    const s = await librarySettings(tx, ctx);
    const book = await tx.book.findFirst({ where: { id: f.bookId }, select: { title: true } });
    const due = await tx.libraryFine.update({ where: { id: f.id }, data: { status: "DUE" } });
    await postToFees(tx, ctx, s, due, book?.title ?? "", todayUtc());
  } else {
    await tx.libraryFine.update({ where: { id: f.id }, data: { status: "NOT_APPROVED", note: [f.note, decision === "ask-change" ? `Sent back: ${note ?? ""}` : decision === "withdraw" ? "Withdrawn" : `Not approved: ${note ?? ""}`].filter(Boolean).join(" · ") } });
  }
  await writeAudit(tx, ctx, { action: `charge-${decision}`, recordType: "Library Fine", recordId: f.id, before: { status: "WAITING" }, after: { decision, note } });
}

/** The librarian corrects a charge that was not approved (or withdraws one waiting): a new charge with the right amount. */
export async function correctCharge(tx: Tx, ctx: SchoolContext, fineId: string, amountPaise: bigint, note: string) {
  if (note.trim().length < 5) throw new LibraryProblem("Say why the amount changed (at least 5 characters).", "note");
  const f = await tx.libraryFine.findFirst({ where: { id: fineId } });
  if (!f || f.reason === "LATE") throw new LibraryProblem("This charge was not found.");
  if (f.status !== "NOT_APPROVED") throw new LibraryProblem("Only a charge that was not approved can be corrected here.");
  const s = await librarySettings(tx, ctx);
  const member = await memberByKey(tx, ctx, s, f.studentId ? `S:${f.studentId}` : `T:${f.staffId}`);
  if (!member) throw new LibraryProblem("The member was not found.");
  const book = await tx.book.findFirstOrThrow({ where: { id: f.bookId } });
  await tx.libraryFine.update({ where: { id: f.id }, data: { status: "WAIVED", waivedAt: new Date(), waivedById: ctx.userId, waiveReason: `Corrected: ${note.trim()}` } });
  return createFine(tx, ctx, s, { member, reason: f.reason, issueId: f.issueId, copyId: f.copyId, bookId: f.bookId, lateDays: null, amountPaise, note: note.trim(), book });
}

/** Words for where a fine is paid, as the fines list shows them. */
export function fineWhere(f: Pick<LibraryFine, "status" | "feeDueId" | "staffId" | "paidHow" | "receiptNo" | "paidAt" | "salaryAt">, tz: string) {
  if (f.status === "PAID") return f.paidHow === "fees" ? "Paid with fees" : f.paidHow === "salary" ? `Taken from salary${f.paidAt ? ` · ${formatDate(f.paidAt, tz)}` : ""}` : `Paid at the desk${f.receiptNo ? ` · ${f.receiptNo}` : ""}${f.paidAt ? ` · ${formatDate(f.paidAt, tz)}` : ""}`;
  if (f.status === "DUE") return f.feeDueId ? "Added to fees" : f.salaryAt ? "From the next salary" : f.staffId ? "Collect here or from salary" : "Collect here";
  return "";
}
