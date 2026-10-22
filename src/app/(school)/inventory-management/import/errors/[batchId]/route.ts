// The rows an import of items or assets left out, with their problems, to fix and bring in again.
import { PLACES } from "@/lib/imports/places";
import { placeErrorsResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const kind = new URL(req.url).searchParams.get("kind") === "inventory-assets" ? "inventory-assets" : "inventory-items";
  return placeErrorsResponse(PLACES[kind], (await params).batchId);
}
