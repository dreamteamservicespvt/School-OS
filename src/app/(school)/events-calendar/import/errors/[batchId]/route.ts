// The rows a holiday list import left out, with their problems, to fix and import again.
import { moduleErrorsResponse } from "@/lib/imports/module-routes";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  return moduleErrorsResponse(req, (await params).batchId, "calendar-holidays", ["calendar-holidays"]);
}
