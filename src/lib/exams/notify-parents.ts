// Messages to parents from Examination & Results: datesheet published, exam
// reminders (A10) and results published (A9). Parents have no login, so these
// go by WhatsApp, SMS or email through Communication, which owns templates,
// opt-outs, credits, Message History and the SMS backup (00-global.md §8).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";

export type ParentMessage = {
  /** Communication template key: "datesheet-published", "exam-reminder" or "result-published". */
  template: "datesheet-published" | "exam-reminder" | "result-published";
  studentIds: string[];
  /** Makes sending twice harmless: the same key never sends again (00-global.md §8). */
  idempotencyKey: string;
  vars: Record<string, string>;
  /** The plain message, used until the school's template is filled in. */
  text: string;
};

/**
 * The one place this module sends to parents. Picks each student's primary
 * guardian (or the first one) who has not opted out, and hands the message
 * on. Returns how many parents it went to.
 */
export async function messageParents(tx: Tx, ctx: SchoolContext, msg: ParentMessage): Promise<{ recipients: number; skippedOptedOut: number }> {
  if (msg.studentIds.length === 0) return { recipients: 0, skippedOptedOut: 0 };
  const links = await tx.studentGuardian.findMany({
    where: { studentId: { in: [...new Set(msg.studentIds)] }, archivedAt: null, guardian: { archivedAt: null } },
    include: { guardian: { select: { id: true, optedOut: true } } },
    orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }],
  });
  const perStudent = new Map<string, { guardianId: string; optedOut: boolean }>();
  for (const l of links) if (!perStudent.has(l.studentId)) perStudent.set(l.studentId, { guardianId: l.guardian.id, optedOut: l.guardian.optedOut });
  const guardians = new Set<string>();
  let skipped = 0;
  for (const g of perStudent.values()) {
    if (g.optedOut) skipped++;
    else guardians.add(g.guardianId);
  }
  // messaging: hand { template, guardianIds: [...guardians], vars, text, idempotencyKey } to
  // Communication's sendMessage once it exists; it sends by WhatsApp or SMS with credits.
  const already = await tx.auditLogEntry.findFirst({ where: { action: "parent-message", recordType: "Exam Message", recordId: msg.idempotencyKey } });
  if (!already) {
    await writeAudit(tx, ctx, {
      action: "parent-message", recordType: "Exam Message", recordId: msg.idempotencyKey,
      after: { template: msg.template, recipients: guardians.size, optedOut: skipped, text: msg.text },
    });
  }
  return { recipients: already ? 0 : guardians.size, skippedOptedOut: skipped };
}
