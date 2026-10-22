// Library cards as a PDF for one class, or for the staff, from the "Library
// card" design in Settings, Document Designs. The card number is the
// admission number or staff code (the same as on the ID card), so either
// card works at the desk. Each print is recorded.
import { withSchool } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { writeAudit } from "@/lib/audit";
import { currentYear } from "@/lib/academic/years";
import { personCampusId } from "@/lib/campus";
import { librarySettings } from "@/lib/library/settings";
import { libraryCardsHtml } from "@/lib/library/labels";
import { libRoute, plain } from "../../_lib/route";
import { memberRows, readMembersFilter } from "../../_lib/members";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await libRoute(req, "members", "print");
  if (x instanceof Response) return x;
  if (!x.can.members) return plain("Only the librarian prints library cards.", 403);
  const f = readMembersFilter(x.get);
  if (f.tab === "students" && !f.sec) return plain("Choose a class to print its library cards.", 400);
  const html = await withSchool(x.current.ctx, async (tx) => {
    const s = await librarySettings(tx, x.current.ctx);
    // The class's own year (each campus has its own school year); staff cards, the person's own campus's year.
    const classYear = f.tab === "students" && f.sec ? (await tx.section.findFirst({ where: { id: f.sec }, select: { academicYear: true } }))?.academicYear ?? null : null;
    const year = classYear ?? await currentYear(tx, x.current.ctx, await personCampusId(tx, x.current.ctx, x.current));
    const { rows } = await memberRows(tx, x.current.ctx, s, { ...f, q: "" }, x.today, null);
    const members = rows.filter((m) => m.active).slice(0, 400);
    if (!members.length) return null;
    await tx.libraryCardPrint.createMany({ data: members.map((m) => ({ schoolId: x.current.ctx.schoolId, memberKind: m.kind, studentId: m.studentId, staffId: m.staffId, academicYearId: year?.id ?? null, cardNo: m.cardNo, printedById: x.current.ctx.userId })) });
    await writeAudit(tx, x.current.ctx, { action: "printed-cards", recordType: "Library Card Print", recordId: null, after: { cards: members.length, for: f.tab === "staff" ? "Staff" : members[0].group } });
    return libraryCardsHtml(tx, x.current.ctx, members, { validUntil: year?.endDate ?? null, yearName: year?.name ?? null });
  }, { timeout: 120_000 });
  if (!html) return plain("There are no active members to print cards for.", 404);
  const pdf = await htmlToPdf(html, { format: "A4", margin: "8mm" });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="library-cards.pdf"', "Cache-Control": "no-store" } });
}
