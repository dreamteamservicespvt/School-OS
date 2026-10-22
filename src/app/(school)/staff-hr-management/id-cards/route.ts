// Staff ID cards as a PDF, in batches of up to 50 (P9), in the school's Staff
// ID card design (Settings, Document Designs). Chosen staff (?ids=), one staff member (?staff=), or the
// Staff List filters (?designation=...). Every printed card is recorded;
// a card printed before is a reprint, with its reason.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { readListParams } from "@/lib/list";
import { writeAudit } from "@/lib/audit";
import { logExport } from "@/lib/exports";
import { staffScope, viewerFor } from "@/lib/staff/access";
import { STAFF_FILTERS, staffWhere } from "@/lib/staff/list";
import { staffIdCards } from "@/lib/staff/print";
import { UUID_RE } from "@/lib/staff/act";

const BATCH = 50;

const problem = (text: string, status = 400) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const { current } = await requireAction("staff-hr-management", "print");
  const url = new URL(req.url);
  const sp = url.searchParams;
  const batch = Math.max(1, Number.parseInt(sp.get("batch") ?? "1", 10) || 1);
  const reason = (sp.get("reason") ?? "").trim().slice(0, 200);
  return withSchool(current.ctx, async (tx) => {
    const viewer = await viewerFor(tx, current.ctx, current);
    // Printing ID cards is HR work (05-roles); "own" reach only views its own record.
    if (viewer.see !== "all" || viewer.change !== "all") return problem("Only HR, the School Admin or the Principal can print staff ID cards.", 403);
    let where;
    // One campus: chosen staff of another campus are not printed (staffScope keeps their campus and their own record).
    if (sp.get("ids")) {
      const ids = sp.get("ids")!.split(",").filter((v) => UUID_RE.test(v)).slice(0, 500);
      where = { id: { in: ids }, archivedAt: null, AND: [staffScope(viewer)] };
    } else if (sp.get("staff") && UUID_RE.test(sp.get("staff")!)) {
      where = { id: sp.get("staff")!, archivedAt: null, AND: [staffScope(viewer)] };
    } else {
      where = staffWhere(readListParams(Object.fromEntries(sp.entries()), STAFF_FILTERS), viewer);
    }
    const all = await tx.staff.findMany({ where, orderBy: [{ designation: "asc" }, { fullName: "asc" }], select: { id: true }, take: 2000 });
    if (all.length === 0) return problem("No staff to print. Go back and choose staff or change the filters.", 404);
    const pageIds = all.slice((batch - 1) * BATCH, batch * BATCH).map((s) => s.id);
    if (pageIds.length === 0) return problem(`There is no batch ${batch}. There are ${Math.ceil(all.length / BATCH)} batches.`, 404);
    const staff = await tx.staff.findMany({ where: { id: { in: pageIds } }, orderBy: [{ designation: "asc" }, { fullName: "asc" }], include: { department: { select: { name: true } } } });
    const before = new Set((await tx.staffIdCardPrint.findMany({ where: { staffId: { in: pageIds } }, select: { staffId: true } })).map((p) => p.staffId));
    const batchKey = `${new Date().toISOString()}:${batch}`;
    await tx.staffIdCardPrint.createMany({
      data: staff.map((s) => ({ schoolId: current.ctx.schoolId, staffId: s.id, batchKey, reprint: before.has(s.id), reason: before.has(s.id) ? reason || "Printed again" : null, printedById: current.user.id })),
    });
    await writeAudit(tx, current.ctx, { action: "printed", recordType: "Staff ID Card Print", recordId: null, after: { cards: staff.length, reprints: staff.filter((s) => before.has(s.id)).length, batch, of: Math.ceil(all.length / BATCH), reason: reason || null } });
    await logExport(tx, current.ctx, { title: "Staff ID cards", format: "pdf", filters: `Batch ${batch} of ${Math.ceil(all.length / BATCH)}`, rows: staff.length });
    const pdf = await (await staffIdCards(tx, current.ctx, staff, current.school.timeZone)).pdf();
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="staff-id-cards-${batch}.pdf"`, "Cache-Control": "no-store" },
    });
  }, { timeout: 120_000 });
}
