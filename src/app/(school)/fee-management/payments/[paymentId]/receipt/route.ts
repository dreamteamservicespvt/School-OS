import { renderReceipt } from "@/lib/fees/documents";
import { feePdf } from "../../../_lib/pdf";
import { withPdfErrors } from "@/lib/pdf";

export const dynamic = "force-dynamic";
// Starting the PDF browser on a fresh server can take several seconds.
export const maxDuration = 60;

/** The receipt PDF: office and parent copies as set in Fee Settings, or ?copy=office / parent. */
async function handleGET(req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const copy = new URL(req.url).searchParams.get("copy");
  return feePdf(req, paymentId, async (tx, ctx) => {
    const doc = await renderReceipt(tx, ctx, paymentId, copy === "office" || copy === "parent" || copy === "both" ? copy : undefined);
    const p = await tx.payment.findFirstOrThrow({ where: { id: paymentId }, select: { studentId: true } });
    return { fileName: doc.fileName, pdf: doc.pdf, studentId: p.studentId, title: `Receipt ${doc.receipt.number}` };
  });
}

// A PDF that cannot be made shows as a printable page instead (src/lib/pdf.ts).
export const GET = withPdfErrors(handleGET);
