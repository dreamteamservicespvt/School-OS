"use server";

import QRCode from "qrcode";
import type { PaymentMode } from "@prisma/client";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { appOrigin } from "@/lib/origin";
import { collectPayment } from "@/lib/fees/collect";
import { giveConcession } from "@/lib/fees/concessions";
import { createPaymentLink, payPath, sendPaymentLink } from "@/lib/fees/online";
import { sendAutomatic } from "@/lib/fees/notify-parents";
import { MoneyProblem } from "@/lib/fees/problem";
import { COUNTER_MODES } from "@/lib/fees/words";
import { dateTimeOf, id, ids, needRupees, optionalText, rupeesOf, str, UUID_RE } from "@/lib/fees/act";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { feeAction } from "../../_lib/action";

const ZERO = BigInt(0);

export type Collected = {
  paymentId: string;
  receiptNo: string | null;
  waiting: boolean;
  amount: string;
  when: string;
  mode: string;
  items: { label: string; amount: string }[];
  sent: boolean;
};

/** Collect Fee: posts the payment, makes the receipt and tells the parent, all in one step (A1). */
export async function collectFee(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const mode = str(fd, "mode");
    if (!COUNTER_MODES.some((m) => m.value === mode)) throw new MoneyProblem("Choose how it is paid.", "mode");
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    const paidAtRaw = str(fd, "paidAt");
    const result = await collectPayment(tx, ctx, { roleKeys: viewer.roleKeys }, {
      studentId: id(fd, "studentId", "student"),
      dueIds: ids(fd, "dueId"),
      amountPaise: needRupees(fd, "amount", "Amount received"),
      mode: mode as PaymentMode,
      reference: str(fd, "reference").replace(/\s+/g, "") || null,
      chequeNo: str(fd, "chequeNo") || null,
      chequeBank: optionalText(fd, "chequeBank", "Bank", 80),
      chequeDate: str(fd, "chequeDate") ? new Date(`${str(fd, "chequeDate")}T00:00:00Z`) : null,
      paidAt: paidAtRaw ? dateTimeOf(fd, "paidAt", "Payment date", school.timeZone) : null,
      note: optionalText(fd, "note", "Note", 300),
      discountPaise: rupeesOf(fd, "discount", "Discount") ?? ZERO,
      discountReason: optionalText(fd, "discountReason", "Reason for the discount", 300),
      waiveDueIds: ids(fd, "waiveDueId"),
      waiveReason: optionalText(fd, "waiveReason", "Reason for the waiver", 300),
      confirmDuplicate: str(fd, "confirmDuplicate") === "1",
    });
    const allocations = await tx.paymentAllocation.findMany({ where: { paymentId: result.payment.id, fromAdvance: false } });
    const dues = await tx.studentFeeDue.findMany({ where: { id: { in: allocations.map((a) => a.dueId) } } });
    const heads = await tx.feeHead.findMany({ where: { id: { in: allocations.map((a) => a.feeHeadId) } } });
    const items = allocations.map((a) => {
      const d = dues.find((x) => x.id === a.dueId);
      const h = heads.find((x) => x.id === a.feeHeadId);
      return { label: d?.kind === "LATE_FEE" ? d.label : `${h?.name ?? "Fees"}${d ? ` · ${d.label}` : ""}`, amount: formatRupees(a.amountPaise) };
    });
    if (result.payment.advancePaise > ZERO) items.push({ label: "Advance, held for the next installments", amount: formatRupees(result.payment.advancePaise) });
    const p = result.payment;
    const mode2 = p.mode === "CHEQUE" ? `Cheque ${p.chequeNo}, ${p.chequeBank}` : COUNTER_MODES.find((m) => m.value === p.mode)?.label ?? p.mode;
    const sent = !result.waiting && (await tx.message.count({ where: { sourceType: "Payment", sourceId: p.id } })) > 0;
    return {
      paymentId: p.id,
      receiptNo: result.receiptNo,
      waiting: result.waiting,
      amount: formatRupees(p.amountPaise),
      when: formatDateTime(p.paidAt, school.timeZone),
      mode: `${mode2}${p.reference ? ` · ${p.reference}` : ""}`,
      items,
      sent,
    } satisfies Collected;
  }, (r) => r.waiting
    ? { message: `${r.amount} saved. It waits for verification before the receipt is made.`, tone: "info" }
    : `${r.amount} received. Receipt ${r.receiptNo}.`, { staffOnly: "collect fees" });
}

/** A discount above the counter limit: sends it to the principal as a concession on the ticked rows. */
export async function askDiscountApproval(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx) => {
    const amount = needRupees(fd, "discount", "Discount");
    const reason = str(fd, "discountReason");
    if (reason.length < 5) throw new MoneyProblem("Give a reason of at least 5 characters for the discount.", "discountReason");
    const dueIds = ids(fd, "dueId");
    if (!dueIds.length) throw new MoneyProblem("Tick the rows the discount is for.", "dueIds");
    const r = await giveConcession(tx, ctx, { studentId: id(fd, "studentId", "student"), type: "DISCOUNT", mode: "amount", amountPaise: amount, percentBp: 0, feeHeadIds: [], dueIds, periodFrom: null, periodTo: null, reason }, { forceApproval: true });
    return { estimate: formatRupees(r.estimate) };
  }, (r) => ({ message: `Discount of ${r.estimate} sent to the principal for approval. Collect once it is approved.`, tone: "info", link: { href: "/approvals", label: "Open Approvals" } }), { staffOnly: "give discounts" });
}

/** "Send payment link instead": a Razorpay link for the ticked rows, by WhatsApp. */
export async function sendLink(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx) => {
    const r = await sendPaymentLink(tx, ctx, { studentId: id(fd, "studentId", "student"), dueIds: ids(fd, "dueId"), channel: "whatsapp" });
    return { amount: formatRupees(r.amount), to: r.card.fatherName ?? r.card.primaryGuardian?.name ?? "the parent", expires: formatDate(r.link.expiresAt) };
  }, (r) => `Payment link sent to ${r.to}. ${r.amount} · WhatsApp, with SMS backup. Valid till ${r.expires}.`, { staffOnly: "send payment links" });
}

export type QrLink = { url: string; svg: string; amount: string; linkId: string };

/** "Show QR": a payment link for the ticked rows as a QR code the parent scans. The payment shows up by itself once Razorpay confirms it. */
export async function showQr(_prev: unknown, fd: FormData) {
  const origin = await appOrigin();
  return feeAction("create", fd, async (tx, ctx) => {
    const r = await createPaymentLink(tx, ctx, { studentId: id(fd, "studentId", "student"), dueIds: ids(fd, "dueId"), source: "LINK", channel: "qr" });
    const url = `${origin}${payPath(ctx.schoolId, r.token)}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f1715", light: "#ffffff" } });
    return { url, svg, amount: formatRupees(r.amount), linkId: r.link.id } satisfies QrLink;
  }, () => ({ message: "QR ready. Ask the parent to scan it with any UPI app." }), { staffOnly: "take online payments" });
}

/** Has the QR's link been paid yet? Read every few seconds while the QR shows. */
export async function qrPaid(linkId: string): Promise<{ paid: boolean; receiptNo: string | null }> {
  if (!UUID_RE.test(linkId)) return { paid: false, receiptNo: null };
  const { current } = await requireAction("fee-management", "create");
  return withSchool(current.ctx, async (tx) => {
    const link = await tx.paymentLink.findFirst({ where: { id: linkId } });
    if (!link?.paymentId) return { paid: false, receiptNo: null };
    const receipt = await tx.receipt.findUnique({ where: { paymentId: link.paymentId } });
    return { paid: true, receiptNo: receipt?.number ?? null };
  });
}

/** Resend the receipt to the parent on WhatsApp. */
export async function resendReceipt(_prev: unknown, fd: FormData) {
  return feeAction("print", fd, async (tx, ctx) => {
    const paymentId = id(fd, "paymentId", "payment");
    const p = await tx.payment.findFirst({ where: { id: paymentId } });
    const receipt = await tx.receipt.findUnique({ where: { paymentId } });
    if (!p || !receipt || p.status !== "POSTED") throw new MoneyProblem("Only a posted payment's receipt can be sent.");
    // A second copy needs its own event key, so it is not taken for a duplicate of the first.
    const r = await sendAutomatic(tx, ctx, {
      rule: "fee-paid",
      event: { key: `fee-paid:${p.id}:again:${Date.now()}`, label: `Receipt ${receipt.number} sent again` },
      to: { guardiansOf: [p.studentId] },
      perStudent: { [p.studentId]: { paid_amount: formatRupees(p.amountPaise), payment_date: formatDate(p.paymentDate), receipt_number: receipt.number } },
      source: { type: "Payment", id: p.id },
    });
    if (r.status === "off") throw new MoneyProblem("The \"Fee received\" message is switched off. Switch it on in Communication, Message Settings.", undefined, { href: "/communication/settings", label: "Open Message Settings" });
    if (r.status === "no-channel") throw new MoneyProblem("No messaging channel is set up. Set up WhatsApp or SMS in Settings.", undefined, { href: "/settings", label: "Open Settings" });
    if (r.status === "nobody") throw new MoneyProblem("No parent can get this message: no phone number, or they opted out. Print the receipt instead.");
    return { no: receipt.number };
  }, (r) => `Receipt ${r.no} sent again on WhatsApp.`, { staffOnly: false });
}
