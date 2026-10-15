// The purchase order as a PDF, from the school's "Purchase order" design
// (Settings, Document Designs), to print or send to the vendor.
import { withSchool } from "@/lib/db";
import { purchaseOrderDoc } from "@/lib/inventory/documents";
import { invRoute, plain } from "../../../../_lib/route";
import { UUID } from "../../../../_lib/page";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const x = await invRoute(req, "purchases", "print");
  if (x instanceof Response) return x;
  if (!UUID.test(id)) return plain("This order was not found.", 404);
  const po = await withSchool(x.current.ctx, (tx) => purchaseOrderDoc(tx, x.current.ctx, id), { timeout: 60_000 });
  if (!po) return plain("This order was not found.", 404);
  if (po.order.status === "WAITING") return plain(`${po.order.number} is waiting for approval. It can be printed once approved.`, 409);
  const pdf = await po.doc.pdf();
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${po.order.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf"`, "Cache-Control": "no-store" },
  });
}
