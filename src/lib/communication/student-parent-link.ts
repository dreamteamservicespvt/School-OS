// Communication's Parent Link, offered to Student Management's Parent &
// Guardian screens (registerParentLink in src/lib/students/guardians.ts):
// the link's status, Resend, and Revoke (which issues and sends a new link).
// Imported by src/lib/students/provider-modules.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { registerParentLink, type ParentLinkProvider, type ParentLinkState } from "../students/guardians";
import { createAndSend, maskPhone, ParentLinkProblem, reissueLink, resendLink } from "../parent-link/links";

// Problems (ParentLinkProblem, MessagingProblem) are plain sentences; Student
// Management's actions show them as they are.

async function guardianPhone(tx: Tx, ctx: SchoolContext, guardianId: string) {
  const g = await tx.guardian.findFirst({ where: { id: guardianId, schoolId: ctx.schoolId, archivedAt: null }, select: { phone: true } });
  if (!g) throw new ParentLinkProblem("This parent was not found.");
  if (!g.phone) throw new ParentLinkProblem("This parent has no mobile number. Add it first.");
  return maskPhone(g.phone);
}

export const parentLinkProvider: ParentLinkProvider = {
  async status(tx, ctx, guardianIds) {
    const links = await tx.parentLink.findMany({
      where: { schoolId: ctx.schoolId, guardianId: { in: guardianIds } },
      select: { guardianId: true, status: true, lastOpenedAt: true, lastSentAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const out = new Map<string, ParentLinkState>();
    for (const l of links) {
      const have = out.get(l.guardianId);
      // An active link wins over older revoked ones.
      if (have && !(have.status !== "Active" && l.status === "ACTIVE")) continue;
      out.set(l.guardianId, {
        status: l.status === "REVOKED" ? "Revoked" : l.lastSentAt ? "Active" : "Not sent",
        lastOpenedAt: l.lastOpenedAt,
      });
    }
    return out;
  },

  /** Sends the active link again; a parent with no link gets a new one. */
  async resend(tx, ctx, guardianId) {
    const to = await guardianPhone(tx, ctx, guardianId);
    const active = await tx.parentLink.findFirst({ where: { schoolId: ctx.schoolId, guardianId, status: "ACTIVE" } });
    if (active) await resendLink(tx, ctx, active.id);
    else await createAndSend(tx, ctx, guardianId);
    return to;
  },

  /** Stops the old link at once and sends a new one. A parent with no link simply gets one. */
  async revoke(tx, ctx, guardianId) {
    const to = await guardianPhone(tx, ctx, guardianId);
    const active = await tx.parentLink.findFirst({ where: { schoolId: ctx.schoolId, guardianId, status: "ACTIVE" } });
    if (active) await reissueLink(tx, ctx, active.id, "Other");
    else await createAndSend(tx, ctx, guardianId);
    return to;
  },
};

registerParentLink(parentLinkProvider);
