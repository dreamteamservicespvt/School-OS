// File backups (08-platform-security.md §4: "Files (photos, documents, bills)
// backed up every night"; gap list G46, part 2). Every uploaded or generated
// file is copied to a second, separate place with its SHA-256 checksum, so a
// restore test can prove each file a record points to is really there.
//
// The database is backed up by the hosting service (continuous backup and
// nightly copies; README.md, "Backups"). This job only covers the files,
// which live outside the database.
import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { backupStore, fileStore } from "../storage";

/** Files copied in one run; the schedule runs every hour, so a big day catches up within the night. */
export const FILES_PER_RUN = 1000;

export const sha256 = (body: Buffer) => createHash("sha256").update(body).digest("hex");

export type FileBackupResult = {
  /** "not-set-up" when no backup place is configured on this server. */
  skipped?: "not-set-up";
  copied: number;
  /** Files a record points to that are not in storage at all. */
  missing: number;
  /** Files whose bytes no longer match the checksum taken at upload: not copied over the good backup. */
  changed: number;
  failed: number;
  /** Still waiting for the next run. */
  left: number;
};

/**
 * Copies this school's files that have no backup yet. Safe to run twice: a
 * copied file is marked and never copied again; a copy that failed is tried
 * on the next run. Archived files are left out (they were copied while live).
 */
export async function backupFiles(tx: Tx, ctx: SchoolContext, now = new Date(), limit = FILES_PER_RUN): Promise<FileBackupResult> {
  const store = backupStore();
  const out: FileBackupResult = { copied: 0, missing: 0, changed: 0, failed: 0, left: 0 };
  if (!store) return { ...out, skipped: "not-set-up" };
  const where: Prisma.StoredFileWhereInput = { backedUpAt: null, archivedAt: null };
  const rows = await tx.storedFile.findMany({ where, orderBy: { createdAt: "asc" }, take: limit, select: { id: true, storageKey: true, contentType: true, sha256: true } });
  for (const f of rows) {
    const body = await fileStore().get(f.storageKey);
    if (!body) {
      out.missing++;
      continue;
    }
    const sum = sha256(body);
    if (f.sha256 && f.sha256 !== sum) {
      out.changed++;
      continue;
    }
    try {
      await store.put(f.storageKey, body, f.contentType, { sha256: sum });
      await tx.storedFile.update({ where: { id: f.id }, data: { sha256: sum, backedUpAt: now } });
      out.copied++;
    } catch (e) {
      out.failed++;
      console.error(JSON.stringify({ level: "error", event: "file-backup-failed", schoolId: ctx.schoolId, fileId: f.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  out.left = Math.max(0, (await tx.storedFile.count({ where })) - out.missing - out.changed - out.failed);
  if (out.missing || out.changed || out.failed) {
    // Nothing fails silently (08 §9): DREAM TEAM's alerts read these lines. No names, only counts.
    console.error(JSON.stringify({ level: "error", event: "file-backup-problems", schoolId: ctx.schoolId, missing: out.missing, changed: out.changed, failed: out.failed }));
  }
  return out;
}

/** For Data Backup & Security: how this school's files stand in the backup. */
export async function fileBackupStatus(tx: Tx) {
  const [last, waiting, total, lastRun] = await Promise.all([
    tx.storedFile.findFirst({ where: { backedUpAt: { not: null } }, orderBy: { backedUpAt: "desc" }, select: { backedUpAt: true } }),
    tx.storedFile.count({ where: { backedUpAt: null, archivedAt: null } }),
    tx.storedFile.count({ where: { archivedAt: null } }),
    tx.backgroundJob.findFirst({ where: { kind: "schedule:file-backup", status: { in: ["done", "failed"] } }, orderBy: { finishedAt: "desc" }, select: { status: true, finishedAt: true, result: true } }),
  ]);
  const result = (lastRun?.result ?? null) as FileBackupResult | null;
  let setUp = false;
  try {
    setUp = backupStore() !== null;
  } catch {
    // Set up wrongly (the backup place is the files' own place): shown as not set up; the job's error tells DREAM TEAM.
  }
  return {
    setUp,
    lastCopiedAt: last?.backedUpAt ?? null,
    waiting,
    total,
    lastRunAt: lastRun?.finishedAt ?? null,
    lastRunFailed: lastRun?.status === "failed",
    problems: result ? result.missing + result.changed + result.failed : 0,
  };
}
