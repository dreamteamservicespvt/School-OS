// A Pickup gate pass as a small printable PDF: the student, the person
// collecting, the time, the reason, who released the child, and a QR the gate
// scans. Only the desk prints it (the person who may release students).
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { logExport } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { appOrigin } from "@/lib/origin";
import { htmlToPdf } from "@/lib/pdf";
import { PermissionDeniedError } from "@/lib/permissions";
import { qrSvg } from "@/lib/students/codes";
import { foCan, foViewer } from "@/lib/front-office/access";
import { clockAt } from "@/lib/front-office/time";
import { BASE } from "@/lib/front-office/words";
import { UUID_RE } from "@/lib/front-office/act";
import { plain } from "../../../_lib/export";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let current;
  try {
    ({ current } = await requireAction("front-office", "print"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to print gate passes.", 403);
    throw e;
  }
  if (!foCan(foViewer(current)).release) return plain("Only the reception desk prints pickup gate passes.", 403);
  if (!UUID_RE.test(id)) return plain("This gate pass was not found.", 404);
  const tz = current.school.timeZone;
  const origin = await appOrigin();
  return withSchool(current.ctx, async (tx) => {
    const g = await tx.gatePass.findFirst({ where: { id, kind: "PICKUP", archivedAt: null } });
    if (!g) return plain("This gate pass was not found.", 404);
    const [student, issuer] = await Promise.all([
      tx.student.findFirst({ where: { id: g.studentId }, select: { fullName: true, admissionNo: true } }),
      g.issuedById ? tx.userLogin.findUnique({ where: { id: g.issuedById }, select: { displayName: true } }) : null,
    ]);
    const qr = await qrSvg(`${origin}${BASE}/pickup?check=${g.passNo}`, 150);
    const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
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
      <h1>Pickup gate pass</h1>
      <table>
        ${row("Student", `${student?.fullName ?? "Student"}${g.sectionLabel ? `, ${g.sectionLabel}` : ""}`)}
        ${row("Admission no.", student?.admissionNo ?? "")}
        ${row("Collected by", `${g.collectorName ?? ""}${g.collectorRelation ? ` (${g.collectorRelation.toLowerCase()})` : ""}`)}
        ${row("Date and time", `${formatDate(g.timeOut, tz)}, ${clockAt(g.timeOut, tz)}`)}
        ${row("Reason", g.reason)}
        ${row("Verified", g.verification ?? "photo")}
        ${row("Released by", issuer?.displayName ?? "")}
      </table>
      <div class="qr">${qr}</div>
      <div class="foot">Gate Security scans this pass before the child leaves. It works once, on this day only.</div>
    </div></body></html>`;
    const pdf = await htmlToPdf(html, { format: "A5", margin: "10mm" });
    await logExport(tx, current.ctx, { title: `Gate pass ${g.passNo}`, format: "pdf", filters: student?.fullName ?? "", rows: 1 });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="gate-pass-${g.passNo}.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
