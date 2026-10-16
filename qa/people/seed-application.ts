// Stand-in for ONE step the browser cannot do here: the guardian's consent code.
// CEMS has no SMS/WhatsApp, so the counter form cannot be saved (D8a). This makes
// the application from a Demo enquiry through the same library calls the form
// uses, with the consent recorded as given at the counter, so the rest of the
// admission pipeline can be tested in the browser.
//   npx tsx --conditions=react-server --env-file=.env qa/people/seed-application.ts <enquiryId> <login>
import { prisma, withSchool } from "../../src/lib/db";
import { loadSettings } from "../../src/lib/admission/settings";
import { createApplication } from "../../src/lib/admission/applications";
import { admissionConsentTexts, DATA_CONSENT, recordConsents } from "../../src/lib/admission/consent";

const [enquiryId, login = "cems.admissions"] = process.argv.slice(2);
const user = await prisma.userLogin.findFirstOrThrow({ where: { username: login } });
const school = await prisma.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM school WHERE code = 'CEMS'`.catch(() => []);
const schoolId = school[0]?.id ?? process.env.CEMS_ID!;
const ctx = { schoolId, userId: user.id };
const app = await withSchool(ctx, async (tx) => {
  const e = await tx.enquiry.findFirstOrThrow({ where: { id: enquiryId } });
  const s = await loadSettings(tx, ctx);
  const campus = await tx.campus.findFirstOrThrow({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }] });
  const cls = await tx.schoolClass.findFirstOrThrow({ where: { name: process.env.CLASS ?? "Grade 5", archivedAt: null } });
  const [firstName, ...rest] = e.childName.split(" ");
  const app = await createApplication(tx, ctx, null, s, {
    classId: cls.id, yearId: e.academicYearId, firstName, lastName: rest.join(" ") || null, dateOfBirth: new Date(process.env.DOB ?? "2016-02-14T00:00:00Z"), gender: "Female",
    fatherName: e.parentName, motherName: "Demo Lakshmi Lanka", guardianName: null, guardianRelation: null, phone: e.phone, altPhone: null, email: null,
    address: "Demo address, Chekkapalli, Andhra Pradesh", previousSchool: "Demo Previous School", previousClass: "Grade 4", previousMarks: "82%",
    preferences: { transportNeeded: false, hostelNeeded: false }, category: null, religion: null, motherTongue: "Telugu", occupation: null, aadhaar: null,
  }, { campusId: campus.id, channel: "counter", enquiryId: e.id, force: true });
  const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId } });
  const texts = await admissionConsentTexts(tx, school.name);
  await recordConsents(tx, ctx, app, { types: [DATA_CONSENT], givenByName: e.parentName, howGiven: "admission-form-counter", texts, verifiedAt: new Date() });
  return app;
});
console.log(app.id, app.applicationNo);
await prisma.$disconnect();
