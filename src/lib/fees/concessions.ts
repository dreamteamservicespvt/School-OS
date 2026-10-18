// Concessions (06 §2 Concessions & Refunds): discounts, scholarships, sibling
// and staff-child concessions, bulk discounts and late-fee waivers. Up to the
// school's limit they apply at once; above it they wait in Approvals and are
// applied only after approval (Done when 7).
import "server-only";

import type { Concession, ConcessionType, StudentFeeDue } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval } from "../approvals";
import { formatRupees } from "../format";
import { assertYearOpen, currentEnrolment } from "../academic/years";
import { MoneyProblem } from "./problem";
import { lockDues, refreshBalances } from "./dues";
import { feeSettings } from "./settings";
import { concessionTypeLabel, percentWord } from "./words";

export type ConcessionInput = {
  studentId: string;
  type: ConcessionType;
  mode: "amount" | "percent";
  amountPaise: bigint;
  percentBp: number;
  feeHeadIds: string[];
  dueIds?: string[];
  periodFrom: Date | null;
  periodTo: Date | null;
  reason: string;
  scholarshipType?: string | null;
  documentFileId?: string | null;
  paymentId?: string | null;
  bulkRuleId?: string | null;
};

/** The open rows a concession covers: chosen rows, or the chosen heads in the period. Oldest first. */
async function coveredDues(tx: Tx, c: Pick<Concession, "studentId" | "academicYearId" | "feeHeadIds" | "dueIds" | "periodFrom" | "periodTo" | "type">) {
  if (c.dueIds.length) {
    return tx.studentFeeDue.findMany({ where: { id: { in: c.dueIds }, studentId: c.studentId, state: "OPEN", balancePaise: { gt: 0 } }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] });
  }
  return tx.studentFeeDue.findMany({
    where: {
      studentId: c.studentId,
      academicYearId: c.academicYearId,
      state: "OPEN",
      balancePaise: { gt: 0 },
      kind: c.type === "LATE_FEE_WAIVER" ? "LATE_FEE" : { in: ["FEE", "CHARGE"] },
      ...(c.feeHeadIds.length ? { feeHeadId: { in: c.feeHeadIds } } : {}),
      ...(c.periodFrom || c.periodTo ? { dueDate: { ...(c.periodFrom ? { gte: c.periodFrom } : {}), ...(c.periodTo ? { lte: c.periodTo } : {}) } } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
}

/** How much a concession takes off each covered row: a percent of each row, or a total spread oldest first. Never more than a row's balance. */
export function spread(c: { mode: string; amountPaise: bigint; percentBp: number }, dues: Pick<StudentFeeDue, "id" | "amountPaise" | "balancePaise">[]) {
  const lines: { dueId: string; amountPaise: bigint }[] = [];
  if (c.mode === "percent") {
    for (const d of dues) {
      const want = (d.amountPaise * BigInt(c.percentBp) + BigInt(5000)) / BigInt(10000);
      const take = want < d.balancePaise ? want : d.balancePaise;
      if (take > BigInt(0)) lines.push({ dueId: d.id, amountPaise: take });
    }
  } else {
    let left = c.amountPaise;
    for (const d of dues) {
      if (left <= BigInt(0)) break;
      const take = left < d.balancePaise ? left : d.balancePaise;
      if (take > BigInt(0)) lines.push({ dueId: d.id, amountPaise: take });
      left -= take;
    }
  }
  return lines;
}

export async function estimateConcession(tx: Tx, c: Pick<Concession, "studentId" | "academicYearId" | "feeHeadIds" | "dueIds" | "periodFrom" | "periodTo" | "type" | "mode" | "amountPaise" | "percentBp">) {
  const dues = await coveredDues(tx, c);
  return spread(c, dues).reduce((s, l) => s + l.amountPaise, BigInt(0));
}

/** Applies an approved concession to the student's rows now. Returns the amount applied. */
export async function applyConcession(tx: Tx, ctx: SchoolContext, concessionId: string) {
  const c = await tx.concession.findFirstOrThrow({ where: { id: concessionId } });
  if (c.status === "APPLIED") return c.appliedPaise;
  const candidates = await coveredDues(tx, c);
  await lockDues(tx, candidates.map((d) => d.id));
  const fresh = await coveredDues(tx, c);
  const lines = spread(c, fresh);
  if (lines.length) {
    await tx.concessionLine.createMany({ data: lines.map((l) => ({ schoolId: ctx.schoolId, concessionId: c.id, dueId: l.dueId, amountPaise: l.amountPaise })) });
    for (const l of lines) await tx.studentFeeDue.update({ where: { id: l.dueId }, data: { concessionPaise: { increment: l.amountPaise } } });
    await refreshBalances(tx, lines.map((l) => l.dueId));
  }
  const applied = lines.reduce((s, l) => s + l.amountPaise, BigInt(0));
  await tx.concession.update({ where: { id: c.id }, data: { status: "APPLIED", appliedPaise: applied } });
  await writeAudit(tx, ctx, { action: "applied", recordType: "Concession", recordId: c.id, after: { applied: formatRupees(applied), rows: lines.length } });
  return applied;
}

/**
 * The fee heads a new concession can reduce for this student: those with
 * something still to pay this year (06 Form fields: Concession), with Tuition
 * chosen at the start when the student has it. With nothing left to pay, every
 * head, so the person sees why nothing can be reduced.
 */
export async function concessionHeadChoices(tx: Tx, studentId: string) {
  const enrolment = await currentEnrolment(tx, studentId);
  const [heads, open] = await Promise.all([
    tx.feeHead.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true } }),
    tx.studentFeeDue.groupBy({ by: ["feeHeadId"], where: { studentId, state: "OPEN", balancePaise: { gt: 0 }, kind: { in: ["FEE", "CHARGE"] }, ...(enrolment ? { academicYearId: enrolment.academicYearId } : {}) } }),
  ]);
  const own = new Set(open.map((o) => o.feeHeadId));
  const list = own.size ? heads.filter((h) => own.has(h.id)) : heads;
  const start = list.find((h) => h.kind === "tuition") ?? list.find((h) => /tuition/i.test(h.name)) ?? list[0] ?? null;
  return { heads: list.map((h) => ({ id: h.id, name: h.name })), startId: start?.id ?? null };
}

function checkInput(input: ConcessionInput) {
  if (input.reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  if (input.mode === "percent") {
    if (input.percentBp <= 0 || input.percentBp > 10000) throw new MoneyProblem("Percent must be more than 0 and at most 100.", "value");
  } else if (input.amountPaise <= BigInt(0)) {
    throw new MoneyProblem("Amount must be more than ₹0.", "value");
  }
  if (input.periodFrom && input.periodTo && input.periodTo < input.periodFrom) throw new MoneyProblem("The period ends before it starts.", "periodTo");
}

/**
 * Records a concession. Up to the school's limit it applies at once;
 * above it, it goes to Approvals (Waiting) and is applied only after approval.
 */
export async function giveConcession(tx: Tx, ctx: SchoolContext, input: ConcessionInput, opts: { forceApproval?: boolean } = {}) {
  checkInput(input);
  // The year of the chosen rows, else the student's class this year (never the enrolment made last).
  const enrolment = await currentEnrolment(tx, input.studentId);
  const student = await tx.student.findFirst({ where: { id: input.studentId }, select: { fullName: true } });
  if (!enrolment || !student) throw new MoneyProblem("This student is not in a class.");
  const rowYear = input.dueIds?.length ? (await tx.studentFeeDue.findFirst({ where: { id: { in: input.dueIds }, studentId: input.studentId }, select: { academicYearId: true } }))?.academicYearId : null;
  const academicYearId = rowYear ?? enrolment.academicYearId;
  await assertYearOpen(tx, academicYearId);
  const settings = await feeSettings(tx, ctx);
  const c = await tx.concession.create({
    data: {
      schoolId: ctx.schoolId,
      studentId: input.studentId,
      academicYearId,
      type: input.type,
      mode: input.mode,
      amountPaise: input.mode === "amount" ? input.amountPaise : BigInt(0),
      percentBp: input.mode === "percent" ? input.percentBp : 0,
      feeHeadIds: input.feeHeadIds,
      dueIds: input.dueIds ?? [],
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      reason: input.reason.trim(),
      scholarshipType: input.scholarshipType ?? null,
      documentFileId: input.documentFileId ?? null,
      paymentId: input.paymentId ?? null,
      bulkRuleId: input.bulkRuleId ?? null,
      requestedById: ctx.userId,
      status: "WAITING",
    },
  });
  const estimate = await estimateConcession(tx, c);
  if (estimate <= BigInt(0)) throw new MoneyProblem("Nothing is left to pay on the chosen fee heads and period, so there is nothing to reduce.", "feeHeadIds");
  await tx.concession.update({ where: { id: c.id }, data: { estimatedPaise: estimate } });
  await writeAudit(tx, ctx, {
    action: "created",
    recordType: "Concession",
    recordId: c.id,
    after: { type: input.type, value: input.mode === "percent" ? percentWord(input.percentBp) : formatRupees(input.amountPaise), estimate: formatRupees(estimate), reason: input.reason },
  });
  if (opts.forceApproval || estimate > settings.concessionLimitPaise) {
    const what = input.type === "LATE_FEE_WAIVER" ? "Late fee waiver" : concessionTypeLabel(input.type);
    const approval = await requestApproval(tx, ctx, {
      type: input.type === "SCHOLARSHIP" ? "scholarship" : "concession",
      recordType: "Concession",
      recordId: c.id,
      summary: `${what} of ${formatRupees(estimate)} for ${student.fullName}`,
      amountPaise: estimate,
      reason: input.reason,
    });
    await tx.concession.update({ where: { id: c.id }, data: { approvalId: approval.id } });
    return { concession: c, applied: BigInt(0), waiting: true, estimate };
  }
  await tx.concession.update({ where: { id: c.id }, data: { status: "APPROVED", decidedById: ctx.userId } });
  const applied = await applyConcession(tx, ctx, c.id);
  return { concession: c, applied, waiting: false, estimate };
}

/** What happens when Approvals decides a concession or scholarship. */
export async function decideConcession(tx: Tx, ctx: SchoolContext, recordId: string, decision: string, note: string | null) {
  const c = await tx.concession.findFirst({ where: { id: recordId } });
  if (!c || c.status !== "WAITING") return;
  if (decision === "approve") {
    await tx.concession.update({ where: { id: c.id }, data: { status: "APPROVED", decidedById: ctx.userId, decisionNote: note } });
    await applyConcession(tx, ctx, c.id);
  } else {
    await tx.concession.update({ where: { id: c.id }, data: { status: "REJECTED", decidedById: ctx.userId, decisionNote: note ?? (decision === "withdraw" ? "Withdrawn" : null) } });
    await writeAudit(tx, ctx, { action: decision === "withdraw" ? "withdrawn" : "rejected", recordType: "Concession", recordId: c.id, after: { note } });
  }
}

/**
 * Takes an applied concession off again (for example given by mistake): its
 * lines come off each row, only from what is still unpaid. The record stays.
 */
export async function revokeConcession(tx: Tx, ctx: SchoolContext, concessionId: string, reason: string) {
  if (reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  const c = await tx.concession.findFirst({ where: { id: concessionId }, include: { lines: true } });
  if (!c) throw new MoneyProblem("This concession was not found.");
  if (c.status === "WAITING") throw new MoneyProblem("This concession is still waiting in Approvals. Withdraw the request there.");
  if (c.status !== "APPLIED") throw new MoneyProblem("Only an applied concession can be taken off.");
  await assertYearOpen(tx, c.academicYearId);
  await lockDues(tx, c.lines.map((l) => l.dueId));
  for (const l of c.lines) {
    await tx.studentFeeDue.update({ where: { id: l.dueId }, data: { concessionPaise: { decrement: l.amountPaise } } });
  }
  await refreshBalances(tx, c.lines.map((l) => l.dueId));
  await tx.concession.update({ where: { id: c.id }, data: { status: "REJECTED", decisionNote: `Taken off: ${reason.trim()}`, archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "taken-off", recordType: "Concession", recordId: c.id, before: { applied: formatRupees(c.appliedPaise) }, after: { reason } });
}

// ---------------------------------------------------------------- bulk discounts

export type BulkRuleInput = { name: string; minInstallments: number; percentBp: number; feeHeadIds: string[]; isActive: boolean };

export async function saveBulkRule(tx: Tx, ctx: SchoolContext, input: BulkRuleInput, id?: string) {
  if (input.name.trim().length < 3) throw new MoneyProblem("Give the rule a name, such as Pay 3 months, get 5% off.", "name");
  if (!Number.isInteger(input.minInstallments) || input.minInstallments < 2 || input.minInstallments > 12) throw new MoneyProblem("Installments paid together must be between 2 and 12.", "minInstallments");
  if (input.percentBp <= 0 || input.percentBp > 5000) throw new MoneyProblem("Discount must be more than 0% and at most 50%.", "percent");
  const data = { name: input.name.trim(), minInstallments: input.minInstallments, percentBp: input.percentBp, feeHeadIds: input.feeHeadIds, isActive: input.isActive };
  const rule = id
    ? await tx.bulkDiscountRule.update({ where: { id }, data })
    : await tx.bulkDiscountRule.create({ data: { ...data, schoolId: ctx.schoolId, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: id ? "changed" : "created", recordType: "Bulk Discount Rule", recordId: rule.id, after: { ...data, percent: percentWord(input.percentBp) } });
  return rule;
}

export async function archiveBulkRule(tx: Tx, ctx: SchoolContext, id: string) {
  await tx.bulkDiscountRule.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Bulk Discount Rule", recordId: id });
}

/**
 * The bulk discount for rows paid together: the best active rule whose
 * condition is met (at least N installments of its heads paid in full).
 */
export async function bulkDiscountFor(tx: Tx, dues: Pick<StudentFeeDue, "id" | "kind" | "feeHeadId" | "amountPaise" | "balancePaise">[]) {
  const rules = await tx.bulkDiscountRule.findMany({ where: { isActive: true, archivedAt: null } });
  let best: { ruleId: string; name: string; percentBp: number; lines: { dueId: string; amountPaise: bigint }[]; total: bigint } | null = null;
  for (const r of rules) {
    const rows = dues.filter((d) => d.kind === "FEE" && (r.feeHeadIds.length === 0 || r.feeHeadIds.includes(d.feeHeadId)));
    if (rows.length < r.minInstallments) continue;
    const lines = rows.map((d) => ({ dueId: d.id, amountPaise: (d.balancePaise * BigInt(r.percentBp) + BigInt(5000)) / BigInt(10000) })).filter((l) => l.amountPaise > BigInt(0));
    const total = lines.reduce((s, l) => s + l.amountPaise, BigInt(0));
    if (!best || total > best.total) best = { ruleId: r.id, name: r.name, percentBp: r.percentBp, lines, total };
  }
  return best;
}

/** Records concession lines given with a payment (bulk discount or counter discount), already decided. */
export async function recordAppliedLines(
  tx: Tx,
  ctx: SchoolContext,
  input: { studentId: string; academicYearId: string; type: ConcessionType; reason: string; paymentId: string | null; bulkRuleId?: string | null; percentBp?: number; lines: { dueId: string; amountPaise: bigint }[] },
) {
  const total = input.lines.reduce((s, l) => s + l.amountPaise, BigInt(0));
  if (total <= BigInt(0)) return null;
  const c = await tx.concession.create({
    data: {
      schoolId: ctx.schoolId, studentId: input.studentId, academicYearId: input.academicYearId, type: input.type,
      mode: input.percentBp ? "percent" : "amount", amountPaise: input.percentBp ? BigInt(0) : total, percentBp: input.percentBp ?? 0,
      dueIds: input.lines.map((l) => l.dueId), reason: input.reason, status: "APPLIED", estimatedPaise: total, appliedPaise: total,
      paymentId: input.paymentId, bulkRuleId: input.bulkRuleId ?? null, requestedById: ctx.userId, decidedById: ctx.userId,
    },
  });
  await tx.concessionLine.createMany({ data: input.lines.map((l) => ({ schoolId: ctx.schoolId, concessionId: c.id, dueId: l.dueId, amountPaise: l.amountPaise })) });
  for (const l of input.lines) await tx.studentFeeDue.update({ where: { id: l.dueId }, data: { concessionPaise: { increment: l.amountPaise } } });
  await refreshBalances(tx, input.lines.map((l) => l.dueId));
  await writeAudit(tx, ctx, { action: "applied", recordType: "Concession", recordId: c.id, after: { type: input.type, amount: formatRupees(total), reason: input.reason } });
  return c;
}
