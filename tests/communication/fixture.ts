// A small school for Communication tests: one year, Class 5 with sections A
// and B, a class teacher for 5 A, students with guardians (two of them
// brothers sharing parents), staff, channels in test mode and some credits.
import { randomUUID } from "node:crypto";
import { withSchool } from "@/lib/db";
import { encryptSecrets } from "@/lib/messaging/channels";
import { ensureReadyTemplates } from "@/lib/messaging/templates";
import { makeSchool, makeUser } from "../helpers";

let phoneSeq = 7000000000 + Math.floor(Math.random() * 90000000);
const nextPhone = () => String(++phoneSeq);

export async function makeCommSchool(opts: { credits?: number; channelsOn?: boolean } = {}) {
  const school = await makeSchool("Comm School");
  const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Principal Person" });
  const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["class-teacher"] }], name: "Teacher Person" });
  const ctx = { schoolId: school.id, userId: principal.id };
  const ids = await withSchool(ctx, async (tx) => {
    await tx.school.update({ where: { id: school.id }, data: { phone: "9876500001", smsDltEntityId: "1201159000000000001", smsSenderHeader: "SUNSCH" } });
    const year = await tx.academicYear.create({ data: { schoolId: school.id, campusId: school.campus.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: school.id, campusId: school.campus.id, name: "Class 5", sortOrder: 5 } });
    const teacherStaff = await tx.staff.create({ data: { schoolId: school.id, campusId: school.campus.id, staffCode: `T${randomUUID().slice(0, 6)}`, firstName: "Teacher", fullName: "Teacher Person", phone: nextPhone(), designation: "TGT", joiningDate: new Date("2020-06-01"), userLoginId: teacher.id } });
    const officeStaff = await tx.staff.create({ data: { schoolId: school.id, campusId: school.campus.id, staffCode: `S${randomUUID().slice(0, 6)}`, firstName: "Office", fullName: "Office Person", phone: nextPhone(), designation: "Clerk", staffType: "Non-teaching", joiningDate: new Date("2020-06-01") } });
    const a = await tx.section.create({ data: { schoolId: school.id, classId: cls.id, academicYearId: year.id, name: "A", classTeacherId: teacherStaff.id } });
    const b = await tx.section.create({ data: { schoolId: school.id, classId: cls.id, academicYearId: year.id, name: "B" } });

    async function student(name: string, sectionId: string, guardians: { id: string; rel: string; primary: boolean }[]) {
      const s = await tx.student.create({ data: { schoolId: school.id, campusId: school.campus.id, admissionNo: `A${randomUUID().slice(0, 6)}`, firstName: name.split(" ")[0], fullName: name } });
      await tx.enrolment.create({ data: { schoolId: school.id, studentId: s.id, academicYearId: year.id, classId: cls.id, sectionId } });
      for (const g of guardians) await tx.studentGuardian.create({ data: { schoolId: school.id, studentId: s.id, guardianId: g.id, relationship: g.rel, isPrimary: g.primary } });
      return s;
    }
    const guardian = (name: string, rel: string, extra: { optedOut?: boolean; language?: string; phone?: string } = {}) =>
      tx.guardian.create({ data: { schoolId: school.id, name, relationship: rel, phone: extra.phone ?? nextPhone(), language: extra.language ?? "en", optedOut: extra.optedOut ?? false } });

    const father = await guardian("Srinivas Kumar", "Father");
    const mother = await guardian("Lakshmi Kumar", "Mother");
    const ravi = await student("Ravi Kumar", a.id, [{ id: father.id, rel: "Father", primary: true }, { id: mother.id, rel: "Mother", primary: false }]);
    const sita = await student("Sita Kumar", b.id, [{ id: father.id, rel: "Father", primary: true }, { id: mother.id, rel: "Mother", primary: false }]);
    const optFather = await guardian("Opted Out Father", "Father", { optedOut: true });
    const anil = await student("Anil Rao", a.id, [{ id: optFather.id, rel: "Father", primary: true }]);
    const teluguMother = await guardian("Padma Reddy", "Mother", { language: "te" });
    const priya = await student("Priya Reddy", a.id, [{ id: teluguMother.id, rel: "Mother", primary: true }]);
    const otherFather = await guardian("Other Section Father", "Father");
    const kiran = await student("Kiran Das", b.id, [{ id: otherFather.id, rel: "Father", primary: true }]);

    if (opts.channelsOn !== false) {
      for (const channel of ["whatsapp", "sms", "email"]) {
        await tx.messagingChannel.create({ data: { schoolId: school.id, channel, provider: "sandbox", isOn: true, environment: "test", ...(channel === "whatsapp" ? encryptSecrets({ appSecret: "app-secret-1234", verifyToken: "verify-me", accessToken: "x" }) : channel === "sms" ? encryptSecrets({ webhookKey: "msg91-key-123456" }) : {}) } });
      }
    }
    const credits = opts.credits ?? 1000;
    if (credits) {
      await tx.creditLedgerEntry.create({ data: { schoolId: school.id, channel: "whatsapp", amount: credits, note: "Test top-up" } });
      await tx.creditLedgerEntry.create({ data: { schoolId: school.id, channel: "sms", amount: credits, note: "Test top-up" } });
    }
    await ensureReadyTemplates(tx, ctx);
    return { year, cls, a, b, teacherStaff, officeStaff, father, mother, optFather, teluguMother, otherFather, ravi, sita, anil, priya, kiran };
  });
  return { school, principal, teacher, ctx, ...ids };
}

export async function templateId(ctx: { schoolId: string; userId: string | null }, key: string, channel: string) {
  return withSchool(ctx, async (tx) => (await tx.template.findFirstOrThrow({ where: { schoolId: ctx.schoolId, key, channel } })).id);
}

/** Gives every SMS template version of a key a DLT template ID. */
export async function addDlt(ctx: { schoolId: string; userId: string | null }, key: string) {
  await withSchool(ctx, async (tx) => {
    const t = await tx.template.findFirstOrThrow({ where: { schoolId: ctx.schoolId, key, channel: "sms" } });
    await tx.templateVersion.updateMany({ where: { templateId: t.id }, data: { dltTemplateId: "1107160000000012345" } });
  });
}
