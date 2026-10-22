// The rows an import left out, with their problems, to fix and import again.
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { errorCsv, importKind } from "@/lib/importer";
import { mayImport } from "@/lib/move-in/service";
import { OWN_RULES, PLACES } from "@/lib/imports/places";
import { placeRefusal } from "@/lib/imports/place-access";
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
  // The rows are for people who may bring that kind of record in, in its own module (salary details, for example).
  if (!mayImport(current.permissions, batch.kind, "create", current.modulesOn)) return new Response("Your role does not allow this. Ask your School Admin.", { status: 403 });
  // Kinds with a narrower rule on their own page (pay details, for example) keep it here.
  if (Object.hasOwn(OWN_RULES, batch.kind)) {
    const why = await placeRefusal(current, PLACES.settings, batch.kind, "create");
    if (why) return new Response(why, { status: 403 });
  }
  const kind = importKind(batch.kind);
  const bad = (batch.errorReport ?? []) as Bad[];
  const columns = kind?.columns ?? [...new Set(bad.flatMap((b) => Object.keys(b.row)))].map((k) => ({ key: k, label: k }));
  return new Response(errorCsv({ columns }, bad), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${batch.kind}-rows-with-problems.csv"`, "Cache-Control": "no-store" },
  });
}
