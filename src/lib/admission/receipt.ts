// The application fee receipt, in the school's fee receipt design (02 §5
// "Application fee receipt before payment"): made only for a confirmed
// payment that is not cancelled. Printed from the application in Admission
// Management and from Collect Fee in Fee Management; each page checks who
// may print and which applications they may see before calling this.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { renderDocument } from "../documents";
import { formatRupees } from "../format";
import { logExport } from "../exports";
import { feeStatus, modeLabel } from "./fee";

/** The receipt as a PDF, or null when there is no receipt for this payment (not confirmed, cancelled or not found). */
export async function applicationFeeReceipt(tx: Tx, ctx: SchoolContext, applicationId: string, paymentId: string, scope: Prisma.ApplicationWhereInput) {
  const pay = await tx.applicationFeePayment.findFirst({ where: { id: paymentId, applicationId, application: scope }, include: { application: { include: { payments: true } } } });
  if (!pay || pay.status !== "CONFIRMED" || pay.cancelledAt || !pay.receiptNo) return null;
  const app = pay.application;
  const cls = await tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } });
  const by = pay.receivedById ? await tx.staff.findFirst({ where: { userLoginId: pay.receivedById }, select: { fullName: true } }) : null;
  const st = feeStatus(app, app.payments);
  const doc = await renderDocument(tx, ctx, "fee-receipt", {
    fields: {
      receipt_no: pay.receiptNo, receipt_date: pay.confirmedAt ?? pay.createdAt, student_name: app.fullName, admission_no: `Application ${app.applicationNo}`,
      class_section: `${cls?.name ?? ""} (applied for)`, father_name: app.fatherName ?? app.motherName ?? app.guardianName ?? "",
      payment_mode: modeLabel(pay.mode), reference_no: pay.reference ?? pay.gatewayPaymentId ?? "", received_by: by?.fullName ?? (pay.mode === "online" ? "Online payment" : ""),
      balance_due: formatRupees(st.duePaise > st.paidPaise ? st.duePaise - st.paidPaise : BigInt(0)),
    },
    lines: [{ label: "Application fee", amountPaise: pay.amountPaise }],
    campusId: app.campusId,
  });
  await logExport(tx, ctx, { title: `Application fee receipt ${pay.receiptNo}`, format: "pdf", filters: app.applicationNo, rows: 1 });
  return { receiptNo: pay.receiptNo, pdf: await doc.pdf() };
}

export function receiptResponse(r: { receiptNo: string; pdf: Uint8Array | Buffer }) {
  return new Response(new Uint8Array(r.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="receipt-${r.receiptNo.replace(/\//g, "-")}.pdf"`, "Cache-Control": "no-store" } });
}
