// The ready Excel sheet for one import (the same as Switching to School OS gives).
import { PLACES } from "@/lib/imports/places";
import { placeTemplateResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  return placeTemplateResponse(PLACES.settings, (await params).kind);
}
