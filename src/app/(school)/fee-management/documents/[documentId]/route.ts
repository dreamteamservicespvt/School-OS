import { renderFeeCertificate, renderFeeInvoice } from "@/lib/fees/documents";
import { MoneyProblem } from "@/lib/fees/problem";
import { feePdf } from "../../_lib/pdf";

export const dynamic = "force-dynamic";

/** A fee invoice or fee certificate made from the Student Fee Ledger. */
export async function GET(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return feePdf(req, documentId, async (tx, ctx) => {
    const row = await tx.feeDocument.findFirst({ where: { id: documentId } });
    if (!row) throw new MoneyProblem("This document was not found.");
    const doc = row.kind === "certificate" ? await renderFeeCertificate(tx, ctx, documentId) : await renderFeeInvoice(tx, ctx, documentId);
    return { fileName: doc.fileName, pdf: doc.pdf, studentId: row.studentId, title: `${row.kind === "certificate" ? "Fee certificate" : "Fee invoice"} ${row.number}` };
  });
}
