// The parent copy of any fee receipt, opened from the "Fee received" message
// ("Open receipt" on WhatsApp). No login: the address carries a secret made
// with the server key for that school and payment (src/lib/parent-link/token.ts).
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit } from "@/lib/rate-limit";
import { readReceiptKey } from "@/lib/parent-link/token";
import { renderReceipt } from "@/lib/fees/documents";

export const dynamic = "force-dynamic";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const device = await deviceInfo();
  const limited = await hitLimit(`receipt-link:ip:${device.ipAddress ?? "unknown"}`, 20, 600);
  if (!limited.ok) return text("Too many tries. Please wait a few minutes.", 429);
  const found = readReceiptKey(key);
  if (!found) return text("This receipt was not found.", 404);
  const ctx = { schoolId: found.schoolId, userId: null };
  return withSchool(ctx, async (tx) => {
    const receipt = await tx.receipt.findUnique({ where: { paymentId: found.paymentId } });
    if (!receipt) return text("This receipt was not found.", 404);
    // A cancelled receipt still opens, stamped CANCELLED, so the parent sees why.
    const doc = await renderReceipt(tx, ctx, found.paymentId, "parent");
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${doc.fileName}"`, "Cache-Control": "private, no-store" } });
  }, { timeout: 60_000 });
}
