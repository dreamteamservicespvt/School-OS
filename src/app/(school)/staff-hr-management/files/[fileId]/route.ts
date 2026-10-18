// Opens a Staff & HR file (photo, document, leave note, letter) only for
// people allowed to see the record it belongs to (08-platform-security.md §8).
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { fileStore } from "@/lib/storage";
import { canOpenStaff, viewerFor } from "@/lib/staff/access";
import { UUID_RE } from "@/lib/staff/act";

const notFound = () => new Response("This file was not found, or you cannot open it.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!UUID_RE.test(fileId)) return notFound();
  const current = await requireCurrent();
  if (current.permissions["staff-hr-management"].see === "none") return notFound();
  const found = await withSchool(current.ctx, async (tx) => {
    const file = await tx.storedFile.findFirst({ where: { id: fileId, archivedAt: null } });
    if (!file) return null;
    const v = await viewerFor(tx, current.ctx, current);
    const hr = v.see === "all";
    const staffWith = async (staffId: string | null | undefined) => Boolean(staffId) && canOpenStaff(v, staffId!);
    let ok = false;
    const photo = await tx.staff.findFirst({ where: { photoFileId: fileId }, select: { id: true } });
    if (photo) ok = hr || (await staffWith(photo.id)) || current.permissions["staff-hr-management"].see !== "none";
    if (!ok) {
      const doc = await tx.staffDocument.findFirst({ where: { fileId }, select: { staffId: true } });
      if (doc) ok = await staffWith(doc.staffId);
    }
    if (!ok) {
      const leave = await tx.leaveRequest.findFirst({ where: { documentFileId: fileId }, select: { staffId: true, approvalId: true } });
      if (leave) {
        const approval = leave.approvalId ? await tx.approval.findUnique({ where: { id: leave.approvalId }, select: { currentApproverId: true, decidedById: true } }) : null;
        ok = (await staffWith(leave.staffId)) || approval?.currentApproverId === current.user.id || approval?.decidedById === current.user.id;
      }
    }
    if (!ok) {
      const training = await tx.trainingRecord.findFirst({ where: { certificateFileId: fileId }, select: { staffId: true } });
      if (training) ok = await staffWith(training.staffId);
    }
    if (!ok && hr) {
      // An exit letter opens with the record of the person leaving (one campus: their campus only); a resume is school-wide recruitment.
      const exit = await tx.exitCase.findFirst({ where: { letterFileId: fileId }, select: { staffId: true } });
      ok = exit ? await staffWith(exit.staffId) : Boolean(await tx.jobApplication.findFirst({ where: { resumeFileId: fileId }, select: { id: true } }));
    }
    return ok ? file : null;
  });
  if (!found) return notFound();
  const body = await fileStore().get(found.storageKey);
  if (!body) return notFound();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": found.contentType,
      "Content-Disposition": `inline; filename="${found.fileName.replace(/[^\w.\- ]+/g, "_")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
