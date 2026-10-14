// A visitor pass as a PDF in the school's "Visitor pass" design (Settings,
// Document Designs), with the visitor's photo and a QR that opens the pass
// check. Only for people who register visitors, and only for a pass still open.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { renderDocument } from "@/lib/documents";
import { logExport } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { appOrigin } from "@/lib/origin";
import { PermissionDeniedError } from "@/lib/permissions";
import { foCan, foViewer, visitorScope } from "@/lib/front-office/access";
import { clockAt, todayDate } from "@/lib/front-office/time";
import { BASE, showPhone } from "@/lib/front-office/words";
import { UUID_RE } from "@/lib/front-office/act";
import { plain } from "../../../_lib/export";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let current;
  try {
    ({ current } = await requireAction("front-office", "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to print visitor passes.", 403);
    throw e;
  }
  const v = foViewer(current);
  if (!foCan(v).register) return plain("Only the reception desk and the gate print visitor passes.", 403);
  if (!UUID_RE.test(id)) return plain("This visitor pass was not found.", 404);
  const tz = current.school.timeZone;
  const origin = await appOrigin();
  return withSchool(current.ctx, async (tx) => {
    const visit = await tx.visitorEntry.findFirst({ where: { id, archivedAt: null, ...visitorScope(v, todayDate(tz)) } });
    if (!visit) return plain("This visitor pass was not found.", 404);
    if (visit.timeOut) return plain(`Pass ${visit.passNo} was closed at check-out. Register the visitor again for a new pass.`, 410);
    const met = visit.meetStaffId ? await tx.staff.findFirst({ where: { id: visit.meetStaffId }, select: { fullName: true } }) : null;
    const doc = await renderDocument(tx, current.ctx, "visitor-pass", {
      fields: {
        visitor_name: visit.name, pass_no: visit.passNo, purpose: visit.purpose, to_meet: met?.fullName ?? "",
        visit_date: formatDate(visit.visitDate, "UTC"), time_in: clockAt(visit.timeIn, tz), visitor_phone: showPhone(visit.phone),
      },
      photoFileId: visit.photoFileId,
      verifyText: `${origin}${BASE}/visitors?check=${visit.passNo}`,
    });
    await logExport(tx, current.ctx, { title: `Visitor pass ${visit.passNo}`, format: "pdf", filters: visit.name, rows: 1 });
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="visitor-pass-${visit.passNo}.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
