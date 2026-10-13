import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { logExport } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { salaryLevel } from "@/lib/salary/access";
import { slipPdf } from "@/lib/salary/slips";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Salary slips as a PDF in the school's "Salary slip" design. Staff with Own
 * access get only their own slips (filtered at the query); full Salary
 * Management may print any. Opening your own slip marks it downloaded.
 */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("salary-management", "view"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to open salary slips.", { status: 403 });
    throw e;
  }
  const level = salaryLevel(current.permissions);
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 200);
  if (!ids.length) return new Response("Choose the slips.", { status: 400 });
  return withSchool(current.ctx, async (tx) => {
    const me = await tx.staff.findFirst({ where: { userLoginId: current.user.id, archivedAt: null }, select: { id: true } });
    const allowed = await tx.payslip.findMany({
      where: { id: { in: ids }, ...(level === "full" ? {} : { staffId: me?.id ?? "00000000-0000-0000-0000-000000000000" }), run: { status: { in: ["APPROVED", "PAID", "LOCKED"] } } },
      orderBy: { month: "desc" }, select: { id: true, staffId: true },
    });
    if (!allowed.length) return new Response(level === "full" ? "These slips were not found." : "You can open only your own salary slips.", { status: level === "full" ? 404 : 403 });
    const out = await slipPdf(tx, current.ctx, allowed.map((s) => s.id), { ownStaffId: me?.id ?? null });
    await logExport(tx, current.ctx, { title: out.title, format: "pdf", filters: `${allowed.length} slip${allowed.length === 1 ? "" : "s"}`, rows: allowed.length });
    const inline = new URL(req.url).searchParams.get("print") === "1";
    return new Response(new Uint8Array(out.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${out.fileName}"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
