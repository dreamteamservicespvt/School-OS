// Gallery (18 §2): albums of photos and videos, each photo tagged with the
// students in it. Photo consent (rule 33, decided 9 October 2026) is checked
// every time a photo is shown outside staff or shared: students without it
// are blurred or the photo is left out; untagged photos stay staff only. The
// check runs at view time, so a consent withdrawn later applies to photos
// already published.
import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Album, MediaItem, MediaTag } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { IMAGE_TYPES, FileProblem, saveFile, sniffType } from "../files";
import { fileStore } from "../storage";
import { nextNumber } from "../sequences";
import { consentRows, requestConsent } from "../students/consent";
import { sendMessage } from "../messaging";
import { EventsProblem } from "./problem";
import { albumUrl, eventsSettings } from "./settings";
import { classesWords, dayOf, dmy, isoOf } from "./words";
import { OPEN_LINK } from "../students/guardian-access";

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const PHOTO_WIDTH = 1920;

/* ---------- Photo consent ---------- */

/** Students whose photo consent stands (every recorded guardian gave it, none withdrew). Same rule as photoConsentStands. */
export async function consentedStudents(tx: Tx, ctx: SchoolContext, studentIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return new Set();
  const rows = (await consentRows(tx, ctx, { studentIds: ids, consentType: "photo" })).filter((r) => r.status !== "REQUESTED");
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.studentId, [...(by.get(r.studentId) ?? []), r.status]);
  return new Set(ids.filter((id) => { const s = by.get(id); return !!s && s.length > 0 && s.every((x) => x === "GIVEN"); }));
}

export type PhotoMark = "ok" | "some" | "untagged" | "none";

export function photoMark(m: Pick<MediaItem, "noStudents"> & { tags: Pick<MediaTag, "studentId">[] }, consented: Set<string>): PhotoMark {
  if (m.noStudents) return "none";
  if (!m.tags.length) return "untagged";
  return m.tags.every((t) => consented.has(t.studentId)) ? "ok" : "some";
}

/* ---------- Albums ---------- */

export type AlbumInput = { name: string; eventId: string | null; date: string; visibleTo: string; classIds: string[]; consentRule: string };

async function checkAlbum(tx: Tx, input: AlbumInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new EventsProblem("Give the album a name.", "name");
  if (name.length > 80) throw new EventsProblem("The name can be at most 80 characters.", "name");
  if (!["STAFF", "CLASSES", "EVERYONE"].includes(input.visibleTo)) throw new EventsProblem("Choose who can see it.", "visibleTo");
  if (input.visibleTo === "CLASSES" && !input.classIds.length) throw new EventsProblem("Choose the classes whose parents can see it.", "classIds");
  if (!["OUT", "BLUR"].includes(input.consentRule)) throw new EventsProblem("Choose to leave the photo out or blur the students.", "consentRule");
  if (input.eventId && !(await tx.event.findFirst({ where: { id: input.eventId, archivedAt: null } }))) throw new EventsProblem("This event was not found.", "eventId");
  return name;
}

export async function audienceWords(tx: Tx, a: Pick<Album, "visibleTo" | "classIds">) {
  if (a.visibleTo === "EVERYONE") return "Everyone";
  if (a.visibleTo === "CLASSES") {
    const names = (await tx.schoolClass.findMany({ where: { id: { in: a.classIds } }, select: { name: true }, orderBy: { sortOrder: "asc" } })).map((c) => c.name);
    return `Parents of ${classesWords(names)}`;
  }
  return "Staff only";
}

export async function createAlbum(tx: Tx, ctx: SchoolContext, input: AlbumInput) {
  const name = await checkAlbum(tx, input);
  const n = await nextNumber(tx, ctx, "album");
  const album = await tx.album.create({
    data: {
      schoolId: ctx.schoolId, number: `AL-${String(n).padStart(2, "0")}`, name, eventId: input.eventId, date: dayOf(input.date),
      visibleTo: input.visibleTo, classIds: input.visibleTo === "CLASSES" ? input.classIds : [], consentRule: input.consentRule, createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Album", recordId: album.id, after: { number: album.number, name, date: dmy(input.date), visibleTo: input.visibleTo, consentRule: input.consentRule } });
  return album;
}

async function liveAlbum(tx: Tx, albumId: string) {
  const a = await tx.album.findFirst({ where: { id: albumId } });
  if (!a) throw new EventsProblem("This album was not found.");
  return a;
}

/** Who can see it and what happens to students without photo consent. */
export async function setAlbumAccess(tx: Tx, ctx: SchoolContext, albumId: string, change: { visibleTo: string; classIds: string[]; consentRule: string }) {
  const a = await liveAlbum(tx, albumId);
  await checkAlbum(tx, { name: a.name, eventId: null, date: isoOf(a.date), ...change });
  const u = await tx.album.update({ where: { id: a.id }, data: { visibleTo: change.visibleTo, classIds: change.visibleTo === "CLASSES" ? change.classIds : [], consentRule: change.consentRule } });
  await writeAudit(tx, ctx, { action: "access-changed", recordType: "Album", recordId: a.id, before: { visibleTo: a.visibleTo, consentRule: a.consentRule }, after: { visibleTo: u.visibleTo, consentRule: u.consentRule } });
  return u;
}

export async function renameAlbum(tx: Tx, ctx: SchoolContext, albumId: string, input: { name: string; date: string; eventId: string | null }) {
  const a = await liveAlbum(tx, albumId);
  const name = await checkAlbum(tx, { ...input, visibleTo: a.visibleTo, classIds: a.classIds, consentRule: a.consentRule });
  const u = await tx.album.update({ where: { id: a.id }, data: { name, date: dayOf(input.date), eventId: input.eventId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Album", recordId: a.id, before: { name: a.name, date: dmy(isoOf(a.date)) }, after: { name, date: dmy(input.date) } });
  return u;
}

/** Publishing: staff-only albums are published only after the person confirms (18 §5). */
export async function publishAlbum(tx: Tx, ctx: SchoolContext, albumId: string, confirmStaffOnly: boolean) {
  const a = await liveAlbum(tx, albumId);
  if (a.status === "PUBLISHED") throw new EventsProblem("This album is already published.");
  const items = await tx.mediaItem.count({ where: { albumId, archivedAt: null } });
  if (!items) throw new EventsProblem("Upload photos before publishing the album.");
  if (a.visibleTo === "STAFF" && !confirmStaffOnly) throw new EventsProblem("Visible to staff only. Change before publishing?", "visibleTo");
  const u = await tx.album.update({ where: { id: a.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "published", recordType: "Album", recordId: a.id, before: { status: a.status }, after: { status: "PUBLISHED", visibleTo: a.visibleTo } });
  return u;
}

export async function archiveAlbum(tx: Tx, ctx: SchoolContext, albumId: string) {
  const a = await liveAlbum(tx, albumId);
  if (a.status === "ARCHIVED") throw new EventsProblem("This album is already archived.");
  const u = await tx.album.update({ where: { id: a.id }, data: { status: "ARCHIVED" } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Album", recordId: a.id, before: { status: a.status }, after: { status: "ARCHIVED" } });
  return { album: u, was: a.status };
}

/** Undo of archiving: back to what it was. */
export async function unarchiveAlbum(tx: Tx, ctx: SchoolContext, albumId: string, back: string) {
  const a = await liveAlbum(tx, albumId);
  if (a.status !== "ARCHIVED") return a;
  const status = back === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const u = await tx.album.update({ where: { id: a.id }, data: { status } });
  await writeAudit(tx, ctx, { action: "unarchived", recordType: "Album", recordId: a.id, after: { status } });
  return u;
}

/** Sends the album link to the parents who may see it. Photo consent is checked when they open it. */
export async function shareAlbum(tx: Tx, ctx: SchoolContext, albumId: string) {
  const a = await liveAlbum(tx, albumId);
  if (a.status !== "PUBLISHED") throw new EventsProblem("Publish the album before sharing it.");
  if (a.visibleTo === "STAFF") throw new EventsProblem("This album is visible to staff only. Change who can see it to share it with parents.", "visibleTo");
  const school = (await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } }))?.name ?? "School";
  const link = albumUrl(ctx.schoolId, a.id, a.shareVersion);
  const r = await sendMessage(tx, ctx, {
    to: a.visibleTo === "CLASSES" ? { kinds: ["parents"], classIds: a.classIds } : { kinds: ["parents"] },
    channels: "preferred", text: `Dear Parent, photos of ${a.name} are ready: ${link} - ${school}`,
    trigger: `Album shared: ${a.name}`, source: { type: "Album", id: a.id }, audienceLabel: await audienceWords(tx, a),
  });
  await tx.album.update({ where: { id: a.id }, data: { sharedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "shared", recordType: "Album", recordId: a.id, after: { people: r.people } });
  return { people: r.people };
}

/** Stops the old shared link working (a new link is made). */
export async function newShareLink(tx: Tx, ctx: SchoolContext, albumId: string) {
  const a = await liveAlbum(tx, albumId);
  const u = await tx.album.update({ where: { id: a.id }, data: { shareVersion: a.shareVersion + 1 } });
  await writeAudit(tx, ctx, { action: "share-link-renewed", recordType: "Album", recordId: a.id });
  return u;
}

/* ---------- Uploads ---------- */

function videoType(buf: Buffer): string | null {
  if (buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    return brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
  }
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return null;
}

/** Saves one photo (made smaller for phones) or video into an album. */
export async function addMedia(tx: Tx, ctx: SchoolContext, albumId: string, file: File) {
  const a = await liveAlbum(tx, albumId);
  if (a.status === "ARCHIVED") throw new EventsProblem("This album is archived. Photos cannot be added.");
  if (!file || file.size === 0) throw new FileProblem("Choose photos or videos to upload.");
  const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const vt = videoType(head);
  let fileId: string;
  let kind = "PHOTO";
  if (vt) {
    if (file.size > MAX_VIDEO_BYTES) throw new FileProblem(`${file.name} is ${(file.size / 1024 / 1024).toFixed(0)} MB. Videos can be at most 50 MB.`);
    const id = randomUUID();
    const key = `${ctx.schoolId}/gallery-video/${id}`;
    await fileStore().put(key, Buffer.from(await file.arrayBuffer()), vt);
    await tx.storedFile.create({ data: { id, schoolId: ctx.schoolId, storageKey: key, fileName: file.name.slice(0, 200) || "video", contentType: vt, sizeBytes: file.size, purpose: "gallery-video", uploadedById: ctx.userId } });
    fileId = id;
    kind = "VIDEO";
  } else {
    if (!sniffType(head) || !IMAGE_TYPES.includes(sniffType(head) as (typeof IMAGE_TYPES)[number])) throw new FileProblem(`${file.name || "This file"} is not a photo or video. Upload JPG, PNG or MP4 files.`);
    const saved = await saveFile(tx, ctx, { file, purpose: "gallery-photo", allowed: IMAGE_TYPES, maxImageWidth: PHOTO_WIDTH });
    fileId = saved.id;
  }
  return tx.mediaItem.create({ data: { schoolId: ctx.schoolId, albumId: a.id, fileId, kind, uploadedById: ctx.userId } });
}

export async function uploaded(tx: Tx, ctx: SchoolContext, albumId: string, photos: number, videos: number) {
  await writeAudit(tx, ctx, { action: "uploaded", recordType: "Album", recordId: albumId, after: { photos, videos } });
}

export async function removeMedia(tx: Tx, ctx: SchoolContext, mediaId: string) {
  const m = await tx.mediaItem.findFirst({ where: { id: mediaId, archivedAt: null } });
  if (!m) throw new EventsProblem("This photo was not found.");
  await tx.mediaItem.update({ where: { id: m.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "media-removed", recordType: "Album", recordId: m.albumId, after: { media: m.id } });
  return m;
}

export async function restoreMedia(tx: Tx, ctx: SchoolContext, mediaId: string) {
  const m = await tx.mediaItem.findFirst({ where: { id: mediaId } });
  if (!m) return null;
  await tx.mediaItem.update({ where: { id: m.id }, data: { archivedAt: null } });
  await writeAudit(tx, ctx, { action: "media-restored", recordType: "Album", recordId: m.albumId, after: { media: m.id } });
  return m;
}

/* ---------- Tagging ---------- */

export type TagInput = { studentId: string; x: number | null; y: number | null };

/** Sets the students in one photo (replacing the old tags), or marks it "No students". */
export async function tagMedia(tx: Tx, ctx: SchoolContext, mediaId: string, tags: TagInput[], noStudents: boolean) {
  const m = await tx.mediaItem.findFirst({ where: { id: mediaId, archivedAt: null }, include: { tags: { where: { archivedAt: null } } } });
  if (!m) throw new EventsProblem("This photo was not found.");
  if (!noStudents && !tags.length) throw new EventsProblem("Pick the students in this photo, or mark it as no students.", "studentIds");
  if (tags.length > 80) throw new EventsProblem("Tag at most 80 students in one photo.", "studentIds");
  const ids = [...new Set(tags.map((t) => t.studentId))];
  const found = await tx.student.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true } });
  if (found.length !== ids.length) throw new EventsProblem("Some of these students were not found.", "studentIds");
  const clamp = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.min(1, Math.max(0, v)));
  // The old list is replaced: tags no longer in it are archived (rows are never deleted).
  const now = new Date();
  for (const old of m.tags) if (!old.archivedAt && (noStudents || !ids.includes(old.studentId))) await tx.mediaTag.update({ where: { id: old.id }, data: { archivedAt: now } });
  if (!noStudents) {
    for (const t of tags) {
      await tx.mediaTag.upsert({
        where: { mediaId_studentId: { mediaId: m.id, studentId: t.studentId } },
        create: { schoolId: ctx.schoolId, mediaId: m.id, studentId: t.studentId, x: clamp(t.x), y: clamp(t.y), taggedById: ctx.userId },
        update: { x: clamp(t.x), y: clamp(t.y), taggedById: ctx.userId, archivedAt: null },
      });
    }
  }
  await tx.mediaItem.update({ where: { id: m.id }, data: { noStudents, blurKey: null, blurFileId: null } });
  const consented = await consentedStudents(tx, ctx, ids);
  const missing = noStudents ? 0 : ids.filter((id) => !consented.has(id)).length;
  await writeAudit(tx, ctx, { action: noStudents ? "marked-no-students" : "tagged", recordType: "Album", recordId: m.albumId, after: { media: m.id, students: noStudents ? 0 : ids.length, withoutConsent: missing } });
  return { tagged: noStudents ? 0 : ids.length, missing };
}

/** Guardians of students tagged in an album without photo consent are asked on Parent Link. */
export async function askConsent(tx: Tx, ctx: SchoolContext, albumId: string) {
  const items = await tx.mediaItem.findMany({ where: { albumId, archivedAt: null }, include: { tags: { where: { archivedAt: null } } } });
  const tagged = [...new Set(items.flatMap((i) => i.tags.map((t) => t.studentId)))];
  const consented = await consentedStudents(tx, ctx, tagged);
  const missing = tagged.filter((s) => !consented.has(s));
  if (!missing.length) throw new EventsProblem("Every tagged student has photo consent.");
  const guardians = await tx.studentGuardian.findMany({ where: { studentId: { in: missing }, ...OPEN_LINK }, select: { guardianId: true } });
  const r = await requestConsent(tx, ctx, [...new Set(guardians.map((g) => g.guardianId))], ["photo"]);
  await writeAudit(tx, ctx, { action: "consent-asked", recordType: "Album", recordId: albumId, after: { students: missing.length } });
  return { students: missing.length, result: r };
}

/* ---------- What a parent may see ---------- */

export type SharedItem = { mediaId: string; fileId: string; kind: string; blurred: boolean };

/**
 * The photos of an album that may be shown outside staff: no untagged
 * photos; photos where every tagged student has photo consent; with the rule
 * "blur", photos with students without consent as a blurred copy (videos
 * cannot be blurred, so they are left out).
 */
export async function sharedItems(tx: Tx, ctx: SchoolContext, album: Album): Promise<{ items: SharedItem[]; leftOut: number; blurred: number; untagged: number }> {
  const items = await tx.mediaItem.findMany({ where: { albumId: album.id, archivedAt: null }, include: { tags: { where: { archivedAt: null } } }, orderBy: { createdAt: "asc" } });
  const consented = await consentedStudents(tx, ctx, items.flatMap((i) => i.tags.map((t) => t.studentId)));
  const out: SharedItem[] = [];
  let leftOut = 0;
  let blurred = 0;
  let untagged = 0;
  for (const m of items) {
    const mark = photoMark(m, consented);
    if (mark === "untagged") { untagged++; continue; }
    if (mark === "ok" || mark === "none") { out.push({ mediaId: m.id, fileId: m.fileId, kind: m.kind, blurred: false }); continue; }
    if (album.consentRule !== "BLUR" || m.kind !== "PHOTO") { leftOut++; continue; }
    const hide = m.tags.filter((t) => !consented.has(t.studentId));
    const fileId = await blurredCopy(tx, ctx, m, hide);
    out.push({ mediaId: m.id, fileId, kind: m.kind, blurred: true });
    blurred++;
  }
  return { items: out, leftOut, blurred, untagged };
}

/** The copy of a photo with these students blurred (made once per set of students and kept). */
async function blurredCopy(tx: Tx, ctx: SchoolContext, m: MediaItem, hide: MediaTag[]) {
  const key = hide.map((t) => `${t.studentId}@${t.x ?? "-"},${t.y ?? "-"}`).sort().join("|");
  if (m.blurKey === key && m.blurFileId) return m.blurFileId;
  const file = await tx.storedFile.findFirst({ where: { id: m.fileId } });
  const body = file ? await fileStore().get(file.storageKey) : null;
  if (!body) throw new EventsProblem("A photo could not be found in storage.");
  const img = sharp(body).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 1200;
  const h = meta.height ?? 900;
  const strong = await sharp(body).rotate().blur(Math.max(12, Math.round(Math.min(w, h) / 30))).toBuffer();
  let out: Buffer;
  if (hide.some((t) => t.x == null || t.y == null)) {
    // Where a student is in the photo is not marked: the whole photo is blurred.
    out = await sharp(strong).jpeg({ quality: 80 }).toBuffer();
  } else {
    const r = Math.round(Math.min(w, h) * 0.14);
    const parts = await Promise.all(hide.map(async (t) => {
      const left = Math.max(0, Math.min(w - 2 * r, Math.round(t.x! * w) - r));
      const top = Math.max(0, Math.min(h - 2 * r, Math.round(t.y! * h) - r));
      const size = Math.min(2 * r, w, h);
      const patch = await sharp(strong).extract({ left, top, width: size, height: size }).composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`), blend: "dest-in" }]).png().toBuffer();
      return { input: patch, left, top };
    }));
    out = await sharp(body).rotate().composite(parts).jpeg({ quality: 82 }).toBuffer();
  }
  const id = randomUUID();
  const storageKey = `${ctx.schoolId}/gallery-blurred/${id}`;
  await fileStore().put(storageKey, out, "image/jpeg");
  await tx.storedFile.create({ data: { id, schoolId: ctx.schoolId, storageKey, fileName: `blurred-${file!.fileName}`.slice(0, 200), contentType: "image/jpeg", sizeBytes: out.length, purpose: "gallery-blurred", uploadedById: null } });
  await tx.mediaItem.update({ where: { id: m.id }, data: { blurFileId: id, blurKey: key } });
  return id;
}

/** The school's default rule for new albums (Events Settings). */
export async function defaultRule(tx: Tx, ctx: SchoolContext) {
  return (await eventsSettings(tx, ctx)).galleryRule;
}
