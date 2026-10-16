// The rows of a file that still have problems, with the problem beside each,
// to fix in Excel and bring in again (P10, step 6).
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { MoveInProblem, canBring, workOn } from "@/lib/move-in/service";
import { safeCell } from "@/lib/move-in/prepare";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (!can(current.permissions, "settings", "view")) return new Response("Your role does not allow this. Ask your School Admin.", { status: 403 });
  const { id } = await params;
  try {
    const csv = await withSchool(current.ctx, async (tx) => {
      const w = await workOn(tx, current.ctx, id, { check: true });
      if (!canBring(current.permissions, w.kind.key)) throw new MoveInProblem("Your role cannot see these rows.");
      const header = ["Row", ...w.kind.columns.map((c) => c.label), "Problems"].map(safeCell).join(",");
      const lines = w.checked!.problems.map((p) => [String(p.line), ...w.kind.columns.map((c) => p.values[c.key] ?? ""), p.problems.join(" ")].map(safeCell).join(","));
      return { text: "﻿" + [header, ...lines].join("\r\n") + "\r\n", name: w.file.fileName.replace(/\.[^.]+$/, "") };
    }, { timeout: 120_000 });
    return new Response(csv.text, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${csv.name.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 60) || "file"}-rows-with-problems.csv"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof MoveInProblem) return new Response(e.message, { status: 404 });
    throw e;
  }
}
