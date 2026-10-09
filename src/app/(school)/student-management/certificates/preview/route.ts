import type { CertificateType } from "@prisma/client";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";
import { getStudentSettings } from "@/lib/students/settings";
import { abilities, loadVisibleStudent } from "@/lib/students/access";
import { certificateData, certificateHtml, printContext } from "@/lib/students/certificates";
import { CERTIFICATE_LABEL } from "@/lib/students/labels";

export const dynamic = "force-dynamic";

const isId = (v: string | null): v is string => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));
const page = (text: string, status: number) => new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">${text.replace(/</g, "&lt;")}</body>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

/**
 * Preview before issuing: the certificate filled from the student's record, marked PREVIEW,
 * with no number and no QR code. Nothing is saved.
 */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("student-management", "create"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return page("You do not have permission to issue certificates.", 403);
    throw e;
  }
  const url = new URL(req.url);
  const studentId = url.searchParams.getAll("studentIds").find(isId) ?? url.searchParams.get("student");
  const type = url.searchParams.get("type") as CertificateType | null;
  if (!isId(studentId)) return page("Choose the student first, then preview.", 400);
  if (!type || !(type in CERTIFICATE_LABEL)) return page("Choose the certificate type first, then preview.", 400);
  const issueRaw = url.searchParams.get("issueDate") ?? "";
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(issueRaw) ? new Date(`${issueRaw}T00:00:00Z`) : new Date();
  const signatoryId = url.searchParams.get("signatoryId");
  const html = await withSchool(current.ctx, async (tx) => {
    const can = abilities(current, await getStudentSettings(tx, current.ctx));
    if (!can.manage || can.reach !== "all") return null;
    const student = await loadVisibleStudent(tx, current, studentId).catch(() => null);
    if (!student) return null;
    const leaving = type === "TC" ? await tx.leavingRequest.findFirst({ where: { studentId, status: { in: ["IN_PROGRESS", "LEFT"] } }, orderBy: { createdAt: "desc" } }) : null;
    const data = await certificateData(tx, studentId, leaving?.id ?? null, { conduct: url.searchParams.get("conduct")?.slice(0, 60) || "Good" });
    const ctx = await printContext(tx, current.ctx, { signatoryId: isId(signatoryId) ? signatoryId : null, verifyCode: "" }, null);
    return certificateHtml({ type, number: null, issueDate, purpose: url.searchParams.get("purpose")?.slice(0, 200) || null, isDuplicate: false, duplicateReason: null, status: "PREVIEW", data }, ctx);
  });
  if (!html) return page("This student was not found, or you cannot issue certificates.", 404);
  const marked = html.replace('<div class="frame">', '<div class="frame"><div style="position:absolute;top:40%;left:0;right:0;text-align:center;font-size:56pt;color:rgba(29,58,138,.15);transform:rotate(-20deg);font-weight:bold">PREVIEW</div>');
  return new Response(marked, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'" } });
}
