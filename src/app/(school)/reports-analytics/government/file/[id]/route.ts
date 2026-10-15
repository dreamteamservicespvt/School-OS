// Downloads a past government export again: the same file as was made then.
import { NextResponse } from "next/server";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { PermissionDeniedError } from "@/lib/permissions";
import { reportAccess } from "@/lib/reports/access";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return plain("This export was not found.", 404);
  let current;
  try {
    ({ current } = await requireAction("reports-analytics", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain(e.message, 403);
    throw e;
  }
  if (!reportAccess(current).pages.government) return plain("Government Reports are not open to your role.", 403);
  const g = await withSchool(current.ctx, (tx) => tx.governmentExport.findFirst({ where: { id }, select: { fileId: true, problemFileId: true } }));
  const which = new URL(req.url).searchParams.get("which") === "problems" ? g?.problemFileId : g?.fileId;
  if (!which) return plain("This export was not found. It may belong to another school.", 404);
  return NextResponse.redirect(new URL(fileLink(which, current.ctx.schoolId), req.url));
}
