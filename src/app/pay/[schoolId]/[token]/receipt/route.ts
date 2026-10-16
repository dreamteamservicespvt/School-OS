// The parent copy of the receipt for a paid payment link (no login: the secret token is the key).
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit } from "@/lib/rate-limit";
import { linkByToken } from "@/lib/fees/online";
import { renderReceipt } from "@/lib/fees/documents";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ schoolId: string; token: string }> }) {
  const { schoolId, token } = await params;
  if (!UUID.test(schoolId)) return text("This receipt was not found.", 404);
  const device = await deviceInfo();
  const limited = await hitLimit(`pay-receipt:ip:${device.ipAddress ?? "unknown"}`, 20, 600);
  if (!limited.ok) return text("Too many tries. Please wait a few minutes.", 429);
  const ctx = { schoolId, userId: null };
  return withSchool(ctx, async (tx) => {
    const link = await linkByToken(tx, token);
    if (!link?.paymentId) return text("This receipt was not found.", 404);
    const receipt = await tx.receipt.findUnique({ where: { paymentId: link.paymentId } });
    if (!receipt) return text("The receipt is not ready yet. It comes on WhatsApp once the payment is confirmed.", 404);
    const doc = await renderReceipt(tx, ctx, link.paymentId, "parent");
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${doc.fileName}"`, "Cache-Control": "private, no-store" } });
  }, { timeout: 60_000 });
}
