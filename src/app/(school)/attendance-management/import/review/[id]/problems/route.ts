// The rows of a file of attendance so far that still have problems, with the problem beside each.
import { PLACES } from "@/lib/imports/places";
import { placeProblemsResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return placeProblemsResponse(PLACES["attendance"], (await params).id);
}
