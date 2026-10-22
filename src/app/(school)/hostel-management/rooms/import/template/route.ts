// The ready Excel sheet for rooms, made for this school.
import { PLACES } from "@/lib/imports/places";
import { kindParam, placeTemplateResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return placeTemplateResponse(PLACES["hostel"], kindParam(req, PLACES["hostel"]));
}
