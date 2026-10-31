// Security audit run-2, lead L5: a person with Staff & HR "Full" but no
// Settings access (the HR role template) could give a staff record a School
// Admin or Principal login, Settings exceptions, or exceptions above their own,
// and make a new sign-in link ("Reset password") for the Principal's login.
// Owner decision taken overnight (to confirm): only someone who can change
// Settings, Users & Permissions (Settings "edit") gives those roles and
// exceptions, or makes a sign-in link for a School Admin or Principal login
// they do not hold themselves. Settings, Users & Permissions is unchanged.
// Calls the real Staff & HR server actions.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { createStaff, type StaffDetails } from "@/lib/staff/staff";
import { LOGIN_CEILING_WORDS } from "@/lib/staff/login-ceiling";
import { closeLoginsOnLastDay, startExit, switchOffLogin } from "@/lib/staff/exit";
import { activeSchoolAdminIds } from "@/lib/settings/common";
import { makeSchool, makeUser } from "../helpers";
import { d, makeHrSchool } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId } };
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));
const profile = await import("@/app/(school)/staff-hr-management/[staffId]/actions");

let f: Awaited<ReturnType<typeof makeHrSchool>>;
let hr: { id: string };
const as = (u: { id: string }) => { who.userId = u.id; who.schoolId = f.school.id; };
const sys = () => ({ schoolId: f.school.id, userId: null });
const form = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x); return fd; };
const loginOf = (staffId: string) => withSchool(sys(), async (tx) => (await tx.staff.findUniqueOrThrow({ where: { id: staffId } })).userLoginId);

let phone = 9123401000;
async function newStaff(name: string) {
  phone++;
  return withSchool(sys(), (tx) => tx.staff.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, staffCode: `LC-${phone}`, firstName: name.split(" ")[0], fullName: name, phone: String(phone), designation: "Teacher", joiningDate: d("2026-06-01") } }));
}
const give = (staffId: string, roleKeys: string[], perms: Record<string, string> = {}) =>
  profile.giveLoginAction({ ok: false, message: "" }, form({ staffId, roleKeys, signIn: "invite", ...Object.fromEntries(Object.entries(perms).map(([k, v]) => [`perm:${k}`, v])) }));

beforeAll(async () => {
  f = await makeHrSchool();
  // The HR role template, switched on by the School Admin.
  await withSchool(sys(), (tx) => tx.role.updateMany({ where: { schoolId: f.school.id, key: "hr" }, data: { isEnabled: true } }));
  hr = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["hr"] }], name: "HR Person" });
}, 120_000);

describe("L5: Staff & HR gives only what Settings, Users & Permissions would let it", () => {
  it("refuses HR giving the School Admin or the Principal role", async () => {
    as(hr);
    for (const role of ["school-admin", "principal"]) {
      const s = await newStaff(`Top Role ${role}`);
      const r = await give(s.id, [role]);
      expect(r?.ok).toBe(false);
      expect(r?.message).toBe(LOGIN_CEILING_WORDS.role);
      expect(await loginOf(s.id)).toBeNull();
    }
  }, 120_000);

  it("refuses HR giving a Settings exception, or one above HR's own access", async () => {
    as(hr);
    const s = await newStaff("Exception Person");
    const settings = await give(s.id, ["teacher"], { settings: "view" });
    expect(settings?.ok).toBe(false);
    expect(settings?.message).toBe(LOGIN_CEILING_WORDS.settings);
    // HR (05-roles.md): Fee Management "-", Attendance "Own", Salary "View".
    for (const [key, level] of [["fee-management", "full"], ["fee-management", "view"], ["attendance-management", "full"], ["attendance-management", "view"], ["salary-management", "full"]]) {
      const r = await give(s.id, ["teacher"], { [key]: level });
      expect(r?.ok, `${key}=${level}`).toBe(false);
      expect(r?.message).toBe(LOGIN_CEILING_WORDS.above);
    }
    expect(await loginOf(s.id)).toBeNull();
  }, 120_000);

  it("lets HR give ready roles and exceptions within HR's own access", async () => {
    as(hr);
    const s = await newStaff("Ordinary Teacher");
    const r = await give(s.id, ["teacher"], { "staff-hr-management": "view", "attendance-management": "own", "salary-management": "view", "fee-management": "none" });
    expect(r?.ok, r?.message).toBe(true);
    expect(await loginOf(s.id)).not.toBeNull();
  }, 120_000);

  it("refuses the same from Add Staff (and a staff import), which give logins the same way", async () => {
    const ctx = { schoolId: f.school.id, userId: hr.id };
    const details: StaffDetails = {
      fullName: "Added Admin", phone: "9123401999", designation: "Teacher", departmentId: null, joiningDate: d("2026-10-01"), gender: null,
      email: null, staffCode: null, dateOfBirth: null, bloodGroup: null, aadhaar: null, address: null, permanentAddress: null, qualification: null,
      experienceYears: null, employmentType: "Permanent", reportingToId: null, campusId: null, phoneVerified: false, emailVerified: false, photoFileId: null,
    };
    await expect(withSchool(ctx, (tx) => createStaff(tx, ctx, details, { roleKeys: ["school-admin"], username: null, exceptions: {}, campusId: null }, []))).rejects.toThrow(LOGIN_CEILING_WORDS.role);
    await expect(withSchool(ctx, (tx) => createStaff(tx, ctx, details, { roleKeys: ["teacher"], username: null, exceptions: { settings: "full" }, campusId: null }, []))).rejects.toThrow(LOGIN_CEILING_WORDS.settings);
    expect(await withSchool(sys(), (tx) => tx.staff.count({ where: { fullName: "Added Admin" } }))).toBe(0);
  }, 120_000);

  it("still lets the School Admin give the School Admin role from Staff & HR", async () => {
    as(f.admin);
    const s = await newStaff("Second Admin");
    const r = await give(s.id, ["school-admin"], { settings: "full" });
    expect(r?.ok, r?.message).toBe(true);
    expect(await loginOf(s.id)).not.toBeNull();
  }, 120_000);

  it("refuses HR a new sign-in link for the Principal's login, but not for a teacher's", async () => {
    const before = await withSchool(sys(), (tx) => tx.userLogin.findUniqueOrThrow({ where: { id: f.principal.id } }));
    as(hr);
    const r = await profile.newSignInLink({ ok: false, message: "" }, form({ staffId: f.principalStaff.id }));
    expect(r?.ok).toBe(false);
    expect(r?.message).toBe(LOGIN_CEILING_WORDS.link);
    expect(JSON.stringify(r)).not.toContain("/invite/");
    const after = await withSchool(sys(), (tx) => tx.userLogin.findUniqueOrThrow({ where: { id: f.principal.id } }));
    expect(after.inviteTokenHash).toBe(before.inviteTokenHash);

    const teacher = await profile.newSignInLink({ ok: false, message: "" }, form({ staffId: f.teacher.id }));
    expect(teacher?.ok, teacher?.message).toBe(true);
  }, 120_000);

  it("lets the School Admin make a new sign-in link for the Principal", async () => {
    as(f.admin);
    const r = await profile.newSignInLink({ ok: false, message: "" }, form({ staffId: f.principalStaff.id }));
    expect(r?.ok, r?.message).toBe(true);
  }, 120_000);
});

describe("Security audit run-3: Staff & HR makes no sign-in link for a login above its own (L5 leftover; owner decision taken overnight, to confirm)", () => {
  // "Reset password" sets a new password for the one login a person uses in
  // every school. Someone who cannot change Settings, Users & Permissions may
  // not make it for a login with a personal exception they could not give
  // (Settings, or above their own), nor for a login that also opens another
  // school, even when it is switched off here.
  let sister: Awaited<ReturnType<typeof makeSchool>>;
  beforeAll(async () => { sister = await makeSchool("Sister School"); }, 120_000);

  /** A staff record here with a Teacher login, maybe with exceptions here, maybe School Admin in the sister school. */
  async function withLogin(name: string, o: { exceptions?: Record<string, string>; adminInSister?: boolean }) {
    const s = await newStaff(name);
    const login = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }, ...(o.adminInSister ? [{ id: sister.id, roleKeys: ["school-admin"] }] : [])], name });
    await withSchool(sys(), async (tx) => {
      await tx.staff.update({ where: { id: s.id }, data: { userLoginId: login.id } });
      if (o.exceptions) await tx.schoolAccess.updateMany({ where: { userLoginId: login.id }, data: { exceptions: o.exceptions } });
    });
    return { staff: s, login };
  }
  const link = (staffId: string) => profile.newSignInLink({ ok: false, message: "" }, form({ staffId }));
  const hashOf = async (id: string) => (await withSchool(sys(), (tx) => tx.userLogin.findUniqueOrThrow({ where: { id } }))).inviteTokenHash;

  it("refuses HR a link for a login with a Settings exception, or one above HR's own", async () => {
    as(hr);
    for (const exceptions of [{ settings: "view" }, { "fee-management": "full" }] as Record<string, string>[]) {
      const { staff, login } = await withLogin(`Excepted ${Object.keys(exceptions)[0]}`, { exceptions });
      const r = await link(staff.id);
      expect(r?.ok, JSON.stringify(exceptions)).toBe(false);
      expect(r?.message).toBe(LOGIN_CEILING_WORDS.linkAbove);
      expect(JSON.stringify(r)).not.toContain("/invite/");
      expect(await hashOf(login.id)).toBeNull();
    }
  }, 120_000);

  it("lets HR make a link for a login whose exceptions are within HR's own", async () => {
    as(hr);
    const { staff } = await withLogin("Narrow Teacher", { exceptions: { "attendance-management": "own", "fee-management": "none" } });
    const r = await link(staff.id);
    expect(r?.ok, r?.message).toBe(true);
  }, 120_000);

  it("refuses HR a link for a login that also opens another school, also once switched off here", async () => {
    as(hr);
    const { staff, login } = await withLogin("Sister Admin", { adminInSister: true });
    const r = await link(staff.id);
    expect(r?.ok).toBe(false);
    expect(r?.message).toBe(LOGIN_CEILING_WORDS.linkElsewhere);
    const actx = { schoolId: f.school.id, userId: f.admin.id };
    await withSchool(actx, (tx) => switchOffLogin(tx, actx, staff.id, "Works at the sister school now"));
    const off = await link(staff.id);
    expect(off?.ok).toBe(false);
    expect(off?.message).toBe(LOGIN_CEILING_WORDS.linkElsewhere);
    expect(await hashOf(login.id)).toBeNull();
  }, 120_000);

  it("lets the School Admin make those links", async () => {
    as(f.admin);
    const { staff } = await withLogin("Admin Made Link", { exceptions: { settings: "view" } });
    const r = await link(staff.id);
    expect(r?.ok, r?.message).toBe(true);
  }, 120_000);
});

describe("Security audit run-3: an exit recorded in Staff & HR never closes a top login on its own", () => {
  // Recording a resignation with a past last working day closes the leaver's
  // login at once. Someone who cannot change Settings, Users & Permissions may
  // not close a School Admin's or Principal's login that way; and no exit, nor
  // the daily last-day job, closes the school's last School Admin.
  const exitForm = (staffId: string) => form({ staffId, type: "RESIGNATION", receivedOn: "2026-10-01", lastWorkingDay: "2026-10-02", reason: "Moving to another city" });
  const exits = (staffId: string) => withSchool(sys(), (tx) => tx.exitCase.count({ where: { staffId } }));

  it("refuses HR recording the Principal's exit; the Principal's login stays open", async () => {
    as(hr);
    const { startExitAction } = await import("@/app/(school)/staff-hr-management/exit/actions");
    const r = await startExitAction({ ok: false, message: "" }, exitForm(f.principalStaff.id));
    expect(r?.ok).toBe(false);
    expect(r?.message).toBe(LOGIN_CEILING_WORDS.exit);
    expect(await exits(f.principalStaff.id)).toBe(0);
    const login = await withSchool(sys(), (tx) => tx.userLogin.findUniqueOrThrow({ where: { id: f.principal.id } }));
    expect(login.status).toBe("ACTIVE");
  }, 120_000);

  it("refuses HR recording the exit of a login with a Settings exception, but not a teacher's", async () => {
    const s = await newStaff("Settings Helper");
    const login = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }], name: "Settings Helper" });
    await withSchool(sys(), async (tx) => {
      await tx.staff.update({ where: { id: s.id }, data: { userLoginId: login.id } });
      await tx.schoolAccess.updateMany({ where: { userLoginId: login.id }, data: { exceptions: { settings: "view" } } });
    });
    const ctx = { schoolId: f.school.id, userId: hr.id };
    const exit = (staffId: string) => withSchool(ctx, (tx) => startExit(tx, ctx, { staffId, type: "RESIGNATION", receivedOn: d("2026-10-01"), lastWorkingDay: d("2027-03-31"), reason: "Moving to another city", letterFileId: null }));
    await expect(exit(s.id)).rejects.toThrow(LOGIN_CEILING_WORDS.exit);
    const teacher = await newStaff("Leaving Teacher");
    await expect(exit(teacher.id)).resolves.toMatchObject({ status: "IN_PROGRESS" });
  }, 120_000);

  it("keeps the last School Admin's login open on the last day, tells them, and closes it once another School Admin is there", async () => {
    // The fixture's School Admin is the school's only active one.
    expect(await withSchool(sys(), (tx) => activeSchoolAdminIds(tx, f.school.id))).toEqual([f.admin.id]);
    const adminStaff = await newStaff("Admin Person");
    await withSchool(sys(), (tx) => tx.staff.update({ where: { id: adminStaff.id }, data: { userLoginId: f.admin.id } }));
    const pctx = { schoolId: f.school.id, userId: f.principal.id };
    await withSchool(pctx, (tx) => startExit(tx, pctx, { staffId: adminStaff.id, type: "RESIGNATION", receivedOn: d("2026-10-01"), lastWorkingDay: d("2026-10-02"), reason: "Moving to another city", letterFileId: null }));

    expect(await withSchool(sys(), (tx) => closeLoginsOnLastDay(tx, sys(), d("2026-10-03")))).toBe(0);
    await withSchool(sys(), async (tx) => {
      expect((await tx.userLogin.findUniqueOrThrow({ where: { id: f.admin.id } })).status).toBe("ACTIVE");
      expect(await tx.schoolAccess.count({ where: { userLoginId: f.admin.id, archivedAt: null } })).toBe(1);
      expect((await tx.staff.findUniqueOrThrow({ where: { id: adminStaff.id } })).status).toBe("ACTIVE");
      const told = await tx.notification.findFirst({ where: { userLoginId: f.admin.id, type: "staff-exit" } });
      expect(told?.text).toContain("only School Admin");
    });

    await makeUser({ schools: [{ id: f.school.id, roleKeys: ["school-admin"] }], name: "New Admin" });
    expect(await withSchool(sys(), (tx) => closeLoginsOnLastDay(tx, sys(), d("2026-10-03")))).toBe(1);
    expect((await withSchool(sys(), (tx) => tx.userLogin.findUniqueOrThrow({ where: { id: f.admin.id } }))).status).toBe("DISABLED");
  }, 120_000);
});
