// Opens a report cards PDF made in the background. Checks the person may
// still print report cards, then sends them to a short-lived file link.
import { NextResponse } from "next/server";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { PermissionDeniedError, reachFor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return plain("This file was not found.", 404);
  let current;
  try { ({ current } = await requireAction("examination-results", "print")); } catch (e) {
    if (e instanceof PermissionDeniedError) return plain(e.message, 403);
    throw e;
  }
  const file = await withSchool(current.ctx, (tx) => tx.storedFile.findFirst({ where: { id: fileId, purpose: "report-cards" }, select: { id: true, uploadedById: true } }));
  if (!file) return plain("This file was not found. It may belong to another school or have been removed.", 404);
  if (file.uploadedById && file.uploadedById !== current.user.id && reachFor(current.permissions, "examination-results", "print") !== "all") {
    return plain("This PDF was made for someone else. Make your own from the Report Cards page.", 403);
  }
  return NextResponse.redirect(new URL(fileLink(file.id, current.ctx.schoolId), req.url));
}
