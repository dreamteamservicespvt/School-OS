// The rows of a file that still have problems, with the problem beside each,
// to fix in Excel and bring in again (P10, step 5).
import { PLACES } from "@/lib/imports/places";
import { placeProblemsResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return placeProblemsResponse(PLACES.settings, (await params).id);
}
