// Audit trail (00-global.md P14, 04-data-model.md rules 22 and 23).
// Entries are written inside the same transaction as the change, so a change
// and its audit line are saved together or not at all. The database refuses
// to change or delete an entry once written.

import type { Prisma } from "@prisma/client";
import { SUPPORT_LOGIN_ID, type SchoolContext, type Tx } from "./db";

export type AuditInput = {
  action: string;
  recordType: string;
  recordId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  /** For example "prepared by AI, confirmed by <person>" (00-global.md §2.1, rule 6). */
  actorNote?: string | null;
  device?: string | null;
  ipAddress?: string | null;
};

/** How the Audit Log marks what a DREAM TEAM person did inside a school (07-super-admin.md §3.4, step 6). */
export const supportNote = (name: string) => `DREAM TEAM support (${name})`;

export async function writeAudit(tx: Tx, ctx: SchoolContext, entry: AuditInput) {
  // Whatever is written while DREAM TEAM looks inside the school carries their name, never a school login.
  const support = ctx.support ? supportNote(ctx.support.name) : ctx.console ? `DREAM TEAM: ${ctx.console.name}` : ctx.userId === SUPPORT_LOGIN_ID ? "DREAM TEAM support" : null;
  return tx.auditLogEntry.create({
    data: {
      schoolId: ctx.schoolId,
      userLoginId: support ? null : ctx.userId,
      action: entry.action,
      recordType: entry.recordType,
      recordId: entry.recordId ?? null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      actorNote: support && entry.actorNote !== support ? [support, entry.actorNote].filter(Boolean).join("; ") : entry.actorNote ?? null,
      device: entry.device ?? null,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
