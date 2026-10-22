// The offer letter as a PDF, in the school's Offer letter design (Settings, Document Designs).
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { logExport } from "@/lib/exports";
import { offerLetter } from "@/lib/staff/print";
import { UUID_RE } from "@/lib/staff/act";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const { current, reach } = await requireAction("staff-hr-management", "print");
  if (reach !== "all") return text("Only HR can print offer letters.", 403);
  if (!UUID_RE.test(offerId)) return text("This offer was not found.", 404);
  return withSchool(current.ctx, async (tx) => {
    const offer = await tx.offer.findFirst({ where: { id: offerId }, include: { application: true } });
    if (!offer) return text("This offer was not found.", 404);
    const dept = offer.departmentId ? await tx.department.findUnique({ where: { id: offer.departmentId } }) : null;
    await logExport(tx, current.ctx, { title: `Offer letter ${offer.offerNo}`, format: "pdf", filters: offer.application.name, rows: 1 });
    const doc = await offerLetter(tx, current.ctx, {
      name: offer.application.name, offerNo: offer.offerNo, designation: offer.designation, department: dept?.name ?? null, joiningDate: offer.joiningDate,
      monthlyPaise: offer.monthlyPaise, respondBy: offer.respondBy, issuedOn: offer.createdAt, timeZone: current.school.timeZone,
    });
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="offer-${offer.offerNo.replace(/\//g, "-")}.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
