// Settings, Users & Permissions: last School Admin protection, invites,
// roles and exceptions, disable signs out everywhere, two-step reset.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { acceptInvite, findInvite } from "@/lib/auth/invites";
import { createSession, findSession } from "@/lib/auth/sessions";
import { changeAccess, disableUser, enableUser, inviteUser, resendInvite, resetTwoStep, setExceptions, linkRecord } from "@/lib/settings/users";
import { SettingsProblem } from "@/lib/settings/common";
import { makeSchool, makeUser } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let admin: { id: string };
let principal: { id: string };
const ctx = (userId: string) => ({ schoolId: school.id, userId });
const roleId = (key: string) => withSchool(ctx(admin.id), async (tx) => (await tx.role.findFirstOrThrow({ where: { key } })).id);

beforeAll(async () => {
  school = await makeSchool("Users School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Suresh Admin" });
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Lakshmi Principal" });
});

describe("the last School Admin", () => {
  it("cannot be disabled", async () => {
    // Another person tries to disable the only School Admin.
    await expect(withSchool(ctx(principal.id), (tx) => disableUser(tx, ctx(principal.id), admin.id, [school.id]))).rejects.toThrow("At least one School Admin must remain");
  });

  it("cannot lose the School Admin role", async () => {
    const teacher = await roleId("teacher");
    await expect(withSchool(ctx(principal.id), (tx) => changeAccess(tx, ctx(principal.id), admin.id, { roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null }))).rejects.toThrow("At least one School Admin must remain");
  });

  it("cannot be narrowed below full Settings by an exception", async () => {
    await expect(withSchool(ctx(principal.id), (tx) => setExceptions(tx, ctx(principal.id), admin.id, { settings: "view" }))).rejects.toThrow(/School Admin must remain/);
  });

  it("can be changed once another School Admin exists", async () => {
    const second = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Second Admin" });
    const teacher = await roleId("teacher");
    const r = await withSchool(ctx(principal.id), (tx) => changeAccess(tx, ctx(principal.id), second.id, { roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null }));
    expect(r.changed).toBe(true);
    // Now admin is the only one again.
    await expect(withSchool(ctx(principal.id), (tx) => disableUser(tx, ctx(principal.id), admin.id, [school.id]))).rejects.toThrow(/School Admin/);
  });

  it("nobody can disable their own login", async () => {
    await expect(withSchool(ctx(admin.id), (tx) => disableUser(tx, ctx(admin.id), admin.id, [school.id]))).rejects.toThrow("your own login");
  });
});

describe("inviting a user", () => {
  it("makes an Invited login with School Access, roles and a working invite link", async () => {
    const teacher = await roleId("teacher");
    const { login, token } = await withSchool(ctx(admin.id), (tx) =>
      inviteUser(tx, ctx(admin.id), { displayName: "Meena Iyer", phone: "9876512345", email: null, username: `meena.${Date.now()}`, roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null, staffId: null }),
    );
    expect(login.status).toBe("INVITED");
    expect((await findInvite(token))?.id).toBe(login.id);
    const access = await accessIn(login.id, school.id);
    expect(access?.roles.map((r) => r.key)).toEqual(["teacher"]);

    // Resending makes a new link; the old one stops working.
    const again = await withSchool(ctx(admin.id), (tx) => resendInvite(tx, ctx(admin.id), login.id));
    expect(await findInvite(token)).toBeNull();
    const accepted = await acceptInvite(again.token, "Strong-pass-42");
    expect(accepted.ok).toBe(true);
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: login.id } })).status).toBe("ACTIVE");
    await expect(withSchool(ctx(admin.id), (tx) => resendInvite(tx, ctx(admin.id), login.id))).rejects.toThrow(/already set a password/);
  });

  it("refuses a taken username and tells every School Admin", async () => {
    const teacher = await roleId("teacher");
    const taken = (await prisma.userLogin.findUniqueOrThrow({ where: { id: principal.id } })).username;
    await expect(withSchool(ctx(admin.id), (tx) =>
      inviteUser(tx, ctx(admin.id), { displayName: "X", phone: null, email: null, username: taken, roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null, staffId: null }),
    )).rejects.toThrow(/taken/);

    await withSchool(ctx(principal.id), (tx) =>
      inviteUser(tx, ctx(principal.id), { displayName: "Kiran Office", phone: null, email: null, username: `kiran.${Date.now()}`, roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null, staffId: null }),
    );
    const alerts = await withSchool(ctx(admin.id), (tx) => tx.notification.findMany({ where: { userLoginId: admin.id, type: "security", text: { contains: "invited Kiran Office" } } }));
    expect(alerts).toHaveLength(1);
  });

  it("links the login to the Staff record it belongs to, and only one", async () => {
    const teacher = await roleId("teacher");
    const staff = await withSchool(ctx(admin.id), (tx) => tx.staff.create({ data: { schoolId: school.id, campusId: school.campus.id, staffCode: `S-${Date.now()}`, firstName: "Ravi", fullName: "Ravi Teja", phone: "9876500004", designation: "Teacher", joiningDate: new Date("2020-06-01") } }));
    const { login } = await withSchool(ctx(admin.id), (tx) =>
      inviteUser(tx, ctx(admin.id), { displayName: "Ravi Teja", phone: null, email: null, username: `ravi.${Date.now()}`, roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null, staffId: staff.id }),
    );
    expect((await withSchool(ctx(admin.id), (tx) => tx.staff.findUniqueOrThrow({ where: { id: staff.id } }))).userLoginId).toBe(login.id);
    await expect(withSchool(ctx(admin.id), (tx) =>
      inviteUser(tx, ctx(admin.id), { displayName: "Other", phone: null, email: null, username: `other.${Date.now()}`, roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null, staffId: staff.id }),
    )).rejects.toThrow(/already has a login/);
    expect(await withSchool(ctx(admin.id), (tx) => linkRecord(tx, ctx(admin.id), login.id, { kind: "none", id: null }))).toBe(true);
    expect((await withSchool(ctx(admin.id), (tx) => tx.staff.findUniqueOrThrow({ where: { id: staff.id } }))).userLoginId).toBeNull();
  });
});

describe("roles, scope and exceptions", () => {
  it("changing roles gives the new permissions, keeps history and signs the person out", async () => {
    const person = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Role Change" });
    const { token } = await createSession(person.id, school.id, {});
    const accountant = await roleId("accountant");
    const r = await withSchool(ctx(admin.id), (tx) => changeAccess(tx, ctx(admin.id), person.id, { roleIds: [accountant], scope: "WHOLE_SCHOOL", campusId: null }));
    expect(r).toEqual({ changed: true, signedOut: 1 });
    expect(await findSession(token)).toBeNull();
    const access = await accessIn(person.id, school.id);
    expect(access?.permissions["fee-management"].change).toBe("all");
    expect(access?.permissions["attendance-management"].see).toBe("none");
    const rows = await withSchool(ctx(admin.id), (tx) => tx.schoolAccess.findMany({ where: { userLoginId: person.id } }));
    expect(rows.filter((a) => a.archivedAt)).toHaveLength(1);
    expect(rows.filter((a) => !a.archivedAt)).toHaveLength(1);
    const alert = await withSchool(ctx(admin.id), (tx) => tx.notification.findFirst({ where: { userLoginId: person.id, type: "security" } }));
    expect(alert?.text).toContain("roles from Teacher to Accountant");
  });

  it("an exception widens or narrows one module for one person", async () => {
    const person = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }], name: "Exception Person" });
    await withSchool(ctx(admin.id), (tx) => setExceptions(tx, ctx(admin.id), person.id, { "salary-management": "none", "front-office": "view", "not-a-module": "full" }));
    const access = await accessIn(person.id, school.id);
    expect(access?.permissions["salary-management"].see).toBe("none");
    expect(access?.permissions["front-office"].see).toBe("all");
    expect(access?.permissions["front-office"].change).toBe("none");
    expect(access?.permissions["fee-management"].change).toBe("all");
    const saved = await withSchool(ctx(admin.id), (tx) => tx.schoolAccess.findFirstOrThrow({ where: { userLoginId: person.id, archivedAt: null } }));
    expect(saved.exceptions).toEqual({ "salary-management": "none", "front-office": "view" });
    // Exceptions survive a role change.
    const teacher = await roleId("teacher");
    await withSchool(ctx(admin.id), (tx) => changeAccess(tx, ctx(admin.id), person.id, { roleIds: [teacher], scope: "WHOLE_SCHOOL", campusId: null }));
    expect((await accessIn(person.id, school.id))?.permissions["front-office"].see).toBe("all");
  });

  it("the Own scope narrows whole-school reach to own records", async () => {
    const person = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Own Scope" });
    const principalRole = await roleId("principal");
    await withSchool(ctx(admin.id), (tx) => changeAccess(tx, ctx(admin.id), person.id, { roleIds: [principalRole], scope: "OWN", campusId: null }));
    const access = await accessIn(person.id, school.id);
    expect(access?.scope).toBe("OWN");
    expect(access?.permissions["student-management"]).toEqual({ see: "own", change: "own" });
  });

  it("one campus scope needs a campus", async () => {
    const person = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    const teacher = await roleId("teacher");
    await expect(withSchool(ctx(admin.id), (tx) => changeAccess(tx, ctx(admin.id), person.id, { roleIds: [teacher], scope: "CAMPUS", campusId: null }))).rejects.toThrow("Choose the campus");
    await withSchool(ctx(admin.id), (tx) => changeAccess(tx, ctx(admin.id), person.id, { roleIds: [teacher], scope: "CAMPUS", campusId: school.campus.id }));
    expect((await accessIn(person.id, school.id))?.campusId).toBe(school.campus.id);
  });
});

describe("disabling and enabling", () => {
  it("disabling signs the person out on every device at once, and enabling brings back their roles", async () => {
    const person = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Ravi Kumar" });
    const one = await createSession(person.id, school.id, { userAgent: "phone" });
    const two = await createSession(person.id, school.id, { userAgent: "computer" });
    const result = await withSchool(ctx(admin.id), (tx) => disableUser(tx, ctx(admin.id), person.id, [school.id]));
    expect(result).toEqual({ name: "Ravi Kumar", signedOut: 2 });
    expect(await findSession(one.token)).toBeNull();
    expect(await findSession(two.token)).toBeNull();
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: person.id } })).status).toBe("DISABLED");
    expect(await accessIn(person.id, school.id)).toBeNull();
    const audit = await withSchool(ctx(admin.id), (tx) => tx.auditLogEntry.findFirst({ where: { recordId: person.id, action: "disabled" } }));
    expect(audit?.after).toMatchObject({ signedOutDevices: 2 });

    await withSchool(ctx(admin.id), (tx) => enableUser(tx, ctx(admin.id), person.id));
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: person.id } })).status).toBe("ACTIVE");
    expect((await accessIn(person.id, school.id))?.roles.map((r) => r.key)).toEqual(["teacher"]);
  });

  it("a login that also works in another school stays on there", async () => {
    const other = await makeSchool("Other School");
    const person = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }, { id: other.id, roleKeys: ["teacher"] }] });
    await withSchool(ctx(admin.id), (tx) => disableUser(tx, ctx(admin.id), person.id, [school.id, other.id]));
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: person.id } })).status).toBe("ACTIVE");
    expect(await accessIn(person.id, school.id)).toBeNull();
    expect(await accessIn(person.id, other.id)).not.toBeNull();
  });
});

describe("two-step login reset", () => {
  it("is done by another School Admin or the Principal, with a reason, and audited", async () => {
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Lost Phone" });
    await expect(withSchool(ctx(admin.id), (tx) => resetTwoStep(tx, ctx(admin.id), ["school-admin"], admin.id, { reason: "lost-phone", checkDone: "In person at the office" }))).rejects.toThrow("your own");
    await expect(withSchool(ctx(teacher.id), (tx) => resetTwoStep(tx, ctx(teacher.id), ["teacher"], admin.id, { reason: "lost-phone", checkDone: "In person" }))).rejects.toThrow(SettingsProblem);
    await expect(withSchool(ctx(admin.id), (tx) => resetTwoStep(tx, ctx(admin.id), ["school-admin"], teacher.id, { reason: "lost-phone", checkDone: "ok" }))).rejects.toThrow(/confirmed/);
    const name = await withSchool(ctx(principal.id), (tx) => resetTwoStep(tx, ctx(principal.id), ["principal"], teacher.id, { reason: "lost-phone", checkDone: "In person at the office" }));
    expect(name).toBe("Lost Phone");
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: teacher.id } })).twoStepResetAt).not.toBeNull();
    const audit = await withSchool(ctx(admin.id), (tx) => tx.auditLogEntry.findFirst({ where: { recordId: teacher.id, action: "reset-two-step" } }));
    expect(audit?.userLoginId).toBe(principal.id);
    expect(audit?.after).toMatchObject({ reason: "Lost phone", checkDone: "In person at the office" });
  });
});
