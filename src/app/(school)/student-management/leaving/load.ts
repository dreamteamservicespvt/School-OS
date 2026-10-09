// Shared reads for the Leaving & Alumni pages.
import "server-only";

import type { Tx } from "@/lib/db";

export const LEAVING_TYPE_LABEL: Record<string, string> = { TRANSFER: "Transfer", WITHDRAWAL: "Withdrawal", GRADUATION: "Graduation" };
export const CHECK_LABEL: Record<string, string> = { CLEAR: "Clear", PENDING: "Pending", WAIVER_ASKED: "Waiver asked", WAIVED: "Waived" };
export const CHECK_TONE = { CLEAR: "success", PENDING: "danger", WAIVER_ASKED: "warning", WAIVED: "neutral" } as const;
export const CERT_LABEL: Record<string, string> = { REQUESTED: "Requested", APPROVED: "Approved", ISSUED: "Issued", CANCELLED: "Cancelled" };

/** Names, admission numbers and the latest class of these students. */
export async function studentFacts(tx: Tx, ids: string[]) {
  const students = await tx.student.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, admissionNo: true, status: true, enrolments: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { sectionId: true } } },
  });
  const secs = await tx.section.findMany({ where: { id: { in: students.flatMap((s) => s.enrolments.map((e) => e.sectionId)) } }, include: { schoolClass: true } });
  return new Map(students.map((s) => {
    const sec = secs.find((x) => x.id === s.enrolments[0]?.sectionId);
    return [s.id, { name: s.fullName, admissionNo: s.admissionNo, status: s.status, cls: sec ? `${sec.schoolClass.name} ${sec.name}` : "" }];
  }));
}

/** The TC of each leaving request, newest first. */
export async function tcFor(tx: Tx, leavingIds: string[]) {
  const certs = await tx.certificate.findMany({ where: { leavingRequestId: { in: leavingIds }, type: "TC" }, orderBy: { createdAt: "desc" } });
  const out = new Map<string, (typeof certs)[number]>();
  for (const c of certs) if (c.leavingRequestId && !out.has(c.leavingRequestId)) out.set(c.leavingRequestId, c);
  return out;
}
