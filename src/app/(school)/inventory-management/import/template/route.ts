// The ready Excel sheet for items or assets, made for this school.
import { PLACES } from "@/lib/imports/places";
import { placeTemplateResponse } from "@/lib/imports/place-routes";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") === "inventory-assets" ? "inventory-assets" : "inventory-items";
  return placeTemplateResponse(PLACES[kind], kind);
}
