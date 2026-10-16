// Opens a report prepared in the background (the link in the person's
// notification). Only the person who asked for it may open it, and only while
// their role still allows the report.
import { NextResponse } from "next/server";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { PermissionDeniedError } from "@/lib/permissions";
import { reportAccess, BASE } from "@/lib/reports/access";
import { entryAllowed, findEntry } from "@/lib/reports/catalogue";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return plain("This report was not found.", 404);
  let current;
  try {
    ({ current } = await requireAction("reports-analytics", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain(e.message, 403);
    throw e;
  }
  const run = await withSchool(current.ctx, (tx) => tx.reportRun.findFirst({ where: { id, userId: current.user.id } }));
  if (!run) return plain("This report was not found. It may have been made for someone else.", 404);
  const entry = findEntry(run.key);
  if (!entry || !entryAllowed(entry, reportAccess(current), current)) return plain("Your role no longer allows this report.", 403);
  if (run.status !== "READY" || !run.fileId) return NextResponse.redirect(new URL(`${BASE}/r/${run.key}?run=${run.id}`, req.url));
  return NextResponse.redirect(new URL(fileLink(run.fileId, current.ctx.schoolId), req.url));
}
