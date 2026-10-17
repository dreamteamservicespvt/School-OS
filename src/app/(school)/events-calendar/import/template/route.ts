// The ready Excel sheet for the holiday list.
import { moduleTemplateResponse } from "@/lib/imports/module-routes";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return moduleTemplateResponse(req, "calendar-holidays", ["calendar-holidays"]);
}
