// Student records: 03 §5 rules and §9 "Done when" 2, 3, 4, 10.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import {
  admissionNoTaken, changeSection, changeStatus, DuplicateFound, saveEnrolment, StudentProblem, undoSectionChange, findDuplicates,
} from "@/lib/students/students";
import { abilities, loadVisibleStudent, noteVisible, studentScope, StudentNotFound } from "@/lib/students/access";
import { linkGuardian } from "@/lib/students/guardians";
import { addStudent, studentSchool } from "./fixtures";
import "@/lib/students/handlers";

let s: Awaited<ReturnType<typeof studentSchool>>;
beforeAll(async () => {
  s = await studentSchool();
});

describe("admission number", () => {
  it("is unique in the school, and the message names who has it", async () => {
    const { student } = await addStudent(s.ctx, s.s5a, { fullName: "Arjun Rao", admissionNo: "TEST/2026/0145" });
    await withSchool(s.ctx, async (tx) => {
      expect(await admissionNoTaken(tx, "TEST/2026/0145")).toBe("Admission number TEST/2026/0145 already belongs to Arjun Rao, 5 A.");
      expect(await admissionNoTaken(tx, "TEST/2026/0145", student.id)).toBeNull();
    });
    await expect(addStudent(s.ctx, s.s5b, { admissionNo: "test/2026/0145" })).rejects.toThrow(/already belongs to Arjun Rao/);
  });

  it("is given automatically and never reused", async () => {
    const a = await addStudent(s.ctx, s.s5a);
    const b = await addStudent(s.ctx, s.s5a);
    expect(a.student.admissionNo).not.toBe(b.student.admissionNo);
    expect(a.student.admissionNo).toMatch(/\/2026\/\d{4}$/);
  });

  it("writes the old and new number to the history when changed (Done when 10)", async () => {
    const { student } = await addStudent(s.ctx, s.s5a);
    await withSchool(s.ctx, (tx) => saveEnrolment(tx, s.ctx, student.id, { admissionNo: "OLD-SOFTWARE-77", admissionDate: student.joiningDate, rollNo: null }));
    const entry = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findFirst({ where: { recordType: "Student", recordId: student.id, action: "changed" }, orderBy: { at: "desc" } }));
    expect(entry?.before).toMatchObject({ admissionNo: student.admissionNo });
    expect(entry?.after).toMatchObject({ admissionNo: "OLD-SOFTWARE-77", section: "Enrolment" });
  });
});

describe("duplicate check (Done when 2)", () => {
  it("warns when name and date of birth match, and saves anyway only with a reason", async () => {
    const dob = new Date("2015-08-20T00:00:00Z");
    await addStudent(s.ctx, s.s5a, { fullName: "Meera Nair", dateOfBirth: dob });
    const attempt = addStudent(s.ctx, s.s5b, { fullName: "meera  nair", dateOfBirth: dob });
    await expect(attempt).rejects.toBeInstanceOf(DuplicateFound);
    const found = await withSchool(s.ctx, (tx) => findDuplicates(tx, { fullName: "Meera Nair", dateOfBirth: dob }));
    expect(found[0].why).toBe("same name and date of birth");
    const saved = await addStudent(s.ctx, s.s5b, { fullName: "Meera Nair", dateOfBirth: dob, duplicateReason: "Two different girls, checked with parents" });
    expect(saved.student.id).toBeTruthy();
  });

  it("also warns on the same name with the same parent phone", async () => {
    await addStudent(s.ctx, s.s5a, { fullName: "Kiran Das", guardianPhone: "9000011111" });
    await expect(addStudent(s.ctx, s.s5a, { fullName: "Kiran Das", guardianPhone: "9000011111", dateOfBirth: new Date("2014-01-01T00:00:00Z") })).rejects.toBeInstanceOf(DuplicateFound);
  });
});

describe("one record per child, guardians shared by siblings (Done when 3)", () => {
  it("links a second child to the same parent record", async () => {
    const first = await addStudent(s.ctx, s.s5a, { fullName: "Ravi Reddy", guardianPhone: "9111122222", guardianName: "Mohan Reddy" });
    const parent = await withSchool(s.ctx, (tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId: first.student.id } }));
    const second = await addStudent(s.ctx, s.s6a, { fullName: "Sita Reddy", guardianPhone: "9111122222", guardianName: "Mohan Reddy", linkGuardianId: parent.guardianId });
    await withSchool(s.ctx, async (tx) => {
      const g = await tx.guardian.findUniqueOrThrow({ where: { id: parent.guardianId }, include: { students: { include: { student: true } } } });
      expect(g.students.map((l) => l.student.fullName).sort()).toEqual(["Ravi Reddy", "Sita Reddy"]);
      expect(await tx.guardian.count({ where: { phone: "9111122222" } })).toBe(1);
      expect(await tx.student.count({ where: { id: second.student.id } })).toBe(1);
      await expect(linkGuardian(tx, s.ctx, second.student.id, parent.guardianId, { relationship: "Father" })).rejects.toThrow(/already linked/);
    });
  });
});

describe("section change keeps history", () => {
  it("moves within the class, records the change and can be undone", async () => {
    const { student, enrolment } = await addStudent(s.ctx, s.s5a);
    const { change } = await withSchool(s.ctx, (tx) => changeSection(tx, s.ctx, student.id, s.s5b, "Balance the sections"));
    await withSchool(s.ctx, async (tx) => {
      expect((await tx.enrolment.findUniqueOrThrow({ where: { id: enrolment.id } })).sectionId).toBe(s.s5b);
      await expect(changeSection(tx, s.ctx, student.id, s.s6a, null)).rejects.toThrow(/same class/);
    });
    await withSchool(s.ctx, (tx) => undoSectionChange(tx, s.ctx, change.id));
    await withSchool(s.ctx, async (tx) => {
      expect((await tx.enrolment.findUniqueOrThrow({ where: { id: enrolment.id } })).sectionId).toBe(s.s5a);
      expect(await tx.sectionChange.count({ where: { studentId: student.id } })).toBe(1);
    });
  });
});

describe("status changes", () => {
  it("offers only allowed changes, and re-admission waits for approval", async () => {
    const { student } = await addStudent(s.ctx, s.s5a);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    await withSchool(s.ctx, async (tx) => {
      await expect(changeStatus(tx, s.ctx, student.id, "TRANSFERRED", today, "Moving city")).rejects.toBeInstanceOf(StudentProblem);
      await changeStatus(tx, s.ctx, student.id, "INACTIVE", today, "Long illness at home");
      expect((await tx.student.findUniqueOrThrow({ where: { id: student.id } })).status).toBe("INACTIVE");
      await tx.student.update({ where: { id: student.id }, data: { status: "WITHDRAWN" } });
      const r = await changeStatus(tx, s.ctx, student.id, "ACTIVE", today, "Family came back to the city");
      expect(r.waiting).toBe(true);
      expect((await tx.student.findUniqueOrThrow({ where: { id: student.id } })).status).toBe("WITHDRAWN");
    });
    const pctx = { schoolId: s.school.id, userId: s.principal.id };
    await withSchool(pctx, async (tx) => {
      const a = await tx.approval.findFirstOrThrow({ where: { type: "re-admission", recordId: student.id } });
      await decide(tx, pctx, a.id, "approve", null);
      expect((await tx.student.findUniqueOrThrow({ where: { id: student.id } })).status).toBe("ACTIVE");
    });
  });
});

describe("who sees which students (Done when 4)", () => {
  it("a teacher sees only students of their sections, never counselling notes", async () => {
    const mine = await addStudent(s.ctx, s.s5a);
    const other = await addStudent(s.ctx, s.s6a);
    const teacher = await s.who(s.teacherUser.id);
    const a = abilities(teacher, { counsellingOn: true, counsellingRoles: ["counsellor", "principal"] });
    expect(a.reach).toBe("own");
    expect(a.manage).toBe(false);
    expect(a.contribute).toBe(true);
    expect(a.seeCounselling).toBe(false);
    expect(a.seeCounsellingNotes).toBe(false);
    expect(a.seeRestricted).toBe(false);
    await withSchool(teacher.ctx, async (tx) => {
      expect((await loadVisibleStudent(tx, teacher, mine.student.id)).id).toBe(mine.student.id);
      await expect(loadVisibleStudent(tx, teacher, other.student.id)).rejects.toBeInstanceOf(StudentNotFound);
      const visible = await tx.student.findMany({ where: await studentScope(tx, teacher), select: { id: true } });
      expect(visible.some((v) => v.id === other.student.id)).toBe(false);
      expect(visible.some((v) => v.id === mine.student.id)).toBe(true);
    });
  });

  it("the accountant only looks students up: no behaviour, no documents, no changes", async () => {
    const acc = abilities(await s.who(s.accountantUser.id));
    expect(acc).toMatchObject({ reach: "all", manage: false, lookupOnly: true, seeBehaviour: false, seeDocuments: false, seeRestricted: false });
    const admin = abilities(await s.who(s.admin.id));
    expect(admin).toMatchObject({ reach: "all", manage: true, lookupOnly: false, seeRestricted: true });
  });

  it("private notes show only to the chosen roles and the author", async () => {
    const teacher = await s.who(s.teacherUser.id);
    const admin = await s.who(s.admin.id);
    const note = { visibleToRoles: ["principal"], authorId: s.admin.id };
    expect(noteVisible(note, teacher)).toBe(false);
    expect(noteVisible(note, admin)).toBe(true);
    expect(noteVisible({ visibleToRoles: [], authorId: null }, teacher)).toBe(true);
  });
});
