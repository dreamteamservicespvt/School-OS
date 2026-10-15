// The rooms import template: the columns, with an example row.
import { importKind, templateCsv } from "@/lib/importer";
import { ROOMS_IMPORT } from "@/lib/hostel/import";
import { hostelRoute, plain } from "../../../_lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await hostelRoute(req, "rooms", "create");
  if (x instanceof Response) return x;
  if (!x.can.rooms) return plain("Only the people who add rooms import them.", 403);
  return new Response(templateCsv(importKind(ROOMS_IMPORT)!), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hostel-rooms-template.csv"', "Cache-Control": "no-store" },
  });
}
