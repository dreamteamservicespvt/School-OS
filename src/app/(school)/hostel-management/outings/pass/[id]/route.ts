// An approved outing or leave pass as a small printable PDF: the student,
// their room, the person they go with, the times, the reason, who approved
// it, and a QR that opens the pass in Outing & Visitors. Only for people
// who handle outings, and only in their own hostel.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { logExport } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { appOrigin } from "@/lib/origin";
import { htmlToPdf } from "@/lib/pdf";
import { PermissionDeniedError } from "@/lib/permissions";
import { qrSvg } from "@/lib/students/codes";
import { showPhone } from "@/lib/front-office/words";
import { hostelCan, hostelViewer } from "@/lib/hostel/access";
import { myHostelIds, inScope } from "@/lib/hostel/scope";
import { activeBedOf } from "@/lib/hostel/allocation";
import { outingWhere, passWhen } from "@/lib/hostel/outings";
import { UUID_RE } from "@/lib/hostel/act";
import { BASE, MODULE, OUTING_TYPE, type OutingType } from "@/lib/hostel/words";
import { plain } from "../../../_lib/route";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let current;
  try {
    ({ current } = await requireAction(MODULE, "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to print outing passes.", 403);
    throw e;
  }
  if (!current.modulesOn.has(MODULE)) return plain("Hostel Management is switched off for this school.", 404);
  const v = hostelViewer(current);
  if (!hostelCan(v).outings) return plain("Only the hostel's wardens print outing passes.", 403);
  if (!UUID_RE.test(id)) return plain("This pass was not found.", 404);
  const tz = current.school.timeZone;
  const origin = await appOrigin();
  return withSchool(current.ctx, async (tx) => {
    const mine = await myHostelIds(tx, current.ctx, v);
    const g = await tx.gatePass.findFirst({ where: outingWhere({ id }) });
    if (!g || !inScope(mine, g.hostelId)) return plain("This pass was not found.", 404);
    if (g.status !== "APPROVED" && g.status !== "OUT") return plain(`Pass ${g.passNo} is not approved for going out, so it cannot be printed.`, 409);
    const [student, approver, bed] = await Promise.all([
      tx.student.findFirst({ where: { id: g.studentId }, select: { fullName: true, admissionNo: true } }),
      g.decidedById ? tx.userLogin.findUnique({ where: { id: g.decidedById }, select: { displayName: true } }) : null,
      activeBedOf(tx, g.studentId),
    ]);
    const qr = await qrSvg(`${origin}${BASE}/outings?pass=${g.id}`, 140);
    const row = (k: string, val: string) => `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}
      .card{border:2px solid #222;border-radius:10px;padding:14px 16px;width:120mm}
      .top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:8px}
      .school{font-weight:700;font-size:15px}.no{font-family:monospace;font-size:14px;font-weight:700}
      h1{font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px;color:#444}
      table{border-collapse:collapse;font-size:13px;width:100%}th{text-align:left;color:#555;font-weight:400;padding:3px 10px 3px 0;width:34%;vertical-align:top}td{padding:3px 0;font-weight:600}
      .qr{text-align:center;margin-top:10px}.foot{font-size:11px;color:#555;margin-top:6px;text-align:center}
    </style></head><body><div class="card">
      <div class="top"><span class="school">${esc(current.school.name)}</span><span class="no">${esc(g.passNo)}</span></div>
      <h1>Hostel ${esc(OUTING_TYPE[(g.outingType ?? "OUTING") as OutingType].label.toLowerCase())} pass</h1>
      <table>
        ${row("Student", `${student?.fullName ?? "Student"}${g.sectionLabel ? `, ${g.sectionLabel}` : ""}`)}
        ${row("Admission no.", student?.admissionNo ?? "")}
        ${row("Room", bed ? `${bed.hostel.name}, ${bed.words}` : "")}
        ${row("Going with", `${g.collectorName ?? ""}${g.collectorRelation ? ` (${g.collectorRelation.toLowerCase()})` : ""}${g.collectorPhone ? `, ${showPhone(g.collectorPhone)}` : ""}`)}
        ${row("Out and back by", passWhen(g, tz))}
        ${row("Reason", g.reason)}
        ${row("Approved by", `${approver?.displayName ?? ""}${g.decidedAt ? `, ${formatDate(g.decidedAt, tz)}` : ""}`)}
      </table>
      <div class="qr">${qr}</div>
      <div class="foot">Show this pass at the gate. Scan the code to open the pass and mark the student back.</div>
    </div></body></html>`;
    const pdf = await htmlToPdf(html, { format: "A5", margin: "10mm" });
    await logExport(tx, current.ctx, { title: `Hostel pass ${g.passNo}`, format: "pdf", filters: student?.fullName ?? "", rows: 1 });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="hostel-pass-${g.passNo}.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
