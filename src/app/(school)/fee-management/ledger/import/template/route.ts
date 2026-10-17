// The ready Excel sheet for old dues or past receipts, made for this school.
import { moduleTemplateResponse } from "@/lib/imports/module-routes";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return moduleTemplateResponse(req, "fee-old-dues", ["fee-old-dues", "fee-past-receipts"]);
}
