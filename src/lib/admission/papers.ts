// Admission papers on the student's record (02 §2 "Confirm admission", gap
// list G21). On admission every paper with a file that was received or
// verified in Documents & Verification becomes one of the student's
// documents: the same stored file (nothing is copied), named as Student
// Settings lists it, so the profile shows it as collected and Student
// Management's own rules decide who may open it. A paper still waiting to be
// checked says so in its note. A verified photo becomes the student's photo.
// A rejected paper is not carried: the family has to bring a new copy.
//
// Papers keep arriving after admission when the school admits with papers
// pending (a TC from the old school, say). When such a paper is uploaded,
// verified or rejected on the admitted application, the student's documents
// follow: a new copy replaces the old one, a verified one says so, and a
// rejected one comes off the student's documents.
import "server-only";

import type { Application, ApplicationDocument } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { IMAGE_TYPES } from "../files";
import { getStudentSettings } from "../students/settings";
import { studentDocumentKind } from "./settings";

type Paper = Pick<ApplicationDocument, "docType" | "status" | "fileId" | "originalSeen" | "uploadedById">;

/** The note on the student's document: where it came from and whether it was checked. */
export function paperNote(p: Pick<Paper, "status" | "originalSeen">, applicationNo: string, when: "at admission" | "after admission") {
  return p.status === "VERIFIED"
    ? `Verified ${when} (application ${applicationNo})${p.originalSeen ? ", original seen" : ""}`
    : `Received ${when} (application ${applicationNo}), not verified yet`;
}

const isImage = (contentType: string | undefined) => Boolean(contentType && (IMAGE_TYPES as readonly string[]).includes(contentType));

/**
 * On admission: every received or verified paper with a file becomes the
 * student's document (same file). Returns the documents made and the photo set.
 */
export async function carryPapers(tx: Tx, ctx: SchoolContext, app: Pick<Application, "id" | "applicationNo">, studentId: string) {
  const papers = await tx.applicationDocument.findMany({ where: { applicationId: app.id, status: { in: ["VERIFIED", "RECEIVED"] }, fileId: { not: null } }, orderBy: { createdAt: "asc" } });
  const documentIds: string[] = [];
  let photoFileId: string | null = null;
  if (!papers.length) return { documentIds, photoFileId, notVerified: 0 };
  const kinds = (await getStudentSettings(tx, ctx)).requiredDocuments;
  const files = await tx.storedFile.findMany({ where: { id: { in: papers.map((p) => p.fileId!) } }, select: { id: true, contentType: true, fileName: true } });
  for (const p of papers) {
    const kind = studentDocumentKind(p.docType, kinds);
    const doc = await tx.studentDocument.create({
      data: { schoolId: ctx.schoolId, studentId, kind, fileId: p.fileId!, note: paperNote(p, app.applicationNo, "at admission"), uploadedById: p.uploadedById ?? ctx.userId },
    });
    documentIds.push(doc.id);
    const file = files.find((f) => f.id === p.fileId);
    await writeAudit(tx, ctx, { action: "uploaded", recordType: "Student Document", recordId: doc.id, after: { studentId, kind, fileName: file?.fileName ?? null, from: `Application ${app.applicationNo}`, verified: p.status === "VERIFIED" } });
    if (p.docType === "photo" && p.status === "VERIFIED" && !photoFileId && isImage(file?.contentType)) photoFileId = file!.id;
  }
  if (photoFileId) await tx.student.update({ where: { id: studentId }, data: { photoFileId } });
  return { documentIds, photoFileId, notVerified: papers.filter((p) => p.status !== "VERIFIED").length };
}

/**
 * After admission: a paper uploaded, verified or rejected on the admitted
 * application is brought onto the student's documents. Returns words for the
 * application's history, or null when the application is not admitted.
 */
export async function followPaper(
  tx: Tx, ctx: SchoolContext,
  app: Pick<Application, "id" | "applicationNo" | "stage" | "studentId">,
  paper: Paper, event: "uploaded" | "verified" | "rejected", previousFileId: string | null = null,
): Promise<string | null> {
  if (app.stage !== "ADMITTED" || !app.studentId) return null;
  const student = await tx.student.findFirst({ where: { id: app.studentId, archivedAt: null }, select: { id: true, photoFileId: true } });
  if (!student) return null;
  const studentId = student.id;
  const at = new Date();
  const archive = async (fileId: string, why: string) => {
    const docs = await tx.studentDocument.findMany({ where: { studentId, fileId, archivedAt: null }, select: { id: true, kind: true } });
    for (const d of docs) {
      await tx.studentDocument.update({ where: { id: d.id }, data: { archivedAt: at } });
      await writeAudit(tx, ctx, { action: "archived", recordType: "Student Document", recordId: d.id, before: { studentId, kind: d.kind, fileId }, after: { reason: why } });
    }
    if (student.photoFileId === fileId) {
      await tx.student.update({ where: { id: studentId }, data: { photoFileId: null } });
      student.photoFileId = null;
    }
    return docs.length;
  };

  if (event === "rejected") {
    if (!paper.fileId) return null;
    const n = await archive(paper.fileId, `Paper rejected on application ${app.applicationNo}`);
    return n ? "Taken off the student's documents." : null;
  }
  if (!paper.fileId) return null;
  if (event === "uploaded" && previousFileId && previousFileId !== paper.fileId) await archive(previousFileId, `New copy uploaded on application ${app.applicationNo}`);

  const note = paperNote(paper, app.applicationNo, "after admission");
  const same = await tx.studentDocument.findFirst({ where: { studentId, fileId: paper.fileId, archivedAt: null } });
  if (same) {
    await tx.studentDocument.update({ where: { id: same.id }, data: { note } });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Student Document", recordId: same.id, before: { note: same.note }, after: { note } });
  } else {
    const kinds = (await getStudentSettings(tx, ctx)).requiredDocuments;
    const kind = studentDocumentKind(paper.docType, kinds);
    const doc = await tx.studentDocument.create({ data: { schoolId: ctx.schoolId, studentId, kind, fileId: paper.fileId, note, uploadedById: paper.uploadedById ?? ctx.userId } });
    await writeAudit(tx, ctx, { action: "uploaded", recordType: "Student Document", recordId: doc.id, after: { studentId, kind, from: `Application ${app.applicationNo}`, verified: paper.status === "VERIFIED" } });
  }
  if (paper.docType === "photo" && paper.status === "VERIFIED" && !student.photoFileId) {
    const file = await tx.storedFile.findUnique({ where: { id: paper.fileId }, select: { contentType: true } });
    if (isImage(file?.contentType)) await tx.student.update({ where: { id: studentId }, data: { photoFileId: paper.fileId } });
  }
  return same ? "Updated on the student's documents." : "Added to the student's documents.";
}
