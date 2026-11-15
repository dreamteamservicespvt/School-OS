// Security review 2026-11-15 (finding: "A School Admin limited to one campus can widen their own
// access to the whole school, or invite whole-school logins"). Someone kept to one campus gives
// access to that campus only, never the whole school (to themselves neither), and changes or
// links only the logins of their own campus. A whole-school School Admin is not limited.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { createSession, findSession } from "@/lib/auth/sessions";
import { changeAccess, disableUser, inviteUser, resendInvite, resetTwoStep, setExceptions, updateDetails } from "@/lib/settings/users";
import { LOGIN_CEILING_WORDS } from "@/lib/staff/login-ceiling";
import { makeSchool, makeUser } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let north: string;
let admin: { id: string };
let northAdmin: { id: string };
let principal: { id: string };
let northTeacher: { id: string };
const ctx = (userId: string) => ({ schoolId: school.id, userId });
const sys = () => ({ schoolId: school.id, userId: null });
const roleId = (key: string) => withSchool(sys(), async (tx) => (await tx.role.findFirstOrThrow({ where: { key } })).id);
const keep = (userId: string, campusId: string) => withSchool(sys(), (tx) => tx.schoolAccess.updateMany({ where: { userLoginId: userId, archivedAt: null }, data: { scope: "CAMPUS", campusId } }));

beforeAll(async () => {
  school = await makeSchool("Two Campus Users");
  north = await withSchool(sys(), async (tx) => (await tx.campus.create({ data: { schoolId: school.id, name: "North Campus" } })).id);
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Whole Admin" });
  northAdmin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "North Admin" });
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Whole Principal" });
  northTeacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "North Teacher" });
  await keep(northAdmin.id, north);
  await keep(northTeacher.id, north);
}, 120_000);

describe("someone kept to one campus, in Settings, Users & Permissions", () => {
  it("cannot widen their own access to the whole school, nor move it to another campus", async () => {
    const adminRole = await roleId("school-admin");
    await expect(withSchool(ctx(northAdmin.id), (tx) => changeAccess(tx, ctx(northAdmin.id), northAdmin.id, { roleIds: [adminRole], scope: "WHOLE_SCHOOL", campusId: null })))
      .rejects.toThrow(LOGIN_CEILING_WORDS.campusScope);
    await expect(withSchool(ctx(northAdmin.id), (tx) => changeAccess(tx, ctx(northAdmin.id), northAdmin.id, { roleIds: [adminRole], scope: "CAMPUS", campusId: school.campus.id })))
      .rejects.toThrow(LOGIN_CEILING_WORDS.campusScope);
    expect((await accessIn(northAdmin.id, school.id))?.campusId).toBe(north);
  }, 60_000);

  it("cannot invite a whole-school login, but can invite one for their campus", async () => {
    const adminRole = await roleId("school-admin");
    const input = { displayName: "New Admin", phone: "+91 98765 11111", email: null, roleIds: [adminRole], staffId: null };
    await expect(withSchool(ctx(northAdmin.id), (tx) => inviteUser(tx, ctx(northAdmin.id), { ...input, username: "campus.widen.1", scope: "WHOLE_SCHOOL", campusId: null })))
      .rejects.toThrow(LOGIN_CEILING_WORDS.campusScope);
    await expect(withSchool(ctx(northAdmin.id), (tx) => inviteUser(tx, ctx(northAdmin.id), { ...input, username: "campus.widen.2", scope: "CAMPUS", campusId: school.campus.id })))
      .rejects.toThrow(LOGIN_CEILING_WORDS.campusScope);
    const ok = await withSchool(ctx(northAdmin.id), (tx) => inviteUser(tx, ctx(northAdmin.id), { ...input, username: "campus.widen.3", scope: "CAMPUS", campusId: north }));
    expect((await accessIn(ok.login.id, school.id))?.campusId).toBe(north);
  }, 60_000);

  it("cannot change, disable, reset or send an invite for a whole-school login", async () => {
    const teacher = await roleId("teacher");
    const as = ctx(northAdmin.id);
    const invited = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], status: "INVITED", name: "Invited Principal" });
    await expect(withSchool(as, (tx) => changeAccess(tx, as, principal.id, { roleIds: [teacher], scope: "CAMPUS", campusId: north }))).rejects.toThrow(LOGIN_CEILING_WORDS.campusPerson);
    await expect(withSchool(as, (tx) => setExceptions(tx, as, principal.id, { "fee-management": "none" }))).rejects.toThrow(LOGIN_CEILING_WORDS.campusPerson);
    await expect(withSchool(as, (tx) => disableUser(tx, as, principal.id, [school.id]))).rejects.toThrow(LOGIN_CEILING_WORDS.campusPerson);
    await expect(withSchool(as, (tx) => resetTwoStep(tx, as, ["school-admin"], principal.id, { reason: "lost-phone", checkDone: "in person at the office" }))).rejects.toThrow(LOGIN_CEILING_WORDS.campusPerson);
    await expect(withSchool(as, (tx) => updateDetails(tx, as, principal.id, [school.id], { displayName: "Whole Principal", phone: "+91 98765 22222", email: null }))).rejects.toThrow(LOGIN_CEILING_WORDS.campusPerson);
    await expect(withSchool(as, (tx) => resendInvite(tx, as, invited.id))).rejects.toThrow(LOGIN_CEILING_WORDS.campusPerson);
    expect((await accessIn(principal.id, school.id))?.roles.map((r) => r.key)).toEqual(["principal"]);
  }, 60_000);

  it("still changes the logins of their own campus", async () => {
    const office = await roleId("receptionist");
    const r = await withSchool(ctx(northAdmin.id), (tx) => changeAccess(tx, ctx(northAdmin.id), northTeacher.id, { roleIds: [office], scope: "CAMPUS", campusId: north }));
    expect(r.changed).toBe(true);
  }, 60_000);

  it("leaves a whole-school School Admin free to give whole-school access", async () => {
    const teacher = await roleId("teacher");
    const r = await withSchool(ctx(admin.id), (tx) => changeAccess(tx, ctx(admin.id), northTeacher.id, { roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null }));
    expect(r.changed).toBe(true);
  }, 60_000);
});

describe("disabling a login that also opens another school (security review 2026-11-15)", () => {
  it("signs it out of this school only, and keeps it signed in at the other", async () => {
    const other = await makeSchool("Other School Of The Group");
    const person = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }, { id: other.id, roleKeys: ["teacher"] }], name: "Two School Teacher" });
    const here = await createSession(person.id, school.id, { userAgent: "Here" });
    const there = await createSession(person.id, other.id, { userAgent: "There" });
    await withSchool(ctx(admin.id), (tx) => disableUser(tx, ctx(admin.id), person.id, [school.id, other.id]));
    expect(await findSession(here.token)).toBeNull();
    expect(await findSession(there.token)).not.toBeNull();
  }, 60_000);
});
