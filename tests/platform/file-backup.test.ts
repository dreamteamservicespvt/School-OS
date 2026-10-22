// File backups (08-platform-security.md §4; gap list G46 part 2): every live
// file is copied to a second place with its checksum, once; a file that is
// missing or changed since upload is reported, never copied over a good backup.
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { backupStore, fileStore } from "@/lib/storage";
import { backupFiles, fileBackupStatus, sha256 } from "@/lib/backup/files";
import { makeSchool } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let ctx: SchoolContext;
let dir: string;
const keys: Record<string, string> = {};
const ids: Record<string, string> = {};

beforeAll(async () => {
  school = await makeSchool("Backup School");
  ctx = { schoolId: school.id, userId: null };
  dir = mkdtempSync(path.join(tmpdir(), "school-os-backup-"));
  await withSchool(ctx, async (tx) => {
    const add = async (name: string, body: Buffer | null, opts: { sha?: string; archived?: boolean } = {}) => {
      const id = randomUUID();
      const key = `${school.id}/test/${id}`;
      if (body) await fileStore().put(key, body, "application/pdf");
      await tx.storedFile.create({ data: { id, schoolId: school.id, storageKey: key, fileName: `${name}.pdf`, contentType: "application/pdf", sizeBytes: body?.length ?? 0, purpose: "test", sha256: "sha" in opts ? opts.sha ?? null : body ? sha256(body) : null, archivedAt: opts.archived ? new Date() : null } });
      keys[name] = key;
      ids[name] = id;
    };
    await add("receipt", Buffer.from("%PDF-1.4 receipt"));
    await add("noChecksum", Buffer.from("%PDF-1.4 made before checksums"), { sha: undefined });
    await add("missing", null, { sha: "0".repeat(64) });
    await add("changed", Buffer.from("%PDF-1.4 changed"), { sha: "f".repeat(64) });
    await add("archived", Buffer.from("%PDF-1.4 old"), { archived: true });
  });
});

afterEach(() => {
  delete process.env.BACKUP_FILES_DIR;
});

describe("file backups", () => {
  it("do nothing, and say so, until a backup place is set up", async () => {
    expect(backupStore()).toBeNull();
    const r = await withSchool(ctx, (tx) => backupFiles(tx, ctx));
    expect(r.skipped).toBe("not-set-up");
    expect((await withSchool(ctx, (tx) => fileBackupStatus(tx))).setUp).toBe(false);
  });

  it("refuse a backup place that is the files' own place", () => {
    process.env.BACKUP_FILES_DIR = process.env.STORAGE_DIR;
    expect(() => backupStore()).toThrow(/different folder/);
  });

  it("copy each live file with its checksum once, and report missing or changed files", async () => {
    process.env.BACKUP_FILES_DIR = dir;
    const r = await withSchool(ctx, (tx) => backupFiles(tx, ctx));
    expect(r).toMatchObject({ copied: 2, missing: 1, changed: 1, failed: 0, left: 0 });
    expect(readFileSync(path.join(dir, keys.receipt)).toString()).toBe("%PDF-1.4 receipt");
    await withSchool(ctx, async (tx) => {
      const old = await tx.storedFile.findUniqueOrThrow({ where: { id: ids.noChecksum } });
      expect(old.sha256).toBe(sha256(Buffer.from("%PDF-1.4 made before checksums")));
      expect(old.backedUpAt).not.toBeNull();
      expect((await tx.storedFile.findUniqueOrThrow({ where: { id: ids.changed } })).backedUpAt).toBeNull();
      expect((await tx.storedFile.findUniqueOrThrow({ where: { id: ids.archived } })).backedUpAt).toBeNull();
    });
    // Running again copies nothing new.
    const again = await withSchool(ctx, (tx) => backupFiles(tx, ctx));
    expect(again.copied).toBe(0);
    const status = await withSchool(ctx, (tx) => fileBackupStatus(tx));
    expect(status).toMatchObject({ setUp: true, waiting: 2, total: 4 });
    expect(status.lastCopiedAt).not.toBeNull();
  });

  it("another school's run never copies or marks this school's files", async () => {
    process.env.BACKUP_FILES_DIR = dir;
    const other = await makeSchool("Backup Other");
    const octx = { schoolId: other.id, userId: null };
    const r = await withSchool(octx, (tx) => backupFiles(tx, octx));
    expect(r).toMatchObject({ copied: 0, missing: 0, changed: 0 });
  });
});
