// Uploading and opening private files (08-platform-security.md §8).
import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import type { SchoolContext, Tx } from "./db";
import { fileStore } from "./storage";
import { checkCsv, checkPdf, checkWorkbook, cleanPhoto, FileProblem, refuseDangerous, scanUpload } from "./upload-check";

export { FileProblem };

/** Default upload limit (inferred: 10 MB per file). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** A file link works for this long (inferred: 15 minutes). */
export const FILE_LINK_MS = 15 * 60 * 1000;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"] as const;
export const SHEET_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** Looks at the first bytes, not the name, to know what a file really is. */
export function sniffType(buf: Buffer): string | null {
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return null;
}

export type SaveFileInput = {
  file: File;
  purpose: string;
  allowed: readonly string[];
  /** Photos are made smaller for phones (08 §8). */
  maxImageWidth?: number;
};

/**
 * Every check an upload passes before it is kept (upload-check.ts): what it
 * really is by its content, no programs, scripts or web pages, no PDF
 * programs or Excel macros, photos without hidden details, and the virus
 * scanner when it is set up. Returns the bytes to keep and their type.
 */
export async function checkUpload(body: Buffer, fileName: string, allowed: readonly string[], maxImageWidth?: number): Promise<{ body: Buffer; type: string }> {
  refuseDangerous(body, fileName);
  let type = sniffType(body) ?? (fileName.toLowerCase().endsWith(".csv") ? "text/csv" : null);
  if (!type || !allowed.includes(type)) {
    const kinds = allowed.some((t) => t.startsWith("image/")) && allowed.includes("application/pdf")
      ? "a photo (JPG or PNG) or a PDF" : allowed.some((t) => t.startsWith("image/")) ? "a photo (JPG or PNG)" : "a CSV or Excel file";
    throw new FileProblem(`This file type is not allowed here. Upload ${kinds}.`);
  }
  if (type === "application/pdf") checkPdf(body);
  if (type === SHEET_TYPES[2]) checkWorkbook(body);
  if (type === "text/csv") checkCsv(body);
  if (type.startsWith("image/")) {
    if (maxImageWidth) {
      try {
        body = await sharp(body).rotate().resize({ width: maxImageWidth, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      } catch {
        throw new FileProblem("This photo could not be opened. It may be damaged. Save or take it again and upload it.");
      }
      type = "image/jpeg";
    } else {
      body = await cleanPhoto(body, type);
    }
  }
  await scanUpload(body);
  return { body, type };
}

export async function saveFile(tx: Tx, ctx: SchoolContext, input: SaveFileInput) {
  const { file } = input;
  if (!file || file.size === 0) throw new FileProblem("Choose a file to upload.");
  if (file.size > MAX_FILE_BYTES) throw new FileProblem(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Files can be at most 10 MB.`);
  const { body, type } = await checkUpload(Buffer.from(await file.arrayBuffer()), file.name, input.allowed, input.maxImageWidth);
  const id = randomUUID();
  const key = `${ctx.schoolId}/${input.purpose}/${id}`;
  await fileStore().put(key, body, type);
  return tx.storedFile.create({
    data: {
      id,
      schoolId: ctx.schoolId,
      storageKey: key,
      fileName: file.name.slice(0, 200) || "file",
      contentType: type,
      sizeBytes: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
      purpose: input.purpose,
      uploadedById: ctx.userId,
    },
  });
}

function secret() {
  const s = process.env.FILE_LINK_SECRET ?? process.env.FIELD_ENCRYPTION_KEY;
  if (!s) throw new Error("FILE_LINK_SECRET is not set");
  return s;
}

function sign(fileId: string, schoolId: string, expires: number) {
  return createHmac("sha256", secret()).update(`${fileId}.${schoolId}.${expires}`).digest("base64url");
}

/**
 * A link to one file for someone already allowed to see it. Expires in 15
 * minutes, or after validMs for a sharing link (School Profile, document vault).
 */
export function fileLink(fileId: string, schoolId: string, now = Date.now(), validMs = FILE_LINK_MS) {
  const expires = now + validMs;
  return `/api/v1/files/${fileId}?s=${schoolId}&e=${expires}&t=${sign(fileId, schoolId, expires)}`;
}

export type LinkCheck = { ok: true } | { ok: false; reason: "expired" | "bad" };

export function checkFileLink(fileId: string, schoolId: string, expires: string, token: string, now = Date.now()): LinkCheck {
  const e = Number(expires);
  if (!Number.isFinite(e) || !token) return { ok: false, reason: "bad" };
  const expected = Buffer.from(sign(fileId, schoolId, e));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad" };
  if (e < now) return { ok: false, reason: "expired" };
  return { ok: true };
}
