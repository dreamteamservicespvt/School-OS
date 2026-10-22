// The Parents & Guardians list's reach and its consent groups, in one place:
// the list page and the Dashboard ("Parents", "guardians have not given data
// consent") read them here, so a card's number is the list it opens
// (01-dashboard.md §2, §5; gap list G36).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { abilities, studentScope, type Who } from "./access";
import { consentRows, consentState } from "./consent";

/**
 * The guardians a person may see: everyone, or with own reach or one campus,
 * the parents of their students only. `archived`: the archived ones instead.
 */
export async function guardiansInReach(tx: Tx, who: Who, yearIds: string[], opts: { archived?: boolean } = {}): Promise<Prisma.GuardianWhereInput> {
  const can = abilities(who);
  const scope = await studentScope(tx, who, yearIds);
  const inReach: Prisma.GuardianWhereInput = can.reach === "own" || who.campusId ? { students: { some: { archivedAt: null, student: scope } } } : {};
  return { AND: [{ archivedAt: opts.archived ? { not: null } : null }, inReach] };
}

/**
 * The guardians of `where` by consent: data consent not given (never given or
 * only requested; withdrawn is its own group), withdrawn, and the same for
 * photo consent. The list's chips and filters and the Dashboard count these.
 */
export async function guardianConsentGroups(tx: Tx, who: Who, where: Prisma.GuardianWhereInput) {
  const all = await tx.guardian.findMany({ where, select: { id: true } });
  const allIds = all.map((g) => g.id);
  const rows = allIds.length ? await consentRows(tx, who.ctx, { guardianIds: allIds }) : [];
  const byGuardian = new Map<string, { consentType: string; status: string }[]>();
  for (const r of rows) { const list = byGuardian.get(r.guardianId) ?? []; list.push({ consentType: r.consentType, status: r.status }); byGuardian.set(r.guardianId, list); }
  const state = (id: string, type: string) => consentState(byGuardian.get(id) ?? [], type);
  return {
    allIds,
    /** One guardian's state for a consent type. */
    state,
    dataNot: allIds.filter((id) => state(id, "data-processing") !== "GIVEN" && state(id, "data-processing") !== "WITHDRAWN"),
    dataWithdrawn: allIds.filter((id) => state(id, "data-processing") === "WITHDRAWN"),
    photoNot: allIds.filter((id) => state(id, "photo") !== "GIVEN"),
    photoWithdrawn: allIds.filter((id) => state(id, "photo") === "WITHDRAWN"),
  };
}
