"use server";

import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { act, file, FieldProblem, id, optionalDateOf, optionalId, str } from "@/lib/staff/act";
import { HrOnlyError } from "@/lib/staff/access";
import { campusStaffWhere } from "@/lib/staff/list";
import { addDocument, removeDocument } from "@/lib/staff/documents";
import { StaffProblem } from "@/lib/staff/staff";
import { revalidatePath } from "next/cache";

/** Upload a staff document, or renew / fill a missing one (replaceId). HR only. */
export async function uploadDocument(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, reach } = await requireAction("staff-hr-management", "edit");
    if (reach !== "all") throw new HrOnlyError("uploading staff documents");
    const staffId = id(fd, "staffId", "staff member");
    const replaceId = optionalId(fd, "replaceId");
    const kind = str(fd, "kind");
    const upload = file(fd, "file");
    if (!upload) throw new FieldProblem("Choose the file to upload.", "file");
    const issuedOn = optionalDateOf(fd, "issuedOn", "Issue date");
    const expiresOn = optionalDateOf(fd, "expiresOn", "Expiry date");
    return withSchool(current.ctx, async (tx) => {
      if (!replaceId && kind.length < 2) throw new FieldProblem("Choose the document type.", "kind");
      const saved = await saveFile(tx, current.ctx, { file: upload, purpose: "staff-document", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 });
      // One campus: another campus's staff member is not found (their own record stays theirs).
      const me = await tx.staff.findFirst({ where: { userLoginId: current.user.id, archivedAt: null }, select: { id: true } });
      const doc = await addDocument(tx, current.ctx, { staffId, kind: kind.slice(0, 80), fileId: saved.id, number: str(fd, "number").slice(0, 40) || null, issuedOn, expiresOn }, replaceId, campusStaffWhere({ campusId: current.campusId, staffId: me?.id ?? null }));
      return doc.kind;
    }, { timeout: 30_000 });
  }, (kind) => `${kind} saved.`);
}

/** Takes a staff document off (HR only). Returns a message only when it could not. */
export async function removeDocumentAction(id: string): Promise<string | void> {
  const { current, reach } = await requireAction("staff-hr-management", "edit");
  if (reach !== "all") return "Only HR can remove staff documents.";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return "This document was not found.";
  try {
    await withSchool(current.ctx, async (tx) => {
      const me = await tx.staff.findFirst({ where: { userLoginId: current.user.id, archivedAt: null }, select: { id: true } });
      return removeDocument(tx, current.ctx, id, campusStaffWhere({ campusId: current.campusId, staffId: me?.id ?? null }));
    });
  } catch (e) {
    if (e instanceof StaffProblem) return e.message;
    throw e;
  }
  revalidatePath("/staff-hr-management", "layout");
}
