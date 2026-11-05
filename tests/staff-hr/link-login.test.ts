// Live test issue 11 (04-data-model.md rule 32): logins made by invite (the
// Principal, the School Admin) have no staff record, so they are missing from
// the Staff List and "Staff present". The Staff List names them, and Add Staff
// makes the staff record for one and links the login: no second login, the
// roles stay as they are. Logins of another school, logins that already have
// a record and Driver/Student-only logins can never be linked.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { createStaff, findDuplicates, type StaffDetails } from "@/lib/staff/staff";
import { linkableLogin, loginsWithoutStaff } from "@/lib/staff/link-login";
import { d, makeHrSchool } from "./fixture";
import { makeSchool, makeUser } from "../helpers";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
const as = (userId: string | null) => ({ schoolId: f.school.id, userId });

const details = (over: Partial<StaffDetails> = {}): StaffDetails => ({
  fullName: "Saiveni Admin", phone: "9123400081", designation: "Teacher", departmentId: null, joiningDate: d("2026-10-01"), gender: "Female",
  email: null, staffCode: null, dateOfBirth: null, bloodGroup: null, aadhaar: null, address: null, permanentAddress: null, qualification: null,
  experienceYears: null, employmentType: "Permanent", reportingToId: null, campusId: null, phoneVerified: false, emailVerified: false, photoFileId: null, ...over,
});

beforeAll(async () => {
  f = await makeHrSchool();
}, 120_000);

describe("logins with no staff record (issue 11)", () => {
  it("lists the School Admin's login (no record) and not the Principal or teachers (they have one)", async () => {
    const list = await withSchool(as(f.principal.id), (tx) => loginsWithoutStaff(tx, as(f.principal.id)));
    const ids = list.map((u) => u.id);
    expect(ids).toContain(f.admin.id);
    expect(ids).not.toContain(f.principal.id);
    expect(ids).not.toContain(f.teacherLogin.id);
    expect(list.find((u) => u.id === f.admin.id)?.roleNames).toEqual(["School Admin"]);
  });

  it("leaves out a Driver-only login", async () => {
    const driver = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["driver"] }], name: "Bus Driver" });
    const list = await withSchool(as(f.principal.id), (tx) => loginsWithoutStaff(tx, as(f.principal.id)));
    expect(list.map((u) => u.id)).not.toContain(driver.id);
  });

  it("refuses a login of another school, and does not list it", async () => {
    const other = await makeSchool("Other School");
    const stranger = await makeUser({ schools: [{ id: other.id, roleKeys: ["school-admin"] }], name: "Other Admin" });
    await withSchool(as(f.principal.id), async (tx) => {
      expect((await loginsWithoutStaff(tx, as(f.principal.id))).map((u) => u.id)).not.toContain(stranger.id);
      expect(await linkableLogin(tx, as(f.principal.id), stranger.id, null)).toMatch(/cannot be linked here/);
      await expect(createStaff(tx, as(f.principal.id), details({ fullName: "Other Admin", phone: "9123400082" }), null, [], { linkLoginId: stranger.id })).rejects.toThrow(/cannot be linked here/);
    });
  });

  it("a campus-limited adder cannot link a whole-school login", async () => {
    const r = await withSchool(as(f.principal.id), (tx) => linkableLogin(tx, as(f.principal.id), f.admin.id, f.school.campus.id));
    expect(r).toMatch(/cannot be linked here/);
  });

  it("refuses a new login and a link together", async () => {
    await expect(withSchool(as(f.principal.id), (tx) => createStaff(tx, as(f.principal.id), details({ phone: "9123400083" }),
      { roleKeys: ["teacher"], username: null, exceptions: {}, campusId: null }, [], { linkLoginId: f.admin.id }))).rejects.toThrow(/already has a login/);
  });

  it("a class teacher needs the Class Teacher role on the linked login", async () => {
    await expect(withSchool(as(f.principal.id), (tx) => createStaff(tx, as(f.principal.id), details({ phone: "9123400084" }), null, [],
      { linkLoginId: f.admin.id, classTeacherSectionId: f.section.id }))).rejects.toThrow(/has no Class Teacher role/);
  });

  it("the linked login's own phone is not a duplicate (found in the browser check)", async () => {
    const desk = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["receptionist"] }], name: "Naresh Kumar" });
    await prisma.userLogin.update({ where: { id: desk.id }, data: { phone: "9123400086" } });
    await withSchool(as(f.principal.id), async (tx) => {
      expect(await findDuplicates(tx, as(f.principal.id), { phone: "9123400086" })).toHaveLength(1);
      expect(await findDuplicates(tx, as(f.principal.id), { phone: "9123400086", excludeLoginId: desk.id })).toHaveLength(0);
      const r = await createStaff(tx, as(f.principal.id), details({ fullName: "Naresh Kumar", phone: "9123400086", designation: "Teacher" }), null, [], { linkLoginId: desk.id });
      expect(r.staff.userLoginId).toBe(desk.id);
    });
  });

  it("Add Staff links the login: no second login, the roles stay, the Audit Log names it, and it leaves the list", async () => {
    const loginsBefore = await prisma.userLogin.count();
    const accessBefore = await withSchool(as(f.principal.id), (tx) => tx.schoolAccess.findFirstOrThrow({ where: { userLoginId: f.admin.id }, include: { roles: true } }));
    const r = await withSchool(as(f.principal.id), (tx) => createStaff(tx, as(f.principal.id), details(), null, [], { linkLoginId: f.admin.id }));
    expect(r.staff.userLoginId).toBe(f.admin.id);
    expect(r.username).toBe(f.admin.username);
    expect(r.roleNames).toEqual(["School Admin"]);
    expect(r.inviteLink).toBeNull();
    expect(await prisma.userLogin.count()).toBe(loginsBefore);
    await withSchool(as(f.principal.id), async (tx) => {
      const access = await tx.schoolAccess.findFirstOrThrow({ where: { userLoginId: f.admin.id }, include: { roles: true } });
      expect(access.roles.map((x) => x.roleId).sort()).toEqual(accessBefore.roles.map((x) => x.roleId).sort());
      const audit = await tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Staff", recordId: r.staff.id, action: "created" } });
      expect(audit.after).toMatchObject({ linkedLogin: f.admin.username });
      expect((await loginsWithoutStaff(tx, as(f.principal.id))).map((u) => u.id)).not.toContain(f.admin.id);
      expect(await linkableLogin(tx, as(f.principal.id), f.admin.id, null)).toMatch(/already belongs to Saiveni Admin/);
    });
    // Linking it a second time is refused.
    await expect(withSchool(as(f.principal.id), (tx) => createStaff(tx, as(f.principal.id), details({ fullName: "Second Try", phone: "9123400085" }), null, [], { linkLoginId: f.admin.id }))).rejects.toThrow(/already belongs to/);
  });
});
