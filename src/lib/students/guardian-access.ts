// Which children a parent or guardian may see and act for, and which parents
// hear about a child (03 §2 "Custody / access restriction"; 11 Parent Link).
//
// A guardian link with a custody or access restriction stays on the child's
// record, and the office sees it in red (student profile, the guardian's
// page, Student Pickup). Everywhere else the guardian is cut off from that
// child: the child is not on their Parent Link; they cannot pay for, download
// receipts of, give consent for or book a PTM for the child there; and none
// of the child's messages go to them. Brothers and sisters without a
// restriction stay as they were.
//
// Every lookup from a guardian to their children goes through
// childrenOfGuardian(); every lookup from a child to the parents to tell
// puts OPEN_LINK in its query, so a new module keeps the rule by using them.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";

/** A link that lets the guardian see, act for and hear about the child: not removed, and no custody or access restriction. */
export const OPEN_LINK = { archivedAt: null, restriction: null } satisfies Prisma.StudentGuardianWhereInput;

/** Children admitted or studying now: the ones Parent Link shows. */
const STUDYING = ["ACTIVE", "ADMITTED"] as const;

/**
 * The children a guardian may see and act for (ids). With `studying`, only
 * children admitted or studying now (what Parent Link shows); otherwise every
 * child of the guardian not archived (receipts of a child who has left).
 */
export async function childrenOfGuardian(tx: Tx, ctx: SchoolContext, guardianId: string, opts: { studying?: boolean } = {}): Promise<string[]> {
  const rows = await tx.studentGuardian.findMany({
    where: {
      schoolId: ctx.schoolId,
      guardianId,
      ...OPEN_LINK,
      guardian: { archivedAt: null },
      student: { archivedAt: null, ...(opts.studying ? { status: { in: [...STUDYING] } } : {}) },
    },
    select: { studentId: true },
  });
  return rows.map((r) => r.studentId);
}

/** Whether the guardian may see and act for this child (see childrenOfGuardian). */
export async function isChildOfGuardian(tx: Tx, ctx: SchoolContext, guardianId: string, studentId: string, opts: { studying?: boolean } = {}) {
  return (await childrenOfGuardian(tx, ctx, guardianId, opts)).includes(studentId);
}
