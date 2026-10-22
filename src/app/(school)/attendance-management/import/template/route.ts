// The ready Excel sheet for attendance so far, made for this school.
import { PLACES } from "@/lib/imports/places";
import { kindParam, placeTemplateResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return placeTemplateResponse(PLACES["attendance"], kindParam(req, PLACES["attendance"]));
}
