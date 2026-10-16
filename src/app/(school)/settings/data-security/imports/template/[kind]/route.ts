import { getCurrent } from "@/lib/current";
import { can } from "@/lib/permissions";
import { importKind, templateCsv } from "@/lib/importer";
import "@/lib/import-registry";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (!can(current.permissions, "settings", "view")) return new Response("Your role does not allow this. Ask your School Admin.", { status: 403 });
  const kind = importKind((await params).kind);
  if (!kind) return new Response("This import is not known.", { status: 404 });
  return new Response(templateCsv(kind), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind.key}-template.csv"`, "Cache-Control": "no-store" },
  });
}
