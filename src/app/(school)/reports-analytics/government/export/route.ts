// Makes one government return's file after a fresh data check (19 §2). With
// problems it needs "Export anyway", and the problems go in a separate file.
// The file is kept, logged in the export log and audited.
import { NextResponse } from "next/server";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { exportResponse } from "@/lib/exports";
import { can, PermissionDeniedError } from "@/lib/permissions";
import { reportAccess, BASE } from "@/lib/reports/access";
import { checkReturn, exportReturn, govChoice, GovProblem } from "@/lib/reports/government";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function POST(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("reports-analytics", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to export government returns.", 403);
    throw e;
  }
  if (!reportAccess(current).pages.government || !can(current.permissions, "reports-analytics", "create")) return plain("Government Reports are not open to your role.", 403);
  const fd = await req.formData();
  const sp: Record<string, string> = {};
  for (const k of ["return", "version", "year", "campus", "anyway"]) { const v = fd.get(k); if (typeof v === "string") sp[k] = v.slice(0, 64); }
  try {
    const out = await withSchool(current.ctx, async (tx) => {
      const c = await govChoice(tx, current.ctx, sp, current.campusId ?? null);
      if (!c.year) throw new GovProblem("Set up the academic year first.");
      const check = await checkReturn(tx, current.ctx, c.ret, c.version, c.year, c.campus);
      if (check.problems.length && sp.anyway !== "1") return { back: c.ret.key };
      const r = await exportReturn(tx, current.ctx, check, { anyway: sp.anyway === "1", exportedBy: current.user.displayName, timeZone: current.school.timeZone, schoolName: current.school.name });
      return { file: r.file };
    }, { timeout: 120_000 });
    if ("back" in out) return NextResponse.redirect(new URL(`${BASE}/government?return=${out.back}&check=1`, req.url), 303);
    return exportResponse(out.file!);
  } catch (e) {
    if (e instanceof GovProblem) return plain(e.message, 400);
    throw e;
  }
}
