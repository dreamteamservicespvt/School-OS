// Signatories: the people who sign documents (Principal, Accountant...), with
// an optional signature image. Archived, never deleted.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { IMAGE_TYPES, saveFile } from "../files";

export class SignatoryProblem extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

export async function addSignatory(tx: Tx, ctx: SchoolContext, input: { name: string; title: string; image: File | null }) {
  const name = input.name.trim();
  const title = input.title.trim();
  if (!name) throw new SignatoryProblem("Name is needed.", "name");
  if (name.length > 80) throw new SignatoryProblem("Name can be at most 80 characters.", "name");
  if (!title) throw new SignatoryProblem("Designation is needed, for example Principal.", "title");
  if (title.length > 80) throw new SignatoryProblem("Designation can be at most 80 characters.", "title");
  let imageFileId: string | null = null;
  if (input.image && input.image.size > 0) {
    if (input.image.size > 2 * 1024 * 1024) throw new SignatoryProblem("A signature image can be at most 2 MB. A clear PNG of about 600 pixels wide is enough.", "image");
    // Kept as uploaded (not made into a JPG), so a see-through PNG stays see-through on documents.
    const file = await saveFile(tx, ctx, { file: input.image, purpose: "signature", allowed: IMAGE_TYPES });
    imageFileId = file.id;
  }
  const row = await tx.signatory.create({ data: { schoolId: ctx.schoolId, name, title, imageFileId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Signatory", recordId: row.id, after: { name, title, signatureImage: Boolean(imageFileId) } });
  return row;
}

export async function archiveSignatory(tx: Tx, ctx: SchoolContext, id: string) {
  const row = await tx.signatory.findUnique({ where: { id } });
  if (!row || row.archivedAt) throw new SignatoryProblem("This signatory was not found.");
  const inUse = await tx.documentDesign.findMany({ where: { isCurrent: true }, select: { docType: true, options: true } });
  const using = inUse.filter((d) => ((d.options as { signatoryIds?: string[] }).signatoryIds ?? []).includes(id)).map((d) => d.docType);
  await tx.signatory.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Signatory", recordId: id, before: { name: row.name, title: row.title }, after: { removedFromDesigns: using } });
  return { using };
}
