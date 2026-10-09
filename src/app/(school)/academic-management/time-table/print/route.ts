// Printable Time Tables: ?section=<id>&section=<id>, ?staff=<id>, ?room=<name>
// or ?all=1, for a version (?version=) or the one in force. ?format=pdf
// downloads the same pages as a PDF.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { htmlToPdf } from "@/lib/pdf";
import { logExport } from "@/lib/exports";
import { chosenYear } from "@/lib/academic/years";
import { academicScope } from "@/lib/academic/scope";
import { mainCampusId, periodSlots, academicSettings } from "@/lib/academic/settings";
import { publishedVersionForYear, roomGrid, sectionGrid, staffGrid } from "@/lib/academic/timetable";
import { timetableHtml, type PrintPage } from "@/lib/academic/timetable-print";
import { todayIn } from "@/lib/academic/common";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { current } = await requireAction("academic-management", "view");
  const ctx = current.ctx;
  const today = todayIn(current.school.timeZone);
  const pdf = url.searchParams.get("format") === "pdf";

  const result = await withSchool(ctx, async (tx) => {
    const campusId = await mainCampusId(tx, ctx);
    const year = await chosenYear(tx, ctx, url.searchParams.get("year"));
    if (!year) return null;
    const scope = await academicScope(tx, current, year.id);
    const vId = url.searchParams.get("version");
    let version = vId ? await tx.timetableVersion.findFirst({ where: { id: vId, academicYearId: year.id, archivedAt: null } }) : null;
    if (version && version.status !== "PUBLISHED" && !scope.arrange) version = null;
    if (!version && vId) {
      const v = await tx.timetableVersion.findFirst({ where: { id: vId, archivedAt: null } });
      if (v && (v.status === "PUBLISHED" || scope.arrange)) version = v;
    }
    version ??= await publishedVersionForYear(tx, year.id, today);
    if (!version) return { pages: [] as PrintPage[], slots: await periodSlots(tx, ctx, campusId), days: (await academicSettings(tx, ctx, campusId)).workingDays };
    const subtitle = version.status === "DRAFT" ? `${version.name} (draft, not published)` : version.name;
    const pages: PrintPage[] = [];
    const own = scope.see === "own" && !scope.arrange;

    let sectionIds = url.searchParams.getAll("section");
    if (url.searchParams.get("all") === "1") sectionIds = (await tx.section.findMany({ where: { academicYearId: version.academicYearId, archivedAt: null }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }], select: { id: true } })).map((s) => s.id);
    if (scope.sectionIds) sectionIds = sectionIds.filter((id) => scope.sectionIds!.includes(id));
    const sections = await tx.section.findMany({ where: { id: { in: sectionIds }, archivedAt: null }, include: { schoolClass: true } });
    for (const id of sectionIds.slice(0, 200)) {
      const s = sections.find((x) => x.id === id);
      if (s) pages.push({ title: `${s.schoolClass.name} ${s.name} Time Table`, subtitle, cells: await sectionGrid(tx, version.id, s.id), mode: "class" });
    }
    for (const staffId of url.searchParams.getAll("staff").slice(0, 200)) {
      if (own && staffId !== scope.staffId) continue;
      const st = await tx.staff.findFirst({ where: { id: staffId }, select: { fullName: true } });
      if (st) pages.push({ title: `${st.fullName}: Time Table`, subtitle, cells: await staffGrid(tx, version.id, staffId), mode: "teacher" });
    }
    for (const room of url.searchParams.getAll("room").slice(0, 50)) {
      if (room.trim()) pages.push({ title: `${room}: Time Table`, subtitle, cells: await roomGrid(tx, version.id, room.trim()), mode: "room" });
    }
    if (pdf) await logExport(tx, ctx, { title: "Time Table print", format: "pdf", filters: `${pages.length} pages`, rows: pages.length });
    return { pages, slots: await periodSlots(tx, ctx, version.campusId), days: (await academicSettings(tx, ctx, version.campusId)).workingDays };
  });

  const generated = formatDateTime(new Date(), current.school.timeZone);
  const pdfUrl = new URL(url);
  pdfUrl.searchParams.set("format", "pdf");
  const html = timetableHtml(result?.pages ?? [], { schoolName: current.school.name, generated, slots: result?.slots ?? [], days: result?.days ?? [], withPrintButton: !pdf, pdfHref: `${pdfUrl.pathname}${pdfUrl.search}` });
  if (pdf) {
    const body = await htmlToPdf(html, { format: "A4", landscape: true });
    return new Response(new Uint8Array(body), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="time-table.pdf"`, "Cache-Control": "no-store" } });
  }
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
