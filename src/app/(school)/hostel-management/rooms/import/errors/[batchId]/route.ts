// The rows an import of rooms left out, with their problems, to fix and bring in again.
import { PLACES } from "@/lib/imports/places";
import { placeErrorsResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  return placeErrorsResponse(PLACES["hostel"], (await params).batchId);
}
