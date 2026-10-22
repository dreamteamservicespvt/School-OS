// Data Backup & Security never shows the demo seed's stand-in backup as a real
// one (Chaitanya QA audit, PLATFORM-03): "Last backup: today" must come only
// from a real backup record.
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { lastBackup } from "@/lib/data-security/privacy";

describe("last backup", () => {
  it("leaves out the demo seed's stand-in record and shows the real one", async () => {
    const real = new Date("2030-10-01T21:00:00Z");
    await prisma.backupRun.create({ data: { kind: "nightly", finishedAt: real, location: "s3://backups/nightly/2030-10-01", restoreTestedAt: real } });
    await prisma.backupRun.create({ data: { kind: "nightly", finishedAt: new Date("2030-10-15T21:00:00Z"), location: "demo (no real backup on this computer)", restoreTestedAt: new Date("2030-10-15T21:00:00Z") } });
    const b = await lastBackup();
    expect(b.at?.toISOString()).toBe(real.toISOString());
    expect(b.restoreTestedAt?.toISOString()).toBe(real.toISOString());
    expect(b.restorePassed).toBe(true);
  });

  it("shows a failed restore test as failed (npm run restore:test records both)", async () => {
    const at = new Date("2030-11-01T00:00:00Z");
    await prisma.backupRun.create({ data: { kind: "restore-test", location: "fresh dump", restoreTestedAt: at, result: "failed", details: { schools: 2 } } });
    const b = await lastBackup();
    expect(b.restoreTestedAt?.toISOString()).toBe(at.toISOString());
    expect(b.restorePassed).toBe(false);
    expect(b.restoreSchools).toBe(2);
  });
});
