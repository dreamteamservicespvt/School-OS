// Undo for the Dashboard's simple changes (P5): a task's status, archiving a
// task, "Mark as seen", and a setup step marked by hand. Each checks the
// person's Dashboard rights again; undo never goes around them.
import "server-only";

import type { TaskStatus } from "@prisma/client";
import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { requirePermission } from "../permissions";
import { writeAudit } from "../audit";
import { restoreTask, setTaskStatus, taskAccess, TaskProblem } from "./tasks";
import { unmarkStep } from "./setup";
import type { Current } from "../current";

const who = (current: Current) => ({ ctx: current.ctx, access: taskAccess(current.permissions) });

registerUndo("task-status", async (current, key) => {
  requirePermission(current.permissions, "dashboard", "edit");
  const [id, prev] = key.split("~");
  if (!id || !["TODO", "IN_PROGRESS", "DONE", "CANCELLED"].includes(prev ?? "")) throw new TaskProblem("This change cannot be undone.");
  await withSchool(current.ctx, (tx) => setTaskStatus(tx, who(current), id, prev as TaskStatus));
});

registerUndo("task-archive", async (current, id) => {
  requirePermission(current.permissions, "dashboard", "edit");
  await withSchool(current.ctx, (tx) => restoreTask(tx, who(current), id));
});

registerUndo("dashboard-seen", async (current, id) => {
  requirePermission(current.permissions, "dashboard", "view");
  await withSchool(current.ctx, async (tx) => {
    const row = await tx.dashboardSeen.findFirst({ where: { id, userLoginId: current.user.id, archivedAt: null } });
    if (!row) throw new TaskProblem("That card is already back.");
    await tx.dashboardSeen.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, current.ctx, { action: "seen taken back", recordType: "Dashboard Seen", recordId: id, before: { item: row.itemKey } });
  });
});

registerUndo("setup-step", async (current, id) => {
  if (requirePermission(current.permissions, "settings", "edit") !== "all") throw new TaskProblem("Only the School Admin or the Principal changes the setup checklist.");
  await withSchool(current.ctx, async (tx) => {
    if (!(await unmarkStep(tx, current.ctx, id))) throw new TaskProblem("That step is already back as it was.");
  });
});
