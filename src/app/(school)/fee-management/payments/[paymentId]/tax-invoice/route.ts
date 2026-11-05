import { renderTaxInvoice } from "@/lib/fees/documents";
import { feePdf } from "../../../_lib/pdf";
import { withPdfErrors } from "@/lib/pdf";

export const dynamic = "force-dynamic";
// Starting the PDF browser on a fresh server can take several seconds.
export const maxDuration = 60;

/** The GST tax invoice made with a receipt for taxable fee heads. */
async function handleGET(req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return feePdf(req, paymentId, async (tx, ctx) => {
    const doc = await renderTaxInvoice(tx, ctx, paymentId);
    const p = await tx.payment.findFirstOrThrow({ where: { id: paymentId }, select: { studentId: true } });
    return { fileName: doc.fileName, pdf: doc.pdf, studentId: p.studentId, title: `Tax invoice ${doc.invoice.number}` };
  });
}

// A PDF that cannot be made shows as a printable page instead (src/lib/pdf.ts).
export const GET = withPdfErrors(handleGET);
