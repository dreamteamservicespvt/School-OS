// Collect Fee and A1 "Fee paid" (06 §2, §4): one step posts the payment,
// makes the receipt with the next number, updates the student's dues and
// balance, posts the Day Book entry (one per bank account the fee heads go
// to), makes the tax invoice for taxable heads and messages the parent.
//
// The same posting is used for counter payments, payments approved after
// verification, and online payments confirmed by the gateway.
import "server-only";

import type { Payment, PaymentMode, PaymentSource, StudentFeeDue } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { nextNumber, formatNumber } from "../sequences";
import { requestApproval } from "../approvals";
import { notify } from "../notifications";
import { formatDate, formatRupees, formatTime } from "../format";
import { addDays, todayIn } from "../staff/dates";
import { postToDayBook } from "../finance/daybook";
import { accountForMode, cashAccount, mainBankAccount } from "../finance/settings";
import { financialYearOf, lastClosedDay } from "../finance/years";
import { MoneyProblem, MoneyWarning } from "./problem";
import { advanceHeld, DUE_WINDOW_DAYS, lockDues, openDues, refreshBalances, studentCard } from "./dues";
import { counterAllowed, featureOn, feeSettings, type FeeSettings } from "./settings";
import { bulkDiscountFor, recordAppliedLines, spread } from "./concessions";
import { modeLabel, NEEDS_REFERENCE } from "./words";
import { placeOfSupply, taxLines } from "./tax";
import { sendFeePaid } from "./notify-parents";

export type CollectInput = {
  studentId: string;
  dueIds: string[];
  amountPaise: bigint;
  mode: PaymentMode;
  reference: string | null;
  chequeNo: string | null;
  chequeBank: string | null;
  chequeDate: Date | null;
  /** When it was paid; null = now. */
  paidAt: Date | null;
  note: string | null;
  discountPaise: bigint;
  discountReason: string | null;
  waiveDueIds: string[];
  waiveReason: string | null;
  /** The person saw the duplicate warning and confirmed it is a second payment. */
  confirmDuplicate: boolean;
};

export type Collector = { roleKeys: string[] };

const ZERO = BigInt(0);
const sum = <T>(list: T[], f: (x: T) => bigint) => list.reduce((s, x) => s + f(x), ZERO);

/** Allocates an amount over rows in order, oldest first. Returns the lines and what is left over. */
export function allocate(amount: bigint, rows: Pick<StudentFeeDue, "id" | "balancePaise">[]) {
  const lines: { dueId: string; amountPaise: bigint }[] = [];
  let left = amount;
  for (const r of rows) {
    if (left <= ZERO) break;
    if (r.balancePaise <= ZERO) continue;
    const take = left < r.balancePaise ? left : r.balancePaise;
    lines.push({ dueId: r.id, amountPaise: take });
    left -= take;
  }
  return { lines, extra: left };
}

function checkMode(input: Pick<CollectInput, "mode" | "reference" | "chequeNo" | "chequeBank" | "chequeDate">, counter: boolean) {
  if (counter && input.mode === "GATEWAY") throw new MoneyProblem("Gateway payments come only from the gateway. Send a payment link instead.", "mode");
  if (NEEDS_REFERENCE.includes(input.mode) && !input.reference) throw new MoneyProblem(`Enter the transaction or UTR number for ${modeLabel(input.mode)}.`, "reference");
  if (input.reference && input.reference.length > 60) throw new MoneyProblem("Reference can be at most 60 characters.", "reference");
  if (input.mode === "CHEQUE") {
    if (!input.chequeNo || !/^\d{6}$/.test(input.chequeNo)) throw new MoneyProblem("Cheque number is 6 digits.", "chequeNo");
    if (!input.chequeBank) throw new MoneyProblem("Enter the bank of the cheque.", "chequeBank");
    if (!input.chequeDate) throw new MoneyProblem("Enter the cheque date.", "chequeDate");
  }
}

/**
 * Collects a payment at the counter. Throws a plain-words problem when a
 * rule stops it (more than owed, duplicate, discount above the limit, books
 * closed). Returns the payment, and its receipt number when posted.
 */
export async function collectPayment(tx: Tx, ctx: SchoolContext, who: Collector, input: CollectInput) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true, name: true } });
  const tz = school.timeZone;
  const settings = await feeSettings(tx, ctx);
  const now = new Date();
  const paidAt = input.paidAt ?? now;
  const today = todayIn(tz, now);
  const paymentDate = todayIn(tz, paidAt);

  if (paidAt.getTime() > now.getTime() + 5 * 60 * 1000) throw new MoneyProblem("Payment date cannot be in the future.", "paidAt");
  if (paymentDate.getTime() !== today.getTime() && !counterAllowed(settings, who.roleKeys, "change-payment-date")) {
    throw new MoneyProblem("Changing the payment date needs the \"change payment date\" permission. Ask the accountant.", "paidAt");
  }
  const closed = await lastClosedDay(tx, ctx);
  if (closed && paymentDate <= closed) throw new MoneyProblem(`Payment date cannot be before ${formatDate(addDays(closed, 1))} (books closed).`, "paidAt");
  checkMode(input, true);
  if (input.amountPaise <= ZERO) throw new MoneyProblem("Amount must be more than ₹0.", "amount");

  const card = await studentCard(tx, ctx, input.studentId);
  if (!card) throw new MoneyProblem("This student was not found.");

  const before = await openDues(tx, input.studentId);
  await lockDues(tx, before.map((d) => d.id));
  let open = await openDues(tx, input.studentId);
  const missing = input.dueIds.filter((id) => !open.some((d) => d.id === id));
  if (missing.length) throw new MoneyProblem("One of the chosen rows was paid or changed a moment ago. Check the dues and try again.");
  if (!input.dueIds.length && open.length) throw new MoneyProblem("Tick at least one row to pay.", "dueIds");

  // Waivers and discounts given at the counter.
  const waived = open.filter((d) => input.waiveDueIds.includes(d.id));
  if (waived.some((d) => d.kind !== "LATE_FEE")) throw new MoneyProblem("Only late fee rows can be waived here. Use a concession for other rows.");
  if (waived.length && !counterAllowed(settings, who.roleKeys, "waive-late-fee")) throw new MoneyProblem("Waiving a late fee needs the \"waive late fee\" permission.", "waive");
  if (waived.length && (!input.waiveReason || input.waiveReason.length < 5)) throw new MoneyProblem("Give a reason of at least 5 characters for the waiver.", "waiveReason");
  if (input.discountPaise > ZERO && !counterAllowed(settings, who.roleKeys, "give-discount")) throw new MoneyProblem("Giving a discount needs the \"give discount\" permission.", "discount");
  if (input.discountPaise > ZERO && (!input.discountReason || input.discountReason.length < 5)) throw new MoneyProblem("Give a reason of at least 5 characters for the discount.", "discountReason");
  const waiveTotal = sum(waived, (d) => d.balancePaise);
  if (waiveTotal + input.discountPaise > settings.concessionLimitPaise) {
    throw new MoneyProblem(
      `Discounts above ${formatRupees(settings.concessionLimitPaise)} need the principal's approval. Ask for approval, then collect once it is approved, or collect without the discount.`,
      "discount",
    ).withCode("needs-approval");
  }
  const academicYearId = open.find((d) => input.dueIds.includes(d.id))?.academicYearId ?? card.academicYearId;
  const givenIds: string[] = [];
  if (waived.length && academicYearId) {
    const c1 = await recordAppliedLines(tx, ctx, { studentId: input.studentId, academicYearId, type: "LATE_FEE_WAIVER", reason: input.waiveReason!, paymentId: null, lines: waived.map((d) => ({ dueId: d.id, amountPaise: d.balancePaise })) });
    if (c1) givenIds.push(c1.id);
  }
  open = await openDues(tx, input.studentId);
  let ticked = open.filter((d) => input.dueIds.includes(d.id));
  if (input.discountPaise > ZERO && academicYearId) {
    const tickedTotal = sum(ticked, (d) => d.balancePaise);
    if (input.discountPaise > tickedTotal) throw new MoneyProblem(`Discount cannot be more than the ticked rows (${formatRupees(tickedTotal)}).`, "discount");
    const lines = spread({ mode: "amount", amountPaise: input.discountPaise, percentBp: 0 }, ticked);
    const c2 = await recordAppliedLines(tx, ctx, { studentId: input.studentId, academicYearId, type: "DISCOUNT", reason: input.discountReason!, paymentId: null, lines });
    if (c2) givenIds.push(c2.id);
    open = await openDues(tx, input.studentId);
    ticked = open.filter((d) => input.dueIds.includes(d.id));
  }
  // Bulk discount: applied when the ticked rows meet a rule's condition and are paid in full.
  let bulkPaise = ZERO;
  const bulk = await bulkDiscountFor(tx, ticked);
  if (bulk && academicYearId && input.amountPaise >= sum(ticked, (d) => d.balancePaise) - bulk.total) {
    const c3 = await recordAppliedLines(tx, ctx, { studentId: input.studentId, academicYearId, type: "BULK_DISCOUNT", reason: bulk.name, paymentId: null, bulkRuleId: bulk.ruleId, percentBp: bulk.percentBp, lines: bulk.lines });
    if (c3) givenIds.push(c3.id);
    bulkPaise = bulk.total;
    open = await openDues(tx, input.studentId);
    ticked = open.filter((d) => input.dueIds.includes(d.id));
  }

  // Ticked rows first (oldest first), then any other open rows, then advance.
  const rest = open.filter((d) => !input.dueIds.includes(d.id));
  const tickedTotal = sum(ticked, (d) => d.balancePaise);
  const { lines, extra } = allocate(input.amountPaise, [...ticked, ...rest]);
  let advance = ZERO;
  if (extra > ZERO) {
    if (!(await featureOn(tx, ctx, "fee-advance"))) {
      const balance = sum(open, (d) => d.balancePaise);
      throw new MoneyProblem(`Balance is ${formatRupees(balance)}. Advance payments are off in Fee Settings.`, "amount");
    }
    advance = extra;
  }
  if (!lines.length && advance === ZERO) throw new MoneyProblem("Nothing is left to pay on the ticked rows.", "dueIds");

  // Same payment entered twice?
  if (!input.confirmDuplicate) await checkDuplicate(tx, ctx, { studentId: input.studentId, studentName: card.name, amountPaise: input.amountPaise, mode: input.mode, reference: input.reference, tz });

  const verify = (await featureOn(tx, ctx, "fee-verification")) && settings.verifyModes.includes(input.mode);
  const isPartial = input.amountPaise < tickedTotal || lines.some((l) => open.find((d) => d.id === l.dueId)!.balancePaise > l.amountPaise);
  const payment = await tx.payment.create({
    data: {
      schoolId: ctx.schoolId,
      studentId: input.studentId,
      academicYearId: academicYearId ?? null,
      amountPaise: input.amountPaise,
      lateFeePaise: sum(lines.filter((l) => open.find((d) => d.id === l.dueId)!.kind === "LATE_FEE"), (l) => l.amountPaise),
      advancePaise: advance,
      discountPaise: input.discountPaise + waiveTotal + bulkPaise,
      mode: input.mode,
      reference: input.reference,
      chequeNo: input.mode === "CHEQUE" ? input.chequeNo : null,
      chequeBank: input.mode === "CHEQUE" ? input.chequeBank : null,
      chequeDate: input.mode === "CHEQUE" ? input.chequeDate : null,
      paidAt,
      paymentDate,
      status: verify ? "WAITING" : "POSTED",
      source: "COUNTER",
      isPartial,
      note: input.note,
      collectedById: ctx.userId,
    },
  });
  if (givenIds.length) await tx.concession.updateMany({ where: { id: { in: givenIds } }, data: { paymentId: payment.id } });
  await createAllocations(tx, ctx, payment.id, lines, open);

  if (verify) {
    const approval = await requestApproval(tx, ctx, {
      type: "payment-verification",
      recordType: "Payment",
      recordId: payment.id,
      summary: `${formatRupees(input.amountPaise)} ${modeLabel(input.mode).toLowerCase()} from ${card.name} (${card.classSection})`,
      amountPaise: input.amountPaise,
      reason: input.reference ?? input.chequeNo ?? null,
    });
    await tx.payment.update({ where: { id: payment.id }, data: { verifyApprovalId: approval.id } });
    await writeAudit(tx, ctx, { action: "collected-waiting", recordType: "Payment", recordId: payment.id, after: paymentAudit(payment) });
    return { payment, receiptNo: null as string | null, waiting: true };
  }
  const posted = await finishPosting(tx, ctx, payment.id, { settings });
  return { payment, receiptNo: posted.receiptNo, waiting: false };
}

async function checkDuplicate(tx: Tx, ctx: SchoolContext, p: { studentId: string; studentName: string; amountPaise: bigint; mode: PaymentMode; reference: string | null; tz: string }) {
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const same = await tx.payment.findFirst({
    where: { studentId: p.studentId, amountPaise: p.amountPaise, mode: p.mode, status: { in: ["POSTED", "WAITING"] }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
  if (same) {
    const other = same.collectedById && same.collectedById !== ctx.userId ? await tx.userLogin.findUnique({ where: { id: same.collectedById }, select: { displayName: true } }) : null;
    const by = same.collectedById === ctx.userId ? "you" : other?.displayName ?? "someone";
    throw new MoneyWarning(`${formatRupees(p.amountPaise)} ${modeLabel(p.mode).toLowerCase()} for ${p.studentName} was collected at ${formatTime(same.paidAt, p.tz)} by ${by}. Collect again?`, "amount");
  }
  if (p.reference) {
    const ref = await tx.payment.findFirst({ where: { reference: p.reference, status: { in: ["POSTED", "WAITING"] } } });
    if (ref) throw new MoneyWarning(`Reference ${p.reference} was already used for a payment on ${formatDate(ref.paymentDate)}. Collect again?`, "reference");
  }
}

async function createAllocations(tx: Tx, ctx: SchoolContext, paymentId: string, lines: { dueId: string; amountPaise: bigint }[], dues: Pick<StudentFeeDue, "id" | "feeHeadId">[]) {
  if (!lines.length) return;
  const splitOn = await featureOn(tx, ctx, "fee-bank-accounts");
  const headIds = [...new Set(lines.map((l) => dues.find((d) => d.id === l.dueId)!.feeHeadId))];
  const heads = await tx.feeHead.findMany({ where: { id: { in: headIds } } });
  await tx.paymentAllocation.createMany({
    data: lines.map((l) => {
      const headId = dues.find((d) => d.id === l.dueId)!.feeHeadId;
      return { schoolId: ctx.schoolId, paymentId, dueId: l.dueId, feeHeadId: headId, amountPaise: l.amountPaise, bankAccountId: splitOn ? heads.find((h) => h.id === headId)?.bankAccountId ?? null : null };
    }),
  });
}

function paymentAudit(p: Payment) {
  return { amount: formatRupees(p.amountPaise), mode: p.mode, reference: p.reference, date: formatDate(p.paymentDate), status: p.status, advance: formatRupees(p.advancePaise) };
}

/** The receipt number for a payment: prefix (with {YEAR} as the financial year) and the next running number. */
export async function receiptNumber(tx: Tx, ctx: SchoolContext, settings: FeeSettings, fyName: string, partial: boolean) {
  const usePartial = settings.partialSeries && partial;
  const prefix = (usePartial ? settings.partialPrefix : settings.receiptPrefix).replaceAll("{YEAR}", fyName);
  const key = `fee-receipt${settings.restartEachYear ? `:${fyName}` : ""}${usePartial ? ":partial" : ""}`;
  for (let tries = 0; tries < 20; tries++) {
    const n = await nextNumber(tx, ctx, key);
    const number = formatNumber(prefix, n, settings.receiptDigits);
    const clash = await tx.receipt.findUnique({ where: { schoolId_number: { schoolId: ctx.schoolId, number } } });
    if (!clash) return number;
  }
  throw new Error("Could not find a free receipt number");
}

/**
 * Posts a payment whose allocations are recorded: applies them to the dues
 * (when money arrived for a row someone already paid, the extra is held as
 * advance), makes the receipt and tax invoice, posts the Day Book, messages
 * the parent. Safe to call twice: a posted payment with a receipt is left alone.
 */
export async function finishPosting(tx: Tx, ctx: SchoolContext, paymentId: string, opts: { settings?: FeeSettings; holdExtraAsAdvance?: boolean } = {}) {
  const settings = opts.settings ?? (await feeSettings(tx, ctx));
  const existing = await tx.receipt.findUnique({ where: { paymentId } });
  if (existing) return { receiptNo: existing.number, created: false };
  let payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: true } });
  if (payment.status === "CANCELLED" || payment.status === "FAILED") throw new MoneyProblem("This payment is cancelled, so it cannot be posted.");

  // Apply the allocations to the rows, checking each row still has that much to pay.
  const allocs = payment.allocations.filter((a) => !a.fromAdvance);
  await lockDues(tx, allocs.map((a) => a.dueId));
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: allocs.map((a) => a.dueId) } } });
  let moved = ZERO;
  for (const a of allocs) {
    const d = dues.find((x) => x.id === a.dueId)!;
    const room = d.state === "OPEN" ? (d.balancePaise > ZERO ? d.balancePaise : ZERO) : ZERO;
    const take = a.amountPaise <= room ? a.amountPaise : room;
    if (take !== a.amountPaise) {
      moved += a.amountPaise - take;
      await tx.paymentAllocation.update({ where: { id: a.id }, data: { amountPaise: take } });
    }
    if (take > ZERO) {
      await tx.studentFeeDue.update({ where: { id: d.id }, data: { paidPaise: { increment: take } } });
      d.balancePaise -= take;
    }
  }
  await refreshBalances(tx, allocs.map((a) => a.dueId));
  if (moved > ZERO) {
    // Money already received cannot be refused: it is held as advance for the student.
    await tx.payment.update({ where: { id: payment.id }, data: { advancePaise: { increment: moved } } });
  }
  payment = await tx.payment.update({ where: { id: payment.id }, data: { status: "POSTED" }, include: { allocations: true } });

  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, gstin: true, timeZone: true } });
  const fy = await financialYearOf(tx, ctx, payment.paymentDate);
  const receiptNo = await receiptNumber(tx, ctx, settings, fy.name, payment.isPartial);
  await tx.receipt.create({ data: { schoolId: ctx.schoolId, paymentId: payment.id, number: receiptNo, date: payment.paymentDate } });

  const posted = payment.allocations.filter((a) => a.amountPaise > ZERO && !a.fromAdvance);
  const heads = await tx.feeHead.findMany({ where: { id: { in: [...new Set(posted.map((a) => a.feeHeadId))] } } });
  const headOf = (id: string) => heads.find((h) => h.id === id)!;

  // Tax invoice for taxable heads.
  const taxable = posted.filter((a) => headOf(a.feeHeadId).taxable && (headOf(a.feeHeadId).gstRateBp ?? 0) > 0);
  if (taxable.length && school.gstin) {
    const lines = taxLines(taxable.map((a) => { const h = headOf(a.feeHeadId); return { feeHeadId: h.id, name: h.name, sacCode: h.sacCode, rateBp: h.gstRateBp ?? 0, amountPaise: a.amountPaise }; }));
    const n = await nextNumber(tx, ctx, `tax-invoice:${fy.name}`);
    const total = sum(lines, (l) => l.amountPaise);
    const tax = sum(lines, (l) => l.taxPaise);
    await tx.taxInvoice.create({
      data: {
        schoolId: ctx.schoolId, paymentId: payment.id, number: formatNumber(`${settings.taxInvoicePrefix}${fy.name}/`, n, 5), date: payment.paymentDate,
        gstin: school.gstin, placeOfSupply: placeOfSupply(school.gstin),
        lines: lines.map((l) => ({ ...l, amountPaise: l.amountPaise.toString(), taxPaise: l.taxPaise.toString() })),
        taxablePaise: total - tax, taxPaise: tax, totalPaise: total,
      },
    });
  }

  if (!payment.broughtIn) await postPaymentToDayBook(tx, ctx, payment, heads);

  // A1: the parent's payment message.
  const card = await studentCard(tx, ctx, payment.studentId);
  if (card && !payment.broughtIn) {
    await sendFeePaid(tx, ctx, { paymentId: payment.id, studentId: payment.studentId, amountPaise: payment.amountPaise, date: payment.paymentDate, receiptNo });
  }
  await writeAudit(tx, ctx, { action: "posted", recordType: "Payment", recordId: payment.id, after: { ...paymentAudit(payment), receipt: receiptNo, student: card?.name ?? null } });
  return { receiptNo, created: true };
}

/**
 * The payment's Day Book entries: one per bank account its fee heads go to
 * (rule 39). Cash lands in Cash in hand; other modes in the head's account.
 */
export async function postPaymentToDayBook(tx: Tx, ctx: SchoolContext, payment: Payment & { allocations: { feeHeadId: string; amountPaise: bigint; bankAccountId: string | null; fromAdvance: boolean; dueId: string }[] }, heads?: { id: string; name: string; kind: string }[]) {
  const main = await mainBankAccount(tx, ctx);
  const cash = payment.mode === "CASH" ? await cashAccount(tx, ctx) : null;
  const posted = payment.allocations.filter((a) => a.amountPaise > ZERO && !a.fromAdvance);
  const headRows = heads ?? (await tx.feeHead.findMany({ where: { id: { in: posted.map((a) => a.feeHeadId) } } }));
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: posted.map((a) => a.dueId) } }, select: { id: true, kind: true } });
  const groups = new Map<string, typeof posted>();
  for (const a of posted) {
    const key = a.bankAccountId ?? main.id;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  if (payment.advancePaise > ZERO && !groups.has(main.id)) groups.set(main.id, []);
  const card = await studentCard(tx, ctx, payment.studentId, payment.academicYearId);
  const otherOnly = posted.length > 0 && posted.every((a) => dues.find((d) => d.id === a.dueId)?.kind !== "FEE");
  const section = payment.isPartial ? "fees-partial" : otherOnly ? "other-fees" : "fees-full";
  for (const [deposit, list] of groups) {
    const amount = sum(list, (a) => a.amountPaise) + (deposit === main.id ? payment.advancePaise : ZERO);
    if (amount <= ZERO) continue;
    const penalty = sum(list.filter((a) => dues.find((d) => d.id === a.dueId)?.kind === "LATE_FEE"), (a) => a.amountPaise);
    const names = [...new Set(list.map((a) => headRows.find((h) => h.id === a.feeHeadId)?.name ?? "Fees"))];
    if (deposit === main.id && payment.advancePaise > ZERO) names.push("Advance");
    await postToDayBook(tx, ctx, {
      date: payment.paymentDate,
      direction: "IN",
      amountPaise: amount,
      penaltyPaise: penalty,
      mode: payment.mode,
      section,
      headName: names.join(", "),
      feeHeadIds: [...new Set(list.map((a) => a.feeHeadId))],
      accountHeadId: (await tx.accountHead.findFirst({ where: { schoolId: ctx.schoolId, systemKey: "fees" } }))?.id ?? null,
      accountId: cash ? cash.id : await accountForMode(tx, ctx, payment.mode, deposit),
      depositAccountId: deposit,
      sourceType: "payment",
      sourceId: payment.id,
      sourceKey: `payment:${payment.id}:${deposit}`,
      studentId: payment.studentId,
      classId: card?.classId ?? null,
      sectionId: card?.sectionId ?? null,
      partyName: card ? `${card.name} (${card.classSection})` : "Student",
      reference: payment.reference ?? payment.chequeNo ?? null,
    });
  }
}

/**
 * Uses advance held for a student on rows that are due now (oldest first).
 * No new money: nothing goes to the Day Book. Returns the amount used.
 */
export async function applyAdvance(tx: Tx, ctx: SchoolContext, studentId: string, today: Date) {
  let held = await advanceHeld(tx, studentId);
  if (held <= ZERO) return ZERO;
  const candidates = (await openDues(tx, studentId)).filter((d) => d.dueDate <= addDays(today, DUE_WINDOW_DAYS));
  if (!candidates.length) return ZERO;
  await lockDues(tx, candidates.map((d) => d.id));
  held = await advanceHeld(tx, studentId);
  const due = (await openDues(tx, studentId)).filter((d) => d.dueDate <= addDays(today, DUE_WINDOW_DAYS));
  // Which payments hold the advance, oldest first.
  const holders = await tx.payment.findMany({ where: { studentId, status: "POSTED", advancePaise: { gt: 0 } }, orderBy: { paidAt: "asc" }, include: { allocations: { where: { fromAdvance: true } } } });
  const refunds = await tx.refund.findMany({ where: { studentId, status: "REFUNDED", advanceUsedPaise: { gt: 0 } } });
  let used = ZERO;
  for (const h of holders) {
    let left = h.advancePaise - sum(h.allocations, (a) => a.amountPaise) - sum(refunds.filter((r) => r.paymentId === h.id), (r) => r.advanceUsedPaise);
    if (left > held - used) left = held - used;
    for (const d of due) {
      if (left <= ZERO) break;
      if (d.balancePaise <= ZERO) continue;
      const take = left < d.balancePaise ? left : d.balancePaise;
      await tx.paymentAllocation.create({ data: { schoolId: ctx.schoolId, paymentId: h.id, dueId: d.id, feeHeadId: d.feeHeadId, amountPaise: take, fromAdvance: true } });
      await tx.studentFeeDue.update({ where: { id: d.id }, data: { paidPaise: { increment: take } } });
      d.balancePaise -= take;
      left -= take;
      used += take;
    }
  }
  await refreshBalances(tx, due.map((d) => d.id));
  if (used > ZERO) await writeAudit(tx, ctx, { action: "advance-used", recordType: "Student Fee Due", recordId: studentId, after: { amount: formatRupees(used) } });
  return used;
}

/** Tells the people who collect fees about an online payment (merged when many arrive). */
export async function notifyOnlinePayment(tx: Tx, ctx: SchoolContext, payment: Pick<Payment, "id" | "amountPaise">, studentName: string, source: PaymentSource) {
  const people = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, roles: { some: { role: { key: { in: ["accountant"] }, isEnabled: true } } } },
    select: { userLoginId: true },
  });
  for (const p of people) {
    await notify(tx, ctx, {
      to: p.userLoginId,
      type: "fee-online",
      text: `Online fee payment: ${formatRupees(payment.amountPaise)} for ${studentName}${source === "PARENT_LINK" ? " from Parent Link" : ""}`,
      link: `/fee-management/payments/${payment.id}`,
      groupKey: "fee-online",
      mergedText: (n) => `${n} online fee payments came in`,
    });
  }
}
