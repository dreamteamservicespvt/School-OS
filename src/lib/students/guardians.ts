// Parents and guardians (03 §2 "Parents & Guardians"). One Guardian record is
// shared by brothers and sisters (04-data-model.md rule 2). Parents have no
// login; each has a Parent Link, owned by Communication (D4).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { StudentProblem } from "./students";

export type GuardianInput = {
  name: string;
  relationship: string;
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  occupation?: string | null;
  dateOfBirth?: Date | null;
  address?: string | null;
  language?: string;
  optedOut?: boolean;
};

export class PhoneOnRecord extends Error {
  constructor(public matches: { id: string; name: string; children: string[] }[]) {
    super("A parent with this phone is already on record.");
    this.name = "PhoneOnRecord";
  }
}

export async function parentsWithPhone(tx: Tx, phone: string, exceptId?: string) {
  const rows = await tx.guardian.findMany({
    where: { phone, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    include: { students: { where: { archivedAt: null }, include: { student: { select: { fullName: true } } } } },
    take: 5,
  });
  return rows.map((g) => ({ id: g.id, name: g.name, children: g.students.map((s) => s.student.fullName) }));
}

/** Adds a parent. If the phone is already on record, offers to link that parent instead (unless told to add anyway). */
export async function createGuardian(tx: Tx, ctx: SchoolContext, input: GuardianInput, opts: { addAnyway?: boolean } = {}) {
  if (!opts.addAnyway) {
    const matches = await parentsWithPhone(tx, input.phone);
    if (matches.length) throw new PhoneOnRecord(matches);
  }
  const g = await tx.guardian.create({
    data: {
      schoolId: ctx.schoolId,
      name: input.name.trim(),
      relationship: input.relationship,
      phone: input.phone,
      altPhone: input.altPhone ?? null,
      email: input.email ?? null,
      occupation: input.occupation ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      address: input.address ?? null,
      language: input.language ?? "en",
      optedOut: input.optedOut ?? false,
      createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Guardian", recordId: g.id, after: { name: g.name, relationship: g.relationship, phone: g.phone } });
  return g;
}

export async function updateGuardian(tx: Tx, ctx: SchoolContext, guardianId: string, input: GuardianInput) {
  const before = await tx.guardian.findFirst({ where: { id: guardianId, archivedAt: null } });
  if (!before) throw new StudentProblem("This parent was not found.");
  const after = await tx.guardian.update({
    where: { id: guardianId },
    data: {
      name: input.name.trim(), relationship: input.relationship, phone: input.phone, altPhone: input.altPhone ?? null,
      email: input.email ?? null, occupation: input.occupation ?? null, dateOfBirth: input.dateOfBirth ?? null,
      address: input.address ?? null, language: input.language ?? before.language, optedOut: input.optedOut ?? before.optedOut,
      updatedById: ctx.userId,
    },
  });
  const keys = ["name", "relationship", "phone", "altPhone", "email", "occupation", "dateOfBirth", "address", "language", "optedOut"] as const;
  const val = (g: typeof before, k: (typeof keys)[number]) => (g[k] instanceof Date ? (g[k] as Date).toISOString().slice(0, 10) : g[k]);
  const changed = keys.filter((k) => JSON.stringify(val(before, k)) !== JSON.stringify(val(after, k)));
  if (changed.length) {
    await writeAudit(tx, ctx, {
      action: "changed",
      recordType: "Guardian",
      recordId: guardianId,
      before: Object.fromEntries(changed.map((k) => [k, val(before, k) ?? null])) as Prisma.InputJsonValue,
      after: Object.fromEntries(changed.map((k) => [k, val(after, k) ?? null])) as Prisma.InputJsonValue,
    });
  }
  return after;
}

/** Links a guardian to a student with a relation (siblings share the same guardian). */
export async function linkGuardian(tx: Tx, ctx: SchoolContext, studentId: string, guardianId: string, opts: { relationship: string; emergency?: boolean; primary?: boolean }) {
  const existing = await tx.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId } } });
  if (existing && !existing.archivedAt) throw new StudentProblem("This parent is already linked to the student.");
  const links = await tx.studentGuardian.findMany({ where: { studentId, archivedAt: null } });
  const nextEmergency = opts.emergency ? Math.max(0, ...links.map((l) => l.emergencyOrder ?? 0)) + 1 : null;
  const primary = opts.primary || links.length === 0;
  if (primary) await tx.studentGuardian.updateMany({ where: { studentId, archivedAt: null }, data: { isPrimary: false } });
  const data = { relationship: opts.relationship, isPrimary: primary, emergencyOrder: nextEmergency, canPickUp: true, restriction: null, archivedAt: null };
  const link = existing
    ? await tx.studentGuardian.update({ where: { id: existing.id }, data })
    : await tx.studentGuardian.create({ data: { schoolId: ctx.schoolId, studentId, guardianId, ...data } });
  await writeAudit(tx, ctx, { action: "linked", recordType: "Guardian", recordId: guardianId, after: { studentId, relationship: opts.relationship, primary } });
  return link;
}

export async function unlinkGuardian(tx: Tx, ctx: SchoolContext, linkId: string) {
  const link = await tx.studentGuardian.findFirst({ where: { id: linkId, archivedAt: null } });
  if (!link) throw new StudentProblem("This link was already removed.");
  const others = await tx.studentGuardian.count({ where: { studentId: link.studentId, archivedAt: null, id: { not: linkId } } });
  if (others === 0) throw new StudentProblem("A student needs at least one parent or guardian. Add the other parent first.");
  await tx.studentGuardian.update({ where: { id: linkId }, data: { archivedAt: new Date(), isPrimary: false } });
  if (link.isPrimary) {
    const next = await tx.studentGuardian.findFirst({ where: { studentId: link.studentId, archivedAt: null, restriction: null }, orderBy: { emergencyOrder: "asc" } });
    if (next) await tx.studentGuardian.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  await writeAudit(tx, ctx, { action: "unlinked", recordType: "Guardian", recordId: link.guardianId, before: { studentId: link.studentId, relationship: link.relationship } });
}

/** The primary contact gets the child's WhatsApp and SMS messages. */
export async function setPrimary(tx: Tx, ctx: SchoolContext, linkId: string) {
  const link = await tx.studentGuardian.findFirst({ where: { id: linkId, archivedAt: null } });
  if (!link) throw new StudentProblem("This link was not found.");
  if (link.restriction) throw new StudentProblem("A guardian with a custody or access restriction cannot be the primary contact.");
  const before = await tx.studentGuardian.findFirst({ where: { studentId: link.studentId, isPrimary: true, archivedAt: null } });
  await tx.studentGuardian.updateMany({ where: { studentId: link.studentId }, data: { isPrimary: false } });
  await tx.studentGuardian.update({ where: { id: linkId }, data: { isPrimary: true } });
  await writeAudit(tx, ctx, { action: "primary-contact-changed", recordType: "Student", recordId: link.studentId, before: { guardianId: before?.guardianId ?? null }, after: { guardianId: link.guardianId } });
}

export async function setPickup(tx: Tx, ctx: SchoolContext, linkId: string, canPickUp: boolean) {
  const link = await tx.studentGuardian.findFirst({ where: { id: linkId, archivedAt: null } });
  if (!link) throw new StudentProblem("This link was not found.");
  if (canPickUp && link.restriction) throw new StudentProblem("A guardian with a custody or access restriction cannot be on the pickup list. Remove the restriction first.");
  await tx.studentGuardian.update({ where: { id: linkId }, data: { canPickUp } });
  await writeAudit(tx, ctx, { action: "pickup-list-changed", recordType: "Student", recordId: link.studentId, before: { guardianId: link.guardianId, canPickUp: link.canPickUp }, after: { canPickUp } });
}

/**
 * Custody / access restriction (03 §5): only an admin changes it, with a
 * reason. A flagged guardian leaves the pickup list and cannot be the primary
 * contact; Front Office shows them in red.
 */
export async function setRestriction(tx: Tx, ctx: SchoolContext, linkId: string, note: string | null, reason: string) {
  const link = await tx.studentGuardian.findFirst({ where: { id: linkId, archivedAt: null } });
  if (!link) throw new StudentProblem("This link was not found.");
  if (reason.trim().length < 5) throw new StudentProblem("Give a reason of at least 5 characters.", "reason");
  const clean = note?.trim() || null;
  await tx.studentGuardian.update({
    where: { id: linkId },
    data: clean ? { restriction: clean, canPickUp: false, isPrimary: false } : { restriction: null },
  });
  if (clean && link.isPrimary) {
    const next = await tx.studentGuardian.findFirst({ where: { studentId: link.studentId, archivedAt: null, restriction: null, id: { not: linkId } }, orderBy: { emergencyOrder: "asc" } });
    if (next) await tx.studentGuardian.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  await writeAudit(tx, ctx, {
    action: clean ? "restriction-set" : "restriction-removed",
    recordType: "Student",
    recordId: link.studentId,
    before: { guardianId: link.guardianId, restricted: Boolean(link.restriction) },
    after: { guardianId: link.guardianId, restricted: Boolean(clean), reason },
  });
}

/** The approved pickup list for one student, for Front Office, Student Pickup ("Done when" 9). */
export async function pickupList(tx: Tx, studentId: string) {
  const links = await tx.studentGuardian.findMany({ where: { studentId, archivedAt: null }, include: { guardian: true }, orderBy: { emergencyOrder: "asc" } });
  return {
    allowed: links.filter((l) => l.canPickUp && !l.restriction && !l.guardian.archivedAt).map((l) => ({ guardianId: l.guardianId, name: l.guardian.name, relationship: l.relationship, phone: l.guardian.phone })),
    restricted: links.filter((l) => l.restriction).map((l) => ({ guardianId: l.guardianId, name: l.guardian.name, relationship: l.relationship, note: l.restriction! })),
  };
}

/** Merges two parent records that are the same person, keeping every link and history. */
export async function mergeGuardians(tx: Tx, ctx: SchoolContext, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new StudentProblem("Choose two different parent records.");
  const [keep, merge] = await Promise.all([
    tx.guardian.findFirst({ where: { id: keepId, archivedAt: null } }),
    tx.guardian.findFirst({ where: { id: mergeId, archivedAt: null }, include: { students: { where: { archivedAt: null } } } }),
  ]);
  if (!keep || !merge) throw new StudentProblem("One of these parent records was not found.");
  const moved: { linkId: string; studentId: string }[] = [];
  for (const link of merge.students) {
    const already = await tx.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId: link.studentId, guardianId: keepId } } });
    if (already && !already.archivedAt) {
      await tx.studentGuardian.update({ where: { id: link.id }, data: { archivedAt: new Date() } });
      if (link.isPrimary) await tx.studentGuardian.update({ where: { id: already.id }, data: { isPrimary: true } });
    } else if (already) {
      await tx.studentGuardian.update({ where: { id: already.id }, data: { archivedAt: null, relationship: link.relationship, isPrimary: link.isPrimary, emergencyOrder: link.emergencyOrder, canPickUp: link.canPickUp, restriction: link.restriction } });
      await tx.studentGuardian.update({ where: { id: link.id }, data: { archivedAt: new Date() } });
    } else {
      await tx.studentGuardian.update({ where: { id: link.id }, data: { guardianId: keepId } });
    }
    moved.push({ linkId: link.id, studentId: link.studentId });
  }
  // Consent records follow the parent unless the kept record already has one for that child.
  for (const c of await tx.consentRecord.findMany({ where: { guardianId: mergeId } })) {
    const clash = await tx.consentRecord.findUnique({ where: { guardianId_studentId_consentType: { guardianId: keepId, studentId: c.studentId, consentType: c.consentType } } });
    if (!clash) await tx.consentRecord.update({ where: { id: c.id }, data: { guardianId: keepId } });
  }
  await tx.studentDocument.updateMany({ where: { guardianId: mergeId }, data: { guardianId: keepId } });
  await tx.guardian.update({
    where: { id: keepId },
    data: { email: keep.email ?? merge.email, occupation: keep.occupation ?? merge.occupation, altPhone: keep.altPhone ?? (merge.phone !== keep.phone ? merge.phone : merge.altPhone), dateOfBirth: keep.dateOfBirth ?? merge.dateOfBirth, address: keep.address ?? merge.address },
  });
  await tx.guardian.update({ where: { id: mergeId }, data: { archivedAt: new Date() } });
  await tx.guardianMerge.create({ data: { schoolId: ctx.schoolId, keptId: keepId, mergedId: mergeId, moved, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "merged", recordType: "Guardian", recordId: keepId, before: { mergedId: mergeId, mergedName: merge.name }, after: { children: moved.length } });
  return moved.length;
}

// ---- Parent Link (owned by 11 Communication, D4) ----------------------------

export type ParentLinkState = { status: "Active" | "Not sent" | "Revoked"; lastOpenedAt: Date | null };
export type ParentLinkProvider = {
  status: (tx: Tx, ctx: SchoolContext, guardianIds: string[]) => Promise<Map<string, ParentLinkState>>;
  /** Sends the guardian's personal link again by WhatsApp or SMS; returns where it went, e.g. "98xxxxxx10". */
  resend: (tx: Tx, ctx: SchoolContext, guardianId: string) => Promise<string>;
  /** Stops the old link at once and issues a new one. */
  revoke: (tx: Tx, ctx: SchoolContext, guardianId: string) => Promise<string>;
};
let parentLink: ParentLinkProvider | null = null;
/** Communication registers Parent Link here when it is built; the guardian screens then show Resend and Revoke. */
export function registerParentLink(provider: ParentLinkProvider) {
  parentLink = provider;
}
export const parentLinkProvider = () => parentLink;

export async function parentLinkStatus(tx: Tx, ctx: SchoolContext, guardianIds: string[]) {
  if (!parentLink || guardianIds.length === 0) return new Map<string, ParentLinkState>();
  return parentLink.status(tx, ctx, guardianIds);
}
