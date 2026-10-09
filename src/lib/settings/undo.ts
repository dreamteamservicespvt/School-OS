// Undo for Settings changes (P5): putting a role's permissions back as they
// were. Undo checks the permission again; it never bypasses it.
import "server-only";

import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { requirePermission } from "../permissions";
import { restoreRoleVersion } from "./roles";

registerUndo("role-permissions", async (current, auditEntryId) => {
  requirePermission(current.permissions, "settings", "edit");
  await withSchool(current.ctx, (tx) => restoreRoleVersion(tx, current.ctx, auditEntryId));
});
