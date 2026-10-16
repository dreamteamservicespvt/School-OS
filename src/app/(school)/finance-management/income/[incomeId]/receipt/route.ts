import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { logExport } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { MoneyProblem } from "@/lib/fees/problem";
import { UUID_RE } from "@/lib/fees/act";
import { incomeReceipt } from "@/lib/finance/income";

export const dynamic = "force-dynamic";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** The receipt for posted income, as a PDF to print (P9). */
export async function GET(req: Request, { params }: { params: Promise<{ incomeId: string }> }) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return text("You do not have permission to print income receipts.", 403);
    throw e;
  }
  const { incomeId } = await params;
  if (!UUID_RE.test(incomeId)) return text("This receipt was not found.", 404);
  const download = new URL(req.url).searchParams.get("download") === "1";
  try {
    return await withSchool(current.ctx, async (tx) => {
      const doc = await incomeReceipt(tx, current.ctx, incomeId);
      const pdf = await doc.pdf();
      await logExport(tx, current.ctx, { title: "Income receipt", format: "pdf", filters: "", rows: 1 });
      return new Response(new Uint8Array(pdf), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.fileName}"`, "Cache-Control": "private, no-store" },
      });
    });
  } catch (e) {
    if (e instanceof MoneyProblem) return text(e.message, 404);
    throw e;
  }
}
