"use server";

import type { ConcessionType, PaymentMode } from "@prisma/client";
import { decide } from "@/lib/approvals";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { formatRupees } from "@/lib/format";
import { canSeeStudent } from "@/lib/fees/access";
import { archiveBulkRule, giveConcession, revokeConcession, saveBulkRule } from "@/lib/fees/concessions";
import { markRefunded, requestRefund } from "@/lib/fees/refunds";
import { MoneyProblem } from "@/lib/fees/problem";
import { CONCESSION_TYPES, REFUND_MODES } from "@/lib/fees/words";
import { dateOf, file, id, ids, needRupees, optionalDateOf, optionalId, optionalText, str, text } from "@/lib/fees/act";
import { feeAction } from "../_lib/action";

const GIVEN = CONCESSION_TYPES.filter((t) => t.value !== "BULK_DISCOUNT").map((t) => t.value) as string[];

/** A concession for one student: applies at once up to the school's limit, else goes to Approvals. */
export async function newConcessionAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const studentId = id(fd, "studentId", "student");
    if (!(await canSeeStudent(tx, viewer, studentId))) throw new MoneyProblem("This student was not found.", "studentId");
    const type = str(fd, "type");
    if (!GIVEN.includes(type)) throw new MoneyProblem("Choose the type of concession.", "type");
    const mode = str(fd, "mode") === "percent" ? "percent" : "amount";
    let percentBp = 0;
    let amountPaise = BigInt(0);
    if (mode === "percent") {
      const v = Number(str(fd, "value"));
      if (!Number.isFinite(v) || v <= 0 || v > 100) throw new MoneyProblem("Percent must be more than 0 and at most 100.", "value");
      percentBp = Math.round(v * 100);
    } else amountPaise = needRupees(fd, "value", "Amount");
    const period = str(fd, "period");
    const from = period === "range" ? optionalDateOf(fd, "periodFrom", "From") : null;
    const to = period === "range" ? optionalDateOf(fd, "periodTo", "To") : null;
    const doc = file(fd, "document");
    const saved = doc ? await saveFile(tx, ctx, { file: doc, purpose: "concession", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 }) : null;
    const r = await giveConcession(tx, ctx, {
      studentId,
      type: type as ConcessionType,
      mode,
      amountPaise,
      percentBp,
      feeHeadIds: ids(fd, "feeHeadId"),
      periodFrom: period === "rest" ? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") : from,
      periodTo: to,
      reason: text(fd, "reason", "Reason", { min: 5, max: 500 }),
      scholarshipType: type === "SCHOLARSHIP" ? optionalText(fd, "scholarshipType", "Scholarship", 80) : null,
      documentFileId: saved?.id ?? null,
    });
    return { waiting: r.waiting, amount: formatRupees(r.waiting ? r.estimate : r.applied) };
  }, (r) => (r.waiting
    ? { message: `Sent for approval: about ${r.amount} is above the limit. It applies once approved.`, tone: "info", link: { href: "/approvals", label: "Open Approvals" } }
    : `Concession of ${r.amount} applied. The dues are lower from now and it shows on the next receipt.`), { staffOnly: "give concessions" });
}

/** Takes an applied concession off again, with a reason. The record stays. */
export async function revokeConcessionAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    await revokeConcession(tx, ctx, id(fd, "concessionId", "concession"), text(fd, "reason", "Reason", { min: 5, max: 300 }));
    return true;
  }, () => "Concession taken off. The rows it covered are due again, and the record stays with your reason.", { staffOnly: "change concessions" });
}

/** Approve or decline a concession or refund from this page (the same decision as in Approvals). */
export async function decideAction(_prev: unknown, fd: FormData) {
  return feeAction("approve", fd, async (tx, ctx) => {
    const kind = str(fd, "kind");
    const recordId = id(fd, "recordId", "request");
    const decision = str(fd, "decision") === "approve" ? "approve" : "reject";
    const rec = kind === "refund" ? await tx.refund.findFirst({ where: { id: recordId } }) : await tx.concession.findFirst({ where: { id: recordId } });
    if (!rec?.approvalId || rec.status !== "WAITING") throw new MoneyProblem("This request is not waiting for a decision.");
    const note = optionalText(fd, "note", "Note", 300);
    if (decision === "reject" && !note) throw new MoneyProblem("Say why it is declined. The person who asked sees it.", "note");
    await decide(tx, ctx, rec.approvalId, decision, note);
    return { decision, kind };
  }, (r) => (r.decision === "approve"
    ? (r.kind === "refund" ? "Refund approved. Mark it refunded once the money goes back." : "Approved. Applied to the student’s dues now.")
    : "Declined. The person who asked sees your reason."), { staffOnly: "decide requests" });
}

/** A refund from one posted payment: never more than paid minus earlier refunds. Always goes to Approvals. */
export async function newRefundAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const paymentId = id(fd, "paymentId", "payment");
    const pay = await tx.payment.findFirst({ where: { id: paymentId }, select: { studentId: true } });
    if (!pay || !(await canSeeStudent(tx, viewer, pay.studentId))) throw new MoneyProblem("Choose the payment to refund.", "paymentId");
    const mode = str(fd, "mode");
    if (!REFUND_MODES.some((m) => m.value === mode)) throw new MoneyProblem("Choose how the money goes back.", "mode");
    const r = await requestRefund(tx, ctx, { paymentId, amountPaise: needRupees(fd, "amount", "Amount"), reason: text(fd, "reason", "Reason", { min: 5, max: 500 }), mode: mode as PaymentMode });
    return formatRupees(r.amountPaise);
  }, (a) => ({ message: `Refund of ${a} sent for approval. Once approved, mark it refunded with the date and reference.`, tone: "info", link: { href: "/approvals", label: "Open Approvals" } }), { staffOnly: "ask for refunds" });
}

/** The money went back: date and reference. Finance gets a money-out entry in the Day Book. */
export async function markRefundedAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    const refundId = id(fd, "refundId", "refund");
    await markRefunded(tx, ctx, refundId, { date: dateOf(fd, "date", "Date paid"), reference: optionalText(fd, "reference", "Reference", 80), accountId: optionalId(fd, "accountId") });
    const r = await tx.refund.findFirstOrThrow({ where: { id: refundId } });
    return formatRupees(r.amountPaise);
  }, (a) => `Refund of ${a} recorded. The Day Book has the money-out entry.`, { staffOnly: "record refunds" });
}

/** A bulk discount rule, such as "pay 3 months, get 5% off", applied by itself at Collect Fee. */
export async function saveRuleAction(_prev: unknown, fd: FormData) {
  const ruleId = optionalId(fd, "ruleId");
  return feeAction(ruleId ? "edit" : "create", fd, async (tx, ctx) => {
    const pct = Number(str(fd, "percent"));
    const r = await saveBulkRule(tx, ctx, {
      name: str(fd, "name"),
      minInstallments: Number(str(fd, "minInstallments")),
      percentBp: Number.isFinite(pct) ? Math.round(pct * 100) : 0,
      feeHeadIds: ids(fd, "feeHeadId"),
      isActive: str(fd, "isActive") === "on",
    }, ruleId ?? undefined);
    return r.name;
  }, (n) => `${n} saved. It applies to payments from now.`, { staffOnly: "change discount rules" });
}

export async function toggleRuleAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    const rule = await tx.bulkDiscountRule.findFirst({ where: { id: id(fd, "ruleId", "rule"), archivedAt: null } });
    if (!rule) throw new MoneyProblem("This rule was not found.");
    const on = str(fd, "on") === "1";
    await saveBulkRule(tx, ctx, { name: rule.name, minInstallments: rule.minInstallments, percentBp: rule.percentBp, feeHeadIds: rule.feeHeadIds, isActive: on }, rule.id);
    return { name: rule.name, on };
  }, (r) => `${r.name}: ${r.on ? "on" : "off"}. Applies to payments from now.`, { staffOnly: "change discount rules" });
}

export async function archiveRuleAction(_prev: unknown, fd: FormData) {
  return feeAction("archive", fd, async (tx, ctx) => {
    const ruleId = id(fd, "ruleId", "rule");
    const rule = await tx.bulkDiscountRule.findFirst({ where: { id: ruleId } });
    await archiveBulkRule(tx, ctx, ruleId);
    return rule?.name ?? "Rule";
  }, (n) => `${n} archived. Discounts already given stay.`, { staffOnly: "change discount rules" });
}
