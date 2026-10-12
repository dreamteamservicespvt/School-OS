// The ready Excel sheet for one import, made for this school (workflow 15, step 2).
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { importKind } from "@/lib/importer";
import { kindInfo, schoolLookups } from "@/lib/move-in/service";
import { templateWorkbook } from "@/lib/move-in/template";
import { ensureHrDefaults } from "@/lib/staff/settings";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (!can(current.permissions, "settings", "view")) return new Response("Your role does not allow this. Ask your School Admin.", { status: 403 });
  const key = (await params).kind;
  const kind = kindInfo(key) ? importKind(key) : null;
  if (!kind) return new Response("This import is not known.", { status: 404 });
  const lookups = await withSchool(current.ctx, async (tx) => {
    if (key === "staff") await ensureHrDefaults(tx, current.ctx);
    return schoolLookups(tx, current.ctx);
  });
  const body = await templateWorkbook(kind, lookups, current.school.name);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${kind.key}-for-school-os.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
