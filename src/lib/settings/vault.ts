// School documents (document vault, School Profile): registration,
// affiliation, NOCs and other papers, with versions, expiry reminders,
// verification, access by role and sharing links that expire.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { DOCUMENT_TYPES, fileLink, saveFile } from "../files";
import { formatDate } from "../format";
import { SettingsProblem } from "./common";
import { DOCUMENT_TYPES_VAULT } from "./profile-rules";

export type DocVersion = { fileId: string; uploadedAt: string; uploadedById: string | null; fileName: string };

/** Reminders start this many days before a document expires (inferred: 30 days). */
export const REMIND_DAYS = 30;
export const DEFAULT_SHARE_DAYS = 7;

/** School Admins see every document; others see those shared with one of their roles. */
export function mayOpenDocument(doc: { visibleTo: string[] }, roleKeys: (string | null)[]) {
  return roleKeys.some((k) => k === "school-admin" || (k !== null && doc.visibleTo.includes(k)));
}

export function expiryState(expiresOn: Date | null, today = new Date()): "expired" | "soon" | "ok" | "none" {
  if (!expiresOn) return "none";
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((expiresOn.getTime() - t) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= REMIND_DAYS) return "soon";
  return "ok";
}

export type NewDocument = { docType: string; title: string; issuedOn: Date | null; expiresOn: Date | null; visibleTo: string[]; file: File };

function checkDates(issuedOn: Date | null, expiresOn: Date | null) {
  if (issuedOn && expiresOn && expiresOn <= issuedOn) throw new SettingsProblem("The expiry date must be after the issue date.", "expiresOn");
}

async function checkRoles(tx: Tx, keys: string[]) {
  const clean = [...new Set(keys)];
  if (clean.length === 0) throw new SettingsProblem("Choose who can see it.", "visibleTo");
  const roles = await tx.role.findMany({ where: { key: { in: clean }, archivedAt: null }, select: { key: true } });
  if (roles.length !== clean.length) throw new SettingsProblem("One of the chosen roles was not found.", "visibleTo");
  return clean;
}

export async function uploadDocument(tx: Tx, ctx: SchoolContext, input: NewDocument) {
  if (!DOCUMENT_TYPES_VAULT.includes(input.docType as never)) throw new SettingsProblem("Choose the document type.", "docType");
  checkDates(input.issuedOn, input.expiresOn);
  const visibleTo = await checkRoles(tx, input.visibleTo);
  const file = await saveFile(tx, ctx, { file: input.file, purpose: "school-document", allowed: DOCUMENT_TYPES });
  const version: DocVersion = { fileId: file.id, uploadedAt: new Date().toISOString(), uploadedById: ctx.userId, fileName: file.fileName };
  const doc = await tx.schoolDocument.create({
    data: {
      schoolId: ctx.schoolId,
      docType: input.docType,
      title: input.title,
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      visibleTo,
      versions: [version] as Prisma.InputJsonValue,
      createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "School Document", recordId: doc.id, after: { docType: input.docType, title: input.title, expiresOn: input.expiresOn?.toISOString().slice(0, 10) ?? null, visibleTo } });
  return doc;
}

async function findDoc(tx: Tx, id: string, roleKeys: (string | null)[]) {
  const doc = await tx.schoolDocument.findUnique({ where: { id } });
  if (!doc || !mayOpenDocument(doc, roleKeys)) throw new SettingsProblem("This document was not found.");
  return doc;
}

/** A new version (for example a renewed NOC). Old versions are kept; verification starts again. */
export async function uploadVersion(tx: Tx, ctx: SchoolContext, roleKeys: (string | null)[], id: string, input: { file: File; issuedOn: Date | null; expiresOn: Date | null }) {
  const doc = await findDoc(tx, id, roleKeys);
  if (doc.archivedAt) throw new SettingsProblem("This document is archived. Restore it first.");
  checkDates(input.issuedOn, input.expiresOn);
  const file = await saveFile(tx, ctx, { file: input.file, purpose: "school-document", allowed: DOCUMENT_TYPES });
  const versions = [...(doc.versions as DocVersion[]), { fileId: file.id, uploadedAt: new Date().toISOString(), uploadedById: ctx.userId, fileName: file.fileName }];
  await tx.schoolDocument.update({
    where: { id },
    data: { versions: versions as Prisma.InputJsonValue, issuedOn: input.issuedOn ?? doc.issuedOn, expiresOn: input.expiresOn, verified: false, verifiedById: null, reminderSentFor: null },
  });
  await writeAudit(tx, ctx, {
    action: "new-version",
    recordType: "School Document",
    recordId: id,
    before: { versions: versions.length - 1, expiresOn: doc.expiresOn?.toISOString().slice(0, 10) ?? null },
    after: { versions: versions.length, expiresOn: input.expiresOn?.toISOString().slice(0, 10) ?? null },
  });
  return versions.length;
}

export async function setVerified(tx: Tx, ctx: SchoolContext, roleKeys: (string | null)[], id: string, verified: boolean) {
  const doc = await findDoc(tx, id, roleKeys);
  if (doc.verified === verified) return false;
  await tx.schoolDocument.update({ where: { id }, data: { verified, verifiedById: verified ? ctx.userId : null } });
  await writeAudit(tx, ctx, { action: verified ? "verified" : "unverified", recordType: "School Document", recordId: id, before: { verified: doc.verified }, after: { verified } });
  return true;
}

export async function editDocument(tx: Tx, ctx: SchoolContext, roleKeys: (string | null)[], id: string, input: { docType: string; title: string; issuedOn: Date | null; expiresOn: Date | null; visibleTo: string[] }) {
  const doc = await findDoc(tx, id, roleKeys);
  if (!DOCUMENT_TYPES_VAULT.includes(input.docType as never)) throw new SettingsProblem("Choose the document type.", "docType");
  checkDates(input.issuedOn, input.expiresOn);
  const visibleTo = await checkRoles(tx, input.visibleTo);
  const before = { docType: doc.docType, title: doc.title, issuedOn: doc.issuedOn?.toISOString().slice(0, 10) ?? null, expiresOn: doc.expiresOn?.toISOString().slice(0, 10) ?? null, visibleTo: doc.visibleTo };
  const after = { docType: input.docType, title: input.title, issuedOn: input.issuedOn?.toISOString().slice(0, 10) ?? null, expiresOn: input.expiresOn?.toISOString().slice(0, 10) ?? null, visibleTo };
  if (JSON.stringify(before) === JSON.stringify(after)) return false;
  const expiryChanged = before.expiresOn !== after.expiresOn;
  await tx.schoolDocument.update({ where: { id }, data: { docType: input.docType, title: input.title, issuedOn: input.issuedOn, expiresOn: input.expiresOn, visibleTo, ...(expiryChanged ? { reminderSentFor: null } : {}) } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "School Document", recordId: id, before, after });
  return true;
}

export async function setDocumentArchived(tx: Tx, ctx: SchoolContext, roleKeys: (string | null)[], id: string, archived: boolean) {
  const doc = await findDoc(tx, id, roleKeys);
  if (Boolean(doc.archivedAt) === archived) return doc;
  await tx.schoolDocument.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await writeAudit(tx, ctx, { action: archived ? "archived" : "restored", recordType: "School Document", recordId: id, after: { title: doc.title } });
  return doc;
}

/** A sharing link to the latest version that stops working after the chosen days (default 7). */
export async function shareDocument(tx: Tx, ctx: SchoolContext, roleKeys: (string | null)[], id: string, days: number, now = Date.now()) {
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new SettingsProblem("A sharing link can work for 1 to 30 days.", "days");
  const doc = await findDoc(tx, id, roleKeys);
  if (doc.archivedAt) throw new SettingsProblem("This document is archived. Restore it before sharing.");
  const latest = (doc.versions as DocVersion[]).at(-1);
  if (!latest) throw new SettingsProblem("This document has no file yet.");
  const expires = new Date(now + days * 86_400_000);
  const link = fileLink(latest.fileId, ctx.schoolId, now, days * 86_400_000);
  await writeAudit(tx, ctx, { action: "shared", recordType: "School Document", recordId: id, after: { title: doc.title, validUntil: expires.toISOString(), days } });
  return { link, expires };
}

/**
 * Daily: reminds School Admins and the Principal about documents that expire
 * within 30 days, once per expiry date (the A15 reminder pattern).
 */
export async function remindExpiringDocuments(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const until = new Date(now.getTime() + REMIND_DAYS * 86_400_000);
  const docs = await tx.schoolDocument.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, expiresOn: { not: null, lte: until } } });
  const due = docs.filter((d) => !d.reminderSentFor || d.reminderSentFor.getTime() !== d.expiresOn!.getTime());
  if (due.length === 0) return 0;
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const people = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: { in: ["school-admin", "principal"] } } } } },
    select: { userLoginId: true, roles: { select: { role: { select: { key: true } } } } },
  });
  for (const d of due) {
    const past = d.expiresOn! < now;
    const text = past
      ? `${d.title} (${d.docType}) expired on ${formatDate(d.expiresOn!, school?.timeZone)}. Upload the renewed paper.`
      : `${d.title} (${d.docType}) expires on ${formatDate(d.expiresOn!, school?.timeZone)}. Start the renewal.`;
    const sent = new Set<string>();
    for (const p of people) {
      if (sent.has(p.userLoginId)) continue;
      if (!mayOpenDocument(d, p.roles.map((r) => r.role.key))) continue;
      sent.add(p.userLoginId);
      await notify(tx, ctx, { to: p.userLoginId, type: "document-expiry", text, link: `/settings/school-profile?doc=${d.id}#documents`, groupKey: "school-document-expiry", mergedText: (n) => `${n} school documents expire soon or have expired` });
    }
    await tx.schoolDocument.update({ where: { id: d.id }, data: { reminderSentFor: d.expiresOn } });
  }
  return due.length;
}
