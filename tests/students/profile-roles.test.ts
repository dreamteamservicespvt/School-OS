// The Student Profile by role (05-roles.md notes; the approved design's
// per-role profile): each role sees only its tabs and parts, and what it may
// not see is left out of the data the server reads for the page, not only
// hidden on screen.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import type { Current } from "@/lib/current";
import { abilities, PROFILE_VIEWS, profileView, type StudentAbilities } from "@/lib/students/access";
import { getStudentSettings } from "@/lib/students/settings";
import { loadProfile } from "@/app/(school)/student-management/_lib/profile";
import { fieldAllowed } from "@/app/(school)/student-management/_lib/export-fields";
import { addStudent, studentSchool } from "./fixtures";

let s: Awaited<ReturnType<typeof studentSchool>>;
let studentId: string;
let siblingId: string;

beforeAll(async () => {
  s = await studentSchool();
  const a = await addStudent(s.ctx, s.s5a, { guardianPhone: "9812345670" });
  studentId = a.student.id;
  await withSchool(s.ctx, async (tx) => {
    await tx.student.update({ where: { id: studentId }, data: { address: "12 Temple Street", city: "Hyderabad", bloodGroup: "B+" } });
    await tx.studentGuardian.updateMany({ where: { studentId }, data: { canPickUp: true } });
  });
  // A brother in 6 A, linked to the same parent.
  const g = await withSchool(s.ctx, (tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId } }));
  const b = await addStudent(s.ctx, s.s6a, { guardianPhone: "9812345670", linkGuardianId: g.guardianId, duplicateReason: "Brother of the first student" });
  siblingId = b.student.id;
}, 120_000);

/** Loads the profile as the School Admin would, but seeing only what `view` allows. */
async function profileAs(role: keyof typeof PROFILE_VIEWS) {
  const who = await s.who(s.admin.id);
  const settings = await withSchool(s.ctx, (tx) => getStudentSettings(tx, s.ctx));
  const base = abilities(who, settings);
  const can: StudentAbilities = { ...base, manage: false, view: PROFILE_VIEWS[role] };
  return withSchool(s.ctx, (tx) => loadProfile(tx, who as unknown as Current, studentId, can, settings, s.yearId));
}

describe("profile tabs and parts by role", () => {
  it("follows the design's table for each role", () => {
    expect(profileView(["principal"], false, false).tabs).toBeNull();
    expect(profileView(["accountant"], false, true)).toMatchObject({ mode: "profile", tabs: ["overview", "fees"], personal: false, address: false, parents: true });
    expect(profileView(["receptionist"], false, true)).toMatchObject({ mode: "pickup", phones: true });
    expect(profileView(["gate-security"], false, true)).toMatchObject({ mode: "pickup", phones: false });
    expect(profileView(["librarian"], false, true)).toMatchObject({ mode: "library" });
    for (const k of ["academic-head", "exam-in-charge"]) {
      expect(profileView([k], false, false)).toMatchObject({ parents: false, address: false, emergency: false, siblings: false, personal: true });
      expect(profileView([k], false, false).tabs).toContain("exams");
    }
    expect(profileView(["admission-counsellor"], false, true)).toMatchObject({ tabs: ["overview"], parents: true, siblings: true, personal: false, address: false });
    expect(profileView(["teacher"], false, false).tabs).not.toContain("documents");
  });

  it("a person with two roles sees what either allows; a Full role sees everything", () => {
    const v = profileView(["gate-security", "teacher"], false, false);
    expect(v.mode).toBe("profile");
    expect(v.parents).toBe(true);
    expect(profileView(["librarian"], true, false).tabs).toBeNull();
  });

  it("the real Accountant gets only Overview and Fees, with parents and no personal details", async () => {
    const a = abilities(await s.who(s.accountantUser.id));
    expect(a.view.tabs).toEqual(["overview", "fees"]);
    expect(a.seeParents).toBe(true);
    expect(a.seeBehaviour).toBe(false);
    expect(a.seeDocuments).toBe(false);
    expect(fieldAllowed("dateOfBirth", a)).toBe(false);
    expect(fieldAllowed("phone", a)).toBe(true);
  });

  it("counselling notes are for the Counsellor only, never the Principal or School Admin", async () => {
    const settings = { counsellingOn: true, counsellingRoles: ["principal", "school-admin"] };
    for (const id of [s.principal.id, s.admin.id]) {
      const a = abilities(await s.who(id), settings);
      expect(a.seeCounselling).toBe(true);
      expect(a.seeCounsellingNotes).toBe(false);
    }
    expect(abilities({ ...(await s.who(s.teacherUser.id)), roles: [{ key: "counsellor" }] }, settings).seeCounsellingNotes).toBe(true);
  });
});

describe("the server reads only what the role may see", () => {
  it("Gate Security: the pickup list without phone numbers, and nothing else", async () => {
    const p = await profileAs("gate-security");
    expect(p.pickups.allowed.length).toBeGreaterThan(0);
    expect(p.pickups.allowed.every((g) => g.phone === "")).toBe(true);
    expect(p.links).toEqual([]);
    expect(p.emergency).toEqual([]);
    expect(p.student.address).toBeNull();
    expect(p.student.dateOfBirth).toBeNull();
    expect(p.studentPhone).toBeFalsy();
  });

  it("Front Office: the pickup list with phone numbers", async () => {
    const p = await profileAs("receptionist");
    expect(p.pickups.allowed[0].phone).toBe("9812345670");
    expect(p.links).toEqual([]);
  });

  it("Academic Head and Exam In-charge: no parents and no address", async () => {
    for (const role of ["academic-head", "exam-in-charge"] as const) {
      const p = await profileAs(role);
      expect(p.links).toEqual([]);
      expect(p.emergency).toEqual([]);
      expect(p.student.address).toBeNull();
      expect(p.student.city).toBeNull();
      expect(p.permanentAddress).toBeNull();
      expect(p.student.bloodGroup).toBe("B+");
    }
  });

  it("Admission Counsellor: parents and brothers and sisters only", async () => {
    const p = await profileAs("admission-counsellor");
    expect(p.links.length).toBeGreaterThan(0);
    expect(p.siblings.map((x) => x.id)).toContain(siblingId);
    expect(p.student.address).toBeNull();
    expect(p.student.dateOfBirth).toBeNull();
    expect(p.identifiers).toEqual([]);
  });

  it("Librarian: name and class only", async () => {
    const p = await profileAs("librarian");
    expect(p.links).toEqual([]);
    expect(p.pickups.allowed).toEqual([]);
    expect(p.student.address).toBeNull();
    expect(p.student.fullName).toBeTruthy();
  });
});
