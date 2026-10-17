// Downloads for a module's own import page: the ready Excel sheet made for
// this school (its fee heads, payment modes or expense heads in drop-downs),
// and the rows an import left out with their problems. Checked on the server
// like the import itself.
import "server-only";

import { withSchool } from "../db";
import { schoolLookups } from "../move-in/service";
import { templateWorkbook } from "../move-in/template";
import { moduleErrorsCsv, routeModuleImport } from "./module-import";

const kindFrom = (req: Request, fallback: string) => new URL(req.url).searchParams.get("kind") || fallback;

export async function moduleTemplateResponse(req: Request, fallback: string, allowed: string[]) {
  const key = kindFrom(req, fallback);
  if (!allowed.includes(key)) return new Response("This import is not known.", { status: 404 });
  const x = await routeModuleImport(key);
  if (x instanceof Response) return x;
  const lookups = await withSchool(x.current.ctx, (tx) => schoolLookups(tx, x.current.ctx));
  const body = await templateWorkbook(x.kind, lookups, x.current.school.name);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${x.key}-for-school-os.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function moduleErrorsResponse(req: Request, batchId: string, fallback: string, allowed: string[]) {
  const key = kindFrom(req, fallback);
  if (!allowed.includes(key)) return new Response("This import was not found.", { status: 404 });
  const x = await routeModuleImport(key);
  if (x instanceof Response) return x;
  const csv = await withSchool(x.current.ctx, (tx) => moduleErrorsCsv(tx, x.key, batchId));
  if (csv === null) return new Response("This import was not found.", { status: 404 });
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${x.key}-rows-with-problems.csv"`, "Cache-Control": "no-store" },
  });
}
