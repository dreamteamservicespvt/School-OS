// QR poster as a PDF to print (05 §2 Devices & QR, P9).
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { appOrigin } from "@/lib/origin";
import { todayIn } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { attendanceAccess, campusOrSchool } from "@/lib/attendance/access";
import { attendanceSettings } from "@/lib/attendance/settings";
import { posterData, posterHtml } from "@/lib/attendance/poster";
import { writeAudit } from "@/lib/audit";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current } = await requireAction("attendance-management", "print");
  if (!UUID_RE.test(id)) return new Response("This QR was not found.", { status: 404 });
  const theme = new URL(req.url).searchParams.get("theme") ?? "ocean";
  const origin = await appOrigin();
  const today = todayIn(current.school.timeZone);
  const html = await withSchool(current.ctx, async (tx) => {
    const settings = await attendanceSettings(tx, current.ctx);
    const access = await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles);
    if (!access.admin) return null;
    const session = await tx.qrSession.findFirst({ where: { id, archivedAt: null, ...campusOrSchool(access) } });
    if (!session) return null;
    await writeAudit(tx, current.ctx, { action: "printed", recordType: "QR Session", recordId: session.id, after: { theme } });
    return posterHtml(await posterData(tx, current.ctx, session, origin, today), theme);
  });
  if (!html) return new Response("This QR was not found.", { status: 404 });
  const pdf = await htmlToPdf(html, { format: "A4", margin: "0mm" });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="qr-poster.pdf"`, "Cache-Control": "no-store" } });
}
