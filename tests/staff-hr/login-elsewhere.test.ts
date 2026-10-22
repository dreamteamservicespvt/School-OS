// A staff member who also works in another school keeps their login there when
// school A closes it: switching the login off, the last working day of an exit,
// or undoing the import that made them. Before, the "works elsewhere?" count ran
// inside school A, where the database hides the other school's rows, so it was
// always 0 and the login was disabled or archived for both schools.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { accessIn, schoolsFor, worksElsewhere } from "@/lib/auth/access";
import { finishLastDay, switchOffLogin } from "@/lib/staff/exit";
import { importKind } from "@/lib/importer";
import "@/lib/staff/import";
import { d, makeHrSchool } from "./fixture";
import { makeSchool, makeUser } from "../helpers";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
let b: Awaited<ReturnType<typeof makeSchool>>;
const inA = () => ({ schoolId: f.school.id, userId: f.admin.id });

beforeAll(async () => {
  f = await makeHrSchool();
  b = await makeSchool("Sister School");
}, 60_000);

/** A staff record in school A whose login (made after it) also opens school B, or only A. */
async function staffWithLogin(phone: string, alsoInB: boolean) {
  const staff = await withSchool(inA(), (tx) => tx.staff.create({
    data: { schoolId: f.school.id, campusId: f.school.campus.id, staffCode: `X-${phone.slice(-4)}`, firstName: "Two", lastName: "Schools", fullName: "Two Schools", phone, designation: "Teacher", joiningDate: d("2024-06-01") },
  }));
  const login = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }, ...(alsoInB ? [{ id: b.id, roleKeys: ["teacher"] }] : [])], name: "Two Schools" });
  await withSchool(inA(), (tx) => tx.staff.update({ where: { id: staff.id }, data: { userLoginId: login.id } }));
  return { staff, login };
}

const loginRow = (id: string) => prisma.userLogin.findUniqueOrThrow({ where: { id } });

describe("closing a login in school A leaves it working in school B", () => {
  it("worksElsewhere sees the other school from inside school A's work", async () => {
    const both = await staffWithLogin("9000011001", true);
    const onlyA = await staffWithLogin("9000011002", false);
    expect(await worksElsewhere(both.login.id, f.school.id)).toBe(true);
    expect(await worksElsewhere(onlyA.login.id, f.school.id)).toBe(false);
  });

  it("Switch off login", async () => {
    const { staff, login } = await staffWithLogin("9000011003", true);
    await withSchool(inA(), (tx) => switchOffLogin(tx, inA(), staff.id, "Moved to the sister school"));
    expect((await loginRow(login.id)).status).toBe("ACTIVE");
    expect((await schoolsFor(login.id)).map((s) => s.id)).toEqual([b.id]);
    expect(await accessIn(login.id, b.id)).not.toBeNull();
    expect(await accessIn(login.id, f.school.id)).toBeNull();
  });

  it("the last working day of an exit", async () => {
    const { staff, login } = await staffWithLogin("9000011004", true);
    const exit = await withSchool(inA(), (tx) => tx.exitCase.create({ data: { schoolId: f.school.id, staffId: staff.id, type: "RESIGNATION", receivedOn: d("2026-09-01"), lastWorkingDay: d("2026-09-30"), reason: "Moving to the sister school" } }));
    await withSchool(inA(), (tx) => finishLastDay(tx, inA(), exit.id));
    expect((await loginRow(login.id)).status).toBe("ACTIVE");
    expect((await schoolsFor(login.id)).map((s) => s.id)).toEqual([b.id]);
  });

  it("undoing the import that made the staff record", async () => {
    const { staff, login } = await staffWithLogin("9000011005", true);
    // The login is "made by the import" when it is newer than the staff record.
    await prisma.userLogin.update({ where: { id: login.id }, data: { createdAt: new Date(staff.createdAt.getTime() + 1000) } });
    await withSchool(inA(), (tx) => importKind("staff")!.undo(tx, inA(), [staff.id]));
    const row = await loginRow(login.id);
    expect(row.archivedAt).toBeNull();
    expect((await schoolsFor(login.id)).map((s) => s.id)).toEqual([b.id]);
  });

  it("a login that opens only school A is still switched off", async () => {
    const { staff, login } = await staffWithLogin("9000011006", false);
    await withSchool(inA(), (tx) => switchOffLogin(tx, inA(), staff.id, "Left the school"));
    expect((await loginRow(login.id)).status).toBe("DISABLED");
    const undone = await staffWithLogin("9000011007", false);
    await prisma.userLogin.update({ where: { id: undone.login.id }, data: { createdAt: new Date(undone.staff.createdAt.getTime() + 1000) } });
    await withSchool(inA(), (tx) => importKind("staff")!.undo(tx, inA(), [undone.staff.id]));
    expect((await loginRow(undone.login.id)).archivedAt).not.toBeNull();
  });
});
