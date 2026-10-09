// Notes and documents on a student's profile (03 §2, Student Profile).
// Private notes show only to the roles chosen; documents are private files.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { DOCUMENT_TYPES, saveFile } from "../files";
import { StudentProblem } from "./students";

export async function addNote(tx: Tx, ctx: SchoolContext, studentId: string, n: { text: string; visibleToRoles: string[] }) {
  const text = n.text.trim();
  if (text.length < 2) throw new StudentProblem("Write the note.", "text");
  const note = await tx.studentNote.create({ data: { schoolId: ctx.schoolId, studentId, text, visibleToRoles: n.visibleToRoles, authorId: ctx.userId } });
  // The note itself stays out of the audit log when it is private.
  await writeAudit(tx, ctx, { action: "created", recordType: "Student Note", recordId: note.id, after: { studentId, private: n.visibleToRoles.length > 0, roles: n.visibleToRoles } });
  return note;
}

/** Only the author, or someone who manages students, archives a note. */
export async function archiveNote(tx: Tx, ctx: SchoolContext, noteId: string, canManage: boolean) {
  const note = await tx.studentNote.findFirst({ where: { id: noteId, archivedAt: null } });
  if (!note) throw new StudentProblem("This note was already removed.");
  if (!canManage && note.authorId !== ctx.userId) throw new StudentProblem("Only the person who wrote this note, or a School Admin, can remove it.");
  await tx.studentNote.update({ where: { id: noteId }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Student Note", recordId: noteId, before: { studentId: note.studentId } });
}

export async function addDocument(tx: Tx, ctx: SchoolContext, studentId: string, d: { kind: string; file: File; note: string | null; guardianId: string | null }) {
  const kind = d.kind.trim();
  if (!kind) throw new StudentProblem("Choose what the document is.", "kind");
  if (d.guardianId) {
    const link = await tx.studentGuardian.findFirst({ where: { studentId, guardianId: d.guardianId, archivedAt: null } });
    if (!link) throw new StudentProblem("Choose one of this student's parents.", "guardianId");
  }
  const file = await saveFile(tx, ctx, { file: d.file, purpose: "student-document", allowed: DOCUMENT_TYPES, maxImageWidth: 2000 });
  const doc = await tx.studentDocument.create({ data: { schoolId: ctx.schoolId, studentId, guardianId: d.guardianId, kind, fileId: file.id, note: d.note, uploadedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "uploaded", recordType: "Student Document", recordId: doc.id, after: { studentId, kind, fileName: file.fileName, forParent: Boolean(d.guardianId) } });
  return doc;
}

export async function archiveDocument(tx: Tx, ctx: SchoolContext, documentId: string) {
  const doc = await tx.studentDocument.findFirst({ where: { id: documentId, archivedAt: null } });
  if (!doc) throw new StudentProblem("This document was already removed.");
  await tx.studentDocument.update({ where: { id: documentId }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Student Document", recordId: documentId, before: { studentId: doc.studentId, kind: doc.kind } });
}
