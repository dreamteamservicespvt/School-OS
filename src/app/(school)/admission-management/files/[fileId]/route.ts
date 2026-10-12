// Opens an admission paper only for the admission team (full reach), and only
// a file that belongs to an application of this school (08-platform-security.md §8).
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { fileStore } from "@/lib/storage";
import { viewerFor } from "@/lib/admission/access";
import { UUID_RE } from "@/lib/admission/act";

const notFound = () => new Response("This file was not found, or you cannot open it.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!UUID_RE.test(fileId)) return notFound();
  const current = await requireCurrent();
  if (current.permissions["admission-management"].see !== "all") return notFound();
  const found = await withSchool(current.ctx, async (tx) => {
    const v = await viewerFor(tx, current.ctx, current);
    if (v.see !== "all") return null;
    const doc = await tx.applicationDocument.findFirst({ where: { fileId }, select: { id: true } });
    if (!doc) return null;
    return tx.storedFile.findFirst({ where: { id: fileId, archivedAt: null } });
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
