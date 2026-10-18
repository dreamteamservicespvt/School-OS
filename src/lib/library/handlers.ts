// Library Management's follow-ups: what happens when the approver decides a
// large lost or damaged charge (Approvals), where that request opens, and
// Undo for the desk's small changes (P5). Listed in
// src/lib/approval-handlers.ts and imported by src/lib/undo-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { requestIds, type StillWaiting } from "../approval-waiting";
import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { requirePermission } from "../permissions";
import { decideCharge } from "./fines";
import { libCan, libViewer } from "./access";
import { LibraryProblem } from "./problem";
import { BASE } from "./words";

export const followUps = {
  "library-charge": async (tx, ctx, approval, decision, note) => {
    await decideCharge(tx, ctx, approval.recordId, decision, note);
  },
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  "library-charge": async (tx) => requestIds(await tx.libraryFine.findMany({ where: { status: "WAITING", approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;

export const approvalLinks = {
  "library-charge": (a) => ({ href: `${BASE}/fines?fine=${a.recordId}`, label: "Open the fine" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;

const RECENT_MS = 2 * 60_000;

/** Undo a renewal just made: the due date and the count go back. */
registerUndo("lib-renew", async (current, key) => {
  requirePermission(current.permissions, "library-management", "edit");
  if (!libCan(libViewer(current)).desk) throw new LibraryProblem("Your role cannot renew books.");
  const [id, prevDue, prevCount] = key.split("~");
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(prevDue ?? "") || !/^\d+$/.test(prevCount ?? "")) throw new LibraryProblem("This renewal cannot be undone.");
  await withSchool(current.ctx, async (tx) => {
    const issue = await tx.bookIssue.findFirst({ where: { id } });
    if (!issue || issue.returnedAt || issue.renewals !== Number(prevCount) + 1 || Date.now() - issue.updatedAt.getTime() > RECENT_MS) throw new LibraryProblem("This renewal can no longer be undone.");
    const due = new Date(`${prevDue}T00:00:00Z`);
    await tx.bookIssue.update({ where: { id }, data: { dueOn: due, renewals: Number(prevCount) } });
    await writeAudit(tx, current.ctx, { action: "renewal-undone", recordType: "Book Issue", recordId: id, before: { due: formatDate(issue.dueOn, "UTC"), renewals: issue.renewals }, after: { due: formatDate(due, "UTC"), renewals: Number(prevCount) } });
  });
});

/** Undo a reservation just made. */
registerUndo("lib-reserve", async (current, id) => {
  requirePermission(current.permissions, "library-management", "edit");
  if (!libCan(libViewer(current)).desk) throw new LibraryProblem("Your role cannot change reservations.");
  await withSchool(current.ctx, async (tx) => {
    const r = await tx.reservation.findFirst({ where: { id } });
    if (!r || r.status !== "WAITING" || r.createdById !== current.user.id || Date.now() - r.reservedAt.getTime() > RECENT_MS) throw new LibraryProblem("This reservation can no longer be undone.");
    await tx.reservation.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date(), closedReason: "Undone at the desk" } });
    await writeAudit(tx, current.ctx, { action: "reservation-undone", recordType: "Reservation", recordId: id, before: { status: "WAITING" }, after: { status: "CANCELLED" } });
  });
});
