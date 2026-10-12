// School data isolation (08-platform-security.md §1 and §16, "Done when" 1):
// a user of school A tries to read, change and write school B's records, and
// every attempt must fail. These run against the real database rules.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { accessIn, schoolsFor } from "@/lib/auth/access";
import { makeSchool, makeUser } from "./helpers";

let a: Awaited<ReturnType<typeof makeSchool>>;
let b: Awaited<ReturnType<typeof makeSchool>>;
let userA: { id: string };
let userB: { id: string };

beforeAll(async () => {
  a = await makeSchool("School A");
  b = await makeSchool("School B");
  userA = await makeUser({ schools: [{ id: a.id, roleKeys: ["school-admin"] }] });
  userB = await makeUser({ schools: [{ id: b.id, roleKeys: ["school-admin"] }] });
  await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
    await writeAudit(tx, { schoolId: b.id, userId: userB.id }, { action: "test", recordType: "School", recordId: b.id });
    await notify(tx, { schoolId: b.id, userId: null }, { to: userB.id, type: "test", text: "Only for school B", link: "/" });
    await tx.approval.create({
      data: { schoolId: b.id, type: "refund", recordType: "Refund", recordId: "r1", summary: "Refund in school B", askedById: userB.id },
    });
  });
});

const ctxA = () => ({ schoolId: a.id, userId: userA.id });

describe("a user of school A cannot read school B", () => {
  it("sees only school A in every school table", async () => {
    await withSchool(ctxA(), async (tx) => {
      const [schools, campuses, roles, accesses, audit, notes, approvals, modules] = await Promise.all([
        tx.school.findMany(),
        tx.campus.findMany(),
        tx.role.findMany(),
        tx.schoolAccess.findMany(),
        tx.auditLogEntry.findMany(),
        tx.notification.findMany(),
        tx.approval.findMany(),
        tx.schoolModule.findMany(),
      ]);
      for (const rows of [campuses, roles, accesses, audit, notes, approvals, modules] as { schoolId: string }[][]) {
        expect(rows.every((r) => r.schoolId === a.id)).toBe(true);
      }
      expect(schools.map((s) => s.id)).toEqual([a.id]);
      expect(approvals).toHaveLength(0);
    });
  });

  it("sees only school A's custom forms (Settings, Forms & Approvals)", async () => {
    await withSchool({ schoolId: b.id, userId: userB.id }, (tx) => tx.customForm.create({ data: { schoolId: b.id, name: "School B consent form" } }));
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.customForm.findMany({ where: { name: { contains: "School B" } } })).toHaveLength(0);
    });
  });

  it("cannot open a school B record even by its exact id", async () => {
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.school.findUnique({ where: { id: b.id } })).toBeNull();
      expect(await tx.campus.findUnique({ where: { id: b.campus.id } })).toBeNull();
    });
  });

  it("cannot find school B records by searching", async () => {
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.approval.findMany({ where: { summary: { contains: "school B" } } })).toHaveLength(0);
      expect(await tx.notification.findMany({ where: { text: { contains: "school B" } } })).toHaveLength(0);
    });
  });

  it("cannot count or export school B records", async () => {
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.approval.count({ where: { schoolId: b.id } })).toBe(0);
      expect(await tx.auditLogEntry.count({ where: { schoolId: b.id } })).toBe(0);
    });
  });

  it("sees none of school B's Staff & HR records", async () => {
    await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      await tx.hrSetting.create({ data: { schoolId: b.id } });
      await tx.designation.create({ data: { schoolId: b.id, name: "School B post" } });
      await tx.vacancy.create({ data: { schoolId: b.id, designation: "School B post" } });
    });
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.hrSetting.findUnique({ where: { schoolId: b.id } })).toBeNull();
      expect(await tx.designation.count({ where: { name: "School B post" } })).toBe(0);
      expect(await tx.vacancy.count()).toBe(0);
    });
  });

  it("gets no permissions in school B", async () => {
    expect(await accessIn(userA.id, b.id)).toBeNull();
    expect((await schoolsFor(userA.id)).map((s) => s.id)).toEqual([a.id]);
  });

  it("sees nothing at all without a school chosen", async () => {
    expect(await prisma.campus.findMany()).toHaveLength(0);
    expect(await prisma.approval.findMany()).toHaveLength(0);
    expect(await prisma.school.findMany()).toHaveLength(0);
  });
});

describe("a user of school A cannot change school B", () => {
  it("cannot update school B records", async () => {
    await withSchool(ctxA(), async (tx) => {
      const result = await tx.campus.updateMany({ where: { id: b.campus.id }, data: { name: "Taken over" } });
      expect(result.count).toBe(0);
      const schools = await tx.school.updateMany({ where: { id: b.id }, data: { name: "Taken over" } });
      expect(schools.count).toBe(0);
    });
    await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      expect((await tx.campus.findUnique({ where: { id: b.campus.id } }))?.name).toBe("Main Campus");
    });
  });

  it("cannot write a record into school B", async () => {
    await expect(
      withSchool(ctxA(), (tx) => tx.campus.create({ data: { schoolId: b.id, name: "Sneaky campus" } })),
    ).rejects.toThrow();
    await expect(
      withSchool(ctxA(), (tx) => tx.notification.create({ data: { schoolId: b.id, userLoginId: userB.id, type: "x", text: "x", link: "/" } })),
    ).rejects.toThrow();
  });

  it("cannot move a school A record into school B", async () => {
    await expect(
      withSchool(ctxA(), (tx) => tx.campus.update({ where: { id: a.campus.id }, data: { schoolId: b.id } })),
    ).rejects.toThrow();
  });

  it("cannot delete anything, in any school", async () => {
    await expect(withSchool(ctxA(), (tx) => tx.campus.deleteMany({ where: { id: a.campus.id } }))).rejects.toThrow(/permission denied/);
  });

  it("cannot switch the walls off", async () => {
    await expect(withSchool(ctxA(), (tx) => tx.$executeRawUnsafe('ALTER TABLE "campus" DISABLE ROW LEVEL SECURITY'))).rejects.toThrow();
    // With row_security off, a query that would need to bypass the walls fails instead of leaking.
    await expect(
      withSchool(ctxA(), async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL row_security = off");
        return tx.campus.findMany();
      }),
    ).rejects.toThrow();
  });
});

describe("student records stay in their school", () => {
  it("a user of school A cannot see or change school B's students, parents, certificates or leaving records", async () => {
    const ids = await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      const student = await tx.student.create({ data: { schoolId: b.id, campusId: b.campus.id, admissionNo: "B/0001", firstName: "Only", fullName: "Only In B" } });
      const guardian = await tx.guardian.create({ data: { schoolId: b.id, name: "Parent In B", relationship: "Father", phone: "9876512340" } });
      await tx.studentGuardian.create({ data: { schoolId: b.id, studentId: student.id, guardianId: guardian.id, relationship: "Father", isPrimary: true } });
      await tx.studentNote.create({ data: { schoolId: b.id, studentId: student.id, text: "Note in B" } });
      const cert = await tx.certificate.create({ data: { schoolId: b.id, studentId: student.id, type: "BONAFIDE", issueDate: new Date(), verifyCode: "BSCHOOLCODE23456" } });
      await tx.leavingRequest.create({ data: { schoolId: b.id, studentId: student.id, type: "TRANSFER", reason: "Moving", lastDate: new Date(), previousStatus: "ACTIVE" } });
      return { student: student.id, guardian: guardian.id, cert: cert.id };
    });
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.student.findUnique({ where: { id: ids.student } })).toBeNull();
      expect(await tx.student.findMany({ where: { fullName: { contains: "Only In B" } } })).toHaveLength(0);
      expect(await tx.guardian.findMany({ where: { phone: "9876512340" } })).toHaveLength(0);
      expect(await tx.studentGuardian.count({ where: { studentId: ids.student } })).toBe(0);
      expect(await tx.studentNote.count({ where: { studentId: ids.student } })).toBe(0);
      expect(await tx.certificate.findUnique({ where: { id: ids.cert } })).toBeNull();
      expect(await tx.leavingRequest.count({ where: { studentId: ids.student } })).toBe(0);
      expect((await tx.student.updateMany({ where: { id: ids.student }, data: { fullName: "Taken over" } })).count).toBe(0);
      expect((await tx.guardian.updateMany({ where: { id: ids.guardian }, data: { phone: "9000000000" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.studentNote.create({ data: { schoolId: b.id, studentId: ids.student, text: "Sneaky" } }))).rejects.toThrow();
  });
});

describe("one login in several schools", () => {
  it("lists both schools and keeps each one's data apart", async () => {
    const both = await makeUser({ schools: [{ id: a.id, roleKeys: ["principal"] }, { id: b.id, roleKeys: ["teacher"] }] });
    expect((await schoolsFor(both.id)).map((s) => s.id).sort()).toEqual([a.id, b.id].sort());

    const inA = await accessIn(both.id, a.id);
    const inB = await accessIn(both.id, b.id);
    expect(inA?.roles.map((r) => r.key)).toEqual(["principal"]);
    expect(inB?.roles.map((r) => r.key)).toEqual(["teacher"]);
    expect(inA?.permissions.settings.see).toBe("all");
    expect(inB?.permissions.settings.see).toBe("none");

    await withSchool({ schoolId: a.id, userId: both.id }, async (tx) => {
      expect(await tx.approval.count()).toBe(0);
    });
  });
});

describe("Academic Management records stay in their school", () => {
  it("school A sees none of school B's settings, rooms, syllabus, lesson plans, substitutions or absences", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    await withSchool(ctxB, async (tx) => {
      const year = await tx.academicYear.create({ data: { schoolId: b.id, campusId: b.campus.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "ACTIVE" } });
      const cls = await tx.schoolClass.create({ data: { schoolId: b.id, campusId: b.campus.id, name: "Class 1" } });
      const subject = await tx.subject.create({ data: { schoolId: b.id, code: "MAT", name: "Mathematics" } });
      const staff = await tx.staff.create({ data: { schoolId: b.id, campusId: b.campus.id, staffCode: "B-1", firstName: "B", lastName: "Teacher", fullName: "B Teacher", phone: "9000000001", designation: "Teacher", staffType: "Teaching", joiningDate: new Date("2020-01-01") } });
      const section = await tx.section.create({ data: { schoolId: b.id, classId: cls.id, academicYearId: year.id, name: "A" } });
      const room = await tx.room.create({ data: { schoolId: b.id, campusId: b.campus.id, name: "Lab B" } });
      const item = await tx.syllabusItem.create({ data: { schoolId: b.id, academicYearId: year.id, classId: cls.id, subjectId: subject.id, kind: "TOPIC", title: "Counting" } });
      const version = await tx.timetableVersion.create({ data: { schoolId: b.id, academicYearId: year.id, campusId: b.campus.id, name: "TT", status: "PUBLISHED" } });
      const period = await tx.timetablePeriod.create({ data: { schoolId: b.id, versionId: version.id, sectionId: section.id, dayOfWeek: 1, periodNo: 1, startTime: "09:00", endTime: "09:40", staffId: staff.id } });
      await tx.academicSettings.create({ data: { schoolId: b.id, campusId: b.campus.id } });
      await tx.stream.create({ data: { schoolId: b.id, campusId: b.campus.id, name: "Science" } });
      await tx.labBooking.create({ data: { schoolId: b.id, roomId: room.id, date: new Date("2026-10-12"), periodNo: 1, staffId: staff.id } });
      await tx.teacherPreference.create({ data: { schoolId: b.id, staffId: staff.id, maxPerDay: 5 } });
      await tx.subjectCondition.create({ data: { schoolId: b.id, subjectId: subject.id, periodNo: 8 } });
      await tx.electiveOption.create({ data: { schoolId: b.id, academicYearId: year.id, classId: cls.id, subjectId: subject.id, groupName: "Optional" } });
      await tx.syllabusProgressEntry.create({ data: { schoolId: b.id, academicYearId: year.id, sectionId: section.id, itemId: item.id, date: new Date("2026-10-09"), status: "taught" } });
      await tx.lessonPlan.create({ data: { schoolId: b.id, academicYearId: year.id, sectionId: section.id, subjectId: subject.id, topicId: item.id, staffId: staff.id, date: new Date("2026-10-12") } });
      await tx.substitution.create({ data: { schoolId: b.id, date: new Date("2026-10-12"), periodId: period.id, absentStaffId: staff.id } });
      await tx.staffAbsence.create({ data: { schoolId: b.id, staffId: staff.id, date: new Date("2026-10-12") } });
      await tx.temporaryCover.create({ data: { schoolId: b.id, absentStaffId: staff.id, tempStaffId: staff.id, fromDate: new Date("2026-10-12"), toDate: new Date("2026-10-13") } });
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.academicSettings.count(), tx.stream.count(), tx.room.count(), tx.labBooking.count(), tx.teacherPreference.count(), tx.subjectCondition.count(),
        tx.electiveOption.count(), tx.electiveChoice.count(), tx.syllabusItem.count(), tx.syllabusProgressEntry.count(), tx.lessonPlan.count(),
        tx.substitution.count(), tx.staffAbsence.count(), tx.temporaryCover.count(), tx.timetablePeriod.count(), tx.section.count(),
      ]);
      expect(counts.every((n) => n === 0)).toBe(true);
      await expect(tx.room.create({ data: { schoolId: b.id, campusId: b.campus.id, name: "Sneaky lab" } })).rejects.toThrow();
    });
  });
});

describe("every school table has its walls", () => {
  it("has row-level security forced and a same-school policy on each table with a school_id", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
    try {
      const tables = await owner.$queryRaw<{ table: string; rls: boolean; forced: boolean; policies: bigint }[]>`
        SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        WHERE c.relkind = 'r'
          AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'school_id')`;
      expect(tables.length).toBeGreaterThan(5);
      const unprotected = tables.filter((t) => !t.rls || !t.forced || Number(t.policies) === 0).map((t) => t.table);
      expect(unprotected).toEqual([]);
    } finally {
      await owner.$disconnect();
    }
  });
});

describe("Communication records stay in their school", () => {
  it("cannot read school B's messages, notices, queries, Parent Links, WhatsApp chats or surveys", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    await withSchool(ctxB, async (tx) => {
      await tx.message.create({ data: { schoolId: b.id, body: "School B only", channels: ["app"], audienceLabel: "B", status: "SENT" } });
      await tx.notice.create({ data: { schoolId: b.id, title: "School B notice", body: "x", audience: {}, audienceLabel: "B" } });
      const chat = await tx.whatsappChat.create({ data: { schoolId: b.id, phone: "9000000001", displayName: "B parent" } });
      await tx.whatsappChatMessage.create({ data: { schoolId: b.id, chatId: chat.id, direction: "in", body: "School B chat" } });
      const survey = await tx.survey.create({ data: { schoolId: b.id, number: "SV-B-1", title: "B survey", audienceKind: "parents", audienceLabel: "B" } });
      await tx.surveyQuestion.create({ data: { schoolId: b.id, surveyId: survey.id, sortOrder: 1, kind: "text", text: "Q" } });
      await tx.surveyInvite.create({ data: { schoolId: b.id, surveyId: survey.id, tokenHash: "b-hash", personType: "guardian", personId: chat.id } });
      await tx.surveyResponse.create({ data: { schoolId: b.id, surveyId: survey.id, answers: {} } });
    });
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.message.count()).toBe(0);
      expect(await tx.messageRecipient.count()).toBe(0);
      expect(await tx.notice.count()).toBe(0);
      expect(await tx.query.count()).toBe(0);
      expect(await tx.parentLink.count()).toBe(0);
      expect(await tx.consentRecord.count()).toBe(0);
      expect(await tx.whatsappChat.count()).toBe(0);
      expect(await tx.whatsappChatMessage.count()).toBe(0);
      expect(await tx.survey.count()).toBe(0);
      expect(await tx.surveyQuestion.count()).toBe(0);
      expect(await tx.surveyInvite.count()).toBe(0);
      expect(await tx.surveyResponse.count()).toBe(0);
    });
  });
});

describe("Examination & Results records stay in their school", () => {
  it("school A sees none of school B's exams, marks, results, report cards or question papers, and cannot write into them", async () => {
    const { randomUUID } = await import("node:crypto");
    const { ensureExamDefaults } = await import("@/lib/exams/settings");
    const ctxB = { schoolId: b.id, userId: userB.id };
    const ids = { year: randomUUID(), term: randomUUID(), cls: randomUUID(), section: randomUUID(), subject: randomUUID(), student: randomUUID() };
    const made = await withSchool(ctxB, async (tx) => {
      await ensureExamDefaults(tx, ctxB);
      const type = await tx.examType.findFirstOrThrow();
      const area = await tx.coScholasticArea.findFirstOrThrow();
      const exam = await tx.exam.create({ data: { schoolId: b.id, academicYearId: ids.year, termId: ids.term, examTypeId: type.id, title: "School B exam", classIds: [ids.cls], startDate: new Date("2026-10-12"), endDate: new Date("2026-10-20") } });
      const entry = await tx.datesheetEntry.create({ data: { schoolId: b.id, examId: exam.id, classId: ids.cls, subjectId: ids.subject, date: new Date("2026-10-12"), startTime: "09:30", durationMin: 120, maxMarks: 80 } });
      await tx.marksPaper.create({ data: { schoolId: b.id, entryId: entry.id, sectionId: ids.section } });
      const marks = await tx.marks.create({ data: { schoolId: b.id, entryId: entry.id, sectionId: ids.section, studentId: ids.student, total: 70 } });
      await tx.marksModeration.create({ data: { schoolId: b.id, marksId: marks.id, entryId: entry.id, studentId: ids.student, before: {}, after: {}, reason: "School B change", requestedById: userB.id } });
      await tx.result.create({ data: { schoolId: b.id, academicYearId: ids.year, examId: exam.id, key: `exam:${exam.id}`, studentId: ids.student, classId: ids.cls, sectionId: ids.section } });
      await tx.resultPublication.create({ data: { schoolId: b.id, academicYearId: ids.year, key: `exam:${exam.id}`, sectionIds: [ids.section], publishOn: new Date() } });
      await tx.reportCard.create({ data: { schoolId: b.id, academicYearId: ids.year, studentId: ids.student, sectionId: ids.section, period: `exam:${exam.id}` } });
      await tx.coScholasticGrade.create({ data: { schoolId: b.id, academicYearId: ids.year, period: "year", studentId: ids.student, areaId: area.id, grade: "A" } });
      const comp = await tx.competency.create({ data: { schoolId: b.id, subjectId: ids.subject, name: "Reads with understanding" } });
      await tx.competencyLevel.create({ data: { schoolId: b.id, academicYearId: ids.year, period: "year", studentId: ids.student, competencyId: comp.id, level: "Proficient" } });
      await tx.seatAllocation.create({ data: { schoolId: b.id, examId: exam.id, date: new Date("2026-10-12"), startTime: "09:30", room: "Hall", seatNo: 1, studentId: ids.student, sectionId: ids.section } });
      await tx.admitCardPrint.create({ data: { schoolId: b.id, examId: exam.id, sectionId: ids.section, count: 1 } });
      const q = await tx.question.create({ data: { schoolId: b.id, classId: ids.cls, subjectId: ids.subject, text: "School B question" } });
      await tx.questionPaper.create({ data: { schoolId: b.id, title: "School B paper", classId: ids.cls, subjectId: ids.subject, questionIds: [q.id] } });
      return { examId: exam.id, marksId: marks.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.exam.count(), tx.datesheetEntry.count(), tx.marksPaper.count(), tx.marks.count(), tx.marksModeration.count(), tx.result.count(),
        tx.resultPublication.count(), tx.reportCard.count(), tx.coScholasticGrade.count(), tx.competency.count(), tx.competencyLevel.count(),
        tx.seatAllocation.count(), tx.admitCardPrint.count(), tx.question.count(), tx.questionPaper.count(),
        tx.examSettings.count({ where: { schoolId: b.id } }), tx.examType.count({ where: { schoolId: b.id } }), tx.markCategory.count({ where: { schoolId: b.id } }),
        tx.gradeScale.count({ where: { schoolId: b.id } }), tx.coScholasticArea.count({ where: { schoolId: b.id } }),
      ]);
      expect(counts).toEqual(counts.map(() => 0));
      expect(await tx.exam.findUnique({ where: { id: made.examId } })).toBeNull();
      const changed = await tx.marks.updateMany({ where: { id: made.marksId }, data: { total: 80 } });
      expect(changed.count).toBe(0);
    });
    await expect(
      withSchool(ctxA(), (tx) => tx.question.create({ data: { schoolId: b.id, classId: ids.cls, subjectId: ids.subject, text: "Sneaky question" } })),
    ).rejects.toThrow();
    const still = await withSchool(ctxB, (tx) => tx.marks.findUniqueOrThrow({ where: { id: made.marksId } }));
    expect(still.total).toBe(70);
  });
});

describe("Dashboard records stay in their school", () => {
  it("cannot read school B's tasks, task comments, seen cards or setup steps", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    await withSchool(ctxB, async (tx) => {
      const t = await tx.task.create({ data: { schoolId: b.id, title: "School B task", assignedToId: userB.id, givenById: userB.id } });
      await tx.taskComment.create({ data: { schoolId: b.id, taskId: t.id, authorId: userB.id, text: "School B comment" } });
      await tx.dashboardSeen.create({ data: { schoolId: b.id, userLoginId: userB.id, itemKey: "x", value: "1" } });
      await tx.setupStepStatus.create({ data: { schoolId: b.id, stepKey: "fees", status: "DONE" } });
    });
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.task.count()).toBe(0);
      expect(await tx.taskComment.count()).toBe(0);
      expect(await tx.dashboardSeen.count()).toBe(0);
      expect(await tx.setupStepStatus.count()).toBe(0);
    });
  });
});

describe("Admission Management records stay in their school", () => {
  it("school A cannot read, change or add to school B's enquiries, applications, papers, tests, fees, consents or codes", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    const ids = await withSchool(ctxB, async (tx) => {
      const year = await tx.academicYear.create({ data: { schoolId: b.id, campusId: b.campus.id, name: "2031-32", startDate: day("2031-04-01"), endDate: day("2032-03-31"), status: "UPCOMING" } });
      const cls = await tx.schoolClass.create({ data: { schoolId: b.id, campusId: b.campus.id, name: "Admission B Class" } });
      const staff = await tx.staff.create({ data: { schoolId: b.id, campusId: b.campus.id, staffCode: "B-ADM", firstName: "B", lastName: "Counsellor", fullName: "B Counsellor", phone: "9000000077", designation: "Counsellor", joiningDate: day("2020-01-01") } });
      await tx.admissionSetting.create({ data: { schoolId: b.id, onlineOn: true } });
      await tx.admissionClassRule.create({ data: { schoolId: b.id, classId: cls.id } });
      await tx.admissionCampaign.create({ data: { schoolId: b.id, name: "School B campaign", message: "Apply now" } });
      const enquiry = await tx.enquiry.create({ data: { schoolId: b.id, campusId: b.campus.id, academicYearId: year.id, enquiryNo: "ENQ-B-1", childName: "Child In B", parentName: "Parent In B", phone: "9000000078", source: "walk-in", firstSource: "walk-in" } });
      await tx.enquiryActivity.create({ data: { schoolId: b.id, enquiryId: enquiry.id, kind: "note", text: "Only in B" } });
      const app = await tx.application.create({ data: { schoolId: b.id, campusId: b.campus.id, academicYearId: year.id, applicationNo: "APP-B-1", classId: cls.id, firstName: "Child", fullName: "Child In B", dateOfBirth: day("2026-01-01"), gender: "Female", phone: "9000000078", address: "B town" } });
      await tx.applicationActivity.create({ data: { schoolId: b.id, applicationId: app.id, kind: "note", text: "Only in B" } });
      await tx.applicationDocument.create({ data: { schoolId: b.id, applicationId: app.id, docType: "birth-certificate" } });
      const test = await tx.admissionTest.create({ data: { schoolId: b.id, academicYearId: year.id, title: "School B test", startsAt: day("2031-02-01") } });
      await tx.admissionTestBooking.create({ data: { schoolId: b.id, testId: test.id, applicationId: app.id } });
      await tx.interviewSlot.create({ data: { schoolId: b.id, applicationId: app.id, interviewerStaffId: staff.id, startsAt: day("2031-02-02") } });
      await tx.applicationFeePayment.create({ data: { schoolId: b.id, applicationId: app.id, amountPaise: BigInt(50000), mode: "cash" } });
      await tx.admissionConsent.create({ data: { schoolId: b.id, applicationId: app.id, consentType: "data-processing", version: 1, givenByName: "Parent In B", phone: "9000000078", howGiven: "admission-form-counter" } });
      await tx.admissionOtp.create({ data: { schoolId: b.id, phone: "9000000078", purpose: "online:9000000078", codeHash: "x", expiresAt: day("2031-01-01") } });
      return { enquiry: enquiry.id, app: app.id, test: test.id, yearId: year.id, classId: cls.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.admissionSetting.count({ where: { schoolId: b.id } }), tx.admissionClassRule.count(), tx.admissionCampaign.count(), tx.enquiry.count(), tx.enquiryActivity.count(),
        tx.application.count(), tx.applicationActivity.count(), tx.applicationDocument.count(), tx.admissionTest.count(), tx.admissionTestBooking.count(),
        tx.interviewSlot.count(), tx.applicationFeePayment.count(), tx.admissionConsent.count(), tx.admissionOtp.count(),
      ]);
      expect(counts).toEqual(Array(14).fill(0));
      expect(await tx.application.findUnique({ where: { id: ids.app } })).toBeNull();
      expect(await tx.enquiry.findMany({ where: { phone: "9000000078" } })).toHaveLength(0);
      expect((await tx.application.updateMany({ where: { id: ids.app }, data: { stage: "ADMITTED" } })).count).toBe(0);
      expect((await tx.enquiry.updateMany({ where: { id: ids.enquiry }, data: { status: "lost" } })).count).toBe(0);
      expect((await tx.admissionOtp.updateMany({ where: { phone: "9000000078" }, data: { attempts: 0 } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.applicationActivity.create({ data: { schoolId: b.id, applicationId: ids.app, kind: "note", text: "Sneaky" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.enquiry.create({ data: { schoolId: b.id, campusId: b.campus.id, academicYearId: ids.yearId, enquiryNo: "ENQ-X", childName: "X", parentName: "X", phone: "9000000079", source: "walk-in", firstSource: "walk-in" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.applicationFeePayment.create({ data: { schoolId: b.id, applicationId: ids.app, amountPaise: BigInt(1), mode: "cash" } }))).rejects.toThrow();
  });
});
