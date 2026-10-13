// Undo for Front Office's simple changes (P5): a check-out, a cleared note,
// an appointment's status and a postal hand-over. Each checks the person's
// Front Office rights again; undo never goes around them.
import "server-only";

import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { requirePermission } from "../permissions";
import { foCan, foViewer } from "./access";
import { FrontOfficeProblem } from "./problem";
import { undoCheckOut } from "./visitors";
import { restoreNote } from "./desk";
import { undoAppointmentStatus } from "./appointments";
import { undoHandOver } from "./postal";

const RECENT_MS = 2 * 60_000;

registerUndo("fo-checkout", async (current, id) => {
  requirePermission(current.permissions, "front-office", "edit");
  if (!foCan(foViewer(current)).checkOut) throw new FrontOfficeProblem("Your role cannot check visitors out.");
  await withSchool(current.ctx, async (tx) => {
    const v = await tx.visitorEntry.findFirst({ where: { id }, select: { checkedOutById: true, updatedAt: true } });
    if (!v || v.checkedOutById !== current.user.id || Date.now() - v.updatedAt.getTime() > RECENT_MS) throw new FrontOfficeProblem("This check-out can no longer be undone.");
    await undoCheckOut(tx, current.ctx, id);
  });
});

registerUndo("fo-note", async (current, id) => {
  requirePermission(current.permissions, "front-office", "edit");
  if (!foCan(foViewer(current)).desk) throw new FrontOfficeProblem("Your role cannot change desk notes.");
  await withSchool(current.ctx, (tx) => restoreNote(tx, current.ctx, id));
});

registerUndo("fo-appointment", async (current, key) => {
  requirePermission(current.permissions, "front-office", "edit");
  if (!foCan(foViewer(current)).desk) throw new FrontOfficeProblem("Your role cannot change appointments.");
  const [id, prev] = key.split("~");
  if (!id || !prev) throw new FrontOfficeProblem("This change cannot be undone.");
  await withSchool(current.ctx, (tx) => undoAppointmentStatus(tx, current.ctx, id, prev));
});

registerUndo("fo-handover", async (current, id) => {
  requirePermission(current.permissions, "front-office", "edit");
  if (!foCan(foViewer(current)).desk) throw new FrontOfficeProblem("Your role cannot change the postal register.");
  await withSchool(current.ctx, (tx) => undoHandOver(tx, current.ctx, id));
});
