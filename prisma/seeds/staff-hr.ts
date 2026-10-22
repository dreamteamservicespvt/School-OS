// Staff & HR demo: emergency contacts, leave (approved, waiting for the head
// of department, sick), a document about to expire and one expired, a
// resignation in progress, a vacancy with applications, an interview and an
// offer, an appraisal cycle, training and a promotion. HR Settings,
// designations and leave rules are made on first use from what is on file.
import { withSchool, type SchoolContext } from "../../src/lib/db";
import { applyLeave, countLeaveDays, leaveSummary, offDaySet } from "../../src/lib/staff/leave";
import { ensureHrDefaults } from "../../src/lib/staff/settings";
import type { ModuleSeed } from "./types";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const seedStaffHr: ModuleSeed = async (school) => {
  const { schoolId, users, full } = school;
  await withSchool({ schoolId, userId: users.principal ?? null }, async (tx) => {
    const staff = await tx.staff.findMany({ where: { schoolId }, orderBy: { staffCode: "asc" }, include: { department: true } });
    const by = (name: string) => staff.find((s) => s.fullName === name);
    const types = await tx.leaveType.findMany({ where: { schoolId, forWhom: "staff" } });
    const type = (code: string) => types.find((t) => t.code === code)!;

    // The optional parts of Recruitment & Appraisal, on in the full demo.
    if (full) {
      for (const featureKey of ["hr-recruitment", "hr-appraisal", "hr-training", "hr-promotions"]) {
        await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId, featureKey } }, create: { schoolId, featureKey, isOn: true }, update: { isOn: true } });
      }
    }

    // Emergency contacts: two for the first staff, one for the rest.
    for (const [i, s] of staff.entries()) {
      if (!s.emergencyName) continue;
      await tx.emergencyContact.create({ data: { schoolId, staffId: s.id, name: s.emergencyName, relation: i % 3 === 0 ? "Spouse" : i % 3 === 1 ? "Father" : "Brother", phone: s.emergencyPhone ?? "9876500000", priority: 1 } });
      if (i < 6) await tx.emergencyContact.create({ data: { schoolId, staffId: s.id, name: `${["Sita", "Ramu", "Kamala", "Venu", "Lalitha", "Shankar"][i]} ${s.lastName ?? ""}`.trim(), relation: "Sister", phone: `98480${String(10000 + i * 7)}`, priority: 2 } });
    }

    if (!full) return;

    // Leave. Ravi Teja (teacher login) heads Mathematics, so Kavitha's leave waits for him.
    const ravi = by("Ravi Teja");
    const kavitha = by("Kavitha Nair");
    const divya = by("Divya Menon");
    const rajesh = by("Rajesh Gupta");
    const admin = users.admin;
    // Leave is counted the way the app counts it: only school days (no Sundays, days off or
    // School Calendar holidays), a half day as 0.5. A demo leave never falls on a day without
    // school (QA SEED-02). A leave still waiting is applied for through the app itself.
    await ensureHrDefaults(tx, { schoolId, userId: users.principal ?? null });
    const waiting = async (s: NonNullable<typeof ravi>, code: string, from: string, to: string, reason: string, asker: string, opts: { halfDayPart?: "first" | "second"; onBehalf?: boolean } = {}) => {
      const as: SchoolContext = { schoolId, userId: asker };
      return applyLeave(tx, as, { staffId: s.id, leaveTypeId: type(code).id, from: day(from), to: day(to), halfDayPart: opts.halfDayPart ?? null, reason, documentFileId: null, onBehalf: opts.onBehalf ?? false });
    };
    // Leave already decided is written as it was decided then, with its days counted the same way.
    const decided = async (s: NonNullable<typeof ravi>, code: string, from: string, to: string, reason: string, status: "APPROVED" | "REJECTED", asker: string, onBehalf: boolean) => {
      const t = type(code);
      const rule = await tx.leaveTypeRule.findUnique({ where: { leaveTypeId: t.id } });
      const days = countLeaveDays(day(from), day(to), await offDaySet(tx, { schoolId, userId: null }, day(from), day(to), s.campusId), { countsHolidays: rule?.countsHolidays ?? false });
      if (days <= 0) throw new Error(`Demo leave for ${s.fullName} from ${from} to ${to} has no school day in it.`);
      const r = await tx.leaveRequest.create({
        data: {
          schoolId, academicYearId: school.yearId, staffId: s.id, leaveTypeId: t.id, fromDate: day(from), toDate: day(to), halfDay: false, days, reason, status,
          recordedById: asker, decidedById: users.principal, decidedAt: day(from),
          decisionReason: status === "REJECTED" ? "Unit tests are on these dates. Please choose the next week." : null,
        },
      });
      await tx.staffLeaveDetail.create({ data: { leaveRequestId: r.id, schoolId, halfDayPart: null, onBehalf, periodsAffected: s.staffType === "Teaching" ? Math.round(days * 5) : 0 } });
      const a = await tx.approval.create({
        data: {
          schoolId, type: "staff-leave", recordType: "Leave Request", recordId: r.id, askedById: asker, reason,
          summary: leaveSummary(t.name, s.fullName, day(from), day(to), days),
          currentApproverRole: "principal", step: 1, status, decidedById: users.principal, decidedAt: day(from),
        },
      });
      await tx.leaveRequest.update({ where: { id: r.id }, data: { approvalId: a.id } });
      return r;
    };
    if (ravi && users.teacher) {
      await decided(ravi, "CL", "2026-07-17", "2026-07-17", "Family function in Vijayawada", "APPROVED", users.teacher, false);
      // A half day on a school day after the Dasara holidays (it was 21-10-2026, a holiday).
      await waiting(ravi, "CL", "2026-10-28", "2026-10-28", "Bank work in the morning", users.teacher, { halfDayPart: "first" });
    }
    if (kavitha && admin) await waiting(kavitha, "CL", "2026-10-15", "2026-10-16", "Sister's wedding", admin, { onBehalf: true });
    if (divya && admin) await decided(divya, "SL", "2026-09-07", "2026-09-09", "Viral fever, doctor's note attached", "APPROVED", admin, true);
    if (rajesh && admin) await decided(rajesh, "EL", "2026-08-24", "2026-08-28", "Trip to native place", "REJECTED", admin, true);

    // Documents: one expired, one expiring this month (core already has some expiring police verifications).
    if (rajesh) await tx.staffDocument.create({ data: { schoolId, staffId: rajesh.id, kind: "Contract", number: "CT-2024-031", issuedOn: day("2024-10-01"), expiresOn: day("2026-09-30"), verified: true } });
    if (kavitha) await tx.staffDocument.create({ data: { schoolId, staffId: kavitha.id, kind: "Teaching eligibility (CTET)", issuedOn: day("2019-10-28"), expiresOn: day("2026-10-28"), verified: true } });

    // A resignation in progress: Harish Naidu, Lab Assistant.
    const harish = by("Harish Naidu");
    if (harish) {
      const exit = await tx.exitCase.create({
        data: { schoolId, staffId: harish.id, type: "RESIGNATION", receivedOn: day("2026-10-01"), lastWorkingDay: day("2026-10-31"), reason: "Moving to Bengaluru for a job in a pharma lab.", status: "IN_PROGRESS", createdById: admin ?? null },
      });
      await tx.handoverItem.createMany({ data: [
        { schoolId, exitCaseId: exit.id, kind: "asset", label: "Chemistry lab keys and stock register" },
        { schoolId, exitCaseId: exit.id, kind: "document", label: "Lab equipment list for 2026-27", doneAt: day("2026-10-05"), doneById: admin ?? null },
      ] });
      await tx.clearanceCheck.createMany({ data: [
        { schoolId, exitCaseId: exit.id, key: "assets", label: "Assets and stock items returned" },
        { schoolId, exitCaseId: exit.id, key: "library", label: "Library books returned", status: "CLEARED", clearedAt: day("2026-10-06") },
        { schoolId, exitCaseId: exit.id, key: "advances", label: "Advances and loans recovered", status: "NOT_NEEDED" },
        { schoolId, exitCaseId: exit.id, key: "id-card", label: "ID card returned" },
        { schoolId, exitCaseId: exit.id, key: "documents", label: "School documents and keys returned" },
      ] });
    }

    // Recruitment: a TGT Science vacancy with applications, an interview and an offer.
    const sci = staff.find((s) => s.department?.name === "Science")?.departmentId ?? null;
    const vacancy = await tx.vacancy.create({ data: { schoolId, designation: "TGT Science", departmentId: sci, openings: 1, closingDate: day("2026-10-31"), details: "B.Sc, B.Ed with CTET. Physics and Chemistry for Classes 6 to 10. 3 years' experience preferred.", createdById: admin ?? null } });
    const apps = [
      { name: "Sandeep Rao", phone: "9849012345", qualification: "M.Sc Physics, B.Ed", experienceYears: 5, status: "OFFERED" as const },
      { name: "Farah Khan", phone: "9849023456", qualification: "B.Sc, B.Ed, CTET", experienceYears: 3, status: "INTERVIEW" as const },
      { name: "Deepak Jain", phone: "9849034567", qualification: "B.Sc, B.Ed", experienceYears: 1, status: "NEW" as const },
      { name: "Nirmala Devi", phone: "9849045678", qualification: "M.Sc Chemistry", experienceYears: 0, status: "REJECTED" as const },
    ];
    const principalStaff = staff.find((s) => s.userLoginId === users.principal);
    for (const a of apps) {
      const app = await tx.jobApplication.create({ data: { schoolId, vacancyId: vacancy.id, name: a.name, phone: a.phone, email: `${a.name.split(" ")[0].toLowerCase()}@example.com`, qualification: a.qualification, experienceYears: a.experienceYears, status: a.status, createdById: admin ?? null } });
      if (a.status === "OFFERED" || a.status === "INTERVIEW") {
        await tx.interview.create({
          data: { schoolId, applicationId: app.id, startsAt: new Date(a.status === "OFFERED" ? "2026-10-03T05:30:00Z" : "2026-10-12T06:00:00Z"), minutes: 30, place: "Principal's office",
            interviewerIds: [principalStaff?.id, divya?.id].filter(Boolean) as string[], outcome: a.status === "OFFERED" ? "PASSED" : "PENDING", notes: a.status === "OFFERED" ? "Strong in practicals. Good demo class on refraction." : null, createdById: admin ?? null },
        });
      }
      if (a.status === "OFFERED") {
        await tx.offer.create({ data: { schoolId, applicationId: app.id, offerNo: "OFR/2026/0001", designation: "TGT Science", departmentId: sci, joiningDate: day("2026-11-02"), monthlyPaise: BigInt(4500000), respondBy: day("2026-10-15"), createdById: admin ?? null } });
      }
    }

    // Appraisal: the 2026-27 cycle, some reviews done.
    const criteria = ["Subject knowledge", "Classroom teaching", "Student results", "Punctuality", "Working with parents"];
    const cycle = await tx.appraisalCycle.create({ data: { schoolId, academicYearId: school.yearId, name: "Appraisal 2026-27", criteria, startDate: day("2026-10-01"), endDate: day("2026-11-30"), createdById: users.principal ?? null } });
    for (const [i, s] of staff.filter((x) => x.status === "ACTIVE").entries()) {
      const reviewerId = s.department?.headStaffId && s.department.headStaffId !== s.id ? s.department.headStaffId : principalStaff && principalStaff.id !== s.id ? principalStaff.id : null;
      const rate = (n: number) => Object.fromEntries(criteria.map((c, k) => [c, Math.min(5, Math.max(2, n + ((k + i) % 3) - 1))]));
      const stage = i % 4;
      const managerRatings = stage === 0 ? rate(4) : {};
      const avg = stage === 0 ? Math.round((Object.values(managerRatings).reduce((a, b) => a + b, 0) / criteria.length) * 10) / 10 : null;
      await tx.appraisal.create({
        data: {
          schoolId, cycleId: cycle.id, staffId: s.id, reviewerId,
          status: stage === 0 ? "DONE" : stage === 1 ? "MANAGER_REVIEW" : "SELF_REVIEW",
          selfRatings: stage <= 1 ? rate(4) : {}, selfComment: stage <= 1 ? "Completed the syllabus on time and ran remedial classes." : null,
          managerRatings, managerComment: stage === 0 ? "Dependable and well prepared." : null, finalRating: avg,
        },
      });
    }

    // Training and a promotion.
    const trainees = staff.filter((s) => s.staffType === "Teaching").slice(3, 9);
    for (const [i, s] of trainees.entries()) {
      await tx.trainingRecord.create({ data: { schoolId, staffId: s.id, course: ["CBSE Capacity Building: Competency-based Assessment", "Experiential Learning in Mathematics", "Inclusive Education", "First Aid and Child Safety"][i % 4], provider: i % 2 ? "CBSE Centre of Excellence, Hyderabad" : "Red Cross Telangana", fromDate: day(`2026-0${5 + (i % 3)}-1${i}`), toDate: day(`2026-0${5 + (i % 3)}-1${i}`), hours: 6 + (i % 3) * 2, createdById: admin ?? null } });
    }
    const srinivas = by("Srinivas Murthy");
    if (srinivas) {
      await tx.promotionRecord.create({ data: { schoolId, staffId: srinivas.id, fromDesignation: "TGT Mathematics", toDesignation: "PGT Mathematics", fromDepartmentId: srinivas.departmentId, toDepartmentId: srinivas.departmentId, effectiveFrom: day("2025-06-01"), reason: "M.Sc completed and senior classes added", createdById: users.principal ?? null } });
    }
  }, { timeout: 120_000 });
};
