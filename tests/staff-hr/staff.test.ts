// Staff records (09 §5, Done when 1, 2, 3, 6, 8, 9): unique staff IDs,
// duplicate warnings, Add Staff with login and Teacher Allocation,
// restricted fields, expiry reminders, exits that close the login, and
// "own" reach for teachers.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { findInvite, acceptInvite } from "@/lib/auth/invites";
import { signIn } from "@/lib/auth/sign-in";
import { accessIn } from "@/lib/auth/access";
import { encryptField } from "@/lib/crypto";
import { createStaff, showRestricted, updateStaffSection, type StaffDetails } from "@/lib/staff/staff";
import { canSeeRestricted, staffScope, viewerFor, canSeeSalary } from "@/lib/staff/access";
import { sendExpiryReminders, docStatus } from "@/lib/staff/documents";
import { closeLoginsOnLastDay, handOver, startExit, completeExit, setClearance } from "@/lib/staff/exit";
import { d, makeHrSchool } from "./fixture";
import { makeSchool, noSleep } from "../helpers";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
beforeAll(async () => { f = await makeHrSchool(); });
const as = (userId: string | null) => ({ schoolId: f.school.id, userId });

const details = (over: Partial<StaffDetails> = {}): StaffDetails => ({
  fullName: "Meena Rao", phone: "9123400001", designation: "Teacher", departmentId: null, joiningDate: d("2026-10-01"), gender: "Female",
  email: null, staffCode: null, dateOfBirth: null, bloodGroup: null, aadhaar: null, address: null, permanentAddress: null, qualification: null,
  experienceYears: null, employmentType: "Permanent", reportingToId: null, campusId: null, phoneVerified: false, emailVerified: false, photoFileId: null, ...over,
});

describe("Add Staff (Done when 1, 2, 3)", () => {
  let newStaffId: string;

  it("adds a teacher with the Teacher role, an invite, and classes in Teacher Allocation", async () => {
    const r = await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details(), { roleKeys: ["teacher"], username: null, exceptions: {}, campusId: null }, [{ sectionId: f.section.id, subjectId: f.maths5.id }]));
    newStaffId = r.staff.id;
    expect(r.staff.staffCode).toMatch(/-ST-\d{3}$/);
    expect(r.username).toBe("meena.rao");
    expect(r.allocated).toBe(1);
    const login = await prisma.userLogin.findUniqueOrThrow({ where: { username: "meena.rao" } });
    expect(login.status).toBe("INVITED");
    const token = r.inviteLink!.split("/").pop()!;
    expect((await findInvite(token))?.id).toBe(login.id);
    expect((await acceptInvite(token, "Teach-2026-ok")).ok).toBe(true);
    const access = await accessIn(login.id, f.school.id);
    expect(access?.roles.map((x) => x.key)).toEqual(["teacher"]);
    await withSchool(as(f.admin.id), async (tx) => {
      const alloc = await tx.teacherAllocation.findFirstOrThrow({ where: { staffId: newStaffId } });
      expect(alloc.sectionId).toBe(f.section.id);
      expect(alloc.isMain).toBe(false); // Ravi Teja is already the main Maths teacher of 5 A.
      expect(await tx.leaveBalance.count({ where: { staffId: newStaffId } })).toBeGreaterThan(0);
      expect(await tx.auditLogEntry.count({ where: { recordType: "Staff", recordId: newStaffId, action: "created" } })).toBe(1);
    });
  });

  it("warns when a second staff member has the same phone", async () => {
    await expect(withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Another Person" }), null, [])))
      .rejects.toThrow("This phone belongs to Meena Rao (Teacher).");
  });

  it("gives every staff member a unique staff ID and checks typed ones", async () => {
    const a = await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Arun Kumar", phone: "9123400002", designation: "Driver" }), null, []));
    const b = await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Sita Devi", phone: "9123400003" }), null, []));
    expect(a.staff.staffCode).not.toBe(b.staff.staffCode);
    await expect(withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Typed Id", phone: "9123400004", staffCode: a.staff.staffCode }), null, [])))
      .rejects.toThrow(`Staff ID ${a.staff.staffCode} is used by Arun Kumar.`);
    // The running number skips an ID typed in by hand.
    const prefix = a.staff.staffCode.replace(/\d+$/, "");
    const next = Number(b.staff.staffCode.slice(prefix.length)) + 1;
    await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Hand Typed", phone: "9123400005", staffCode: `${prefix}${String(next).padStart(3, "0")}` }), null, []));
    const c = await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "After Typed", phone: "9123400006" }), null, []));
    expect(c.staff.staffCode).toBe(`${prefix}${String(next + 1).padStart(3, "0")}`);
  });

  it("keeps before and after values when a section is edited", async () => {
    await withSchool(as(f.admin.id), (tx) => updateStaffSection(tx, as(f.admin.id), newStaffId, "personal", { fullName: "Meena S Rao", qualification: "M.A, B.Ed" }));
    await withSchool(as(f.admin.id), async (tx) => {
      const e = await tx.auditLogEntry.findFirstOrThrow({ where: { recordId: newStaffId, action: "changed" } });
      expect(e.before).toMatchObject({ fullName: "Meena Rao" });
      expect(e.after).toMatchObject({ fullName: "Meena S Rao", qualification: "M.A, B.Ed" });
    });
  });
});

describe("restricted fields and own reach (Done when 9)", () => {
  it("shows Aadhaar in full only to the roles that keep staff records", () => {
    const enc = encryptField("234567890123");
    expect(showRestricted(enc, true)).toBe("234567890123");
    expect(showRestricted(enc, false)).toBe("••••••••0123");
    expect(canSeeRestricted(["principal"])).toBe(true);
    expect(canSeeRestricted(["hr"])).toBe(true);
    expect(canSeeRestricted(["teacher", "class-teacher"])).toBe(false);
    expect(canSeeRestricted(["accountant"])).toBe(false);
  });

  it("lets a teacher open only their own staff record, leave and salary", async () => {
    const access = (await accessIn(f.teacherLogin.id, f.school.id))!;
    const v = await withSchool(as(f.teacherLogin.id), (tx) => viewerFor(tx, as(f.teacherLogin.id), { permissions: access.permissions, roles: access.roles, user: { id: f.teacherLogin.id } as never }));
    expect(v.see).toBe("own");
    expect(staffScope(v)).toEqual({ id: f.teacher.id });
    expect(canSeeSalary(v, f.teacher.id)).toBe(true);
    expect(canSeeSalary(v, f.head.id)).toBe(false);
    const seen = await withSchool(as(f.teacherLogin.id), (tx) => tx.staff.findMany({ where: staffScope(v) }));
    expect(seen.map((s) => s.id)).toEqual([f.teacher.id]);
  });
});

describe("document expiry reminders (Done when 6)", () => {
  it("reminds HR and the staff member 30 days before, once per window", async () => {
    const today = d("2026-10-09");
    await withSchool(as(f.admin.id), (tx) => tx.staffDocument.create({ data: { schoolId: f.school.id, staffId: f.teacher.id, kind: "Police verification", fileId: "00000000-0000-4000-8000-000000000001", expiresOn: d("2026-11-08") } }));
    const sent = await withSchool(as(null), (tx) => sendExpiryReminders(tx, as(null), today));
    expect(sent).toBe(1);
    const again = await withSchool(as(null), (tx) => sendExpiryReminders(tx, as(null), today));
    expect(again).toBe(0);
    await withSchool(as(f.admin.id), async (tx) => {
      const toHr = await tx.notification.findFirst({ where: { userLoginId: f.admin.id, type: "document-expiry" } });
      expect(toHr?.text).toContain("Police verification of Ravi Teja expires on 08-11-2026 (in 30 days)");
      expect(await tx.notification.count({ where: { userLoginId: f.teacherLogin.id, type: "document-expiry" } })).toBe(1);
    });
    expect(docStatus({ fileId: "x", expiresOn: d("2026-11-08") }, today)).toBe("Expiring soon");
    expect(docStatus({ fileId: "x", expiresOn: d("2026-10-01") }, today)).toBe("Expired");
    expect(docStatus({ fileId: null, expiresOn: null }, today)).toBe("Missing");
    // 7 days before, the second reminder goes.
    expect(await withSchool(as(null), (tx) => sendExpiryReminders(tx, as(null), d("2026-11-02")))).toBe(1);
  });
});

describe("staff exit (Done when 8)", () => {
  it("lists the handover, and on the last working day the login stops working", async () => {
    const leaver = await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Leaving Teacher", phone: "9123400009" }), { roleKeys: ["teacher"], username: "leaving.teacher", exceptions: {}, campusId: null }, [{ sectionId: f.section.id, subjectId: f.maths5.id }]));
    await acceptInvite(leaver.inviteLink!.split("/").pop()!, "Leaving-2026");
    expect((await signIn("leaving.teacher", "Leaving-2026", {}, { sleep: noSleep })).ok).toBe(true);

    const exit = await withSchool(as(f.admin.id), (tx) => startExit(tx, as(f.admin.id), { staffId: leaver.staff.id, type: "RESIGNATION", receivedOn: d("2026-10-01"), lastWorkingDay: d("2026-10-31"), reason: "Moving to another city", letterFileId: null }));
    const items = await withSchool(as(f.admin.id), (tx) => tx.handoverItem.findMany({ where: { exitCaseId: exit.id } }));
    expect(items.map((i) => i.label)).toEqual(["Class 5 A: Mathematics"]);

    // Not yet: the day before the last day.
    expect(await withSchool(as(null), (tx) => closeLoginsOnLastDay(tx, as(null), d("2026-10-30")))).toBe(0);
    expect(await withSchool(as(null), (tx) => closeLoginsOnLastDay(tx, as(null), d("2026-10-31")))).toBe(1);
    expect(await withSchool(as(null), (tx) => closeLoginsOnLastDay(tx, as(null), d("2026-10-31")))).toBe(0);

    const login = await prisma.userLogin.findUniqueOrThrow({ where: { username: "leaving.teacher" } });
    expect(login.status).toBe("DISABLED");
    expect((await signIn("leaving.teacher", "Leaving-2026", {}, { sleep: noSleep })).ok).toBe(false);
    await withSchool(as(f.admin.id), async (tx) => {
      expect((await tx.staff.findUniqueOrThrow({ where: { id: leaver.staff.id } })).status).toBe("RESIGNED");
    });

    await expect(withSchool(as(f.admin.id), (tx) => completeExit(tx, as(f.admin.id), exit.id))).rejects.toThrow("1 handover item is not handed over yet.");
    await withSchool(as(f.admin.id), (tx) => handOver(tx, as(f.admin.id), items[0].id, f.teacher.id));
    const checks = await withSchool(as(f.admin.id), (tx) => tx.clearanceCheck.findMany({ where: { exitCaseId: exit.id, status: "PENDING" } }));
    for (const c of checks) await withSchool(as(f.admin.id), (tx) => setClearance(tx, as(f.admin.id), c.id, "CLEARED", null));
    await withSchool(as(f.admin.id), (tx) => completeExit(tx, as(f.admin.id), exit.id));
    await withSchool(as(f.admin.id), async (tx) => {
      expect(await tx.teacherAllocation.count({ where: { staffId: leaver.staff.id, archivedAt: null } })).toBe(0);
      expect((await tx.exitCase.findUniqueOrThrow({ where: { id: exit.id } })).status).toBe("COMPLETED");
    });
  });

  it("refuses a termination without approval, and a second exit for the same person", async () => {
    const ex = await withSchool(as(f.admin.id), (tx) => startExit(tx, as(f.admin.id), { staffId: f.scienceTeacher.id, type: "TERMINATION", receivedOn: d("2026-10-09"), lastWorkingDay: d("2026-10-09"), reason: "Misconduct inquiry", letterFileId: null }));
    expect(ex.status).toBe("WAITING_APPROVAL");
    expect(await withSchool(as(null), (tx) => closeLoginsOnLastDay(tx, as(null), d("2026-10-10")))).toBe(0);
    await expect(withSchool(as(f.admin.id), (tx) => startExit(tx, as(f.admin.id), { staffId: f.scienceTeacher.id, type: "RESIGNATION", receivedOn: d("2026-10-09"), lastWorkingDay: d("2026-10-20"), reason: "Again", letterFileId: null })))
      .rejects.toThrow(/already has an exit in progress/);
  });
});

describe("school walls", () => {
  it("keeps HR records of one school out of another", async () => {
    const other = await makeSchool("Other School");
    await withSchool({ schoolId: other.id, userId: null }, async (tx) => {
      expect(await tx.designation.count()).toBe(0);
      expect(await tx.exitCase.count()).toBe(0);
      expect(await tx.leaveTypeRule.count()).toBe(0);
      expect(await tx.staff.count()).toBe(0);
      expect(await tx.hrSetting.count()).toBe(0);
    });
    await expect(withSchool({ schoolId: other.id, userId: null }, (tx) => tx.designation.create({ data: { schoolId: f.school.id, name: "Sneaky" } }))).rejects.toThrow();
  });
});

