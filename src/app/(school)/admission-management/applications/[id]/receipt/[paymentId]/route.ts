// The application fee receipt, in the school's fee receipt design. Made only
// for a confirmed payment (02 §5 "Application fee receipt before payment").
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { renderDocument } from "@/lib/documents";
import { formatRupees } from "@/lib/format";
import { logExport } from "@/lib/exports";
import { applicationScope, viewerFor } from "@/lib/admission/access";
import { UUID_RE } from "@/lib/admission/act";
import { modeLabel } from "@/lib/admission/fee";
import { feeStatus } from "@/lib/admission/fee";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  const { current } = await requireAction("admission-management", "print");
  if (!UUID_RE.test(id) || !UUID_RE.test(paymentId)) return text("This receipt was not found.", 404);
  return withSchool(current.ctx, async (tx) => {
    const v = await viewerFor(tx, current.ctx, current);
    if (v.see !== "all") return text("Only the admission team can print receipts.", 403);
    const pay = await tx.applicationFeePayment.findFirst({ where: { id: paymentId, applicationId: id, application: applicationScope(v) }, include: { application: { include: { payments: true } } } });
    if (!pay || pay.status !== "CONFIRMED" || pay.cancelledAt || !pay.receiptNo) return text("There is no receipt for this payment: it is not confirmed, or it was cancelled.", 404);
    const app = pay.application;
    const cls = await tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } });
    const by = pay.receivedById ? await tx.staff.findFirst({ where: { userLoginId: pay.receivedById }, select: { fullName: true } }) : null;
    const st = feeStatus(app, app.payments);
    const doc = await renderDocument(tx, current.ctx, "fee-receipt", {
      fields: {
        receipt_no: pay.receiptNo, receipt_date: pay.confirmedAt ?? pay.createdAt, student_name: app.fullName, admission_no: `Application ${app.applicationNo}`,
        class_section: `${cls?.name ?? ""} (applied for)`, father_name: app.fatherName ?? app.motherName ?? app.guardianName ?? "",
        payment_mode: modeLabel(pay.mode), reference_no: pay.reference ?? pay.gatewayPaymentId ?? "", received_by: by?.fullName ?? (pay.mode === "online" ? "Online payment" : ""),
        balance_due: formatRupees(st.duePaise > st.paidPaise ? st.duePaise - st.paidPaise : BigInt(0)),
      },
      lines: [{ label: "Application fee", amountPaise: pay.amountPaise }],
      campusId: app.campusId,
    });
    await logExport(tx, current.ctx, { title: `Application fee receipt ${pay.receiptNo}`, format: "pdf", filters: app.applicationNo, rows: 1 });
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="receipt-${pay.receiptNo.replace(/\//g, "-")}.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
