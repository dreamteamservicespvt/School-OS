import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { canSeeStudent } from "@/lib/fees/access";
import { BASE, feeGuard } from "../../_lib/page";

/** A payment's own address (used by Approvals and notifications): opens it on the student's ledger. */
export default async function PaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) notFound();
  const p = await feeGuard("payments");
  const studentId = await withSchool(p.current.ctx, async (tx) => {
    const pay = await tx.payment.findFirst({ where: { id: paymentId }, select: { studentId: true } });
    if (!pay || !(await canSeeStudent(tx, p.viewer, pay.studentId))) return null;
    return pay.studentId;
  });
  if (!studentId) notFound();
  redirect(`${BASE}/ledger/${studentId}?tab=payments&pay=${paymentId}`);
}
