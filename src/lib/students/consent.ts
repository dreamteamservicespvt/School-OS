// Consent Records (DPDP Act 2023, decided 9 October 2026, D8a; 04-data-model.md rule 33).
// Staff never tick consent: they send a request, and the guardian agrees in
// Parent Link with a one-time code (or on the admission form). Withdrawal can
// be recorded by the office when a guardian asks; photo consent is withdrawn
// on its own.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { StudentProblem } from "./students";
import { CONSENT_TYPES } from "./labels";

export type ConsentState = "GIVEN" | "WITHDRAWN" | "REQUESTED" | "NONE";

async function currentText(tx: Tx, consentType: string) {
  return tx.consentText.findFirst({ where: { consentType, isCurrent: true }, orderBy: { version: "desc" } });
}

/**
 * Sends a consent request to each guardian for each of their children, for
 * the chosen consent types. Consents already given are left as they are.
 */
export async function requestConsent(tx: Tx, ctx: SchoolContext, guardianIds: string[], types: string[] = CONSENT_TYPES.map((t) => t.key)) {
  let requested = 0;
  let alreadyGiven = 0;
  const reached = new Set<string>();
  for (const guardianId of guardianIds) {
    const links = await tx.studentGuardian.findMany({ where: { guardianId, archivedAt: null, guardian: { archivedAt: null } } });
    for (const link of links) {
      for (const consentType of types) {
        const existing = await tx.consentRecord.findUnique({ where: { guardianId_studentId_consentType: { guardianId, studentId: link.studentId, consentType } } });
        if (existing?.status === "GIVEN") { alreadyGiven++; continue; }
        const text = await currentText(tx, consentType);
        const data = { status: "REQUESTED" as const, requestedAt: new Date(), requestedById: ctx.userId, consentTextId: text?.id ?? null, version: text?.version ?? null };
        if (existing) await tx.consentRecord.update({ where: { id: existing.id }, data });
        else await tx.consentRecord.create({ data: { schoolId: ctx.schoolId, guardianId, studentId: link.studentId, consentType, ...data } });
        requested++;
        reached.add(guardianId);
      }
    }
  }
  // messaging: send each guardian in `reached` their consent request through Parent Link
  // (template "consent-request", sendMessage from 11 Communication, which also handles opt-outs).
  await writeAudit(tx, ctx, { action: "consent-requested", recordType: "Consent Record", recordId: null, after: { guardians: reached.size, requests: requested, alreadyGiven, types } });
  return { guardians: reached.size, requested, alreadyGiven };
}

/**
 * Consent given by the guardian. Called by Parent Link (after the one-time
 * code) or by Admission (the application form). Never by staff.
 */
export async function recordConsentGiven(tx: Tx, ctx: SchoolContext, c: { guardianId: string; studentId: string; consentType: string; method: "parent-link" | "admission-form"; consentTextId: string }) {
  if (c.method !== "parent-link" && c.method !== "admission-form") throw new StudentProblem("Consent is given only by the guardian, in Parent Link or on the admission form.");
  const text = await tx.consentText.findFirst({ where: { id: c.consentTextId, consentType: c.consentType } });
  if (!text) throw new StudentProblem("This consent text was not found.");
  const data = { status: "GIVEN" as const, givenOn: new Date(), method: c.method, consentTextId: text.id, version: text.version, withdrawnOn: null, withdrawnNote: null };
  const row = await tx.consentRecord.upsert({
    where: { guardianId_studentId_consentType: { guardianId: c.guardianId, studentId: c.studentId, consentType: c.consentType } },
    create: { schoolId: ctx.schoolId, guardianId: c.guardianId, studentId: c.studentId, consentType: c.consentType, ...data },
    update: data,
  });
  await writeAudit(tx, ctx, { action: "consent-given", recordType: "Consent Record", recordId: row.id, after: { consentType: c.consentType, version: text.version, method: c.method } });
  return row;
}

/** Records a withdrawal (in Parent Link, or the guardian asked the office). The record stays, with the date. */
export async function withdrawConsent(tx: Tx, ctx: SchoolContext, c: { guardianId: string; consentType: string; studentId?: string | null; note: string }) {
  if (c.note.trim().length < 5) throw new StudentProblem("Say how the guardian asked, in at least 5 characters (for example \"Letter dated 12-10-2026\").", "note");
  const rows = await tx.consentRecord.findMany({ where: { guardianId: c.guardianId, consentType: c.consentType, status: { in: ["GIVEN", "REQUESTED"] }, ...(c.studentId ? { studentId: c.studentId } : {}) } });
  if (rows.length === 0) throw new StudentProblem("There is no consent of this type to withdraw.");
  const now = new Date();
  for (const r of rows) {
    await tx.consentRecord.update({ where: { id: r.id }, data: { status: "WITHDRAWN", withdrawnOn: now, withdrawnNote: c.note.trim() } });
    await writeAudit(tx, ctx, { action: "consent-withdrawn", recordType: "Consent Record", recordId: r.id, before: { status: r.status }, after: { status: "WITHDRAWN", consentType: c.consentType, note: c.note.trim() } });
  }
  return rows.length;
}

/** One state per consent type for a guardian (across their children: Given only if given for every child). */
export function consentState(records: { consentType: string; status: string }[], consentType: string): ConsentState {
  const mine = records.filter((r) => r.consentType === consentType);
  if (mine.length === 0) return "NONE";
  if (mine.some((r) => r.status === "WITHDRAWN")) return "WITHDRAWN";
  if (mine.every((r) => r.status === "GIVEN")) return "GIVEN";
  if (mine.some((r) => r.status === "REQUESTED")) return "REQUESTED";
  return "NONE";
}

/** Photo use is allowed only while every linked guardian's photo consent stands (rule 33). */
export async function photoConsentStands(tx: Tx, studentId: string) {
  const rows = await tx.consentRecord.findMany({ where: { studentId, consentType: "photo" } });
  return rows.length > 0 && rows.every((r) => r.status === "GIVEN");
}
