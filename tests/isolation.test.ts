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

  it("sees only school A's push devices (push alerts)", async () => {
    await withSchool({ schoolId: b.id, userId: userB.id }, (tx) => tx.pushDevice.create({ data: { schoolId: b.id, userLoginId: userB.id, token: "school-b-push-token-0000000000" } }));
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.pushDevice.findMany({ where: { token: { startsWith: "school-b" } } })).toHaveLength(0);
      await expect(tx.pushDevice.create({ data: { schoolId: b.id, userLoginId: userA.id, token: "planted-in-b-000000000000" } })).rejects.toThrow();
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

  it("sees none of school B's Attendance records", async () => {
    await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      await tx.attendanceSetting.create({ data: { schoolId: b.id } });
      await tx.attendanceStatus.create({ data: { schoolId: b.id, key: "present", name: "Present", letter: "P" } });
      await tx.attendanceMark.create({ data: { schoolId: b.id, studentId: b.id, date: new Date("2026-10-05T00:00:00Z"), statusKey: "absent", note: "School B mark" } });
      const device = await tx.attendanceDevice.create({ data: { schoolId: b.id, campusId: b.campus.id, name: "School B gate", serialNo: "B-1", deviceType: "face", keyHash: `b-${b.id}`, keyLast4: "abcd" } });
      await tx.devicePunch.create({ data: { schoolId: b.id, deviceId: device.id, punchNo: "1", deviceUserNo: "7", punchedAt: new Date() } });
      await tx.attendanceAlert.create({ data: { schoolId: b.id, studentId: b.id, date: new Date("2026-10-05T00:00:00Z"), kind: "absence", text: "School B absence" } });
      await tx.attendanceCorrection.create({ data: { schoolId: b.id, date: new Date("2026-10-05T00:00:00Z"), entries: [], reason: "School B correction" } });
      await tx.qrSession.create({ data: { schoolId: b.id, name: "School B QR", secretEnc: "x" } });
      const shift = await tx.staffShift.create({ data: { schoolId: b.id, name: "School B shift", startTime: "08:00", endTime: "16:00" } });
      await tx.staffShiftAssignment.create({ data: { schoolId: b.id, staffId: b.id, shiftId: shift.id, fromDate: new Date("2026-10-01T00:00:00Z") } });
      await tx.deviceUserMap.create({ data: { schoolId: b.id, deviceId: device.id, deviceUserNo: "7" } });
      await tx.attendanceSubmission.create({ data: { schoolId: b.id, clientId: `b-${b.id}`, sectionId: b.id, date: new Date("2026-10-05T00:00:00Z"), outcome: "saved" } });
      await tx.attendanceFlag.create({ data: { schoolId: b.id, studentId: b.id, kind: "threshold", value: 60, raisedOn: new Date("2026-10-05T00:00:00Z") } });
      await tx.geoFence.create({ data: { schoolId: b.id, campusId: b.campus.id, latitude: 17.4, longitude: 78.4 } });
      await tx.overtimeEntry.create({ data: { schoolId: b.id, staffId: b.id, date: new Date("2026-10-05T00:00:00Z"), minutes: 30 } });
      await tx.studentLeaveQuota.create({ data: { schoolId: b.id, leaveTypeId: b.id, days: 6 } });
    });
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.attendanceSetting.findUnique({ where: { schoolId: b.id } })).toBeNull();
      expect(await tx.attendanceStatus.count({ where: { schoolId: b.id } })).toBe(0);
      expect(await tx.attendanceMark.count({ where: { note: "School B mark" } })).toBe(0);
      expect(await tx.attendanceDevice.count()).toBe(0);
      expect(await tx.devicePunch.count()).toBe(0);
      expect(await tx.attendanceAlert.count()).toBe(0);
      expect(await tx.attendanceCorrection.count()).toBe(0);
      expect(await tx.qrSession.count()).toBe(0);
      expect(await tx.staffShift.count()).toBe(0);
      expect(await tx.staffShiftAssignment.count()).toBe(0);
      expect(await tx.deviceUserMap.count()).toBe(0);
      expect(await tx.attendanceSubmission.count()).toBe(0);
      expect(await tx.attendanceFlag.count()).toBe(0);
      expect(await tx.geoFence.count()).toBe(0);
      expect(await tx.overtimeEntry.count()).toBe(0);
      expect(await tx.studentLeaveQuota.count()).toBe(0);
      expect((await tx.attendanceMark.updateMany({ where: { note: "School B mark" }, data: { statusKey: "present" } })).count).toBe(0);
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
      // The Super Admin console's own tables (07-super-admin.md) use for_school_id, and are
      // walled off the same way: only the console (app.console) sees them, never a school.
      const consoleTables = await owner.$queryRaw<{ table: string; rls: boolean; forced: boolean; policies: bigint }[]>`
        SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        WHERE c.relkind = 'r'
          AND (c.relname LIKE 'console\\_%' OR c.relname IN ('super_admin_user', 'school_invite', 'platform_invoice', 'subscription', 'plan', 'school_group', 'support_access_request'))`;
      expect(consoleTables.length).toBeGreaterThan(5);
      // Support Access Requests (gap G35) are console records too.
      expect(consoleTables.map((t) => t.table)).toContain("support_access_request");
      expect(consoleTables.filter((t) => !t.rls || !t.forced || Number(t.policies) === 0).map((t) => t.table)).toEqual([]);
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

describe("Salary Management records stay in their school", () => {
  it("school A cannot read, change or add to school B's salary settings, structures, salary months, slips, advances or statements", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    const ids = await withSchool(ctxB, async (tx) => {
      const staff = await tx.staff.create({ data: { schoolId: b.id, campusId: b.campus.id, staffCode: "B-SAL", firstName: "B", lastName: "Payee", fullName: "B Payee", phone: "9000000081", designation: "Teacher", joiningDate: day("2020-01-01") } });
      await tx.salarySetting.create({ data: { schoolId: b.id } });
      await tx.statutorySetting.create({ data: { schoolId: b.id, validFrom: day("2031-04-01") } });
      await tx.professionalTaxSlab.create({ data: { schoolId: b.id, state: "Telangana", fromPaise: BigInt(0), taxPaise: BigInt(20000) } });
      await tx.salaryComponent.create({ data: { schoolId: b.id, name: "B allowance", kind: "EARNING" } });
      await tx.salaryTemplate.create({ data: { schoolId: b.id, name: "B template" } });
      await tx.salaryStructure.create({ data: { schoolId: b.id, staffId: staff.id, version: 1, effectiveFrom: day("2031-04-01"), lines: [], grossPaise: BigInt(3000000) } });
      const run = await tx.payrollRun.create({ data: { schoolId: b.id, campusId: b.campus.id, month: day("2031-04-01"), number: "PAY-B-1", netPaise: BigInt(2800000) } });
      const line = await tx.payrollLine.create({ data: { schoolId: b.id, runId: run.id, staffId: staff.id, daysInMonth: 30, paidDays: 30, netPaise: BigInt(2800000) } });
      await tx.payrollAdjustment.create({ data: { schoolId: b.id, runId: run.id, staffId: staff.id, type: "BONUS", amountPaise: BigInt(100000), reason: "Only in B" } });
      const slip = await tx.payslip.create({ data: { schoolId: b.id, runId: run.id, lineId: line.id, staffId: staff.id, month: day("2031-04-01"), netPaise: BigInt(2800000) } });
      const adv = await tx.salaryAdvance.create({ data: { schoolId: b.id, number: "ADV-B-1", staffId: staff.id, type: "LOAN", amountPaise: BigInt(1000000), installmentPaise: BigInt(100000), startMonth: day("2031-05-01"), reason: "Only in B" } });
      await tx.salaryRecovery.create({ data: { schoolId: b.id, advanceId: adv.id, kind: "CASH", date: day("2031-05-02"), amountPaise: BigInt(100000) } });
      await tx.statutoryStatement.create({ data: { schoolId: b.id, runId: run.id, campusId: b.campus.id, month: day("2031-04-01"), kind: "PF", staffCount: 1, wagesPaise: BigInt(1500000), employeePaise: BigInt(180000), employerPaise: BigInt(180000), lines: [] } });
      return { staff: staff.id, run: run.id, line: line.id, slip: slip.id, adv: adv.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.salarySetting.count({ where: { schoolId: b.id } }), tx.statutorySetting.count({ where: { schoolId: b.id } }), tx.professionalTaxSlab.count({ where: { schoolId: b.id } }),
        tx.salaryComponent.count({ where: { schoolId: b.id } }), tx.salaryTemplate.count({ where: { schoolId: b.id } }), tx.salaryStructure.count(), tx.payrollRun.count(),
        tx.payrollLine.count(), tx.payrollAdjustment.count(), tx.payslip.count(), tx.salaryAdvance.count(), tx.salaryRecovery.count(), tx.statutoryStatement.count(),
      ]);
      expect(counts).toEqual(Array(13).fill(0));
      expect(await tx.payslip.findUnique({ where: { id: ids.slip } })).toBeNull();
      expect(await tx.payrollLine.findMany({ where: { staffId: ids.staff } })).toHaveLength(0);
      expect((await tx.payrollRun.updateMany({ where: { id: ids.run }, data: { status: "PAID" } })).count).toBe(0);
      expect((await tx.payrollLine.updateMany({ where: { id: ids.line }, data: { netPaise: BigInt(1) } })).count).toBe(0);
      expect((await tx.salaryAdvance.updateMany({ where: { id: ids.adv }, data: { status: "CLOSED" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.payrollAdjustment.create({ data: { schoolId: b.id, runId: ids.run, staffId: ids.staff, type: "BONUS", amountPaise: BigInt(1), reason: "Sneaky" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.salaryRecovery.create({ data: { schoolId: b.id, advanceId: ids.adv, kind: "CASH", date: day("2031-05-03"), amountPaise: BigInt(1) } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.salaryStructure.create({ data: { schoolId: b.id, staffId: ids.staff, version: 2, effectiveFrom: day("2031-06-01"), lines: [], grossPaise: BigInt(1) } }))).rejects.toThrow();
  });
});

describe("Front Office records stay in their school", () => {
  it("school A cannot read, change or add to school B's visitors, gate log, gate passes, codes, notes, requests, calls, appointments, postal or settings", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const day = new Date("2031-05-05T00:00:00Z");
    const at = new Date("2031-05-05T05:00:00Z");
    const someone = "00000000-0000-4000-8000-000000000001";
    const ids = await withSchool(ctxB, async (tx) => {
      await tx.frontOfficeSetting.create({ data: { schoolId: b.id } });
      const visitor = await tx.visitorEntry.create({ data: { schoolId: b.id, passNo: "V-B-1", visitDate: day, name: "Visitor In B", phone: "9000000081", purpose: "Meeting", timeIn: at, passExpiresAt: at } });
      await tx.gateEntry.create({ data: { schoolId: b.id, at, direction: "IN", kind: "person", who: "Only in B" } });
      const pass = await tx.gatePass.create({ data: { schoolId: b.id, passNo: "GP-B-1", kind: "PICKUP", studentId: someone, reason: "Unwell", timeOut: at } });
      await tx.pickupCode.create({ data: { schoolId: b.id, studentId: someone, guardianId: someone, codeHash: "x", expiresAt: at } });
      await tx.frontOfficeNote.create({ data: { schoolId: b.id, text: "Only in B" } });
      await tx.walkInRequest.create({ data: { schoolId: b.id, requestNo: "WR-B-1", fromName: "Parent In B", request: "TC copy", department: "Office", givenBy: "Desk" } });
      await tx.callLogEntry.create({ data: { schoolId: b.id, at, direction: "IN", phone: "9000000081", name: "Caller In B", purpose: "Other" } });
      await tx.appointment.create({ data: { schoolId: b.id, staffId: someone, date: day, startMin: 600, lengthMin: 15, visitorName: "Visitor In B", visitorPhone: "9000000081", purpose: "Meeting" } });
      await tx.postalEntry.create({ data: { schoolId: b.id, entryNo: "PD-B-1", at, direction: "RECEIVED", itemType: "LETTER", party: "Sender In B", forText: "Office", status: "AT_DESK" } });
      return { visitor: visitor.id, pass: pass.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.frontOfficeSetting.count({ where: { schoolId: b.id } }), tx.visitorEntry.count(), tx.gateEntry.count(), tx.gatePass.count(), tx.pickupCode.count(),
        tx.frontOfficeNote.count(), tx.walkInRequest.count(), tx.callLogEntry.count(), tx.appointment.count(), tx.postalEntry.count(),
      ]);
      expect(counts).toEqual(Array(10).fill(0));
      expect(await tx.visitorEntry.findUnique({ where: { id: ids.visitor } })).toBeNull();
      expect(await tx.visitorEntry.findMany({ where: { phone: "9000000081" } })).toHaveLength(0);
      expect((await tx.visitorEntry.updateMany({ where: { id: ids.visitor }, data: { timeOut: at } })).count).toBe(0);
      expect((await tx.gatePass.updateMany({ where: { id: ids.pass }, data: { leftAt: at } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.visitorEntry.create({ data: { schoolId: b.id, passNo: "V-X", visitDate: day, name: "X", phone: "9000000082", purpose: "Meeting", timeIn: at, passExpiresAt: at } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.postalEntry.create({ data: { schoolId: b.id, entryNo: "PD-X", at, direction: "RECEIVED", itemType: "LETTER", party: "X", forText: "X", status: "AT_DESK" } }))).rejects.toThrow();
  });
});

describe("Events & Calendar records stay in their school", () => {
  it("school A cannot read, change or add to school B's events, registrations, volunteers, reminders, PTMs, slots, notes, albums, photos, tags or settings", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const day = new Date("2031-06-06T00:00:00Z");
    const someone = "00000000-0000-4000-8000-000000000001";
    const ids = await withSchool(ctxB, async (tx) => {
      await tx.eventsSetting.create({ data: { schoolId: b.id } });
      const event = await tx.event.create({ data: { schoolId: b.id, academicYearId: someone, number: "EV-B-1", name: "Event In B", type: "Trip", date: day, startMin: 600, audienceLabel: "Whole school" } });
      await tx.eventRegistration.create({ data: { schoolId: b.id, eventId: event.id, studentId: someone } });
      await tx.eventVolunteer.create({ data: { schoolId: b.id, eventId: event.id, kind: "other", name: "Helper In B", duty: "First aid" } });
      await tx.eventReminder.create({ data: { schoolId: b.id, eventId: event.id, people: 3, note: "Only in B" } });
      const ptm = await tx.ptm.create({ data: { schoolId: b.id, academicYearId: someone, date: day, classIds: [someone], classesLabel: "Class 5", startMin: 570, endMin: 690, slotMinutes: 10 } });
      await tx.ptmTeacher.create({ data: { schoolId: b.id, ptmId: ptm.id, staffId: someone, label: "Class teacher, 5 A" } });
      const slot = await tx.ptmSlot.create({ data: { schoolId: b.id, ptmId: ptm.id, staffId: someone, startMin: 570, studentId: someone } });
      await tx.ptmMeetingNote.create({ data: { schoolId: b.id, slotId: slot.id, ptmId: ptm.id, studentId: someone, staffId: someone, remarks: "Only in B" } });
      const album = await tx.album.create({ data: { schoolId: b.id, number: "AL-B-1", name: "Album In B", date: day } });
      const media = await tx.mediaItem.create({ data: { schoolId: b.id, albumId: album.id, fileId: someone } });
      await tx.mediaTag.create({ data: { schoolId: b.id, mediaId: media.id, studentId: someone } });
      return { event: event.id, ptm: ptm.id, slot: slot.id, album: album.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.eventsSetting.count({ where: { schoolId: b.id } }), tx.event.count(), tx.eventRegistration.count(), tx.eventVolunteer.count(), tx.eventReminder.count(),
        tx.ptm.count(), tx.ptmTeacher.count(), tx.ptmSlot.count(), tx.ptmMeetingNote.count(), tx.album.count(), tx.mediaItem.count(), tx.mediaTag.count(),
      ]);
      expect(counts).toEqual(Array(12).fill(0));
      expect(await tx.event.findUnique({ where: { id: ids.event } })).toBeNull();
      expect((await tx.event.updateMany({ where: { id: ids.event }, data: { name: "Changed by A" } })).count).toBe(0);
      expect((await tx.ptmSlot.updateMany({ where: { id: ids.slot }, data: { studentId: null } })).count).toBe(0);
      expect((await tx.album.updateMany({ where: { id: ids.album }, data: { status: "PUBLISHED" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.event.create({ data: { schoolId: b.id, academicYearId: someone, number: "EV-X", name: "X", type: "Trip", date: day, startMin: 600, audienceLabel: "X" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.ptmSlot.create({ data: { schoolId: b.id, ptmId: ids.ptm, staffId: someone, startMin: 600 } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.album.create({ data: { schoolId: b.id, number: "AL-X", name: "X", date: day } }))).rejects.toThrow();
  });

  it("school A cannot read, change or add to school B's event consents, achievements, credits, houses, clubs, teams, fixtures, fitness records or daily diaries", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const day = new Date("2031-06-07T00:00:00Z");
    const someone = "00000000-0000-4000-8000-000000000001";
    const ids = await withSchool(ctxB, async (tx) => {
      const event = await tx.event.create({ data: { schoolId: b.id, academicYearId: someone, number: "EV-B-2", name: "Trip In B", type: "Trip", date: day, startMin: 600, audienceLabel: "Whole school", consentOn: true } });
      await tx.eventConsent.create({ data: { schoolId: b.id, eventId: event.id, studentId: someone, answer: "GIVEN", how: "office" } });
      const ach = await tx.achievement.create({ data: { schoolId: b.id, academicYearId: someone, studentId: someone, activity: "Quiz In B", kind: "Quiz", date: day } });
      await tx.activityCreditEntry.create({ data: { schoolId: b.id, academicYearId: someone, studentId: someone, achievementId: ach.id, points: 10, reason: "Quiz", date: day } });
      const house = await tx.house.create({ data: { schoolId: b.id, name: "House In B" } });
      await tx.houseMember.create({ data: { schoolId: b.id, academicYearId: someone, houseId: house.id, studentId: someone } });
      await tx.housePointsEntry.create({ data: { schoolId: b.id, academicYearId: someone, houseId: house.id, points: 5, reason: "Only in B", date: day } });
      const club = await tx.club.create({ data: { schoolId: b.id, name: "Club In B" } });
      await tx.clubMember.create({ data: { schoolId: b.id, academicYearId: someone, clubId: club.id, studentId: someone } });
      await tx.clubMeeting.create({ data: { schoolId: b.id, clubId: club.id, date: day, memberIds: [someone], presentIds: [someone] } });
      const team = await tx.sportsTeam.create({ data: { schoolId: b.id, name: "Team In B", sport: "Football" } });
      await tx.teamMember.create({ data: { schoolId: b.id, academicYearId: someone, teamId: team.id, studentId: someone } });
      await tx.trainingSession.create({ data: { schoolId: b.id, teamId: team.id, date: day, memberIds: [someone], presentIds: [] } });
      const fixture = await tx.fixture.create({ data: { schoolId: b.id, teamId: team.id, title: "Match In B", date: day } });
      await tx.fitnessRecord.create({ data: { schoolId: b.id, academicYearId: someone, studentId: someone, date: day, heightCm: 140 } });
      const act = await tx.dailyActivity.create({ data: { schoolId: b.id, academicYearId: someone, sectionId: someone, date: day, type: "Meal", label: "Snack", startMin: 615, options: ["Ate all"] } });
      await tx.dailyActivityLog.create({ data: { schoolId: b.id, activityId: act.id, studentId: someone, value: "Ate all" } });
      await tx.diarySend.create({ data: { schoolId: b.id, sectionId: someone, date: day, people: 1, logged: 100 } });
      return { ach: ach.id, house: house.id, fixture: fixture.id, act: act.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.eventConsent.count(), tx.achievement.count(), tx.activityCreditEntry.count(), tx.house.count(), tx.houseMember.count(), tx.housePointsEntry.count(),
        tx.club.count(), tx.clubMember.count(), tx.clubMeeting.count(), tx.sportsTeam.count(), tx.teamMember.count(), tx.trainingSession.count(),
        tx.fixture.count(), tx.fitnessRecord.count(), tx.dailyActivity.count(), tx.dailyActivityLog.count(), tx.diarySend.count(),
      ]);
      expect(counts).toEqual(Array(17).fill(0));
      expect(await tx.achievement.findUnique({ where: { id: ids.ach } })).toBeNull();
      expect((await tx.achievement.updateMany({ where: { id: ids.ach }, data: { certificateNo: "CC/X" } })).count).toBe(0);
      expect((await tx.house.updateMany({ where: { id: ids.house }, data: { name: "Changed by A" } })).count).toBe(0);
      expect((await tx.fixture.updateMany({ where: { id: ids.fixture }, data: { result: "WON" } })).count).toBe(0);
      expect((await tx.dailyActivity.updateMany({ where: { id: ids.act }, data: { label: "Changed by A" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.housePointsEntry.create({ data: { schoolId: b.id, academicYearId: someone, houseId: ids.house, points: 100, reason: "X", date: day } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.dailyActivityLog.create({ data: { schoolId: b.id, activityId: ids.act, studentId: someone, value: "X" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.achievement.create({ data: { schoolId: b.id, academicYearId: someone, studentId: someone, activity: "X", kind: "X", date: day } }))).rejects.toThrow();
  });
});

describe("Homework & Learning records stay in their school", () => {
  it("school A cannot read, change or add to school B's homework, submissions, courses, lessons, quizzes, boards, online classes or settings", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const day = new Date("2031-06-02T00:00:00Z");
    const at = new Date("2031-06-02T05:00:00Z");
    const x = "00000000-0000-4000-8000-000000000002";
    const where = { academicYearId: x, sectionId: x, classId: x, subjectId: x };
    const ids = await withSchool(ctxB, async (tx) => {
      await tx.homeworkSetting.create({ data: { schoolId: b.id } });
      const hw = await tx.homework.create({ data: { schoolId: b.id, ...where, title: "Only in B", startDate: day, dueDate: day } });
      await tx.homeworkAttachment.create({ data: { schoolId: b.id, homeworkId: hw.id, kind: "link", name: "Only in B" } });
      const sub = await tx.submission.create({ data: { schoolId: b.id, homeworkId: hw.id, studentId: x } });
      await tx.homeworkComment.create({ data: { schoolId: b.id, homeworkId: hw.id, studentId: x, authorName: "B", body: "Only in B" } });
      const course = await tx.course.create({ data: { schoolId: b.id, ...where } });
      const lesson = await tx.lesson.create({ data: { schoolId: b.id, courseId: course.id, title: "Only in B" } });
      await tx.lessonItem.create({ data: { schoolId: b.id, lessonId: lesson.id, kind: "NOTES", name: "Only in B" } });
      await tx.lessonView.create({ data: { schoolId: b.id, lessonId: lesson.id, studentId: x } });
      await tx.courseCertificate.create({ data: { schoolId: b.id, courseId: course.id, studentId: x, number: "CC-B-1" } });
      const quiz = await tx.quiz.create({ data: { schoolId: b.id, ...where, title: "Only in B" } });
      await tx.quizQuestion.create({ data: { schoolId: b.id, quizId: quiz.id, text: "Only in B?" } });
      await tx.quizAttempt.create({ data: { schoolId: b.id, quizId: quiz.id, studentId: x } });
      const board = await tx.discussionBoard.create({ data: { schoolId: b.id, title: "Only in B", ownerName: "B" } });
      await tx.discussionPost.create({ data: { schoolId: b.id, boardId: board.id, authorName: "B" } });
      const session = await tx.onlineClassSession.create({ data: { schoolId: b.id, ...where, title: "Only in B", startsAt: at, meetingLink: "https://meet.example/b" } });
      await tx.onlineClassAttendance.create({ data: { schoolId: b.id, sessionId: session.id, studentId: x } });
      return { hw: hw.id, sub: sub.id, quiz: quiz.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.homeworkSetting.count({ where: { schoolId: b.id } }), tx.homework.count(), tx.homeworkAttachment.count(), tx.submission.count(), tx.homeworkComment.count(),
        tx.course.count(), tx.lesson.count(), tx.lessonItem.count(), tx.lessonView.count(), tx.courseCertificate.count(),
        tx.quiz.count(), tx.quizQuestion.count(), tx.quizAttempt.count(), tx.discussionBoard.count(), tx.discussionPost.count(),
        tx.onlineClassSession.count(), tx.onlineClassAttendance.count(),
      ]);
      expect(counts).toEqual(Array(17).fill(0));
      expect(await tx.homework.findUnique({ where: { id: ids.hw } })).toBeNull();
      expect((await tx.homework.updateMany({ where: { id: ids.hw }, data: { title: "Changed by A" } })).count).toBe(0);
      expect((await tx.submission.updateMany({ where: { id: ids.sub }, data: { score: 1 } })).count).toBe(0);
      expect((await tx.quiz.updateMany({ where: { id: ids.quiz }, data: { title: "Changed by A" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.submission.create({ data: { schoolId: b.id, homeworkId: ids.hw, studentId: "00000000-0000-4000-8000-000000000003" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.homework.create({ data: { schoolId: b.id, ...where, title: "X", startDate: day, dueDate: day } }))).rejects.toThrow();
  });
});

describe("Reports & Analytics records stay in their school", () => {
  it("school A cannot read, change or add to school B's pins, uses, runs, warning settings, flags, reviews, AI decisions, forecasts, government exports, custom reports, schedules or sends", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const x = "00000000-0000-4000-8000-000000000004";
    const ids = await withSchool(ctxB, async (tx) => {
      await tx.reportPin.create({ data: { schoolId: b.id, userId: userB.id, key: "fe-defaulter" } });
      await tx.reportUse.create({ data: { schoolId: b.id, userId: userB.id, key: "fe-defaulter" } });
      const run = await tx.reportRun.create({ data: { schoolId: b.id, userId: userB.id, key: "fe-defaulter", title: "Only in B" } });
      await tx.earlyWarningSetting.create({ data: { schoolId: b.id } });
      const flag = await tx.riskFlag.create({ data: { schoolId: b.id, studentId: x, academicYearId: x, area: "attendance", reason: "Only in B", basis: "Only in B" } });
      await tx.flagReview.create({ data: { schoolId: b.id, flagId: flag.id, decision: "REVIEWED", note: "Only in B", reviewerId: userB.id } });
      await tx.aiSignalDecision.create({ data: { schoolId: b.id, signalKey: "only-in-b", decision: "DISMISSED", userId: userB.id } });
      const forecast = await tx.forecastSignal.create({ data: { schoolId: b.id, key: "only-in-b", area: "fees", title: "Only in B", body: "Only in B", source: "Only in B" } });
      await tx.governmentExport.create({ data: { schoolId: b.id, returnKey: "udise", title: "Only in B", version: "2026-27", rows: 1, exportedById: userB.id } });
      const custom = await tx.customReport.create({ data: { schoolId: b.id, name: "Only in B", area: "students", columns: ["name"], ownerId: userB.id } });
      const sched = await tx.reportSchedule.create({ data: { schoolId: b.id, reportKey: `c:${custom.id}`, reportName: "Only in B", recipientIds: [userB.id], nextAt: new Date("2031-06-09T02:30:00Z"), createdById: userB.id } });
      await tx.reportScheduleSend.create({ data: { schoolId: b.id, scheduleId: sched.id, userId: userB.id, slot: "2031-06-09T02:30" } });
      return { run: run.id, flag: flag.id, custom: custom.id, sched: sched.id, forecast: forecast.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.reportPin.count(), tx.reportUse.count(), tx.reportRun.count(), tx.earlyWarningSetting.count({ where: { schoolId: b.id } }), tx.riskFlag.count(), tx.flagReview.count(),
        tx.aiSignalDecision.count(), tx.governmentExport.count(), tx.customReport.count(), tx.reportSchedule.count(), tx.reportScheduleSend.count(), tx.forecastSignal.count(),
      ]);
      expect(counts).toEqual(Array(12).fill(0));
      expect((await tx.forecastSignal.updateMany({ where: { id: ids.forecast }, data: { title: "Changed by A" } })).count).toBe(0);
      expect(await tx.riskFlag.findUnique({ where: { id: ids.flag } })).toBeNull();
      expect((await tx.riskFlag.updateMany({ where: { id: ids.flag }, data: { status: "CLOSED" } })).count).toBe(0);
      expect((await tx.reportRun.updateMany({ where: { id: ids.run }, data: { status: "READY" } })).count).toBe(0);
      expect((await tx.customReport.updateMany({ where: { id: ids.custom }, data: { name: "Changed by A" } })).count).toBe(0);
      expect((await tx.reportSchedule.updateMany({ where: { id: ids.sched }, data: { recipientIds: [userA.id] } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.flagReview.create({ data: { schoolId: b.id, flagId: ids.flag, decision: "REVIEWED", note: "X", reviewerId: userA.id } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.forecastSignal.create({ data: { schoolId: b.id, key: "from-a", area: "fees", title: "X", body: "X", source: "X" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.reportSchedule.create({ data: { schoolId: b.id, reportKey: "fe-defaulter", reportName: "X", recipientIds: [userA.id], nextAt: new Date(), createdById: userA.id } }))).rejects.toThrow();
  });
});

describe("Transport Management records stay in their school", () => {
  it("school A cannot read, change or add to school B's vehicles, papers, drivers, phone keys, routes, stops, places, fees, schedules, trips, locations, stop and boarding marks, alerts, fuel, repairs, reminders or settings", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const x = "00000000-0000-4000-8000-000000000005";
    const day = new Date("2026-10-15T00:00:00Z");
    const at = new Date("2026-10-15T02:00:00Z");
    const ids = await withSchool(ctxB, async (tx) => {
      await tx.transportSetting.create({ data: { schoolId: b.id } });
      const vendor = await tx.transportVendor.create({ data: { schoolId: b.id, name: "Only in B Travels" } });
      const vehicle = await tx.vehicle.create({ data: { schoolId: b.id, number: "TS01ZZ0001", capacity: 30, vendorId: vendor.id } });
      await tx.vehicleDocument.create({ data: { schoolId: b.id, vehicleId: vehicle.id, kind: "INSURANCE", expiresOn: day } });
      const driver = await tx.driver.create({ data: { schoolId: b.id, name: "Only in B", phone: "9700000001", licenceNo: "TS0000000001" } });
      await tx.driverDevice.create({ data: { schoolId: b.id, driverId: driver.id, name: "B phone", keyHash: `b-only-${b.id}`, keyLast4: "BBBB" } });
      const route = await tx.route.create({ data: { schoolId: b.id, number: 1, name: "Only in B", vehicleId: vehicle.id, driverId: driver.id } });
      const stop = await tx.stop.create({ data: { schoolId: b.id, routeId: route.id, name: "Only in B", seq: 1, pickupMin: 450 } });
      const place = await tx.transportAssignment.create({ data: { schoolId: b.id, studentId: x, academicYearId: x, routeId: route.id, stopId: stop.id, fromDate: day, monthlyFeePaise: BigInt(150000) } });
      await tx.transportFeeCharge.create({ data: { schoolId: b.id, studentId: x, assignmentId: place.id, dueId: x, periodKey: "2026-10", periodStart: day, periodEnd: day, amountPaise: BigInt(150000) } });
      await tx.tripSchedule.create({ data: { schoolId: b.id, routeId: route.id, kind: "MORNING", startMin: 440 } });
      const trip = await tx.trip.create({ data: { schoolId: b.id, routeId: route.id, kind: "MORNING", date: day, plannedStartMin: 440, status: "STARTED", startedAt: at, vehicleId: vehicle.id, driverId: driver.id } });
      await tx.gpsPoint.create({ data: { schoolId: b.id, tripId: trip.id, at, lat: 17.4, lng: 78.4 } });
      await tx.tripStopEvent.create({ data: { schoolId: b.id, tripId: trip.id, stopId: stop.id, at } });
      await tx.boardingEvent.create({ data: { schoolId: b.id, tripId: trip.id, studentId: x, status: "BOARDED", at } });
      await tx.transportAlert.create({ data: { schoolId: b.id, tripId: trip.id, kind: "EMERGENCY", text: "Only in B", at, onceKey: "b-only" } });
      await tx.fuelLog.create({ data: { schoolId: b.id, vehicleId: vehicle.id, date: day, amountPaise: BigInt(500000) } });
      await tx.maintenanceLog.create({ data: { schoolId: b.id, vehicleId: vehicle.id, date: day, what: "Only in B", amountPaise: BigInt(100000) } });
      await tx.transportReminderLog.create({ data: { schoolId: b.id, onceKey: "b-only", text: "Only in B" } });
      return { vehicle: vehicle.id, driver: driver.id, route: route.id, stop: stop.id, trip: trip.id, place: place.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.transportSetting.count({ where: { schoolId: b.id } }), tx.transportVendor.count(), tx.vehicle.count(), tx.vehicleDocument.count(), tx.driver.count(), tx.driverDevice.count(),
        tx.route.count(), tx.stop.count(), tx.transportAssignment.count(), tx.transportFeeCharge.count(), tx.tripSchedule.count(), tx.trip.count(),
        tx.gpsPoint.count(), tx.tripStopEvent.count(), tx.boardingEvent.count(), tx.transportAlert.count(), tx.fuelLog.count(), tx.maintenanceLog.count(), tx.transportReminderLog.count(),
      ]);
      expect(counts).toEqual(Array(19).fill(0));
      expect(await tx.trip.findUnique({ where: { id: ids.trip } })).toBeNull();
      expect((await tx.trip.updateMany({ where: { id: ids.trip }, data: { status: "COMPLETED" } })).count).toBe(0);
      expect((await tx.vehicle.updateMany({ where: { id: ids.vehicle }, data: { capacity: 99 } })).count).toBe(0);
      expect((await tx.transportAssignment.updateMany({ where: { id: ids.place }, data: { status: "ENDED" } })).count).toBe(0);
      expect((await tx.driver.updateMany({ where: { id: ids.driver }, data: { status: "INACTIVE" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.gpsPoint.create({ data: { schoolId: b.id, tripId: ids.trip, at, lat: 17.4, lng: 78.4 } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.stop.create({ data: { schoolId: b.id, routeId: ids.route, name: "X", seq: 2, pickupMin: 460 } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.transportAlert.create({ data: { schoolId: b.id, kind: "EMERGENCY", text: "X", at, onceKey: "a-into-b" } }))).rejects.toThrow();
  });
});

describe("Library Management records stay in their school", () => {
  it("school A cannot read, change or add to school B's library settings, categories, authors, publishers, books, copies, issues, members, reservations, fines, stock checks or card prints", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const x = "00000000-0000-4000-8000-000000000001";
    const day = new Date("2026-10-12T00:00:00Z");
    const ids = await withSchool(ctxB, async (tx) => {
      await tx.librarySetting.create({ data: { schoolId: b.id } });
      const cat = await tx.libraryCategory.create({ data: { schoolId: b.id, name: "Only in B" } });
      await tx.author.create({ data: { schoolId: b.id, name: "Author In B" } });
      await tx.publisher.create({ data: { schoolId: b.id, name: "Publisher In B" } });
      const book = await tx.book.create({ data: { schoolId: b.id, title: "Book In B", authorText: "Author In B", categoryId: cat.id } });
      const copy = await tx.bookCopy.create({ data: { schoolId: b.id, bookId: book.id, accessionNo: "B-1", barcode: "B-1" } });
      const issue = await tx.bookIssue.create({ data: { schoolId: b.id, copyId: copy.id, bookId: book.id, memberKind: "STUDENT", studentId: x, issuedOn: day, dueOn: day } });
      await tx.libraryMember.create({ data: { schoolId: b.id, memberKind: "STUDENT", studentId: x, blockReason: "Only in B" } });
      await tx.reservation.create({ data: { schoolId: b.id, bookId: book.id, memberKind: "STUDENT", studentId: x } });
      const fine = await tx.libraryFine.create({ data: { schoolId: b.id, fineNo: "LF-B-1", issueId: issue.id, copyId: copy.id, bookId: book.id, memberKind: "STUDENT", studentId: x, reason: "LATE", amountPaise: BigInt(1000) } });
      const session = await tx.stockCheckSession.create({ data: { schoolId: b.id, name: "Only in B" } });
      await tx.stockCheckScan.create({ data: { schoolId: b.id, sessionId: session.id, code: "B-1", copyId: copy.id } });
      await tx.libraryCardPrint.create({ data: { schoolId: b.id, memberKind: "STUDENT", studentId: x, cardNo: "ADM-B" } });
      return { book: book.id, copy: copy.id, issue: issue.id, fine: fine.id, session: session.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.librarySetting.count({ where: { schoolId: b.id } }), tx.libraryCategory.count(), tx.author.count(), tx.publisher.count(), tx.book.count(), tx.bookCopy.count(), tx.bookIssue.count(),
        tx.libraryMember.count(), tx.reservation.count(), tx.libraryFine.count(), tx.stockCheckSession.count(), tx.stockCheckScan.count(), tx.libraryCardPrint.count(),
      ]);
      expect(counts).toEqual(Array(13).fill(0));
      expect(await tx.book.findUnique({ where: { id: ids.book } })).toBeNull();
      expect(await tx.bookCopy.findMany({ where: { accessionNo: "B-1" } })).toHaveLength(0);
      expect((await tx.bookCopy.updateMany({ where: { id: ids.copy }, data: { status: "LOST" } })).count).toBe(0);
      expect((await tx.bookIssue.updateMany({ where: { id: ids.issue }, data: { returnedAt: new Date() } })).count).toBe(0);
      expect((await tx.libraryFine.updateMany({ where: { id: ids.fine }, data: { status: "WAIVED" } })).count).toBe(0);
      expect((await tx.stockCheckSession.updateMany({ where: { id: ids.session }, data: { status: "CLOSED" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.book.create({ data: { schoolId: b.id, title: "X", authorText: "X" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.bookIssue.create({ data: { schoolId: b.id, copyId: ids.copy, bookId: ids.book, memberKind: "STUDENT", studentId: x, issuedOn: day, dueOn: day } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.stockCheckScan.create({ data: { schoolId: b.id, sessionId: ids.session, code: "X-1" } }))).rejects.toThrow();
  });
});

describe("Hostel Management records stay in their school", () => {
  it("school A cannot read, change or add to school B's hostel settings, hostels, wardens, rooms, beds, allocations, fee plans, fee rows, roll calls, incidents, menus, head counts or mess expenses", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const x = "00000000-0000-4000-8000-000000000001";
    const day = new Date("2026-10-12T00:00:00Z");
    const at = new Date("2026-10-12T16:00:00Z");
    const ids = await withSchool(ctxB, async (tx) => {
      await tx.hostelSetting.create({ data: { schoolId: b.id, rules: "Only in B" } });
      const hostel = await tx.hostel.create({ data: { schoolId: b.id, name: "Only in B", gender: "BOYS" } });
      await tx.hostelWarden.create({ data: { schoolId: b.id, hostelId: hostel.id, staffId: x, fromDate: day } });
      const room = await tx.hostelRoom.create({ data: { schoolId: b.id, hostelId: hostel.id, floor: "Ground", roomNo: "B-1" } });
      const bed = await tx.hostelBed.create({ data: { schoolId: b.id, hostelId: hostel.id, roomId: room.id, bedNo: 1 } });
      const alloc = await tx.bedAllocation.create({ data: { schoolId: b.id, studentId: x, hostelId: hostel.id, roomId: room.id, bedId: bed.id, academicYearId: x, startDate: day } });
      const plan = await tx.hostelFeePlan.create({ data: { schoolId: b.id, academicYearId: x, name: "Only in B", feeHeadId: x } });
      const inst = await tx.hostelFeeInstallment.create({ data: { schoolId: b.id, planId: plan.id, label: "Quarter 1", dueDate: day, amountPaise: BigInt(2400000) } });
      await tx.hostelFeeCharge.create({ data: { schoolId: b.id, allocationId: alloc.id, installmentId: inst.id, studentId: x, dueId: x } });
      const roll = await tx.rollCall.create({ data: { schoolId: b.id, hostelId: hostel.id, date: day, session: "NIGHT", takenAt: at, absentCount: 1 } });
      await tx.rollCallMark.create({ data: { schoolId: b.id, rollCallId: roll.id, studentId: x, mark: "ABSENT" } });
      const incident = await tx.hostelIncident.create({ data: { schoolId: b.id, incidentNo: "HI-B-1", hostelId: hostel.id, type: "DISCIPLINE", at, studentIds: [x], description: "Only in B" } });
      await tx.messMenuItem.create({ data: { schoolId: b.id, weekStart: day, dayIndex: 0, meal: "Breakfast", dishes: "Only in B" } });
      await tx.mealHeadCount.create({ data: { schoolId: b.id, date: day, meal: "Breakfast", expected: 10, actual: 9 } });
      const expense = await tx.messExpense.create({ data: { schoolId: b.id, date: day, item: "Only in B", amountPaise: BigInt(150000) } });
      return { hostel: hostel.id, room: room.id, bed: bed.id, alloc: alloc.id, roll: roll.id, incident: incident.id, expense: expense.id, plan: plan.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.hostelSetting.count({ where: { schoolId: b.id } }), tx.hostel.count(), tx.hostelWarden.count(), tx.hostelRoom.count(), tx.hostelBed.count(), tx.bedAllocation.count(),
        tx.hostelFeePlan.count(), tx.hostelFeeInstallment.count(), tx.hostelFeeCharge.count(), tx.rollCall.count(), tx.rollCallMark.count(), tx.hostelIncident.count(),
        tx.messMenuItem.count(), tx.mealHeadCount.count(), tx.messExpense.count(),
      ]);
      expect(counts).toEqual(Array(15).fill(0));
      expect(await tx.hostel.findUnique({ where: { id: ids.hostel } })).toBeNull();
      expect(await tx.bedAllocation.findMany({ where: { studentId: x } })).toHaveLength(0);
      expect((await tx.hostelBed.updateMany({ where: { id: ids.bed }, data: { blockedAt: at } })).count).toBe(0);
      expect((await tx.bedAllocation.updateMany({ where: { id: ids.alloc }, data: { status: "CHECKED_OUT" } })).count).toBe(0);
      expect((await tx.rollCall.updateMany({ where: { id: ids.roll }, data: { absentCount: 0 } })).count).toBe(0);
      expect((await tx.hostelIncident.updateMany({ where: { id: ids.incident }, data: { description: "Changed by A" } })).count).toBe(0);
      expect((await tx.messExpense.updateMany({ where: { id: ids.expense }, data: { paid: true } })).count).toBe(0);
      expect((await tx.hostelFeePlan.updateMany({ where: { id: ids.plan }, data: { name: "Changed by A" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.hostelRoom.create({ data: { schoolId: b.id, hostelId: ids.hostel, floor: "Ground", roomNo: "X-1" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.bedAllocation.create({ data: { schoolId: b.id, studentId: x, hostelId: ids.hostel, roomId: ids.room, bedId: ids.bed, academicYearId: x, startDate: day } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.rollCallMark.create({ data: { schoolId: b.id, rollCallId: ids.roll, studentId: x, mark: "PRESENT" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.messExpense.create({ data: { schoolId: b.id, date: day, item: "X", amountPaise: BigInt(100) } }))).rejects.toThrow();
  });
});

describe("Inventory Management records stay in their school", () => {
  it("school A cannot read, change or add to school B's store: items, stock, issues, audits, purchases, bills, assets, facilities, maintenance and labs", async () => {
    const ctxB = { schoolId: b.id, userId: userB.id };
    const x = "00000000-0000-4000-8000-000000000002";
    const day = new Date("2026-10-12T00:00:00Z");
    const s = { schoolId: b.id };
    const ids = await withSchool(ctxB, async (tx) => {
      await tx.inventorySetting.create({ data: s });
      const cat = await tx.itemCategory.create({ data: { ...s, name: "Only in B" } });
      const loc = await tx.storeLocation.create({ data: { ...s, name: "Store in B" } });
      const item = await tx.item.create({ data: { ...s, code: "B-0001", name: "Item in B", categoryId: cat.id } });
      await tx.stockBalance.create({ data: { ...s, itemId: item.id, locationId: loc.id, qty: 5 } });
      await tx.stockBatch.create({ data: { ...s, itemId: item.id, locationId: loc.id, batchNo: "B1", expiresOn: day } });
      await tx.stockMovement.create({ data: { ...s, itemId: item.id, locationId: loc.id, kind: "OPENING", qty: 5, date: day, balanceAfter: 5 } });
      await tx.stockTransfer.create({ data: { ...s, number: "TR-B-1", date: day, fromLocationId: loc.id, toLocationId: loc.id, lines: [] } });
      const set = await tx.bookSet.create({ data: { ...s, name: "Set in B", pricePaise: BigInt(100) } });
      await tx.bookSetItem.create({ data: { ...s, setId: set.id, itemId: item.id } });
      const issue = await tx.stockIssue.create({ data: { ...s, number: "IS-B-1", date: day, toKind: "STAFF", locationId: loc.id } });
      await tx.stockIssueLine.create({ data: { ...s, issueId: issue.id, itemId: item.id, qty: 1 } });
      const audit = await tx.stockAudit.create({ data: { ...s, number: "SA-B-1", name: "Count in B", locationId: loc.id, startedOn: day } });
      await tx.stockAuditLine.create({ data: { ...s, auditId: audit.id, itemId: item.id, systemQty: 5 } });
      await tx.vendorDetail.create({ data: { ...s, vendorId: x, contactName: "Only in B" } });
      const req = await tx.purchaseRequest.create({ data: { ...s, number: "PR-B-1", date: day, reason: "Only in B" } });
      await tx.purchaseRequestLine.create({ data: { ...s, requestId: req.id, itemId: item.id, qty: 1 } });
      const order = await tx.purchaseOrder.create({ data: { ...s, number: "PO-B-1", date: day, vendorId: x, locationId: loc.id, totalPaise: BigInt(100) } });
      const line = await tx.purchaseOrderLine.create({ data: { ...s, orderId: order.id, itemId: item.id, qty: 1, unitPricePaise: BigInt(100) } });
      const receipt = await tx.goodsReceipt.create({ data: { ...s, number: "GR-B-1", orderId: order.id, date: day, locationId: loc.id } });
      await tx.goodsReceiptLine.create({ data: { ...s, receiptId: receipt.id, orderLineId: line.id, itemId: item.id, qty: 1 } });
      const bill = await tx.purchaseInvoice.create({ data: { ...s, vendorId: x, billNo: "B-77", billDate: day, amountPaise: BigInt(100), expenseId: x } });
      const asset = await tx.asset.create({ data: { ...s, tag: "AT-B-1", name: "Asset in B", type: "IT" } });
      await tx.assetAssignment.create({ data: { ...s, assetId: asset.id, date: day } });
      await tx.assetMaintenanceLog.create({ data: { ...s, assetId: asset.id, date: day, problem: "Only in B" } });
      await tx.assetDisposal.create({ data: { ...s, assetId: asset.id, method: "SCRAPPED", reason: "Only in B", date: day } });
      await tx.assetItemLink.create({ data: { ...s, assetId: asset.id, itemId: item.id } });
      const check = await tx.assetAudit.create({ data: { ...s, name: "Check in B" } });
      await tx.assetAuditScan.create({ data: { ...s, auditId: check.id, code: "AT-B-1" } });
      await tx.facility.create({ data: { ...s, roomId: x, type: "classroom" } });
      const mr = await tx.maintenanceRequest.create({ data: { ...s, number: "MR-B-1", roomId: x, problem: "Only in B" } });
      await tx.labExperiment.create({ data: { ...s, classId: x, subject: "Science", title: "Only in B" } });
      await tx.labSafetyCheck.create({ data: { ...s, roomId: x, date: day, checklist: [], result: "PASSED" } });
      return { item: item.id, issue: issue.id, order: order.id, bill: bill.id, asset: asset.id, mr: mr.id, loc: loc.id, cat: cat.id };
    });
    await withSchool(ctxA(), async (tx) => {
      const counts = await Promise.all([
        tx.inventorySetting.count({ where: { schoolId: b.id } }), tx.itemCategory.count(), tx.storeLocation.count(), tx.item.count(), tx.stockBalance.count(), tx.stockBatch.count(),
        tx.stockMovement.count(), tx.stockTransfer.count(), tx.bookSet.count(), tx.bookSetItem.count(), tx.stockIssue.count(), tx.stockIssueLine.count(), tx.stockAudit.count(),
        tx.stockAuditLine.count(), tx.vendorDetail.count(), tx.purchaseRequest.count(), tx.purchaseRequestLine.count(), tx.purchaseOrder.count(), tx.purchaseOrderLine.count(),
        tx.goodsReceipt.count(), tx.goodsReceiptLine.count(), tx.purchaseInvoice.count(), tx.asset.count(), tx.assetAssignment.count(), tx.assetMaintenanceLog.count(),
        tx.assetDisposal.count(), tx.assetItemLink.count(), tx.assetAudit.count(), tx.assetAuditScan.count(), tx.facility.count(), tx.maintenanceRequest.count(),
        tx.labExperiment.count(), tx.labSafetyCheck.count(),
      ]);
      expect(counts).toEqual(Array(33).fill(0));
      expect(await tx.item.findUnique({ where: { id: ids.item } })).toBeNull();
      expect((await tx.item.updateMany({ where: { id: ids.item }, data: { name: "Changed by A" } })).count).toBe(0);
      expect((await tx.stockBalance.updateMany({ where: { itemId: ids.item }, data: { qty: 999 } })).count).toBe(0);
      expect((await tx.stockIssue.updateMany({ where: { id: ids.issue }, data: { note: "Changed by A" } })).count).toBe(0);
      expect((await tx.purchaseOrder.updateMany({ where: { id: ids.order }, data: { status: "CANCELLED" } })).count).toBe(0);
      expect((await tx.purchaseInvoice.updateMany({ where: { id: ids.bill }, data: { billNo: "A-1" } })).count).toBe(0);
      expect((await tx.asset.updateMany({ where: { id: ids.asset }, data: { status: "DISPOSED" } })).count).toBe(0);
      expect((await tx.maintenanceRequest.updateMany({ where: { id: ids.mr }, data: { status: "DONE" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.item.create({ data: { schoolId: b.id, code: "A-1", name: "X", categoryId: ids.cat } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.stockMovement.create({ data: { schoolId: b.id, itemId: ids.item, locationId: ids.loc, kind: "IN", qty: 100, date: day, balanceAfter: 105 } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.asset.create({ data: { schoolId: b.id, tag: "AT-A-9", name: "X", type: "IT" } }))).rejects.toThrow();
    await expect(withSchool(ctxA(), (tx) => tx.maintenanceRequest.create({ data: { schoolId: b.id, number: "MR-A-9", roomId: x, problem: "X" } }))).rejects.toThrow();
  });
});

describe("Finance Management day closes stay in their school", () => {
  it("school A cannot read, reopen or add to school B's closed days", async () => {
    const date = new Date("2026-10-05T00:00:00Z");
    const close = await withSchool({ schoolId: b.id, userId: userB.id }, (tx) => tx.dayClose.create({ data: { schoolId: b.id, financialYearId: b.id, date, expectedCashPaise: BigInt(100), countedCashPaise: BigInt(100), incomePaise: BigInt(0), expensePaise: BigInt(0), entryCount: 0, closedById: userB.id } }));
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.dayClose.count()).toBe(0);
      expect(await tx.dayClose.findFirst({ where: { id: close.id } })).toBeNull();
      expect((await tx.dayClose.updateMany({ where: { id: close.id }, data: { reopenedAt: new Date() } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.dayClose.create({ data: { schoolId: b.id, financialYearId: b.id, date, expectedCashPaise: BigInt(0), countedCashPaise: BigInt(0), incomePaise: BigInt(0), expensePaise: BigInt(0), entryCount: 0 } }))).rejects.toThrow();
  });
});

describe("Switching to School OS files stay in their school", () => {
  it("school A cannot read, change or add to school B's move-in files and plan", async () => {
    const file = await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      await tx.moveInPlan.create({ data: { schoolId: b.id, oldSoftware: "B software" } });
      return tx.moveInFile.create({ data: { schoolId: b.id, fileId: b.id, fileName: "b.xlsx", kind: "students" } });
    });
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.moveInFile.count()).toBe(0);
      expect(await tx.moveInPlan.count()).toBe(0);
      expect((await tx.moveInFile.updateMany({ where: { id: file.id }, data: { status: "cancelled" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.moveInFile.create({ data: { schoolId: b.id, fileId: b.id, fileName: "x.xlsx", kind: "students" } }))).rejects.toThrow();
  });

  it("school A cannot read, change or add to school B's remembered column matches (Import Mapping)", async () => {
    const m = await withSchool({ schoolId: b.id, userId: userB.id }, (tx) => tx.importMapping.create({ data: { schoolId: b.id, kind: "students", headerKey: "only-in-b", headings: ["adm no"], columns: { admissionNo: ["adm no"] }, source: "B software", fileName: "b.xlsx" } }));
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.importMapping.count()).toBe(0);
      expect(await tx.importMapping.findUnique({ where: { id: m.id } })).toBeNull();
      expect((await tx.importMapping.updateMany({ where: { id: m.id }, data: { archivedAt: new Date() } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.importMapping.create({ data: { schoolId: b.id, kind: "students", headerKey: "from-a", fileName: "x.xlsx" } }))).rejects.toThrow();
  });
});

describe("The AI Call log stays in its school", () => {
  it("school A cannot read, change or add to school B's AI Calls", async () => {
    const call = await withSchool({ schoolId: b.id, userId: userB.id }, (tx) => tx.aiCall.create({ data: { schoolId: b.id, feature: "ai-smart-import", purpose: "Only in B", model: "claude-opus-5-5", userLoginId: userB.id, outcome: "ok", sent: true } }));
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.aiCall.count()).toBe(0);
      expect(await tx.aiCall.findMany({ where: { purpose: "Only in B" } })).toHaveLength(0);
      expect((await tx.aiCall.updateMany({ where: { id: call.id }, data: { outcome: "failed" } })).count).toBe(0);
      expect((await tx.aiCall.aggregate({ _sum: { costPaise: true } }))._sum.costPaise).toBeNull();
    });
    await expect(withSchool(ctxA(), (tx) => tx.aiCall.create({ data: { schoolId: b.id, feature: "ai-smart-import", purpose: "From A", model: "x" } }))).rejects.toThrow();
  });
});

describe("The one student search stays in its school", () => {
  it("school A's search (raw SQL under row-level security) never finds school B's student by name, typo, number or parent phone", async () => {
    const { findStudents, studentIdsMatching } = await import("@/lib/students/find");
    const sid = await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      const s = await tx.student.create({ data: { schoolId: b.id, campusId: b.campus.id, admissionNo: "ISO-B-77", firstName: "Zubeida", fullName: "Zubeida Qureshi" } });
      const g = await tx.guardian.create({ data: { schoolId: b.id, name: "Yusuf Qureshi", relationship: "Father", phone: "9123498765" } });
      await tx.studentGuardian.create({ data: { schoolId: b.id, studentId: s.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
      return s.id;
    });
    await withSchool(ctxA(), async (tx) => {
      for (const q of ["Zubeida Qureshi", "Zubieda", "ISO-B-77", "98765", "Yusuf"]) {
        expect(await findStudents(tx, q, { scope: {}, yearId: null, statuses: "any", archived: "include" })).toEqual([]);
        expect(await studentIdsMatching(tx, q, { scope: {}, yearId: null, statuses: "any", archived: "include" })).toEqual([]);
      }
    });
    await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      expect((await findStudents(tx, "Zubieda", { scope: {}, yearId: null })).map((h) => h.id)).toEqual([sid]);
    });
  });
});

describe("Online fee payment orders stay in their school", () => {
  it("school A cannot read, change or add to school B's payment link orders or gateway log", async () => {
    const x = "00000000-0000-4000-8000-000000000005";
    const ids = await withSchool({ schoolId: b.id, userId: userB.id }, async (tx) => {
      const order = await tx.paymentLinkOrder.create({ data: { schoolId: b.id, paymentLinkId: x, gatewayOrderId: "order_OnlyInB1", amountPaise: BigInt(600000) } });
      const log = await tx.gatewayTransaction.create({ data: { schoolId: b.id, gatewayAccountId: x, event: "payment.captured", gatewayPaymentId: "pay_OnlyInB1", gatewayOrderId: "order_OnlyInB1", amountPaise: BigInt(600000), outcome: "unmatched", details: { contact: "+919800000000" } } });
      return { order: order.id, log: log.id };
    });
    await withSchool(ctxA(), async (tx) => {
      expect(await tx.paymentLinkOrder.count()).toBe(0);
      expect(await tx.gatewayTransaction.count()).toBe(0);
      expect(await tx.paymentLinkOrder.findFirst({ where: { gatewayOrderId: "order_OnlyInB1" } })).toBeNull();
      expect((await tx.paymentLinkOrder.updateMany({ where: { id: ids.order }, data: { paymentLinkId: x } })).count).toBe(0);
      expect((await tx.gatewayTransaction.updateMany({ where: { id: ids.log }, data: { outcome: "posted" } })).count).toBe(0);
    });
    await expect(withSchool(ctxA(), (tx) => tx.paymentLinkOrder.create({ data: { schoolId: b.id, paymentLinkId: x, gatewayOrderId: "order_FromA1", amountPaise: BigInt(1) } }))).rejects.toThrow();
  });
});
