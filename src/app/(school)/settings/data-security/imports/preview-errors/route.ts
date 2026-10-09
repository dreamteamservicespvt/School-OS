// The rows with problems from the preview, before anything is imported.
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { errorCsv, importKind, previewImport } from "@/lib/importer";
import { matchFromParams, readUploaded } from "@/lib/data-security/imports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (!can(current.permissions, "settings", "create")) return new Response("Your role does not allow this. Ask your School Admin.", { status: 403 });
  const url = new URL(request.url);
  const kind = importKind(url.searchParams.get("kind") ?? "");
  const fileId = url.searchParams.get("file") ?? "";
  if (!kind || !/^[0-9a-f-]{36}$/i.test(fileId)) return new Response("This import was not found.", { status: 404 });
  const csv = await withSchool(current.ctx, async (tx) => {
    const uploaded = await readUploaded(tx, fileId);
    if (!uploaded) return null;
    const match = matchFromParams(Object.fromEntries(url.searchParams), kind.columns.map((c) => c.key), uploaded.sheet.headers.length);
    const preview = await previewImport(tx, current.ctx, kind, uploaded.sheet.rows, match);
    return errorCsv(kind, preview.bad);
  }, { timeout: 60_000 });
  if (csv === null) return new Response("The uploaded file was not found. Upload it again.", { status: 404 });
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind.key}-rows-with-problems.csv"`, "Cache-Control": "no-store" },
  });
}
