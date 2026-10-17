// Fees on Parent Link (D4): each child's fees due with a Pay button
// (Razorpay) and the receipts and tax invoices to download. Parent Link is
// read-only apart from paying; a payment posts only once the gateway
// confirms it (A8). The section is registered in ./parent-link-section.tsx,
// the Pay action is src/app/p/[token]/fee-actions.ts and downloads are
// served by src/app/p/[token]/fees/[paymentId]/route.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { MoneyProblem } from "./problem";
import { allDues, dueStatus, totalsOf, advanceHeld } from "./dues";
import { gatewayFor } from "./settings";
import { createPaymentLink, payPath } from "./online";
import { renderReceipt, renderTaxInvoice } from "./documents";
import { todayIn } from "../staff/dates";
import { childrenOfGuardian } from "../students/guardian-access";

const ZERO = BigInt(0);

/** The guardian’s children (never one they have a custody restriction for), as student records. */
async function childrenOf(tx: Tx, ctx: SchoolContext, guardianId: string) {
  const ids = await childrenOfGuardian(tx, ctx, guardianId);
  return ids.length ? tx.student.findMany({ where: { schoolId: ctx.schoolId, id: { in: ids } } }) : [];
}

export type ParentLinkFees = Awaited<ReturnType<typeof parentLinkFees>>;

/** For each of the guardian's children: fees due (oldest first) with what can be paid, totals, and receipts. */
export async function parentLinkFees(tx: Tx, ctx: SchoolContext, guardianId: string, onlyStudentIds?: string[]) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone);
  const children = (await childrenOf(tx, ctx, guardianId)).filter((c) => !onlyStudentIds || onlyStudentIds.includes(c.id));
  const out = [];
  for (const s of children) {
    const dues = await allDues(tx, s.id);
    const heads = await tx.feeHead.findMany({ where: { id: { in: dues.map((d) => d.feeHeadId) } } });
    const enrol = await tx.enrolment.findFirst({ where: { studentId: s.id, archivedAt: null }, orderBy: { createdAt: "desc" } });
    const section = enrol ? await tx.section.findUnique({ where: { id: enrol.sectionId }, include: { schoolClass: true } }) : null;
    const payments = await tx.payment.findMany({ where: { studentId: s.id, status: { in: ["POSTED", "CANCELLED"] } }, orderBy: { paidAt: "desc" }, take: 50 });
    const receipts = await tx.receipt.findMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
    const invoices = await tx.taxInvoice.findMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
    const gateway = await gatewayFor(tx, ctx, enrol?.classId ?? null);
    const totals = totalsOf(dues);
    out.push({
      studentId: s.id,
      name: s.fullName,
      classSection: section ? `${section.schoolClass.name} ${section.name}` : "",
      totals,
      advance: await advanceHeld(tx, s.id),
      canPayOnline: Boolean(gateway) && totals.balance > ZERO,
      dues: dues.filter((d) => d.balancePaise > ZERO).map((d) => ({
        id: d.id,
        head: heads.find((h) => h.id === d.feeHeadId)?.name ?? "Fees",
        label: d.label,
        dueDate: d.dueDate,
        balancePaise: d.balancePaise,
        status: dueStatus(d, today),
      })),
      receipts: payments
        .filter((p) => receipts.some((r) => r.paymentId === p.id))
        .map((p) => {
          const r = receipts.find((x) => x.paymentId === p.id)!;
          const ti = invoices.find((x) => x.paymentId === p.id);
          return { paymentId: p.id, number: r.number, date: p.paymentDate, amountPaise: p.amountPaise, mode: p.mode, cancelled: r.status === "cancelled", broughtIn: p.broughtIn, taxInvoiceNo: ti?.number ?? null };
        }),
    });
  }
  return out;
}

async function assertChild(tx: Tx, ctx: SchoolContext, guardianId: string, studentId: string) {
  if (!(await childrenOfGuardian(tx, ctx, guardianId)).includes(studentId)) throw new MoneyProblem("This student is not linked to you.");
}

/** The Pay button: a payment for the chosen rows (or everything due now). Returns where to send the parent. */
export async function startParentLinkPayment(tx: Tx, ctx: SchoolContext, guardianId: string, studentId: string, dueIds: string[]) {
  await assertChild(tx, ctx, guardianId, studentId);
  const made = await createPaymentLink(tx, ctx, { studentId, dueIds, guardianId, source: "PARENT_LINK", channel: "parent-link" });
  return { payPath: payPath(ctx.schoolId, made.token), amountPaise: made.amount, linkId: made.link.id };
}

/** A receipt (parent copy) for one of the guardian's children, as a PDF. */
export async function receiptForGuardian(tx: Tx, ctx: SchoolContext, guardianId: string, paymentId: string) {
  const p = await tx.payment.findFirst({ where: { id: paymentId } });
  if (!p) throw new MoneyProblem("This receipt was not found.");
  await assertChild(tx, ctx, guardianId, p.studentId);
  const doc = await renderReceipt(tx, ctx, paymentId, "parent");
  return { fileName: doc.fileName, pdf: doc.pdf };
}

/** A tax invoice for one of the guardian's children, as a PDF. */
export async function taxInvoiceForGuardian(tx: Tx, ctx: SchoolContext, guardianId: string, paymentId: string) {
  const p = await tx.payment.findFirst({ where: { id: paymentId } });
  if (!p) throw new MoneyProblem("This tax invoice was not found.");
  await assertChild(tx, ctx, guardianId, p.studentId);
  const doc = await renderTaxInvoice(tx, ctx, paymentId);
  return { fileName: doc.fileName, pdf: doc.pdf };
}
