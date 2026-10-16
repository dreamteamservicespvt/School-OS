// A person's own photo in the school they are working in (My profile). It is
// kept on their School Access, so a School Admin without a staff record has
// one too; a staff record's photo is used until they choose their own.
import "server-only";

import type { SchoolContext, Tx } from "./db";
import { fileLink } from "./files";

export async function myPhotoFileId(tx: Tx, ctx: SchoolContext, userLoginId: string): Promise<string | null> {
  const access = await tx.schoolAccess.findFirst({ where: { schoolId: ctx.schoolId, userLoginId, archivedAt: null }, select: { photoFileId: true } });
  if (access?.photoFileId) return access.photoFileId;
  const staff = await tx.staff.findFirst({ where: { userLoginId }, select: { photoFileId: true } });
  return staff?.photoFileId ?? null;
}

/** A short-lived link to the person's photo, or null when they have none. */
export async function myPhotoLink(tx: Tx, ctx: SchoolContext, userLoginId: string): Promise<string | null> {
  const id = await myPhotoFileId(tx, ctx, userLoginId);
  return id ? fileLink(id, ctx.schoolId) : null;
}
