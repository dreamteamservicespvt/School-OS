// Undo for Settings changes (P5): putting a role's permissions back as they
// were. Undo checks the permission again; it never bypasses it.
import "server-only";

import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { PermissionDeniedError, requirePermission } from "../permissions";
import { restoreRoleVersion } from "./roles";

registerUndo("role-permissions", async (current, auditEntryId) => {
  // Settings 'own' only reads (page-access.ts): undoing a role change needs reach "all".
  if (requirePermission(current.permissions, "settings", "edit") !== "all") throw new PermissionDeniedError("settings");
  await withSchool(current.ctx, (tx) => restoreRoleVersion(tx, current.ctx, auditEntryId));
});
