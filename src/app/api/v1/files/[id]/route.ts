// Opens one private file through a signed link that expires
// (08-platform-security.md §8). Any module shows photos and documents with
// fileLink() from src/lib/files.ts; this route checks the signature and the
// time, then sends the file from the school's private storage.
import { withSchool } from "@/lib/db";
import { checkFileLink } from "@/lib/files";
import { fileStore } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function problem(status: number, message: string) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/** A file name safe for the Content-Disposition header, with the full name for browsers that read filename*. */
function disposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_").slice(0, 150) || "file";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name.slice(0, 150))}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("s") ?? "";
  const expires = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!UUID.test(id) || !UUID.test(schoolId)) return problem(404, "This file was not found.");

  const check = checkFileLink(id, schoolId, expires, token);
  if (!check.ok) {
    return check.reason === "expired"
      ? problem(410, "This file link has expired. Go back to the page and open the file again to get a new link.")
      : problem(403, "This file link is not valid. Go back to the page and open the file again.");
  }

  const file = await withSchool({ schoolId, userId: null }, (tx) => tx.storedFile.findUnique({ where: { id } }));
  if (!file || file.archivedAt) return problem(404, "This file was not found. It may have been replaced or archived.");
  const body = await fileStore().get(file.storageKey);
  if (!body) return problem(404, "This file could not be found in storage. Upload it again.");

  const secondsLeft = Math.max(0, Math.floor((Number(expires) - Date.now()) / 1000));
  const download = url.searchParams.get("download") === "1";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(body.length),
      "Content-Disposition": disposition(download ? "attachment" : "inline", file.fileName),
      "Cache-Control": `private, max-age=${Math.min(secondsLeft, 900)}`,
      "X-Content-Type-Options": "nosniff",
      // Only checked photos, PDFs and sheets are stored (saveFile); none of them may run scripts.
      ...(file.contentType === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
      "Referrer-Policy": "no-referrer",
    },
  });
}
