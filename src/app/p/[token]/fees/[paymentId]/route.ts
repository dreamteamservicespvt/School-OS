// A receipt or tax invoice PDF for a guardian on Parent Link. The phone must
// be confirmed for this link (device cookie), and the payment must belong to
// one of the guardian's own children.
import { cookies } from "next/headers";
import { withSchool } from "@/lib/db";
import { confirmedDevice, deviceCookieName, findLink } from "@/lib/parent-link/links";
import { hitLimit } from "@/lib/rate-limit";
import { receiptForGuardian, taxInvoiceForGuardian } from "@/lib/fees/parent-link";
import { MoneyProblem } from "@/lib/fees/problem";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function plain(status: number, text: string) {
  return new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string; paymentId: string }> }) {
  const { token, paymentId } = await params;
  const doc = new URL(request.url).searchParams.get("doc") === "tax-invoice" ? "tax-invoice" : "receipt";
  if (!UUID.test(paymentId)) return plain(404, "This receipt was not found.");
  const found = await findLink(token);
  if (!found) return plain(404, "This link is no longer active. Please ask the school for a new one.");
  const limited = await hitLimit(`pl-receipt:link:${found.linkId}`, 60, 3600);
  if (!limited.ok) return plain(429, "Too many downloads. Please try again later.");
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  const ctx = { schoolId: found.schoolId, userId: null };
  try {
    const file = await withSchool(ctx, async (tx) => {
      const ok = await confirmedDevice(tx, found.linkId, key);
      if (!ok) return null;
      return doc === "tax-invoice" ? taxInvoiceForGuardian(tx, ctx, ok.link.guardianId, paymentId) : receiptForGuardian(tx, ctx, ok.link.guardianId, paymentId);
    }, { timeout: 30_000 });
    if (!file) return plain(403, "Please open your Parent Link and confirm this phone first.");
    const pdf = await file.pdf();
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${file.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof MoneyProblem) return plain(404, e.message);
    throw e;
  }
}
