import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { checkFileLink } from "@/lib/files";
import { fileStore } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Opens one private file through a signed link that expires in 15 minutes
 * (08-platform-security.md §8). The link is made only for someone allowed to
 * see the file, and it works only for a person signed in to that school.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const schoolId = url.searchParams.get("s") ?? "";
  const check = checkFileLink(id, schoolId, url.searchParams.get("e") ?? "", url.searchParams.get("t") ?? "");
  if (!check.ok) {
    return new Response(check.reason === "expired" ? "This file link has expired. Go back and open the file again." : "This file link is not valid.", { status: check.reason === "expired" ? 410 : 403 });
  }
  const current = await getCurrent();
  if (!current || current.ctx.schoolId !== schoolId) return new Response("Sign in to the school to open this file.", { status: 401 });
  const file = await withSchool(current.ctx, (tx) => tx.storedFile.findFirst({ where: { id, archivedAt: null } }));
  if (!file) return new Response("This file was not found.", { status: 404 });
  const body = await fileStore().get(file.storageKey);
  if (!body) return new Response("This file is missing from storage.", { status: 404 });
  const download = url.searchParams.get("download") === "1";
  const safeName = file.fileName.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      // Uploaded files never run scripts. (PDFs are left to the browser's own viewer.)
      ...(file.contentType === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}
