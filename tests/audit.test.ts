// Audit Log Entries can never be changed or deleted (04-data-model.md, rule 23).
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { makeSchool } from "./helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let entryId: string;

beforeAll(async () => {
  school = await makeSchool();
  const ctx = { schoolId: school.id, userId: null };
  const entry = await withSchool(ctx, (tx) =>
    writeAudit(tx, ctx, { action: "edited", recordType: "Campus", recordId: school.campus.id, before: { name: "Old" }, after: { name: "New" } }),
  );
  entryId = entry.id;
});

describe("audit log", () => {
  it("keeps who, what, before and after", async () => {
    const entry = await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.findUnique({ where: { id: entryId } }));
    expect(entry).toMatchObject({ action: "edited", recordType: "Campus", before: { name: "Old" }, after: { name: "New" } });
  });

  it("cannot be changed by the app", async () => {
    await expect(
      withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.update({ where: { id: entryId }, data: { action: "hidden" } })),
    ).rejects.toThrow();
  });

  it("cannot be deleted by the app", async () => {
    await expect(
      withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.deleteMany({ where: { id: entryId } })),
    ).rejects.toThrow();
  });

  it("cannot be changed or deleted even by the table owner", async () => {
    const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
    try {
      const tryAsOwner = (sql: string) =>
        owner.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.school_id', ${school.id}, true)`;
          return tx.$executeRawUnsafe(sql, entryId);
        });
      await expect(tryAsOwner(`UPDATE audit_log_entry SET action = 'hidden' WHERE id = $1::uuid`)).rejects.toThrow(/never be changed or deleted/);
      await expect(tryAsOwner(`DELETE FROM audit_log_entry WHERE id = $1::uuid`)).rejects.toThrow(/never be changed or deleted/);
    } finally {
      await owner.$disconnect();
    }
  });
});
