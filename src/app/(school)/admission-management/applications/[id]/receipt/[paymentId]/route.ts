// The application fee receipt, in the school's fee receipt design. Made only
// for a confirmed payment (02 §5 "Application fee receipt before payment").
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { applicationScope, viewerFor } from "@/lib/admission/access";
import { UUID_RE } from "@/lib/admission/act";
import { applicationFeeReceipt, receiptResponse } from "@/lib/admission/receipt";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  const { current } = await requireAction("admission-management", "print");
  if (!UUID_RE.test(id) || !UUID_RE.test(paymentId)) return text("This receipt was not found.", 404);
  return withSchool(current.ctx, async (tx) => {
    const v = await viewerFor(tx, current.ctx, current);
    if (v.see !== "all") return text("Only the admission team can print receipts.", 403);
    const r = await applicationFeeReceipt(tx, current.ctx, id, paymentId, applicationScope(v));
    if (!r) return text("There is no receipt for this payment: it is not confirmed, or it was cancelled.", 404);
    return receiptResponse(r);
  }, { timeout: 60_000 });
}
