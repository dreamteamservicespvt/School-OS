// Undo for Communication (P5): an archived notice comes back as it was.
import "server-only";

import type { NoticeStatus } from "@prisma/client";
import { registerUndo, UNDO_GRACE_MS } from "../undo";
import { withSchool } from "../db";
import { commAction } from "./access";
import { noticeOnCampus, restoreNotice } from "./notices";

const STATUSES: NoticeStatus[] = ["DRAFT", "SCHEDULED", "PUBLISHED", "EXPIRED"];
const CANNOT = "This change cannot be undone.";

registerUndo("notice-archive", async (_current, key) => {
  // The same checks as archiving it (archiveNoticeAction): their campus, and only notices
  // they wrote unless they reach the whole school. Support sessions are refused.
  const { current, scope } = await commAction("archive");
  // The status in the key is not trusted: the notice goes back to the status it had when archived.
  const [id] = key.split(":");
  await withSchool(current.ctx, async (tx) => {
    const n = await tx.notice.findFirst({ where: { id, schoolId: current.ctx.schoolId, status: "ARCHIVED" } });
    if (!n || !noticeOnCampus(n, scope.campusId, current.user.id)) throw new Error(CANNOT);
    if (current.permissions.communication.change !== "all" && n.createdById !== current.user.id) throw new Error(CANNOT);
    // Only the person who archived it, right after (00-global.md P5).
    if (n.updatedById !== current.user.id || !n.archivedAt || Date.now() - n.archivedAt.getTime() > UNDO_GRACE_MS) throw new Error(CANNOT);
    const archived = await tx.auditLogEntry.findFirst({ where: { schoolId: current.ctx.schoolId, recordType: "Notice", recordId: n.id, action: "archived" }, orderBy: { at: "desc" } });
    const status = (archived?.before as { status?: string } | null)?.status as NoticeStatus | undefined;
    if (!status || !STATUSES.includes(status)) throw new Error(CANNOT);
    await restoreNotice(tx, current.ctx, n.id, status);
  });
});
