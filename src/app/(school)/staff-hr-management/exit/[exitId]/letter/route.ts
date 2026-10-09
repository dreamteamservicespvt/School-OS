// The experience letter as a PDF. The number is given the first time and kept, so a reprint shows the same number.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { logExport } from "@/lib/exports";
import { experienceLetterHtml } from "@/lib/staff/print";
import { ExitProblem, issueExperienceLetter } from "@/lib/staff/exit";
import { UUID_RE } from "@/lib/staff/act";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ exitId: string }> }) {
  const { exitId } = await params;
  const { current, reach } = await requireAction("staff-hr-management", "print");
  if (reach !== "all") return text("Only HR can print experience letters.", 403);
  if (!UUID_RE.test(exitId)) return text("This exit was not found.", 404);
  try {
    return await withSchool(current.ctx, async (tx) => {
      const number = await issueExperienceLetter(tx, current.ctx, exitId);
      const exit = await tx.exitCase.findUniqueOrThrow({ where: { id: exitId } });
      const staff = await tx.staff.findUniqueOrThrow({ where: { id: exit.staffId }, include: { department: true } });
      await logExport(tx, current.ctx, { title: `Experience letter ${number}`, format: "pdf", filters: staff.fullName, rows: 1 });
      const html = await experienceLetterHtml(tx, current.ctx, { staff, number, lastDay: exit.lastWorkingDay, issuedOn: exit.experienceLetterAt ?? new Date(), timeZone: current.school.timeZone });
      const pdf = await htmlToPdf(html);
      return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="experience-letter-${staff.staffCode}.pdf"`, "Cache-Control": "no-store" } });
    }, { timeout: 60_000 });
  } catch (e) {
    if (e instanceof ExitProblem) return text(e.message, 400);
    throw e;
  }
}
