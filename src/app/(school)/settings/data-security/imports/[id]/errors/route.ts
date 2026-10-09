// The rows an import left out, with their problems, to fix and import again.
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { errorCsv, importKind } from "@/lib/importer";
import "@/lib/import-registry";

export const dynamic = "force-dynamic";

type Bad = { line: number; row: Record<string, string>; problems: string[] };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (!can(current.permissions, "settings", "view")) return new Response("Your role does not allow this. Ask your School Admin.", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("This import was not found.", { status: 404 });
  const batch = await withSchool(current.ctx, (tx) => tx.importBatch.findUnique({ where: { id } }));
  if (!batch) return new Response("This import was not found.", { status: 404 });
  const kind = importKind(batch.kind);
  const bad = (batch.errorReport ?? []) as Bad[];
  const columns = kind?.columns ?? [...new Set(bad.flatMap((b) => Object.keys(b.row)))].map((k) => ({ key: k, label: k }));
  return new Response(errorCsv({ columns }, bad), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${batch.kind}-rows-with-problems.csv"`, "Cache-Control": "no-store" },
  });
}
