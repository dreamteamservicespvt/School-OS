// Application fee (02 §2, optional): collected at the counter, or paid
// online through Razorpay (decision D1). A receipt number is given only after
// the payment is confirmed: at the counter by the person who took the money,
// online only after Razorpay's signature or webhook confirms it (A8 rules).
// The same confirmation arriving twice never makes a second receipt.
// Every confirmed payment is posted to the Day Book through Fee Management
// (src/lib/fees/application-fee.ts), and a cancelled one is reversed there,
// so the counter's cash and the books always match.
import "server-only";

import type { Application, ApplicationFeePayment } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { todayIn } from "../staff/dates";
import { assertBooksOpen } from "../finance/years";
import { postApplicationFee, reverseApplicationFee } from "../fees/application-fee";
import { nextNumber, formatNumber } from "../sequences";
import { razorpayCredentials } from "../payments/gateways";
import { createOrder, verifyPaymentSignature, type RazorpayCredentials } from "../payments/razorpay";
import type { GatewayEvent } from "../payments/events";
import { AdmissionProblem } from "./act";
import { applicationScope, requireFull, type Viewer } from "./access";
import { activity, loadApplication, CLOSED_STAGES } from "./applications";

export const COUNTER_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "bank-transfer", label: "Bank transfer" },
] as const;
export const modeLabel = (m: string) => (m === "online" ? "Online (Razorpay)" : COUNTER_MODES.find((x) => x.value === m)?.label ?? m);

/** Why an application fee is cancelled: Fee Management's reasons, in applicant words. "Other" needs a note. */
export const CANCEL_REASONS = ["Wrong applicant", "Wrong amount", "Cheque bounced", "Duplicate", "Other"] as const;

export type FeeStatus = { key: "not-needed" | "paid" | "waiting" | "due"; label: string; paidPaise: bigint; duePaise: bigint };

export function feeStatus(app: Pick<Application, "feeDuePaise">, payments: Pick<ApplicationFeePayment, "status" | "amountPaise" | "cancelledAt">[]): FeeStatus {
  const due = app.feeDuePaise ?? BigInt(0);
  const paid = payments.filter((p) => p.status === "CONFIRMED" && !p.cancelledAt).reduce((a, p) => a + p.amountPaise, BigInt(0));
  if (due <= BigInt(0)) return { key: "not-needed", label: "Not needed", paidPaise: paid, duePaise: due };
  if (paid >= due) return { key: "paid", label: "Yes", paidPaise: paid, duePaise: due };
  if (payments.some((p) => p.status === "PENDING" && !p.cancelledAt)) return { key: "waiting", label: "Waiting for payment confirmation", paidPaise: paid, duePaise: due };
  return { key: "due", label: "No", paidPaise: paid, duePaise: due };
}

async function receiptNo(tx: Tx, ctx: SchoolContext, app: Pick<Application, "academicYearId">) {
  const [school, year] = await Promise.all([
    tx.school.findUnique({ where: { id: ctx.schoolId }, select: { code: true } }),
    tx.academicYear.findUnique({ where: { id: app.academicYearId }, select: { name: true } }),
  ]);
  return formatNumber(`${school?.code ?? "SCH"}/AF/${(year?.name ?? "").slice(0, 4)}/`, await nextNumber(tx, ctx, "admission-fee-receipt"), 5);
}

async function remaining(tx: Tx, app: Application) {
  const payments = await tx.applicationFeePayment.findMany({ where: { applicationId: app.id } });
  const st = feeStatus(app, payments);
  return { st, left: st.duePaise - st.paidPaise };
}

/** Collect the application fee at the counter: confirmed when the money is in hand, with a receipt. */
export async function recordCounterPayment(tx: Tx, ctx: SchoolContext, v: Viewer, applicationId: string, input: { amountPaise: bigint; mode: string; reference: string | null }) {
  requireFull(v, "the application fee");
  const app = await loadApplication(tx, applicationId, v);
  if (CLOSED_STAGES.includes(app.stage) && app.stage !== "ADMITTED") throw new AdmissionProblem("This application is closed, so no fee can be taken.");
  if (!app.feeDuePaise) throw new AdmissionProblem("No application fee is due for this application (Admission Settings).");
  if (!COUNTER_MODES.some((m) => m.value === input.mode)) throw new AdmissionProblem("Choose how the fee was paid.", "mode");
  if (input.mode !== "cash" && (!input.reference || input.reference.length < 4)) throw new AdmissionProblem(`Give the ${input.mode === "cheque" ? "cheque number" : "transaction reference"}, so the payment can be matched later.`, "reference");
  const { left } = await remaining(tx, app);
  if (left <= BigInt(0)) throw new AdmissionProblem("The application fee is already paid.");
  if (input.amountPaise <= BigInt(0)) throw new AdmissionProblem("Amount must be more than ₹0.", "amount");
  if (input.amountPaise > left) throw new AdmissionProblem(`Only ${formatRupees(left)} is due. Take ${formatRupees(left)} or less.`, "amount");
  const receipt = await receiptNo(tx, ctx, app);
  const p = await tx.applicationFeePayment.create({ data: { schoolId: ctx.schoolId, applicationId: app.id, amountPaise: input.amountPaise, mode: input.mode, reference: input.reference, status: "CONFIRMED", receiptNo: receipt, confirmedAt: new Date(), receivedById: ctx.userId } });
  const entry = await postApplicationFee(tx, ctx, p);
  await activity(tx, ctx, app.id, "fee", `Application fee ${formatRupees(input.amountPaise)} received (${modeLabel(input.mode)}). Receipt ${receipt}. In the Day Book.`);
  await writeAudit(tx, ctx, { action: "fee-received", recordType: "Application", recordId: app.id, after: { paymentId: p.id, amount: formatRupees(input.amountPaise), mode: input.mode, reference: input.reference, receipt, dayBookEntryId: entry?.id ?? null } });
  return p;
}

/**
 * Cancel a payment with a reason, as a fee payment is cancelled (rule 6):
 * never deleted, the receipt number stays on record marked cancelled, and
 * the Day Book gets a reversal on today's date. Principal or School Admin
 * only; DREAM TEAM support access never cancels a payment.
 */
export async function cancelPayment(tx: Tx, ctx: SchoolContext, v: Viewer, paymentId: string, input: { reason: string; note: string | null }) {
  requireFull(v, "the application fee");
  if (ctx.support) throw new AdmissionProblem("DREAM TEAM support access cannot cancel payments. Ask the Principal.");
  if (!v.overCapacity) throw new AdmissionProblem("Only the Principal or School Admin can cancel a payment.");
  const p = await tx.applicationFeePayment.findFirst({ where: { id: paymentId, application: applicationScope(v) } });
  if (!p) throw new AdmissionProblem("This payment was not found.");
  if (p.cancelledAt) throw new AdmissionProblem("This payment is already cancelled.");
  if (p.status !== "CONFIRMED") throw new AdmissionProblem(p.status === "PENDING" ? "This payment is still waiting for confirmation from Razorpay, so there is nothing to cancel." : "This online payment failed, so there is nothing to cancel.");
  if (!(CANCEL_REASONS as readonly string[]).includes(input.reason)) throw new AdmissionProblem("Choose why it is cancelled.", "reason");
  const note = input.note?.trim() || null;
  if (input.reason === "Other" && (!note || note.length < 5)) throw new AdmissionProblem("Say what happened in the note (at least 5 characters).", "note");
  const why = note ? `${input.reason}: ${note}` : input.reason;
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone);
  try {
    await assertBooksOpen(tx, ctx, today);
  } catch (e) {
    throw new AdmissionProblem(e instanceof Error ? e.message : "The books are closed for today.");
  }
  await tx.applicationFeePayment.update({ where: { id: p.id }, data: { cancelledAt: new Date(), cancelReason: why } });
  const reversed = await reverseApplicationFee(tx, ctx, p.id, today, why);
  await activity(tx, ctx, p.applicationId, "fee", `Payment ${p.receiptNo ?? ""} of ${formatRupees(p.amountPaise)} cancelled: ${why}.${reversed.length ? " The Day Book has a reversal today." : ""}`);
  await writeAudit(tx, ctx, { action: "fee-cancelled", recordType: "Application", recordId: p.applicationId, before: { paymentId: p.id, status: p.status, receipt: p.receiptNo, amount: formatRupees(p.amountPaise) }, after: { cancelled: true, reason: input.reason, note, dayBookReversals: reversed.map((r) => r.id) } });
  return { receiptNo: p.receiptNo, amount: formatRupees(p.amountPaise), reversed: reversed.length > 0 };
}

/** The school's active Razorpay gateway, if it has one (Settings, Payment Gateways). */
export async function activeRazorpay(tx: Tx): Promise<{ gatewayId: string; creds: RazorpayCredentials } | null> {
  const g = await tx.paymentGatewayAccount.findFirst({ where: { provider: "razorpay", isActive: true, archivedAt: null }, orderBy: { updatedAt: "desc" } });
  if (!g) return null;
  const creds = await razorpayCredentials(tx, g.id);
  return creds ? { gatewayId: g.id, creds } : null;
}

/** Starts an online payment: a Razorpay order for what is still due, kept as Pending. */
export async function createOnlineOrder(tx: Tx, ctx: SchoolContext, applicationId: string, fetchImpl?: typeof fetch) {
  const app = await loadApplication(tx, applicationId);
  if (CLOSED_STAGES.includes(app.stage)) throw new AdmissionProblem("This application is closed, so no fee can be paid.");
  const { left } = await remaining(tx, app);
  if (!app.feeDuePaise || left <= BigInt(0)) throw new AdmissionProblem("Nothing is due on this application.");
  const gateway = await activeRazorpay(tx);
  if (!gateway) throw new AdmissionProblem("Online payment is not set up at this school yet. Please pay the application fee at the school office.");
  const order = await createOrder(gateway.creds, { amountPaise: left, receipt: app.applicationNo, notes: { applicationId: app.id, purpose: "admission-application-fee" } }, fetchImpl);
  await tx.applicationFeePayment.create({ data: { schoolId: ctx.schoolId, applicationId: app.id, amountPaise: left, mode: "online", status: "PENDING", gatewayAccountId: gateway.gatewayId, gatewayOrderId: order.id } });
  await activity(tx, ctx, app.id, "fee", `Online payment of ${formatRupees(left)} started. Waiting for confirmation from Razorpay.`);
  return { orderId: order.id, keyId: gateway.creds.keyId, amountPaise: left, applicationNo: app.applicationNo, name: app.fullName, phone: app.phone, email: app.email };
}

/** Marks a pending online payment confirmed, once. Returns the payment and whether this call confirmed it. */
async function confirmPending(tx: Tx, ctx: SchoolContext, orderId: string, paymentId: string, via: string) {
  const p = await tx.applicationFeePayment.findFirst({ where: { gatewayOrderId: orderId } });
  if (!p) return null;
  if (p.status === "CONFIRMED") return { payment: p, confirmedNow: false };
  const app = await tx.application.findUniqueOrThrow({ where: { id: p.applicationId } });
  const receipt = await receiptNo(tx, ctx, app);
  const changed = await tx.applicationFeePayment.updateMany({ where: { id: p.id, status: { not: "CONFIRMED" } }, data: { status: "CONFIRMED", gatewayPaymentId: paymentId, confirmedAt: new Date(), receiptNo: receipt, failedReason: null } });
  if (changed.count === 0) return { payment: p, confirmedNow: false };
  const confirmed = await tx.applicationFeePayment.findUniqueOrThrow({ where: { id: p.id } });
  const entry = await postApplicationFee(tx, ctx, confirmed);
  await activity(tx, ctx, p.applicationId, "fee", `Online payment of ${formatRupees(p.amountPaise)} confirmed by Razorpay (${via}). Receipt ${receipt}. In the Day Book.`);
  await writeAudit(tx, ctx, { action: "fee-received", recordType: "Application", recordId: p.applicationId, after: { paymentId: p.id, amount: formatRupees(p.amountPaise), mode: "online", gatewayPaymentId: paymentId, receipt, via, dayBookEntryId: entry?.id ?? null } });
  return { payment: confirmed, confirmedNow: true };
}

/** After Checkout: trusted only when Razorpay's signature for this order and payment matches. */
export async function confirmCheckout(tx: Tx, ctx: SchoolContext, input: { orderId: string; paymentId: string; signature: string }) {
  const p = await tx.applicationFeePayment.findFirst({ where: { gatewayOrderId: input.orderId } });
  if (!p || !p.gatewayAccountId) throw new AdmissionProblem("This payment was not found. If money was taken, the school will match it when Razorpay confirms.");
  const creds = await razorpayCredentials(tx, p.gatewayAccountId);
  if (!creds || !verifyPaymentSignature({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature }, creds.keySecret)) {
    await writeAudit(tx, ctx, { action: "fee-signature-refused", recordType: "Application", recordId: p.applicationId, after: { orderId: input.orderId } });
    throw new AdmissionProblem("Waiting for payment confirmation. The payment could not be checked yet; the receipt will be made as soon as Razorpay confirms it.");
  }
  return confirmPending(tx, ctx, input.orderId, input.paymentId, "checkout");
}

/** Razorpay webhooks (registered in handlers.ts): confirm or mark failed; safe to run twice. */
export async function onAdmissionGatewayEvent(tx: Tx, ctx: SchoolContext, event: GatewayEvent) {
  if (!event.orderId) return;
  const p = await tx.applicationFeePayment.findFirst({ where: { gatewayOrderId: event.orderId } });
  if (!p) return;
  if ((event.event === "payment.captured" || event.event === "order.paid") && event.paymentId) {
    if (event.amountPaise !== null && BigInt(event.amountPaise) !== p.amountPaise) {
      await writeAudit(tx, ctx, { action: "fee-amount-mismatch", recordType: "Application", recordId: p.applicationId, after: { expected: p.amountPaise.toString(), got: event.amountPaise } });
      return;
    }
    await confirmPending(tx, ctx, event.orderId, event.paymentId, "webhook");
  } else if (event.event === "payment.failed" && p.status === "PENDING") {
    await tx.applicationFeePayment.update({ where: { id: p.id }, data: { status: "FAILED", failedReason: "Razorpay reported the payment failed." } });
    await activity(tx, ctx, p.applicationId, "fee", `Online payment of ${formatRupees(p.amountPaise)} failed. Pay again online or at the counter.`);
  }
}
