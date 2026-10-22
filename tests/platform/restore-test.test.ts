// Restore tests (08-platform-security.md §4 "Proven", §16 Done when 3; gap
// list G46 part 3): a backup restored into a scratch database has every
// school's rows and every file, and the result is recorded for the schools.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prisma, withSchool } from "@/lib/db";
import { backupStore, fileStore } from "@/lib/storage";
import { backupFiles, sha256 } from "@/lib/backup/files";
import { checkFile, compareCounts } from "@/lib/backup/restore-check";
import { runRestoreTest, scratchName } from "@/lib/backup/restore-test";
import { makeSchool } from "../helpers";

describe("restore test checks", () => {
  it("a copy must match where nothing changed, and fall in range where a school was busy", () => {
    const before = { student: { a: 10, b: 4 } };
    const after = { student: { a: 12, b: 4 } };
    expect(compareCounts(before, after, { student: { a: 11, b: 4 } }).problems).toEqual([]);
    expect(compareCounts(before, after, { student: { a: 11, b: 4 } }).busy).toBe(1);
    const lost = compareCounts(before, after, { student: { a: 11, b: 3 } }).problems;
    expect(lost).toHaveLength(1);
    expect(lost[0].text).toContain("school b has 3 rows in the copy, 4 in the live database");
  });

  it("a file is missing, changed or right", () => {
    expect(checkFile("abc", null)).toBe("missing");
    expect(checkFile("abc", "def")).toBe("changed");
    expect(checkFile("abc", "abc")).toBe("ok");
    expect(checkFile(null, "def")).toBe("ok");
  });

  it("restores only into a scratch database named after the source", () => {
    expect(scratchName("school_os_w2")).toBe("school_os_w2_restore_test");
    expect(() => scratchName("school_os; DROP")).toThrow();
  });

});

// The whole test needs pg_dump and pg_restore (PG_BIN, or this computer's portable PostgreSQL).
const pgBin = process.env.PG_BIN ?? (existsSync("C:/Users/chala/tools/pg16/pgsql/bin/pg_dump.exe") ? "C:/Users/chala/tools/pg16/pgsql/bin" : undefined);
const adminUrl = (() => {
  if (process.env.RESTORE_ADMIN_URL) return process.env.RESTORE_ADMIN_URL;
  const u = new URL(process.env.MIGRATION_DATABASE_URL!);
  u.username = "postgres";
  u.password = "";
  return u.toString();
})();

const latestRestore = () => prisma.backupRun.findFirstOrThrow({ where: { kind: "restore-test" }, orderBy: { finishedAt: "desc" } });

describe.skipIf(!pgBin)("restore test on a real copy", () => {
  let dir: string;
  let reports: string;
  let key: string;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "school-os-restore-files-"));
    reports = mkdtempSync(path.join(tmpdir(), "school-os-restore-reports-"));
    process.env.BACKUP_FILES_DIR = dir;
    // Other test files leave schools and files behind, some broken on purpose
    // (file-backup.test.ts: a missing and a changed file). Start from what a
    // nightly backup leaves: every live file whose bytes are intact is in this
    // backup, and one whose bytes are gone or changed is archived, so this file
    // depends only on its own data whatever ran before it.
    const store = backupStore()!;
    // Every school, past row-level security: the admin login lists them, the work is done per school.
    const onTestDb = new URL(adminUrl);
    onTestDb.pathname = new URL(process.env.MIGRATION_DATABASE_URL!).pathname;
    const admin = new PrismaClient({ datasourceUrl: onTestDb.toString() });
    const schools = await admin.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM school`.finally(() => admin.$disconnect());
    for (const { id: schoolId } of schools) {
      await withSchool({ schoolId, userId: null }, async (tx) => {
        for (const f of await tx.storedFile.findMany({ where: { archivedAt: null } })) {
          const body = await fileStore().get(f.storageKey);
          if (body && (!f.sha256 || f.sha256 === sha256(body))) await store.put(f.storageKey, body, f.contentType, { sha256: sha256(body) });
          else await tx.storedFile.update({ where: { id: f.id }, data: { archivedAt: new Date() } });
        }
      });
    }
    for (const name of ["Restore A", "Restore B"]) {
      const s = await makeSchool(name);
      const ctx = { schoolId: s.id, userId: null };
      await withSchool(ctx, async (tx) => {
        const id = randomUUID();
        key = `${s.id}/test/${id}`;
        const body = Buffer.from(`%PDF-1.4 ${name}`);
        await fileStore().put(key, body, "application/pdf");
        await tx.storedFile.create({ data: { id, schoolId: s.id, storageKey: key, fileName: "r.pdf", contentType: "application/pdf", sizeBytes: body.length, purpose: "test", sha256: sha256(body) } });
        await backupFiles(tx, ctx);
      });
    }
  });

  afterAll(() => {
    delete process.env.BACKUP_FILES_DIR;
    rmSync(dir, { recursive: true, force: true });
    rmSync(reports, { recursive: true, force: true });
  });

  it("passes when every school's rows and files are in the copy, writes a report and records it", async () => {
    const r = await runRestoreTest({ sourceUrl: process.env.MIGRATION_DATABASE_URL!, adminUrl, pgBin, reportDir: reports, record: true });
    expect(r.problems).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.schools).toBeGreaterThanOrEqual(2);
    expect(r.files).toMatchObject({ missing: 0, changed: 0, where: "backup" });
    expect(r.files.ok).toBeGreaterThanOrEqual(2);
    expect(readFileSync(r.reportFile!, "utf8")).toContain("Restore test: PASSED");
    const row = await latestRestore();
    expect(row.result).toBe("passed");
    expect((row.details as { schools: number }).schools).toBe(r.schools);
    // The scratch database is gone again.
    const left = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_database WHERE datname = ${r.target}`;
    expect(Number(left[0].n)).toBe(0);
  }, 300_000);

  it("fails, and records the failure, when a file is not in the backup", async () => {
    rmSync(path.join(dir, key));
    const r = await runRestoreTest({ sourceUrl: process.env.MIGRATION_DATABASE_URL!, adminUrl, pgBin, record: true });
    expect(r.passed).toBe(false);
    expect(r.files.missing).toBe(1);
    expect(r.problems.some((p) => p.kind === "file" && p.text.includes(key))).toBe(true);
    expect((await latestRestore()).result).toBe("failed");
  }, 300_000);
});
