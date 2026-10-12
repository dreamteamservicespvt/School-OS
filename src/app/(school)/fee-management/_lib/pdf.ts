// A fee document (receipt, tax invoice, fee invoice, fee certificate) as a PDF,
// opened in the browser to print, or downloaded with ?download=1.
import "server-only";

import { requireAction } from "@/lib/current";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { logExport } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { canSeeStudent, feePageAllowed, feeViewer } from "@/lib/fees/access";
import { MoneyProblem } from "@/lib/fees/problem";
import { UUID_RE } from "@/lib/fees/act";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

type Doc = { fileName: string; pdf: () => Promise<Buffer | Uint8Array>; studentId: string; title: string };

export async function feePdf(req: Request, id: string, render: (tx: Tx, ctx: SchoolContext) => Promise<Doc>) {
  let current;
  try {
    ({ current } = await requireAction("fee-management", "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return text("You do not have permission to print fee documents.", 403);
    throw e;
  }
  if (!UUID_RE.test(id)) return text("This document was not found.", 404);
  const download = new URL(req.url).searchParams.get("download") === "1";
  try {
    return await withSchool(current.ctx, async (tx) => {
      const viewer = await feeViewer(tx, current.ctx, current);
      if (!feePageAllowed(viewer, "documents")) return text("Your role cannot see fee documents.", 403);
      const doc = await render(tx, current.ctx);
      if (!(await canSeeStudent(tx, viewer, doc.studentId))) return text("This document was not found.", 404);
      const pdf = await doc.pdf();
      await logExport(tx, current.ctx, { title: doc.title, format: "pdf", filters: "", rows: 1 });
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.fileName}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }, { timeout: 60_000 });
  } catch (e) {
    if (e instanceof MoneyProblem) return text(e.message, 404);
    throw e;
  }
}
