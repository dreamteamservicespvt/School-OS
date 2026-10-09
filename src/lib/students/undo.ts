// Undo for Student Management's simple changes (P5). Undo checks the person
// may still make the change; it never bypasses permissions.
import "server-only";

import { withSchool } from "../db";
import { registerUndo } from "../undo";
import { requireManage } from "./access";
import { undoSectionChange } from "./students";
import { undoBulkUpdate } from "./bulk";

registerUndo("student-section-change", async (current, id) => {
  requireManage(current);
  await withSchool(current.ctx, (tx) => undoSectionChange(tx, current.ctx, id));
});

registerUndo("student-bulk-update", async (current, id) => {
  requireManage(current);
  await withSchool(current.ctx, (tx) => undoBulkUpdate(tx, current.ctx, id));
});
