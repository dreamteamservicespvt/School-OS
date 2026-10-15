// Asset tags as a PDF of A4 label sheets (barcode or QR): one asset, chosen
// assets, a run of tags (?from=AT-0031&to=AT-0060, as when 30 desks are added
// at once), or every asset in a room. Labels already used on a sheet can be
// skipped so a part sheet is not wasted.
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { labelsHtml, LABELS_PER_SHEET } from "@/lib/inventory/documents";
import { placeNames } from "@/lib/inventory/assets";
import { invRoute, plain } from "../../_lib/route";
import { UUID } from "../../_lib/page";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await invRoute(req, "assets", "print");
  if (x instanceof Response) return x;
  if (!x.can.assets) return plain("Only the store keeper prints asset tags.", 403);
  const ids = x.url.searchParams.getAll("asset").filter((v) => UUID.test(v)).slice(0, 2000);
  const from = x.get("from").trim().toUpperCase().slice(0, 24);
  const to = (x.get("to").trim().toUpperCase() || from).slice(0, 24);
  const room = UUID.test(x.get("room")) ? x.get("room") : "";
  const kind = x.get("kind") === "qr" ? "qr" : "barcode";
  const skip = Math.max(0, Math.min(LABELS_PER_SHEET - 1, Number(x.get("skip")) || 0));
  if (!ids.length && !from && !room) return plain("Choose the assets to print tags for.", 400);
  const where: Prisma.AssetWhereInput = { archivedAt: null, status: { not: "DISPOSED" }, ...(ids.length ? { id: { in: ids } } : room ? { roomId: room } : { tag: { gte: from, lte: to } }) };
  const out = await withSchool(x.current.ctx, async (tx) => {
    const assets = await tx.asset.findMany({ where, orderBy: { tag: "asc" }, take: 2000 });
    const place = await placeNames(tx, assets);
    return assets.map((a) => ({ code: a.tag, title: a.name, sub: place(a) }));
  }, { timeout: 60_000 });
  if (!out.length) return plain("There are no assets with these tags.", 404);
  const html = labelsHtml(out, { schoolName: x.current.school.name, kind, title: "Asset tags", skip });
  const pdf = await htmlToPdf(html, { format: "A4", margin: "10mm" });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="asset-tags.pdf"', "Cache-Control": "no-store" } });
}
