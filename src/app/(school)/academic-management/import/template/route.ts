// The ready Excel sheet for Teacher Allocation, the Time Table or the syllabus, made for this school.
import { PLACES } from "@/lib/imports/places";
import { kindParam, placeTemplateResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return placeTemplateResponse(PLACES["academic"], kindParam(req, PLACES["academic"]));
}
