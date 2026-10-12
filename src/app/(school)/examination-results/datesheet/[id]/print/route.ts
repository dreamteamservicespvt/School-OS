// The datesheet as a PDF to print or share: one table per class, papers in
// date and time order.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { esc, htmlToPdf } from "@/lib/pdf";
import { examDetail } from "@/lib/exams/datesheet";
import { examScope } from "@/lib/exams/scope";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return plain("This datesheet was not found.", 404);
  let current;
  try { ({ current } = await requireAction("examination-results", "print")); } catch (e) {
    if (e instanceof PermissionDeniedError) return plain(e.message, 403);
    throw e;
  }
  const out = await withSchool(current.ctx, async (tx) => {
    const d = await examDetail(tx, id);
    if (!d) return null;
    const scope = await examScope(tx, current, d.exam.academicYearId);
    if (scope.sectionIds) {
      const mine = await tx.section.findMany({ where: { id: { in: scope.sectionIds } }, select: { classId: true } });
      if (!d.exam.classIds.some((c) => mine.some((m) => m.classId === c))) return null;
    }
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { name: true } });
    await writeAudit(tx, current.ctx, { action: "printed", recordType: "Exam", recordId: id, after: { what: "datesheet" } });
    return { d, school };
  });
  if (!out) return plain("This datesheet was not found.", 404);
  const { d, school } = out;
  const tables = d.classes.map((c) => {
    const rows = d.entries.filter((e) => e.classId === c.id);
    if (!rows.length) return "";
    return `<h2>${esc(c.name)}</h2><table><thead><tr><th>Date</th><th>Day</th><th>Time</th><th>Subject</th><th>Max marks</th><th>Room</th></tr></thead><tbody>${rows.map((e) => `<tr><td>${formatDate(e.date)}</td><td>${esc(e.day)}</td><td>${esc(e.time)}</td><td>${esc(e.subjectName)}${e.categories.length ? `<br><small>${esc(e.categories.map((x) => `${x.name} ${x.max}`).join(", "))}</small>` : ""}</td><td>${e.gradeOnly ? "Graded" : e.maxMarks}</td><td>${esc(e.room ?? "")}</td></tr>`).join("")}</tbody></table>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,"Noto Sans",sans-serif;font-size:10.5pt;color:#111}h1{font-size:16pt;text-align:center;margin:0}
    .sub{text-align:center;margin:1mm 0 5mm;color:#333}h2{font-size:12pt;margin:5mm 0 2mm;page-break-after:avoid}
    table{width:100%;border-collapse:collapse;page-break-inside:auto}th,td{border:1px solid #999;padding:1.8mm 2.5mm;text-align:left}th{background:#eef2ff}small{color:#444}
  </style></head><body><h1>${esc(school.name)}</h1><p class="sub"><strong>${esc(d.exam.title)}</strong> · ${esc(d.termName)} · ${formatDate(d.exam.startDate)} to ${formatDate(d.exam.endDate)}</p>${tables}</body></html>`;
  try {
    const pdf = await htmlToPdf(html, { format: "A4", margin: "12mm" });
    const name = `datesheet-${d.exam.title}`.replace(/[^\w-]+/g, "-").toLowerCase();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "datesheet-pdf", error: e instanceof Error ? e.message : String(e) }));
    return plain("The PDF could not be made right now. Please try again in a minute.", 503);
  }
}
