import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { PermissionDeniedError } from "@/lib/permissions";
import { currentYear } from "@/lib/academic/years";
import { getStudentSettings } from "@/lib/students/settings";
import { abilities, studentScope } from "@/lib/students/access";
import { idCardsHtml, recordBatch, sectionCards } from "@/lib/students/id-cards";
import { writeAudit } from "@/lib/audit";
import { StudentProblem } from "@/lib/students/students";

export const dynamic = "force-dynamic";

const isId = (v: string | null): v is string => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));
const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * ID cards as a print-ready PDF:
 * ?section=&batch= prints one batch of a class (up to 50) and records it;
 * ?ids= prints the chosen students (from the Student List or a profile);
 * ?replacement= reprints one replacement card.
 */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("student-management", "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return text("You do not have permission to print ID cards.", 403);
    throw e;
  }
  const url = new URL(req.url);
  const section = url.searchParams.get("section");
  const batch = Math.max(0, Number.parseInt(url.searchParams.get("batch") ?? "0", 10) || 0);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(isId).slice(0, 200);
  const replacement = url.searchParams.get("replacement");

  let out: { html: string; name: string } | { error: string; status: number };
  try {
    out = await withSchool(current.ctx, async (tx) => {
      const settings = await getStudentSettings(tx, current.ctx);
      const can = abilities(current, settings);
      if (can.reach !== "all" || can.lookupOnly) return { error: "You do not have permission to print ID cards.", status: 403 };
      const year = await currentYear(tx, current.ctx);

      if (isId(section)) {
        const { data, slice } = await recordBatch(tx, current.ctx, section, batch);
        const validUntil = settings.idCardValidUntil ?? data.section.academicYear.endDate;
        return { html: await idCardsHtml(tx, current.ctx, slice, { classLabel: data.label, yearName: data.section.academicYear.name, validUntil }), name: `id-cards-${data.label}-batch-${batch + 1}` };
      }

      if (isId(replacement)) {
        const card = await tx.idCardPrint.findFirst({ where: { id: replacement, isReplacement: true } });
        if (!card || !card.sectionId) return { error: "This replacement card was not found.", status: 404 };
        const data = await sectionCards(tx, card.sectionId);
        const s = data.students.find((x) => x.id === card.studentId);
        if (!s) return { error: "This student is no longer in the class.", status: 404 };
        return { html: await idCardsHtml(tx, current.ctx, [s], { classLabel: data.label, yearName: data.section.academicYear.name, validUntil: card.validUntil ?? data.section.academicYear.endDate, replacement: true }), name: `id-card-${s.admissionNo}-replacement` };
      }

      if (ids.length) {
        if (!year) return { error: "No academic year is set up yet.", status: 409 };
        const scope = await studentScope(tx, current, year.id);
        const enr = await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, studentId: { in: ids }, student: scope }, select: { sectionId: true } });
        const sectionIds = [...new Set(enr.map((e) => e.sectionId))];
        if (sectionIds.length === 0) return { error: "None of these students has a class this year.", status: 409 };
        const pages: string[] = [];
        let count = 0;
        for (const sid of sectionIds) {
          const data = await sectionCards(tx, sid);
          const chosen = data.students.filter((s) => ids.includes(s.id));
          if (!chosen.length) continue;
          const validUntil = settings.idCardValidUntil ?? data.section.academicYear.endDate;
          for (const s of chosen) {
            if (!s.printed) await tx.idCardPrint.create({ data: { schoolId: current.ctx.schoolId, studentId: s.id, academicYearId: data.section.academicYearId, sectionId: sid, validUntil, printedById: current.ctx.userId } });
          }
          count += chosen.length;
          pages.push(await idCardsHtml(tx, current.ctx, chosen, { classLabel: data.label, yearName: data.section.academicYear.name, validUntil }));
        }
        await writeAudit(tx, current.ctx, { action: "printed", recordType: "ID Card Print", recordId: null, after: { chosen: count } });
        const head = pages[0].slice(0, pages[0].indexOf("<body>"));
        const bodies = pages.map((p) => p.slice(p.indexOf("<body>") + 6, p.lastIndexOf("</body>")));
        return { html: `${head}<body>${bodies.join('<div style="break-before:page;page-break-before:always"></div>')}</body></html>`, name: count === 1 ? "id-card" : `id-cards-${count}` };
      }
      return { error: "Choose a class, or the students to print.", status: 400 };
    }, { timeout: 120_000 });
  } catch (e) {
    if (e instanceof StudentProblem) return text(e.message, 409);
    throw e;
  }
  if ("error" in out) return text(out.error, out.status);
  const pdf = await htmlToPdf(out.html, { format: "A4", margin: "10mm" });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.name.replace(/[^\w-]+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" } });
}
