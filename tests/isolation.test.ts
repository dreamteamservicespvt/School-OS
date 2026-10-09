// School data isolation (08-platform-security.md §1 and §16, "Done when" 1):
// a user of school A tries to read, change and write school B's records, and
// every attempt must fail. These run against the real database rules.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { accessIn, schoolsFor } from "@/lib/auth/access";
import { makeSchool, makeUser } from "./helpers";

let a: Awaited<ReturnType<typeof makeSchool>>;
let b: Awaited<ReturnType<typeof makeSchool>>;
let userA: { id: string };
let userB: { id: string };

beforeAll(async () => {
  a = await makeSchool("School A");
  b = await makeSchool("School B");
  userA = await makeUser({ schools: [{ id: a.id, roleKeys: ["school-admin"] }] });
  userB = await makeUser({ schools: [{ id: b.id, roleKeys: ["school-admin"] }] });
  await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
    await writeAudit(tx, { schoolId: b.id, userId: userB.id }, { action: "test", recordType: "School", recordId: b.id });
    await notify(tx, { schoolId: b.id, userId: null }, { to: userB.id, type: "test", text: "Only for school B", link: "/" });
    await tx.approval.create({
      data: { schoolId: b.id, type: "refund", recordType: "Refund", recordId: "r1", summary: "Refund in school B", askedById: userB.id },
    });
  });
});

const ctxA = () => ({ schoolId: a.id, userId: userA.id });

describe("a user of school A cannot read school B", () => {
  it("sees only school A in every school table", async () => {
    await withSchool(ctxA(), async (tx) => {
      const [schools, campuses, roles, accesses, audit, notes, approvals, modules] = await Promise.all([
        tx.school.findMany(),
        tx.campus.findMany(),
        tx.role.findMany(),
        tx.schoolAccess.findMany(),
        tx.auditLogEntry.findMany(),
        tx.notification.findMany(),
        tx.approval.findMany(),
        tx.schoolModule.findMany(),
      ]);
      for (const rows of [campuses, roles, accesses, audit, notes, approvals, modules] as { schoolId: string }[][]) {
        expect(rows.every((r) => r.schoolId === a.id)).toBe(true);
      }
      expect(schools.map((s) => s.id)).toEqual([a.id]);
      expect(approvals).toHaveLength(0);
    });
  });

  it("cannot open a school B record even by its exact id", async () => {
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.school.findUnique({ where: { id: b.id } })).toBeNull();
      expect(await tx.campus.findUnique({ where: { id: b.campus.id } })).toBeNull();
    });
  });

  it("cannot find school B records by searching", async () => {
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.approval.findMany({ where: { summary: { contains: "school B" } } })).toHaveLength(0);
      expect(await tx.notification.findMany({ where: { text: { contains: "school B" } } })).toHaveLength(0);
    });
  });

  it("cannot count or export school B records", async () => {
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.approval.count({ where: { schoolId: b.id } })).toBe(0);
      expect(await tx.auditLogEntry.count({ where: { schoolId: b.id } })).toBe(0);
    });
  });

  it("sees none of school B's Staff & HR records", async () => {
    await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      await tx.hrSetting.create({ data: { schoolId: b.id } });
      await tx.designation.create({ data: { schoolId: b.id, name: "School B post" } });
      await tx.vacancy.create({ data: { schoolId: b.id, designation: "School B post" } });
    });
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.hrSetting.findUnique({ where: { schoolId: b.id } })).toBeNull();
      expect(await tx.designation.count({ where: { name: "School B post" } })).toBe(0);
      expect(await tx.vacancy.count()).toBe(0);
    });
  });

  it("gets no permissions in school B", async () => {
    expect(await accessIn(userA.id, b.id)).toBeNull();
    expect((await schoolsFor(userA.id)).map((s) => s.id)).toEqual([a.id]);
  });

  it("sees nothing at all without a school chosen", async () => {
    expect(await prisma.campus.findMany()).toHaveLength(0);
    expect(await prisma.approval.findMany()).toHaveLength(0);
    expect(await prisma.school.findMany()).toHaveLength(0);
  });
});

describe("a user of school A cannot change school B", () => {
  it("cannot update school B records", async () => {
    await withSchool(ctxA(), async (tx) => {
      const result = await tx.campus.updateMany({ where: { id: b.campus.id }, data: { name: "Taken over" } });
      expect(result.count).toBe(0);
      const schools = await tx.school.updateMany({ where: { id: b.id }, data: { name: "Taken over" } });
      expect(schools.count).toBe(0);
    });
    await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      expect((await tx.campus.findUnique({ where: { id: b.campus.id } }))?.name).toBe("Main Campus");
    });
  });

  it("cannot write a record into school B", async () => {
    await expect(
      withSchool(ctxA(), (tx) => tx.campus.create({ data: { schoolId: b.id, name: "Sneaky campus" } })),
    ).rejects.toThrow();
    await expect(
      withSchool(ctxA(), (tx) => tx.notification.create({ data: { schoolId: b.id, userLoginId: userB.id, type: "x", text: "x", link: "/" } })),
    ).rejects.toThrow();
  });

  it("cannot move a school A record into school B", async () => {
    await expect(
      withSchool(ctxA(), (tx) => tx.campus.update({ where: { id: a.campus.id }, data: { schoolId: b.id } })),
    ).rejects.toThrow();
  });

  it("cannot delete anything, in any school", async () => {
    await expect(withSchool(ctxA(), (tx) => tx.campus.deleteMany({ where: { id: a.campus.id } }))).rejects.toThrow(/permission denied/);
  });

  it("cannot switch the walls off", async () => {
    await expect(withSchool(ctxA(), (tx) => tx.$executeRawUnsafe('ALTER TABLE "campus" DISABLE ROW LEVEL SECURITY'))).rejects.toThrow();
    // With row_security off, a query that would need to bypass the walls fails instead of leaking.
    await expect(
      withSchool(ctxA(), async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL row_security = off");
        return tx.campus.findMany();
      }),
    ).rejects.toThrow();
  });
});

describe("one login in several schools", () => {
  it("lists both schools and keeps each one's data apart", async () => {
    const both = await makeUser({ schools: [{ id: a.id, roleKeys: ["principal"] }, { id: b.id, roleKeys: ["teacher"] }] });
    expect((await schoolsFor(both.id)).map((s) => s.id).sort()).toEqual([a.id, b.id].sort());

    const inA = await accessIn(both.id, a.id);
    const inB = await accessIn(both.id, b.id);
    expect(inA?.roles.map((r) => r.key)).toEqual(["principal"]);
    expect(inB?.roles.map((r) => r.key)).toEqual(["teacher"]);
    expect(inA?.permissions.settings.see).toBe("all");
    expect(inB?.permissions.settings.see).toBe("none");

    await withSchool({ schoolId: a.id, userId: both.id }, async (tx) => {
      expect(await tx.approval.count()).toBe(0);
    });
  });
});

describe("every school table has its walls", () => {
  it("has row-level security forced and a same-school policy on each table with a school_id", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
    try {
      const tables = await owner.$queryRaw<{ table: string; rls: boolean; forced: boolean; policies: bigint }[]>`
        SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        WHERE c.relkind = 'r'
          AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'school_id')`;
      expect(tables.length).toBeGreaterThan(5);
      const unprotected = tables.filter((t) => !t.rls || !t.forced || Number(t.policies) === 0).map((t) => t.table);
      expect(unprotected).toEqual([]);
    } finally {
      await owner.$disconnect();
    }
  });
});
