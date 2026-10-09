// Download of a full data export. Only the person who asked may download it,
// and only for 24 hours after it is ready. Every download is in the audit log.
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { fileStore } from "@/lib/storage";
import { exportExpired, EXPORT_LINK_HOURS } from "@/lib/data-security/data-export";

export const dynamic = "force-dynamic";

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrent();
  if (!current) return plain("Sign in first.", 401);
  if (!can(current.permissions, "settings", "export")) return plain("Your role does not allow this. Ask your School Admin.", 403);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return plain("This export was not found.", 404);
  const found = await withSchool(current.ctx, async (tx) => {
    const row = await tx.dataExport.findUnique({ where: { id } });
    if (!row || row.requestedById !== current.user.id) return { problem: "This export was not found. Only the person who asked for an export can download it." as const, status: 404 };
    if (row.status !== "ready" || !row.fileId) return { problem: "This export is still being prepared. You will get a notification when it is ready.", status: 409 };
    if (exportExpired(row.readyAt)) return { problem: `This link has expired. Download links work for ${EXPORT_LINK_HOURS} hours. Ask for a new export on the Data Backup & Security page.`, status: 410 };
    const file = await tx.storedFile.findUnique({ where: { id: row.fileId } });
    if (!file) return { problem: "The export file was not found. Ask for a new export.", status: 404 };
    await writeAudit(tx, current.ctx, { action: "data-export-downloaded", recordType: "Data Export", recordId: row.id, after: { sizeBytes: file.sizeBytes } });
    return { file };
  });
  if ("problem" in found) return plain(found.problem ?? "", found.status ?? 400);
  const body = await fileStore().get(found.file.storageKey);
  if (!body) return plain("The export file could not be read. Ask for a new export.", 404);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${found.file.fileName.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
