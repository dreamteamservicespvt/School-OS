// Bus passes as a print-ready PDF (12 §2 Student Transport: "print a bus pass
// with route, stop and photo"), in the school's Bus pass design. Only for
// people who see Student Transport, checked on the server.
import { withSchool } from "@/lib/db";
import { logExport } from "@/lib/exports";
import { htmlToPdf } from "@/lib/pdf";
import { PermissionDeniedError } from "@/lib/permissions";
import { trPerson, TransportProblem, UUID_RE } from "@/lib/transport/act";
import { busPasses } from "@/lib/transport/pass";

export const dynamic = "force-dynamic";

const plain = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  let who;
  try {
    who = await trPerson("print");
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to print bus passes.", 403);
    if (e instanceof TransportProblem) return plain(e.message, 403);
    throw e;
  }
  if (who.v.pages.students === "hidden") return plain("You do not have permission to print bus passes.", 403);
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => UUID_RE.test(x)).slice(0, 200);
  if (!ids.length) return plain("Choose the students to print bus passes for.", 400);
  let out;
  try {
    out = await withSchool(who.current.ctx, async (tx) => {
      const r = await busPasses(tx, who.current.ctx, ids);
      await logExport(tx, who.current.ctx, { title: "Bus passes", format: "pdf", filters: r.count === 1 ? String(r.first.student_name) : `${r.count} students`, rows: r.count });
      return r;
    }, { timeout: 120_000 });
  } catch (e) {
    if (e instanceof TransportProblem) return plain(e.message, 409);
    throw e;
  }
  const pdf = await htmlToPdf(out.html, { format: "A4", margin: "10mm" });
  const name = out.count === 1 ? `bus-pass-${String(out.first.bus_pass_no).replace(/[^\w-]+/g, "-")}` : `bus-passes-${out.count}`;
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
}
