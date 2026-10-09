// Undo for Communication (P5): an archived notice comes back as it was.
import "server-only";

import type { NoticeStatus } from "@prisma/client";
import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { requirePermission } from "../permissions";
import { restoreNotice } from "./notices";

const STATUSES: NoticeStatus[] = ["DRAFT", "SCHEDULED", "PUBLISHED", "EXPIRED"];

registerUndo("notice-archive", async (current, key) => {
  requirePermission(current.permissions, "communication", "archive");
  const [id, status] = key.split(":");
  if (!STATUSES.includes(status as NoticeStatus)) throw new Error("This change cannot be undone.");
  await withSchool(current.ctx, (tx) => restoreNotice(tx, current.ctx, id, status as NoticeStatus));
});
