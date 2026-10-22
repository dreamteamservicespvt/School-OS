// The application fee receipt from Fee Management's Collect Fee: the same
// receipt as in Admission Management, for people who print fee documents.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";
import { feePageAllowed, feeViewer } from "@/lib/fees/access";
import { applicantScope } from "@/lib/fees/applicants";
import { UUID_RE } from "@/lib/fees/act";
import { applicationFeeReceipt, receiptResponse } from "@/lib/admission/receipt";

export const dynamic = "force-dynamic";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ applicationId: string; paymentId: string }> }) {
  const { applicationId, paymentId } = await params;
  let current;
  try {
    ({ current } = await requireAction("fee-management", "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return text("You do not have permission to print fee documents.", 403);
    throw e;
  }
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(paymentId)) return text("This receipt was not found.", 404);
  return withSchool(current.ctx, async (tx) => {
    const viewer = await feeViewer(tx, current.ctx, current);
    if (viewer.see !== "all" || !feePageAllowed(viewer, "documents")) return text("Your role cannot see fee documents.", 403);
    const r = await applicationFeeReceipt(tx, current.ctx, applicationId, paymentId, applicantScope(viewer));
    if (!r) return text("There is no receipt for this payment: it is not confirmed, or it was cancelled.", 404);
    return receiptResponse(r);
  }, { timeout: 60_000 });
}
