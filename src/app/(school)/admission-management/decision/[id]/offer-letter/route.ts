// The admission offer letter as a PDF, in the school's "Admission offer
// letter" design (Settings, Document Designs). Only after it is recorded as
// sent, so every printed letter has its number.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { renderDocument } from "@/lib/documents";
import { formatDate } from "@/lib/format";
import { logExport } from "@/lib/exports";
import { viewerFor } from "@/lib/admission/access";
import { UUID_RE } from "@/lib/admission/act";
import { parentName } from "@/lib/admission/applications";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const ACCEPT_DAYS = 7;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current } = await requireAction("admission-management", "print");
  if (!UUID_RE.test(id)) return text("This offer letter was not found.", 404);
  return withSchool(current.ctx, async (tx) => {
    const v = await viewerFor(tx, current.ctx, current);
    if (v.see !== "all") return text("Only the admission team can print offer letters.", 403);
    const app = await tx.application.findFirst({ where: { id, archivedAt: null } });
    if (!app || !app.offerLetterNo || !app.offerSentAt) return text("There is no offer letter yet. Record it as sent on Admission Decision first.", 404);
    const [cls, year] = await Promise.all([
      tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } }),
      tx.academicYear.findUnique({ where: { id: app.academicYearId }, select: { name: true } }),
    ]);
    const tz = current.school.timeZone;
    const doc = await renderDocument(tx, current.ctx, "admission-offer-letter", {
      fields: {
        letter_no: app.offerLetterNo, student_name: app.fullName, application_no: app.applicationNo, class_name: cls?.name ?? "", academic_year: year?.name ?? "",
        parent_name: parentName(app), address: app.address ?? "", accept_by: formatDate(new Date(app.offerSentAt.getTime() + ACCEPT_DAYS * 86_400_000), tz), today: formatDate(app.offerSentAt, tz),
      },
      campusId: app.campusId,
    });
    await logExport(tx, current.ctx, { title: `Offer letter ${app.offerLetterNo}`, format: "pdf", filters: app.applicationNo, rows: 1 });
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="offer-${app.offerLetterNo.replace(/\//g, "-")}.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
