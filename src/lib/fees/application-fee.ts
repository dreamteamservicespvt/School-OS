// The application fee in the school's money records (02 §2 "Collect
// application fee", 06 §4 "application fee collection", rule 10). An
// applicant is not a student yet, so the payment stays on the application
// (Application Fee Payment, with its own receipt series), and Fee Management
// posts it as it posts any fee: one Day Book entry under "Other fee types",
// head "Application fee", in Cash in hand or the bank account of its mode
// (the "Application fee" fee head's own account when fees go into different
// accounts, rule 39), on the day the money came. Cancelling it reverses that
// entry on the cancel date, as for a fee payment (rule 6); the original
// stays. Posting the same payment twice does nothing.
import "server-only";

import type { ApplicationFeePayment, PaymentMode } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { postToDayBook, reverseSource } from "../finance/daybook";
import { accountForMode, mainBankAccount, systemHead } from "../finance/settings";
import { todayIn } from "../staff/dates";
import { featureOn } from "./settings";

/** Day Book source of an application fee, and of its cancellation. */
export const APPLICATION_FEE_SOURCE = "application-fee";
export const APPLICATION_FEE_CANCEL = "application-fee-cancel";
export const APPLICATION_FEE_HEAD = "Application fee";

/** The counter and online modes of an application fee, as Fee Management's payment modes. */
const MODES: Record<string, PaymentMode> = { cash: "CASH", upi: "UPI", card: "CARD", cheque: "CHEQUE", "bank-transfer": "BANK_TRANSFER", online: "GATEWAY" };
export const applicationFeeMode = (mode: string): PaymentMode => MODES[mode] ?? "CASH";

/**
 * Posts a confirmed application fee to the Day Book, once. Returns the entry,
 * or null when the payment is not confirmed or is cancelled.
 */
export async function postApplicationFee(tx: Tx, ctx: SchoolContext, payment: ApplicationFeePayment) {
  if (payment.status !== "CONFIRMED" || payment.cancelledAt) return null;
  const app = await tx.application.findUniqueOrThrow({ where: { id: payment.applicationId }, select: { fullName: true, applicationNo: true, classId: true } });
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const mode = applicationFeeMode(payment.mode);
  // The school's own "Application fee" fee head, when it has one: its bank account (rule 39) and the head filters.
  const head = await tx.feeHead.findFirst({ where: { archivedAt: null, name: { equals: APPLICATION_FEE_HEAD, mode: "insensitive" } } });
  const deposit = head?.bankAccountId && (await featureOn(tx, ctx, "fee-bank-accounts")) ? head.bankAccountId : (await mainBankAccount(tx, ctx)).id;
  const { entry } = await postToDayBook(tx, ctx, {
    date: todayIn(school.timeZone, payment.confirmedAt ?? new Date()),
    direction: "IN",
    amountPaise: payment.amountPaise,
    mode,
    section: "other-fees",
    headName: head?.name ?? APPLICATION_FEE_HEAD,
    feeHeadIds: head ? [head.id] : [],
    accountHeadId: (await systemHead(tx, ctx, "fees"))?.id ?? null,
    accountId: await accountForMode(tx, ctx, mode, deposit),
    depositAccountId: deposit,
    sourceType: APPLICATION_FEE_SOURCE,
    sourceId: payment.id,
    sourceKey: `${APPLICATION_FEE_SOURCE}:${payment.id}`,
    classId: app.classId,
    partyName: `${app.fullName} (application ${app.applicationNo})`,
    reference: payment.reference ?? payment.gatewayPaymentId ?? null,
    note: payment.receiptNo ? `Receipt ${payment.receiptNo}` : null,
  });
  return entry;
}

/** Takes a cancelled application fee off the Day Book on the cancel date. Nothing to do for a payment never posted. */
export async function reverseApplicationFee(tx: Tx, ctx: SchoolContext, paymentId: string, date: Date, why: string) {
  return reverseSource(tx, ctx, { sourceType: APPLICATION_FEE_SOURCE, sourceId: paymentId, date, reversalType: APPLICATION_FEE_CANCEL, note: `Application fee cancelled: ${why}` });
}
