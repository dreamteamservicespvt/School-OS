// Deleting an empty, closed school for good (07-super-admin.md §7, Owner's
// approval): everything of that school goes, all or nothing; its Audit Log and
// the console Activity Log stay; no other school is touched; a school that is
// not closed, or has students, can never be deleted this way.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withConsole, withConsoleSchool, withSchool } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { actorOf } from "@/lib/console/auth";
import { deleteSchoolForGood } from "@/lib/console/schools";
import { makeSchool, makeUser, PASSWORD } from "../helpers";

type School = Awaited<ReturnType<typeof makeSchool>>;
let owner: ReturnType<typeof actorOf>;

async function card(s: School, status: "TRIAL" | "CLOSED") {
  await withConsoleSchool(s.id, (tx) => tx.consoleSchool.create({ data: { id: s.id, code: s.code, name: s.name, city: "Kakinada", state: "Andhra Pradesh", status, statusSince: new Date(), startedAs: "TRIAL" } }));
  if (status === "CLOSED") await withConsoleSchool(s.id, (tx) => tx.school.update({ where: { id: s.id }, data: { status: "CLOSED" } }));
}

const exists = (id: string) => withConsole((tx) => tx.consoleSchool.count({ where: { id } }));

beforeAll(async () => {
  const u = await withConsole(async (tx) => tx.superAdminUser.create({ data: { name: "Delete Owner", phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, role: "OWNER", status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
  owner = actorOf(u);
});

describe("deleting an empty closed school for good", () => {
  it("removes the school and its own logins, keeps its Audit Log, and leaves other schools alone", async () => {
    const test = await makeSchool("Delete Test School");
    const keep = await makeSchool("Delete Keep School");
    await card(test, "CLOSED");
    await card(keep, "TRIAL");
    const onlyHere = await makeUser({ schools: [{ id: test.id, roleKeys: ["school-admin"] }] });
    const both = await makeUser({ schools: [{ id: test.id, roleKeys: ["principal"] }, { id: keep.id, roleKeys: ["principal"] }] });
    await withSchool({ schoolId: test.id, userId: null }, (tx) => tx.auditLogEntry.create({ data: { schoolId: test.id, action: "test", recordType: "School", recordId: test.id } }));
    const keepRoles = await withSchool({ schoolId: keep.id, userId: null }, (tx) => tx.role.count());

    await expect(deleteSchoolForGood(owner, test.id, { typedName: "Wrong name", reason: "Test school" })).rejects.toThrow(/Type Delete Test School/);
    await deleteSchoolForGood(owner, test.id, { typedName: test.name, reason: "Test school, made while trying School OS" });

    expect(await exists(test.id)).toBe(0);
    await withSchool({ schoolId: test.id, userId: null }, async (tx) => {
      expect(await tx.role.count()).toBe(0);
      expect(await tx.schoolAccess.count()).toBe(0);
      // The Audit Log stays, unchanged.
      expect(await tx.auditLogEntry.count({ where: { action: "test" } })).toBe(1);
    });
    expect(await prisma.userLogin.count({ where: { id: onlyHere.id } })).toBe(0);
    expect(await prisma.userLogin.count({ where: { id: both.id } })).toBe(1);
    expect(await withSchool({ schoolId: keep.id, userId: null }, (tx) => tx.role.count())).toBe(keepRoles);
    expect(await exists(keep.id)).toBe(1);
    const line = await withConsole((tx) => tx.consoleActivityEntry.findFirst({ where: { forSchoolId: test.id, text: { contains: "for good" } } }));
    expect(line?.actorName).toBe("Delete Owner");
  });

  it("refuses a school that is not closed", async () => {
    const s = await makeSchool("Delete Open School");
    await card(s, "TRIAL");
    await expect(deleteSchoolForGood(owner, s.id, { typedName: s.name, reason: "Test school" })).rejects.toThrow(/Close it first/);
    expect(await exists(s.id)).toBe(1);
  });

  it("deletes a made-up demo school with its students", async () => {
    const s = await makeSchool("Delete Demo School");
    await card(s, "CLOSED");
    await withSchool({ schoolId: s.id, userId: null }, async (tx) => {
      await tx.school.update({ where: { id: s.id }, data: { isDemo: true } });
      await tx.student.create({ data: { schoolId: s.id, campusId: s.campus.id, admissionNo: `A${randomUUID().slice(0, 6)}`, firstName: "Ravi", fullName: "Ravi Demo" } });
    });
    await deleteSchoolForGood(owner, s.id, { typedName: s.name, reason: "Demo school, made-up data" });
    expect(await exists(s.id)).toBe(0);
    expect(await withSchool({ schoolId: s.id, userId: null }, (tx) => tx.student.count())).toBe(0);
  });

  it("refuses a closed school that has students, and deletes nothing", async () => {
    const s = await makeSchool("Delete Real School");
    await card(s, "CLOSED");
    await withSchool({ schoolId: s.id, userId: null }, (tx) => tx.student.create({ data: { schoolId: s.id, campusId: s.campus.id, admissionNo: `A${randomUUID().slice(0, 6)}`, firstName: "Asha", fullName: "Asha Rao" } }));
    await expect(deleteSchoolForGood(owner, s.id, { typedName: s.name, reason: "Test school" })).rejects.toThrow(/can never be deleted/);
    expect(await exists(s.id)).toBe(1);
    expect(await withSchool({ schoolId: s.id, userId: null }, (tx) => tx.student.count())).toBe(1);
  });
});
