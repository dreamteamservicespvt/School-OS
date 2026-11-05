// A teacher is class teacher of one section only (owner test 2026-11-05):
// Add Staff step 3 keeps "Class teacher of" apart from the subjects taught,
// and Academic Management, Classes & Sections refuses a second section.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { createStaff, type StaffDetails } from "@/lib/staff/staff";
import { updateSection } from "@/lib/academic/structure";
import { d, makeHrSchool } from "./fixture";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
let sectionB: string;
let sectionC: string;
beforeAll(async () => {
  f = await makeHrSchool();
  [sectionB, sectionC] = await withSchool({ schoolId: f.school.id, userId: null }, async (tx) => Promise.all(["B", "C"].map(async (name) =>
    (await tx.section.create({ data: { schoolId: f.school.id, classId: f.section.classId, academicYearId: f.section.academicYearId, name } })).id)));
});
const as = () => ({ schoolId: f.school.id, userId: f.admin.id });

const details = (over: Partial<StaffDetails> = {}): StaffDetails => ({
  fullName: "Kavya Iyer", phone: "9123400901", designation: "Teacher", departmentId: null, joiningDate: d("2026-10-01"), gender: "Female",
  email: null, staffCode: null, dateOfBirth: null, bloodGroup: null, aadhaar: null, address: null, permanentAddress: null, qualification: null,
  experienceYears: null, employmentType: "Permanent", reportingToId: null, campusId: null, phoneVerified: false, emailVerified: false, photoFileId: null, ...over,
});
const login = (roleKeys: string[]) => ({ roleKeys, username: null, exceptions: {}, campusId: null });
const base = { seats: 40, streamId: null, room: null };

describe("Classes & Sections: one class-teacher section per teacher", () => {
  it("refuses a second section for Ravi (class teacher of 5 A), and gives it to a teacher who has none", async () => {
    await expect(withSchool(as(), (tx) => updateSection(tx, as(), sectionB, { ...base, name: "B", classTeacherId: f.teacher.id })))
      .rejects.toThrow(/Ravi Teja is already the class teacher of Class 5 A\. A teacher is class teacher of one section only/);
    const r = await withSchool(as(), (tx) => updateSection(tx, as(), sectionB, { ...base, name: "B", classTeacherId: f.head.id }));
    expect(r.section.classTeacherId).toBe(f.head.id);
  });

  it("keeps saving a section whose class teacher stays the same", async () => {
    const r = await withSchool(as(), (tx) => updateSection(tx, as(), f.section.id, { ...base, name: "A", seats: 38, classTeacherId: f.teacher.id }));
    expect(r.section.seats).toBe(38);
  });
});

describe("Add Staff step 3: class teacher apart from subjects", () => {
  it("refuses a section that already has a class teacher", async () => {
    await expect(withSchool(as(), (tx) => createStaff(tx, as(), details(), login(["class-teacher"]), [], { classTeacherSectionId: sectionB })))
      .rejects.toThrow(/Class 5 B already has a class teacher, Divya Menon/);
  });

  it("needs the Class Teacher role from step 2", async () => {
    await expect(withSchool(as(), (tx) => createStaff(tx, as(), details(), login(["teacher"]), [], { classTeacherSectionId: sectionC })))
      .rejects.toThrow(/needs a login with the Class Teacher role/);
    await expect(withSchool(as(), (tx) => createStaff(tx, as(), details(), null, [], { classTeacherSectionId: sectionC })))
      .rejects.toThrow(/needs a login with the Class Teacher role/);
  });

  it("makes her class teacher of 5 C only, while she teaches Maths in 5 A as a subject teacher", async () => {
    const r = await withSchool(as(), (tx) => createStaff(tx, as(), details(), login(["class-teacher"]), [{ sectionId: f.section.id, subjectId: f.maths5.id }], { classTeacherSectionId: sectionC }));
    expect(r.classTeacherOf).toBe("Class 5 C");
    expect(r.allocated).toBe(1);
    await withSchool(as(), async (tx) => {
      const sections = await tx.section.findMany({ where: { id: { in: [f.section.id, sectionC] } }, select: { id: true, classTeacherId: true } });
      expect(Object.fromEntries(sections.map((s) => [s.id, s.classTeacherId]))).toEqual({ [f.section.id]: f.teacher.id, [sectionC]: r.staff.id });
      expect(await tx.auditLogEntry.count({ where: { recordType: "Section", recordId: sectionC, action: "changed" } })).toBe(1);
    });
  });

  it("without a class-teacher section, nobody becomes a class teacher", async () => {
    const r = await withSchool(as(), (tx) => createStaff(tx, as(), details({ fullName: "Subject Only", phone: "9123400902" }), login(["teacher"]), [{ sectionId: f.section.id, subjectId: f.maths5.id }]));
    expect(r.classTeacherOf).toBeNull();
    expect(await withSchool(as(), (tx) => tx.section.count({ where: { classTeacherId: r.staff.id } }))).toBe(0);
  });
});
