// The ready Excel sheet for past expenses, with this school's expense heads.
import { moduleTemplateResponse } from "@/lib/imports/module-routes";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return moduleTemplateResponse(req, "finance-past-expenses", ["finance-past-expenses"]);
}
