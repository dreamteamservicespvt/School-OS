import { renderTaxInvoice } from "@/lib/fees/documents";
import { feePdf } from "../../../_lib/pdf";

export const dynamic = "force-dynamic";

/** The GST tax invoice made with a receipt for taxable fee heads. */
export async function GET(req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return feePdf(req, paymentId, async (tx, ctx) => {
    const doc = await renderTaxInvoice(tx, ctx, paymentId);
    const p = await tx.payment.findFirstOrThrow({ where: { id: paymentId }, select: { studentId: true } });
    return { fileName: doc.fileName, pdf: doc.pdf, studentId: p.studentId, title: `Tax invoice ${doc.invoice.number}` };
  });
}
