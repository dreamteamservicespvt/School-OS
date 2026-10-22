// Consent Records (DPDP Act 2023, decided 9 October 2026, D8a; 04-data-model.md rule 33),
// as Student Management shows them. The records themselves belong to Parent Link
// (src/lib/parent-link/consent.ts): each giving is its own row keeping the Consent
// Text version, and a withdrawal stays on record with its date. Staff never tick
// consent: they send a request, and the guardian agrees in Parent Link with a
// one-time code (or on the admission form).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestConsent as askParents } from "../parent-link/consent";
import { StudentProblem } from "./students";
import { CONSENT_TYPES } from "./labels";
import { OPEN_LINK } from "./guardian-access";

/** REFUSED: the guardian said no on a paper form (gap list G42); they can still agree later in Parent Link. */
export type ConsentState = "GIVEN" | "WITHDRAWN" | "REFUSED" | "REQUESTED" | "NONE";
export type ConsentRow = { guardianId: string; studentId: string; consentType: string; status: Exclude<ConsentState, "NONE">; consentTextId: string | null; version: number | null; givenOn: Date | null; method: string | null; withdrawnOn: Date | null; withdrawnNote: string | null; recordedById?: string | null; recordedOn?: Date | null };

async function currentText(tx: Tx, ctx: SchoolContext, consentType: string) {
  return tx.consentText.findFirst({ where: { schoolId: ctx.schoolId, consentType, isCurrent: true }, orderBy: { version: "desc" } });
}

/**
 * One row per guardian, child and consent type: the latest record decides
 * (given, or withdrawn); a guardian asked in an open request with nothing
 * given yet is "requested".
 */
export async function consentRows(tx: Tx, ctx: SchoolContext, where: { guardianIds?: string[]; studentIds?: string[]; consentType?: string } = {}): Promise<ConsentRow[]> {
  const records = await tx.consentRecord.findMany({
    where: {
      schoolId: ctx.schoolId,
      archivedAt: null,
      ...(where.guardianIds ? { guardianId: { in: where.guardianIds } } : {}),
      ...(where.studentIds ? { studentId: { in: where.studentIds } } : {}),
      ...(where.consentType ? { consentType: where.consentType } : {}),
    },
    orderBy: { givenAt: "desc" },
  });
  const out = new Map<string, ConsentRow>();
  for (const r of records) {
    const key = `${r.guardianId}:${r.studentId}:${r.consentType}`;
    if (out.has(key)) continue;
    out.set(key, {
      guardianId: r.guardianId, studentId: r.studentId, consentType: r.consentType,
      status: r.refused ? "REFUSED" : r.withdrawnAt ? "WITHDRAWN" : "GIVEN",
      consentTextId: r.consentTextId, version: r.textVersion, givenOn: r.givenAt, method: r.how,
      withdrawnOn: r.refused ? null : r.withdrawnAt, withdrawnNote: r.refused ? null : r.withdrawnHow,
      recordedById: r.createdById, recordedOn: r.createdAt,
    });
  }
  const requests = await tx.consentRequest.findMany({
    where: { schoolId: ctx.schoolId, replyBy: { gte: new Date(new Date().toISOString().slice(0, 10)) }, ...(where.consentType ? { consentType: where.consentType } : {}), ...(where.guardianIds ? { guardianIds: { hasSome: where.guardianIds } } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (requests.length) {
    const asked = [...new Set(requests.flatMap((q) => q.guardianIds))].filter((g) => !where.guardianIds || where.guardianIds.includes(g));
    const links = await tx.studentGuardian.findMany({ where: { guardianId: { in: asked }, ...OPEN_LINK, ...(where.studentIds ? { studentId: { in: where.studentIds } } : {}) } });
    for (const q of requests) {
      for (const l of links) {
        if (!q.guardianIds.includes(l.guardianId)) continue;
        const key = `${l.guardianId}:${l.studentId}:${q.consentType}`;
        if (!out.has(key)) out.set(key, { guardianId: l.guardianId, studentId: l.studentId, consentType: q.consentType, status: "REQUESTED", consentTextId: q.consentTextId, version: null, givenOn: null, method: null, withdrawnOn: null, withdrawnNote: null });
      }
    }
  }
  return [...out.values()];
}

/**
 * Sends a consent request to the chosen guardians, through Parent Link, for each
 * consent type. Guardians who have already given it for every child are left out.
 */
export async function requestConsent(tx: Tx, ctx: SchoolContext, guardianIds: string[], chosen?: string[]) {
  // Not chosen: every consent the school asks for (a type with a current text).
  const types = chosen ?? (await tx.consentText.findMany({ where: { schoolId: ctx.schoolId, isCurrent: true, consentType: { in: CONSENT_TYPES.map((t) => t.key) } }, select: { consentType: true }, distinct: ["consentType"] })).map((t) => t.consentType);
  if (!types.length) throw new StudentProblem("There is no consent text yet. Add one in Settings, Data Backup & Security.");
  let requested = 0;
  let alreadyGiven = 0;
  const reached = new Set<string>();
  const replyBy = new Date(Date.now() + 14 * 86_400_000);
  for (const consentType of types) {
    const text = await currentText(tx, ctx, consentType);
    if (!text) throw new StudentProblem(`There is no current consent text for ${CONSENT_TYPES.find((t) => t.key === consentType)?.label ?? consentType}. Add one in Settings, Data Backup & Security.`);
    const rows = await consentRows(tx, ctx, { guardianIds, consentType });
    const todo = guardianIds.filter((g) => {
      const mine = rows.filter((r) => r.guardianId === g);
      const given = mine.length > 0 && mine.every((r) => r.status === "GIVEN");
      if (given) alreadyGiven++;
      return !given;
    });
    if (!todo.length) continue;
    await askParents(tx, ctx, { consentTextId: text.id, guardianIds: todo, audienceLabel: todo.length === 1 ? "One parent (Student Management)" : `${todo.length} parents (Student Management)`, replyBy });
    requested += todo.length;
    todo.forEach((g) => reached.add(g));
  }
  return { guardians: reached.size, requested, alreadyGiven };
}

/**
 * Consent given by the guardian. Called by Admission (the application form);
 * Parent Link records its own after the one-time code. Never by staff.
 */
export async function recordConsentGiven(tx: Tx, ctx: SchoolContext, c: { guardianId: string; studentId: string; consentType: string; method: "parent-link" | "admission-form"; consentTextId: string }) {
  if (c.method !== "parent-link" && c.method !== "admission-form") throw new StudentProblem("Consent is given only by the guardian, in Parent Link or on the admission form.");
  const text = await tx.consentText.findFirst({ where: { id: c.consentTextId, consentType: c.consentType } });
  if (!text) throw new StudentProblem("This consent text was not found.");
  const row = await tx.consentRecord.create({
    data: { schoolId: ctx.schoolId, guardianId: c.guardianId, studentId: c.studentId, consentType: c.consentType, consentTextId: text.id, textVersion: text.version, how: c.method, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "consent-given", recordType: "Consent Record", recordId: row.id, after: { consentType: c.consentType, version: text.version, method: c.method } });
  return row;
}

/** Records a withdrawal the guardian asked the office for. The record stays, with the date. */
export async function withdrawConsent(tx: Tx, ctx: SchoolContext, c: { guardianId: string; consentType: string; studentId?: string | null; note: string }) {
  if (c.note.trim().length < 5) throw new StudentProblem("Say how the guardian asked, in at least 5 characters (for example \"Letter dated 12-10-2026\").", "note");
  const rows = await tx.consentRecord.findMany({ where: { schoolId: ctx.schoolId, guardianId: c.guardianId, consentType: c.consentType, withdrawnAt: null, ...(c.studentId ? { studentId: c.studentId } : {}) } });
  if (rows.length === 0) throw new StudentProblem("There is no consent of this type to withdraw.");
  const now = new Date();
  for (const r of rows) {
    await tx.consentRecord.update({ where: { id: r.id }, data: { withdrawnAt: now, withdrawnHow: `office: ${c.note.trim()}` } });
    await writeAudit(tx, ctx, { action: "consent-withdrawn", recordType: "Consent Record", recordId: r.id, before: { status: "GIVEN" }, after: { status: "WITHDRAWN", consentType: c.consentType, note: c.note.trim() } });
  }
  return rows.length;
}

/** One state per consent type for a guardian (across their children: Given only if given for every child). */
export function consentState(records: { consentType: string; status: string }[], consentType: string): ConsentState {
  const mine = records.filter((r) => r.consentType === consentType);
  if (mine.length === 0) return "NONE";
  if (mine.some((r) => r.status === "WITHDRAWN")) return "WITHDRAWN";
  if (mine.some((r) => r.status === "REFUSED")) return "REFUSED";
  if (mine.every((r) => r.status === "GIVEN")) return "GIVEN";
  if (mine.some((r) => r.status === "REQUESTED")) return "REQUESTED";
  return "NONE";
}

/** Photo use is allowed only while every linked guardian's photo consent stands (rule 33). */
export async function photoConsentStands(tx: Tx, ctx: SchoolContext, studentId: string) {
  const rows = (await consentRows(tx, ctx, { studentIds: [studentId], consentType: "photo" })).filter((r) => r.status !== "REQUESTED");
  return rows.length > 0 && rows.every((r) => r.status === "GIVEN");
}

export type ApaarConsent = { state: ConsentState; guardianName: string | null; on: Date | null; how: string | null };

/**
 * APAAR consent for one child (gap list G42; 03 §1 Identifiers): its own
 * purpose, never bundled with data consent. A guardian's consent for a minor:
 * it stands while any parent on record (not one with a custody restriction)
 * has given it. Otherwise the latest answer: withdrawn, refused on a paper
 * form, asked in Parent Link, or not given.
 */
export async function apaarConsentOf(tx: Tx, ctx: SchoolContext, studentId: string): Promise<ApaarConsent> {
  const links = await tx.studentGuardian.findMany({ where: { studentId, ...OPEN_LINK, guardian: { archivedAt: null } }, select: { guardianId: true, guardian: { select: { name: true } } } });
  if (!links.length) return { state: "NONE", guardianName: null, on: null, how: null };
  const rows = await consentRows(tx, ctx, { studentIds: [studentId], consentType: "apaar", guardianIds: links.map((l) => l.guardianId) });
  const name = (g: string) => links.find((l) => l.guardianId === g)?.guardian.name ?? null;
  const pick = (st: ConsentState) => rows.find((r) => r.status === st);
  for (const st of ["GIVEN", "WITHDRAWN", "REFUSED", "REQUESTED"] as const) {
    const r = pick(st);
    if (r) return { state: st, guardianName: name(r.guardianId), on: st === "WITHDRAWN" ? r.withdrawnOn : r.givenOn, how: r.method };
  }
  return { state: "NONE", guardianName: null, on: null, how: null };
}
