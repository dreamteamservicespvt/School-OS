// Student Management demo: settings with the optional parts on, a signatory,
// the promotion policy, behaviour records (some in Ravi Teja's Class 5 A),
// a counselling case, notes, a student leaving, one who left, an issued
// bonafide certificate, and an alumnus with a donation and a job post.
import { randomBytes } from "node:crypto";
import { withSchool } from "../../src/lib/db";
import { nextNumber } from "../../src/lib/sequences";
import type { ModuleSeed } from "./types";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const code = () => Array.from(randomBytes(16), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

export const seedStudents: ModuleSeed = async (school) => {
  await withSchool(school.ctx, async (tx) => {
    await tx.studentSettings.upsert({
      where: { schoolId: school.schoolId },
      create: { schoolId: school.schoolId, pointsOn: school.full, counsellingOn: school.full, careerOn: school.full, alumniOn: school.full, qrOn: true },
      update: {},
    });
    const principalId = school.users.principal ?? null;
    const signatory = await tx.signatory.create({ data: { schoolId: school.schoolId, title: "Principal", name: "Lakshmi Rao" } });
    await tx.studentSettings.update({ where: { schoolId: school.schoolId }, data: { defaultSignatories: { TC: signatory.id, BONAFIDE: signatory.id, STUDY: signatory.id, CHARACTER: signatory.id } } });
    await tx.promotionPolicy.create({ data: { schoolId: school.schoolId, academicYearId: school.yearId, version: 1, passRequired: true, minAttendancePct: 75, feeDuesAllowed: true, exceptionApproverRole: "principal", createdById: principalId } });
    if (!school.full) return;

    const year = await tx.academicYear.findUniqueOrThrow({ where: { id: school.yearId } });
    const fiveA = await tx.section.findFirst({ where: { academicYearId: school.yearId, name: "A", schoolClass: { name: "Class 5" } } });
    const tenA = await tx.section.findFirst({ where: { academicYearId: school.yearId, name: "A", schoolClass: { name: "Class 10" } } });
    if (!fiveA || !tenA) return;
    const inSection = (sectionId: string) => tx.enrolment.findMany({ where: { sectionId, archivedAt: null }, include: { student: true }, orderBy: { rollNo: "asc" } });
    const five = await inSection(fiveA.id);
    const ten = await inSection(tenA.id);
    const teacherId = school.users.teacher ?? principalId;
    const start = year.startDate.toISOString().slice(0, 10);
    const d = (offsetDays: number) => new Date(year.startDate.getTime() + offsetDays * 86400000);

    // Behaviour: incidents and rewards, with points.
    const records = [
      { s: [five[0]], typeKey: "homework", kind: "incident", points: -1, text: "Maths homework not done for the second day.", days: 20 },
      { s: [five[1], five[2]], typeKey: "disrupt", kind: "incident", points: -2, text: "Talking loudly during the maths test.", days: 34 },
      { s: [five[3]], typeKey: "helping", kind: "reward", points: 2, text: "Helped a new classmate catch up with fractions.", days: 41 },
      { s: [five[4]], typeKey: "competition", kind: "recognition", points: 5, text: "First prize in the inter-school maths quiz.", days: 55 },
      { s: [ten[0]], typeKey: "warning", kind: "warning", points: -3, text: "Used a mobile phone in class after a reminder.", days: 48 },
    ];
    let firstIncidentId: string | null = null;
    for (const r of records) {
      const inc = await tx.behaviourIncident.create({
        data: { schoolId: school.schoolId, academicYearId: school.yearId, typeKey: r.typeKey, kind: r.kind, date: d(r.days), description: r.text, reportedById: teacherId, status: r.kind === "incident" ? "OPEN" : "CLOSED", actionTaken: r.kind === "warning" ? "Phone kept in the office until the end of the day." : null },
      });
      firstIncidentId ??= inc.id;
      for (const e of r.s) {
        await tx.behaviourIncidentStudent.create({ data: { schoolId: school.schoolId, incidentId: inc.id, studentId: e.studentId } });
        await tx.behaviourPointEntry.create({ data: { schoolId: school.schoolId, studentId: e.studentId, points: r.points, reason: r.text, incidentId: inc.id, createdById: teacherId } });
      }
    }

    // Counselling: one open case referred from an incident.
    const cs = await tx.counsellingCase.create({
      data: { schoolId: school.schoolId, studentId: five[1].studentId, reason: "Often distracted and upset in class since last month.", referredById: teacherId, incidentId: firstIncidentId, counsellorId: principalId, openedOn: d(36), actionPlan: "Weekly talk; check in with the parents after two weeks.", nextSessionOn: d(50) },
    });
    await tx.counsellingSession.create({ data: { schoolId: school.schoolId, caseId: cs.id, date: d(43), summary: "First talk. The student settled after a while.", createdById: principalId } });

    // Notes on the profile.
    await tx.studentNote.create({ data: { schoolId: school.schoolId, studentId: five[0].studentId, text: "Sits in the front row because of short sight.", authorId: teacherId } });
    await tx.studentNote.create({ data: { schoolId: school.schoolId, studentId: five[1].studentId, text: "Parents are going through a separation; speak gently.", visibleToRoles: ["principal"], authorId: principalId } });

    // Leaving: one transfer in progress (clearance passes: no fee or library checks yet).
    const leaving = ten[1];
    await tx.leavingRequest.create({
      data: { schoolId: school.schoolId, studentId: leaving.studentId, type: "TRANSFER", reason: "Family moving to another city", lastDate: d(200), destinationSchool: "Kendriya Vidyalaya, Pune", previousStatus: leaving.student.status, createdById: principalId },
    });

    // Left: a withdrawal that is complete; the record stays.
    const left = ten[2];
    const leftOn = d(60);
    await tx.leavingRequest.create({
      data: { schoolId: school.schoolId, studentId: left.studentId, type: "WITHDRAWAL", reason: "Health reasons", lastDate: leftOn, previousStatus: left.student.status, status: "LEFT", leftOn, createdById: principalId },
    });
    await tx.student.update({ where: { id: left.studentId }, data: { status: "WITHDRAWN", leavingDate: leftOn, leavingReason: "Health reasons" } });
    await tx.enrolment.update({ where: { id: left.id }, data: { status: "LEFT" } });

    // An issued bonafide certificate with a QR check code.
    const s = five[2];
    const n = await nextNumber(tx, school.ctx, `certificate:BONAFIDE:${year.name}`);
    const father = await tx.studentGuardian.findFirst({ where: { studentId: s.studentId, relationship: "Father" }, include: { guardian: true } });
    await tx.certificate.create({
      data: {
        schoolId: school.schoolId, studentId: s.studentId, type: "BONAFIDE", number: `BONAFIDE/${year.name}/${String(n).padStart(4, "0")}`, purpose: "bank account opening",
        issueDate: d(30), signatoryId: signatory.id, status: "ISSUED", verifyCode: code(), requestedById: principalId, issuedById: principalId, issuedAt: d(30),
        data: { name: s.student.fullName, admissionNo: s.student.admissionNo, gender: s.student.gender, father: father?.guardian.name ?? "", mother: "", dateOfBirth: s.student.dateOfBirth?.toISOString().slice(0, 10) ?? null, lastClass: "Class 5 A", lastClassName: "Class 5", lastYear: year.name, joinedOn: s.student.joiningDate?.toISOString().slice(0, 10) ?? start, conduct: "Good" },
      },
    });

    // An alumnus from an earlier batch, with a donation, a mentee and a job post.
    const alum = await tx.student.create({
      data: { schoolId: school.schoolId, campusId: school.campusId, admissionNo: `${school.code}/2014/0007`, firstName: "Karthik", lastName: "Varma", fullName: "Karthik Varma", gender: "Male", dateOfBirth: day("2004-06-11"), status: "ALUMNI", joiningDate: day("2014-06-10"), leavingDate: day("2022-03-31"), leavingReason: "Finished the last class" },
    });
    const a = await tx.alumniRecord.create({ data: { schoolId: school.schoolId, studentId: alum.id, graduationYear: "2021-22", phone: "9876512345", email: "karthik.varma@example.com", career: "Software engineer", higherEducation: "B.Tech, JNTU Hyderabad", achievements: "State rank 212 in EAMCET.", isMentor: true, createdById: principalId } });
    await tx.alumniDonation.create({ data: { schoolId: school.schoolId, alumniId: a.id, amountPaise: BigInt(2500000), date: d(15), purpose: "Library books", createdById: principalId } });
    await tx.alumniMentorship.create({ data: { schoolId: school.schoolId, alumniId: a.id, studentId: ten[3].studentId, note: "Guidance for engineering entrance exams.", createdById: principalId } });
    await tx.jobPost.create({ data: { schoolId: school.schoolId, title: "Junior accountant", organisation: "Sai Traders, Ameerpet", location: "Hyderabad", description: "B.Com graduates. Tally and GST filing. Freshers welcome.", contact: "Call 9876543210 or email jobs@saitraders.example", postedById: principalId } });
  }, { timeout: 60_000 });
};
