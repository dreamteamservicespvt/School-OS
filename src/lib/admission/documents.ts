// Documents & Verification (02 §2): the papers checklist for the class
// applied for, upload (PDF, JPG or PNG up to 5 MB), verify, reject with a
// reason, "Original seen at counter", and a reminder listing missing papers.
import "server-only";

import type { ApplicationDocument } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { DOCUMENT_TYPES, FileProblem, saveFile } from "../files";
import { AdmissionProblem } from "./act";
import { applicationScope, requireFull, type Viewer } from "./access";
import { activity, loadApplication, parentName, CLOSED_STAGES } from "./applications";
import { classRule, docLabel, DOC_TYPES, type ClassDoc } from "./settings";
import { messageParent } from "./notify-parents";
import { followPaper } from "./papers";

/** Admission papers are at most 5 MB each (inferred limit). */
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

export const DOC_STATUS_LABEL: Record<string, string> = { NOT_RECEIVED: "Not received", RECEIVED: "Received", VERIFIED: "Verified", REJECTED: "Rejected" };

export type Progress = { required: number; verified: number; requiredVerified: number; total: number; missing: string[]; complete: boolean; unverifiedRequired: string[] };

/** "4 of 6 verified" and the missing papers, against the class checklist. */
export function progressOf(docs: Pick<ApplicationDocument, "docType" | "status">[], checklist: ClassDoc[]): Progress {
  const required = checklist.filter((c) => c.required);
  const verified = docs.filter((d) => d.status === "VERIFIED");
  const requiredVerified = required.filter((c) => docs.some((d) => d.docType === c.type && d.status === "VERIFIED")).length;
  const missing = checklist.filter((c) => !docs.some((d) => d.docType === c.type && (d.status === "RECEIVED" || d.status === "VERIFIED"))).map((c) => docLabel(c.type));
  const unverifiedRequired = required.filter((c) => !docs.some((d) => d.docType === c.type && d.status === "VERIFIED")).map((c) => docLabel(c.type));
  return { required: required.length, verified: verified.length, requiredVerified, total: Math.max(checklist.length, docs.length), missing, complete: unverifiedRequired.length === 0, unverifiedRequired };
}

async function loadDoc(tx: Tx, v: Viewer, docId: string) {
  const doc = await tx.applicationDocument.findFirst({ where: { id: docId, application: applicationScope(v) } });
  if (!doc) throw new AdmissionProblem("This paper was not found.");
  const app = await loadApplication(tx, doc.applicationId, v);
  if (CLOSED_STAGES.includes(app.stage) && app.stage !== "ADMITTED") throw new AdmissionProblem("This application is closed, so its papers cannot change.");
  return { doc, app };
}

export async function uploadDocument(tx: Tx, ctx: SchoolContext, v: Viewer, input: { applicationId: string; docType: string; file: File; note: string | null }) {
  requireFull(v, "admission papers");
  const app = await loadApplication(tx, input.applicationId, v);
  if (CLOSED_STAGES.includes(app.stage) && app.stage !== "ADMITTED") throw new AdmissionProblem("This application is closed, so papers cannot be added.");
  if (!DOC_TYPES.some((d) => d.key === input.docType)) throw new AdmissionProblem("Choose the document type.", "docType");
  if (input.file.size > MAX_DOC_BYTES) throw new FileProblem(`This file is ${(input.file.size / 1024 / 1024).toFixed(1)} MB. Admission papers can be at most 5 MB. Take a smaller photo or scan at a lower size.`);
  const stored = await saveFile(tx, ctx, { file: input.file, purpose: "admission-document", allowed: DOCUMENT_TYPES, maxImageWidth: 2000 });
  const existing = await tx.applicationDocument.findUnique({ where: { applicationId_docType: { applicationId: app.id, docType: input.docType } } });
  const now = new Date();
  const doc = existing
    ? await tx.applicationDocument.update({ where: { id: existing.id }, data: { fileId: stored.id, status: "RECEIVED", note: input.note, rejectReason: null, verifiedAt: null, verifiedById: null, uploadedById: ctx.userId, uploadedAt: now } })
    : await tx.applicationDocument.create({ data: { schoolId: ctx.schoolId, applicationId: app.id, docType: input.docType, required: (await classRule(tx, app.classId)).documents.find((d) => d.type === input.docType)?.required ?? false, fileId: stored.id, status: "RECEIVED", note: input.note, uploadedById: ctx.userId, uploadedAt: now } });
  // Admitted with papers pending: the paper goes onto the student's documents too.
  const followed = await followPaper(tx, ctx, app, doc, "uploaded", existing?.fileId ?? null);
  await activity(tx, ctx, app.id, "document", `${docLabel(input.docType)} uploaded${existing?.fileId ? " (new copy)" : ""}.${followed ? ` ${followed}` : ""}`, { docType: input.docType, fileId: stored.id, previousFileId: existing?.fileId ?? null });
  await writeAudit(tx, ctx, { action: "document-uploaded", recordType: "Application", recordId: app.id, before: existing ? { status: existing.status, fileId: existing.fileId } : null, after: { docType: input.docType, fileId: stored.id, status: "RECEIVED" } });
  return doc;
}

export async function verifyDocument(tx: Tx, ctx: SchoolContext, v: Viewer, docId: string) {
  requireFull(v, "verifying papers");
  const { doc, app } = await loadDoc(tx, v, docId);
  if (doc.status === "VERIFIED") throw new AdmissionProblem("This paper is already verified.");
  if (!doc.fileId && !doc.originalSeen) throw new AdmissionProblem(`Upload ${docLabel(doc.docType).toLowerCase()} or mark the original as seen at the counter before verifying it.`);
  const done = await tx.applicationDocument.update({ where: { id: doc.id }, data: { status: "VERIFIED", verifiedById: ctx.userId, verifiedAt: new Date(), rejectReason: null } });
  const followed = await followPaper(tx, ctx, app, done, "verified");
  await activity(tx, ctx, app.id, "document", `${docLabel(doc.docType)} verified.${followed ? ` ${followed}` : ""}`, { docType: doc.docType });
  await writeAudit(tx, ctx, { action: "document-verified", recordType: "Application", recordId: app.id, before: { docType: doc.docType, status: doc.status }, after: { status: "VERIFIED" } });
}

export async function rejectDocument(tx: Tx, ctx: SchoolContext, v: Viewer, schoolName: string, docId: string, reason: string, tellParent: boolean) {
  requireFull(v, "rejecting papers");
  const { doc, app } = await loadDoc(tx, v, docId);
  if (reason.trim().length < 3) throw new AdmissionProblem("Give a reason, for example \"Photo not clear\".", "reason");
  const done = await tx.applicationDocument.update({ where: { id: doc.id }, data: { status: "REJECTED", rejectReason: reason.trim(), verifiedAt: null, verifiedById: null } });
  const followed = await followPaper(tx, ctx, app, done, "rejected");
  let told = false;
  let notSent: string | null = null;
  if (tellParent) {
    const name = parentName(app);
    const r = await messageParent(tx, ctx, { to: { name, phone: app.phone, email: app.email }, template: "admission-document-rejected", text: `Dear ${name}, the ${docLabel(doc.docType).toLowerCase()} for ${app.fullName} (application ${app.applicationNo}) could not be accepted: ${reason.trim()}. Please bring or send a new copy to ${schoolName}.`, about: { recordType: "Application", recordId: app.id } });
    told = r.status === "queued";
    if (!told) notSent = r.note ?? "No valid mobile number";
  }
  await activity(tx, ctx, app.id, "document", `${docLabel(doc.docType)} rejected: ${reason.trim()}.${followed ? ` ${followed}` : ""}${told ? " Message to the parent queued." : notSent ? ` Parent not messaged: ${notSent}.` : ""}`, { docType: doc.docType });
  await writeAudit(tx, ctx, { action: "document-rejected", recordType: "Application", recordId: app.id, before: { docType: doc.docType, status: doc.status }, after: { status: "REJECTED", reason: reason.trim(), told } });
  return { told, notSent };
}

/** "Original seen at counter" (inferred): the original was shown; a paper not yet received becomes Received. */
export async function markOriginalSeen(tx: Tx, ctx: SchoolContext, v: Viewer, docId: string) {
  requireFull(v, "admission papers");
  const { doc, app } = await loadDoc(tx, v, docId);
  if (doc.originalSeen) throw new AdmissionProblem("The original is already marked as seen.");
  await tx.applicationDocument.update({ where: { id: doc.id }, data: { originalSeen: true, status: doc.status === "NOT_RECEIVED" || doc.status === "REJECTED" ? "RECEIVED" : doc.status } });
  await activity(tx, ctx, app.id, "document", `${docLabel(doc.docType)}: original seen at the counter.`, { docType: doc.docType });
  await writeAudit(tx, ctx, { action: "document-original-seen", recordType: "Application", recordId: app.id, after: { docType: doc.docType } });
}

/** Send a reminder to the parent listing the missing papers. */
export async function remindMissing(tx: Tx, ctx: SchoolContext, v: Viewer, schoolName: string, applicationId: string) {
  requireFull(v, "reminders");
  const app = await loadApplication(tx, applicationId, v);
  const rule = await classRule(tx, app.classId);
  const docs = await tx.applicationDocument.findMany({ where: { applicationId } });
  const p = progressOf(docs, rule.documents);
  const rejected = docs.filter((d) => d.status === "REJECTED").map((d) => `${docLabel(d.docType)} (${d.rejectReason ?? "new copy needed"})`);
  const list = [...new Set([...p.missing.filter((m) => !rejected.some((r) => r.startsWith(m))), ...rejected])];
  if (list.length === 0) throw new AdmissionProblem("No papers are missing for this applicant.");
  const name = parentName(app);
  const r = await messageParent(tx, ctx, { to: { name, phone: app.phone, email: app.email }, template: "admission-documents-missing", text: `Dear ${name}, for ${app.fullName}'s admission (application ${app.applicationNo}) at ${schoolName}, please bring: ${list.join(", ")}.`, about: { recordType: "Application", recordId: app.id } });
  if (r.status === "skipped") throw new AdmissionProblem(`The reminder was not sent. ${r.note ?? "The application has no valid mobile number"}.`);
  await activity(tx, ctx, app.id, "reminder", `Reminder sent for missing papers: ${list.join(", ")}.`);
  return list.length;
}

/** Record an exception at decision: admit with papers pending, with a reason. */
export async function recordPapersException(tx: Tx, ctx: SchoolContext, v: Viewer, applicationId: string, reason: string) {
  requireFull(v, "exceptions");
  if (!v.overCapacity) throw new AdmissionProblem("Only the Principal or School Admin can record an exception for missing papers.");
  const app = await loadApplication(tx, applicationId, v);
  if (reason.trim().length < 10) throw new AdmissionProblem("Give the reason for the exception in a sentence, for example \"TC to come from the old school by 30-06\".", "reason");
  await tx.application.update({ where: { id: app.id }, data: { papersException: reason.trim(), updatedById: ctx.userId } });
  await activity(tx, ctx, app.id, "exception", `Exception recorded: may be admitted with papers pending. Reason: ${reason.trim()}`);
  await writeAudit(tx, ctx, { action: "papers-exception", recordType: "Application", recordId: app.id, before: { papersException: app.papersException }, after: { papersException: reason.trim() } });
}
