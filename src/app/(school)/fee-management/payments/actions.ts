"use server";

import { decide } from "@/lib/approvals";
import { formatRupees } from "@/lib/format";
import { cancelPayment } from "@/lib/fees/cancel";
import { sendPaymentLink } from "@/lib/fees/online";
import { MoneyProblem } from "@/lib/fees/problem";
import { CANCEL_REASONS } from "@/lib/fees/words";
import { id, optionalText, rupeesOf, str, text } from "@/lib/fees/act";
import { feeAction } from "../_lib/action";

/** Cancel with a reason: never deleted. Reopens the dues and reverses the Day Book entry today. */
export async function cancelPaymentAction(_prev: unknown, fd: FormData) {
  return feeAction("archive", fd, async (tx, ctx) => {
    const paymentId = id(fd, "paymentId", "payment");
    const reason = str(fd, "reason");
    if (!CANCEL_REASONS.includes(reason as (typeof CANCEL_REASONS)[number])) throw new MoneyProblem("Choose why it is cancelled.", "reason");
    const p = await tx.payment.findFirst({ where: { id: paymentId } });
    const receipt = await tx.receipt.findUnique({ where: { paymentId } });
    const r = await cancelPayment(tx, ctx, paymentId, { reason, note: optionalText(fd, "note", "Note", 300), bounceChargePaise: reason === "Cheque bounced" ? rupeesOf(fd, "bounceCharge", "Bounce charge") : null });
    return { ...r, no: receipt?.number ?? "", amount: p ? formatRupees(p.amountPaise) : "" };
  }, (r) => r.waiting
    ? { message: `Cancelling ${r.no} is sent for approval. It stays posted until it is decided.`, tone: "info", link: { href: "/approvals", label: "Open Approvals" } }
    : `Receipt ${r.no} cancelled. ${r.amount} is back in the student’s dues and the Day Book has a reversal today.`, { staffOnly: "cancel payments" });
}

/** Approve a payment waiting for verification: it posts and the receipt is made. */
export async function verifyPayment(_prev: unknown, fd: FormData) {
  return feeAction("approve", fd, async (tx, ctx) => {
    const paymentId = id(fd, "paymentId", "payment");
    const p = await tx.payment.findFirst({ where: { id: paymentId } });
    if (!p?.verifyApprovalId || p.status !== "WAITING") throw new MoneyProblem("This payment is not waiting for verification.");
    await decide(tx, ctx, p.verifyApprovalId, "approve", null);
    const receipt = await tx.receipt.findUnique({ where: { paymentId } });
    return { no: receipt?.number ?? "", amount: formatRupees(p.amountPaise) };
  }, (r) => `${r.no} posted. ${r.amount} is in today’s Day Book and the receipt is sent.`, { staffOnly: "verify payments" });
}

/** Reject a payment waiting for verification: nothing is posted, the dues stay open. */
export async function rejectPayment(_prev: unknown, fd: FormData) {
  return feeAction("approve", fd, async (tx, ctx) => {
    const paymentId = id(fd, "paymentId", "payment");
    const why = text(fd, "why", "Why it is rejected", { min: 5, max: 300 });
    const p = await tx.payment.findFirst({ where: { id: paymentId } });
    if (!p?.verifyApprovalId || p.status !== "WAITING") throw new MoneyProblem("This payment is not waiting for verification.");
    await decide(tx, ctx, p.verifyApprovalId, "reject", why);
    return { amount: formatRupees(p.amountPaise) };
  }, (r) => ({ message: `${r.amount} rejected. The dues stay open.`, tone: "info" }), { staffOnly: "verify payments" });
}

/** A failed online payment: send the parent a new link for what is still due. */
export async function newLinkForFailed(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx) => {
    const paymentId = id(fd, "paymentId", "payment");
    const p = await tx.payment.findFirst({ where: { id: paymentId } });
    if (!p) throw new MoneyProblem("This payment was not found.");
    const link = p.paymentLinkId ? await tx.paymentLink.findFirst({ where: { id: p.paymentLinkId } }) : null;
    const r = await sendPaymentLink(tx, ctx, { studentId: p.studentId, dueIds: link?.dueIds ?? [], channel: "whatsapp" });
    return { amount: formatRupees(r.amount), to: r.card.fatherName ?? r.card.primaryGuardian?.name ?? "the parent" };
  }, (r) => `New payment link sent to ${r.to}. ${r.amount} · WhatsApp. Valid 7 days.`, { staffOnly: "send payment links" });
}

/** A stuck online attempt (not confirmed in 30 minutes): send a new link for the same rows. */
export async function newLinkForStuck(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx) => {
    const linkId = id(fd, "linkId", "payment link");
    const link = await tx.paymentLink.findFirst({ where: { id: linkId } });
    if (!link) throw new MoneyProblem("This payment link was not found.");
    const r = await sendPaymentLink(tx, ctx, { studentId: link.studentId, dueIds: link.dueIds, channel: "whatsapp" });
    return { amount: formatRupees(r.amount), to: r.card.fatherName ?? r.card.primaryGuardian?.name ?? "the parent" };
  }, (r) => `New payment link sent to ${r.to}. ${r.amount} · WhatsApp. Valid 7 days.`, { staffOnly: "send payment links" });
}
