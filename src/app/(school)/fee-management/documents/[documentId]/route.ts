import { renderFeeCertificate, renderFeeInvoice } from "@/lib/fees/documents";
import { MoneyProblem } from "@/lib/fees/problem";
import { feePdf } from "../../_lib/pdf";
import { withPdfErrors } from "@/lib/pdf";

export const dynamic = "force-dynamic";
// Starting the PDF browser on a fresh server can take several seconds.
export const maxDuration = 60;

/** A fee invoice or fee certificate made from the Student Fee Ledger. */
async function handleGET(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return feePdf(req, documentId, async (tx, ctx) => {
    const row = await tx.feeDocument.findFirst({ where: { id: documentId } });
    if (!row) throw new MoneyProblem("This document was not found.");
    const doc = row.kind === "certificate" ? await renderFeeCertificate(tx, ctx, documentId) : await renderFeeInvoice(tx, ctx, documentId);
    return { fileName: doc.fileName, pdf: doc.pdf, studentId: row.studentId, title: `${row.kind === "certificate" ? "Fee certificate" : "Fee invoice"} ${row.number}` };
  });
}

// A PDF that cannot be made shows as a printable page instead (src/lib/pdf.ts).
export const GET = withPdfErrors(handleGET);
