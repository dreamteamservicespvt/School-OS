// The ready Excel sheet for one import, made for this school (workflow 15, step 2).
import { PLACES } from "@/lib/imports/places";
import { placeTemplateResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  return placeTemplateResponse(PLACES.settings, (await params).kind);
}
