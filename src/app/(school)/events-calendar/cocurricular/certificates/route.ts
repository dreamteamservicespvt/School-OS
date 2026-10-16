// Participation and achievement certificates as a PDF, in the school's designs
// (Settings, Document Designs). Only certificates already issued print; when
// both kinds are ticked, a small page offers each kind's PDF.
import { requireAction } from "@/lib/current";
import { PermissionDeniedError } from "@/lib/permissions";
import { withSchool } from "@/lib/db";
import { renderDocument } from "@/lib/documents";
import { logExport } from "@/lib/exports";
import { evCan, evViewer } from "@/lib/events/access";
import { certificateKind } from "@/lib/events/cocurricular";
import { dmy, isoOf } from "@/lib/events/words";
import { plain } from "../../_lib/export";
import { achievementList } from "../../_lib/co";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("events-calendar", "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to print certificates.", 403);
    throw e;
  }
  if (!evCan(evViewer(current)).cocurricular) return plain("You do not have permission to print certificates.", 403);
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 300);
  const kindWanted = url.searchParams.get("kind");
  if (!ids.length) return plain("Tick the achievements to print.", 400);
  return withSchool(current.ctx, async (tx) => {
    const all = (await achievementList(tx, null, { ids })).filter((a) => a.certificateNo);
    if (!all.length) return plain("None of these has a certificate yet. Issue the certificates first.", 404);
    const kinds = [...new Set(all.map((a) => certificateKind(a)))];
    if (kinds.length > 1 && !kinds.includes(kindWanted as never)) {
      const link = (k: string, label: string) => `<li><a href="?ids=${ids.join(",")}&kind=${k}">${esc(label)} (${all.filter((a) => certificateKind(a) === k).length})</a></li>`;
      return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Print certificates</title><body style="font:16px system-ui;padding:24px;max-width:520px;margin:auto"><h1 style="font-size:20px">Print certificates</h1><p>The ticked achievements need two designs. Open each:</p><ul style="line-height:2">${link("achievement-certificate", "Achievement certificates")}${link("participation-certificate", "Participation certificates")}</ul></body>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    const kind = kinds.length > 1 ? (kindWanted as string) : kinds[0];
    const rows = all.filter((a) => certificateKind(a) === kind);
    const doc = await renderDocument(tx, current.ctx, kind, rows.map((a) => ({
      fields: {
        certificate_no: a.certificateNo ?? "", student_name: a.student, admission_no: a.admissionNo, class_section: a.place ? `Class ${a.place}` : "",
        roll_no: a.rollNo ? String(a.rollNo) : "", activity: a.activity, level: a.level, position: a.position ?? "Winners", activity_date: dmy(isoOf(a.date)),
      },
    })));
    await logExport(tx, current.ctx, { title: kind === "achievement-certificate" ? "Achievement certificates" : "Participation certificates", format: "pdf", filters: `${rows.length} certificates`, rows: rows.length });
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${kind}s.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
