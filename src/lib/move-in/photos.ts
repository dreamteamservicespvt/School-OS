// Bringing records in from photos of a paper register (gap list G43), on the
// one import engine. The person uploads photos or PDF scans of the pages; with
// Smart Import on and the AI service connected, each page is read into rows
// (src/lib/ai/register-photo.ts) and the rows become an ordinary Move-in File:
// the same column matching, row problems, fixes, leave-out, check and Undo.
// Nothing is saved as a record until the person presses Bring in. The file
// keeps the photos, so the review shows them beside the rows to check.
//
// Order of the checks, so nothing leaves School OS that should not: the
// person's role may add these records, the AI assistant is on for them, they
// confirmed the private numbers are covered; only then are the photos saved
// and sent, one request each, logged.
import "server-only";

import { randomUUID } from "node:crypto";
import type { SchoolContext } from "../db";
import { withSchool } from "../db";
import { DOCUMENT_TYPES, saveFile } from "../files";
import { fileStore } from "../storage";
import { importKind } from "../importer";
import { aiConnected } from "../ai";
import { MAX_PHOTOS, readRegisterPhotos, sheetFromPages } from "../ai/register-photo";
import type { AiImage } from "../ai/provider";
import { aiOffReason, type AiWho } from "../settings/switch-rules";
import type { ModuleKey } from "../modules";
import type { PermissionMap } from "../permissions";
import { csvCell } from "./prepare";
import { MoveInProblem, addUpload, kindInfo, uploadKinds, type PhotoMeta } from "./service";

/** Photos are made smaller before they are kept and read: enough for handwriting, not more. */
const PHOTO_WIDTH = 2000;

const SHEET_INSTEAD = "Or download the ready Excel sheet, type the register into it, and upload that.";

/** Why photos cannot be read for this person, in plain words with the way on, or null when they can. */
export function photoRefusal(who: AiWho): string | null {
  const off = aiOffReason(who, "ai-smart-import");
  if (off === "assistant-off" || off === "feature-off") return `Reading photos of a register needs the AI assistant switched on in Settings, Modules On/Off, with Smart Import on. ${SHEET_INSTEAD}`;
  if (off === "role-not-allowed") return `Reading photos of a register uses the AI assistant, which your school has not turned on for your role (Settings, Modules On/Off). ${SHEET_INSTEAD}`;
  if (off) return `Reading photos of a register is not ready yet. ${SHEET_INSTEAD}`;
  if (!aiConnected()) return `Reading photos of a register needs the AI service, which is not connected yet: DREAM TEAM connects it. ${SHEET_INSTEAD}`;
  return null;
}

export type PhotoUpload = {
  files: File[];
  kind: string | null;
  /** The person confirmed Aadhaar, bank and other private numbers are covered or cut out of the pages. */
  privateCovered: boolean;
  options?: Record<string, unknown>;
  exclude?: readonly string[];
};

/**
 * Reads the photos into one Move-in File and returns its id (or ids). Throws
 * MoveInProblem with plain words, with the field it belongs to, when it cannot.
 */
export async function addPhotoUpload(ctx: SchoolContext, who: AiWho & { permissions: PermissionMap; modulesOn?: ReadonlySet<ModuleKey> }, upload: PhotoUpload): Promise<{ ids: string[]; dropped: string[] }> {
  const files = upload.files.filter((f) => f && f.size > 0);
  if (!files.length) throw new MoveInProblem("Choose the photos of the register pages.", "photos");
  if (files.length > MAX_PHOTOS) throw new MoveInProblem(`Upload at most ${MAX_PHOTOS} pages at a time. Bring the rest in as another upload.`, "photos");
  uploadKinds(who.permissions, upload, who.modulesOn);
  const off = photoRefusal(who);
  if (off) throw new MoveInProblem(off, "photos");
  if (!upload.privateCovered) throw new MoveInProblem("Cover or cut out Aadhaar, bank and other private numbers on the pages first, then tick to say so.", "privateCovered");

  // 1. The photos are kept as the school's own private files (made smaller, checked by their first bytes).
  const saved = await withSchool(ctx, async (tx) => {
    const out: { id: string; fileName: string; contentType: string; storageKey: string }[] = [];
    for (const file of files) {
      const f = await saveFile(tx, ctx, { file, purpose: "move-in-photo", allowed: DOCUMENT_TYPES, maxImageWidth: PHOTO_WIDTH });
      out.push({ id: f.id, fileName: f.fileName, contentType: f.contentType, storageKey: f.storageKey });
    }
    return out;
  }, { timeout: 60_000 });

  // 2. Each page is read through the AI gateway, outside any transaction. Only the picture is sent, with the import's column names.
  const photos: { fileName: string; image: AiImage }[] = [];
  for (const f of saved) {
    const body = await fileStore().get(f.storageKey);
    if (!body) throw new MoveInProblem("The photo could not be read back. Upload it again.", "photos");
    photos.push({ fileName: f.fileName, image: { mediaType: f.contentType as AiImage["mediaType"], data: body.toString("base64") } });
  }
  const kind = upload.kind ? importKind(upload.kind) : null;
  const importing = kind ? kindInfo(kind.key)?.label ?? kind.label : "School records";
  const reading = await readRegisterPhotos(ctx, { importing, fields: kind?.columns ?? [], photos });
  // When nothing comes of them, the photos are archived, never left lying about.
  const putAway = () => withSchool(ctx, (tx) => tx.storedFile.updateMany({ where: { id: { in: saved.map((f) => f.id) } }, data: { archivedAt: new Date() } }));
  if (!reading.ok) {
    await putAway();
    throw new MoveInProblem(reading.message, "photos");
  }

  // 3. The rows become the file, read by the one engine like any sheet. They are kept nowhere else.
  const sheet = sheetFromPages(reading.pages);
  const csv = Buffer.from(sheet.rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", "utf8");
  const base = (saved[0].fileName.replace(/\.[^.]+$/, "") || "Register").slice(0, 120);
  const fileName = `${base}${saved.length > 1 ? ` and ${saved.length - 1} more` : ""} (read from ${saved.length === 1 ? "a photo" : "photos"}).csv`;
  const meta: PhotoMeta[] = saved.map((f, i) => ({ fileId: f.id, fileName: f.fileName, contentType: f.contentType, from: sheet.spans[i].from, to: sheet.spans[i].to }));
  try {
    const ids = await withSchool(ctx, async (tx) => {
      const id = randomUUID();
      const key = `${ctx.schoolId}/move-in/${id}`;
      await fileStore().put(key, csv, "text/csv");
      await tx.storedFile.create({ data: { id, schoolId: ctx.schoolId, storageKey: key, fileName: fileName.slice(0, 200), contentType: "text/csv", sizeBytes: csv.length, purpose: "move-in", uploadedById: ctx.userId } });
      return addUpload(tx, ctx, who.permissions, { fileId: id, fileName, kind: upload.kind, options: upload.options, exclude: upload.exclude, photos: meta }, who.modulesOn);
    }, { timeout: 120_000 });
    return { ids, dropped: sheet.dropped };
  } catch (e) {
    await putAway();
    throw e;
  }
}

export { MAX_PHOTOS };
