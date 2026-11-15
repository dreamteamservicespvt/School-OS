// Owner decisions 15 and 17 (15-11-2026).
// 15: a parent may have no phone. Moving in (the student import) brings the row
// in and marks the parent "Phone missing"; two families are never matched on an
// empty phone; messages skip the parent with "No phone"; Parent Link cannot be
// sent until a phone is added ("Add a phone first").
// 17: School Profile keeps a "WhatsApp number for parents" for the Parent Link
// footer, falling back to the office phone when that is a mobile.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { previewImport, runImport, undoImport } from "@/lib/importer";
import { noPhoneWritten, studentImport, STUDENT_IMPORT } from "@/lib/students/import";
import { studentUpdateImport } from "@/lib/students/update-import";
import { createGuardian, parentsWithPhone, updateGuardian } from "@/lib/students/guardians";
import { findDuplicates } from "@/lib/students/students";
import { phonesOfDifferentFamilies } from "@/lib/move-in/service";
import { createLink, guardiansWithPhone, maskPhone, sendToFamilies } from "@/lib/parent-link/links";
import { indianMobileDigits, parentWhatsappNumber, whatsappChatLink } from "@/lib/parent-link/contact";
import { planMessage } from "@/lib/messaging";
import { saveDetails } from "@/lib/settings/school-profile";
import { byHeadings } from "../helpers";
import { makeCommSchool } from "../communication/fixture";
import { addStudent, studentSchool } from "./fixtures";

let s: Awaited<ReturnType<typeof studentSchool>>;
beforeAll(async () => {
  s = await studentSchool();
});

const headers = ["Full name", "Class", "Section", "Date of birth", "Gender", "Father's or guardian's name", "Parent's phone", "Mother's name"];

describe("a parent with no phone (decision 15)", () => {
  it("reads '-', 'NA', 'nil' and zeros as no phone, never a real number", () => {
    for (const v of ["", "  ", "-", "--", "NA", "N/A", "nil", "None", "0", "0000000000"]) expect(noPhoneWritten(v)).toBe(true);
    for (const v of ["9876543210", "98765", "+91 98765 43210"]) expect(noPhoneWritten(v)).toBe(false);
  });

  it("the import brings in a row with no parent's phone, marks the parent Phone missing and never matches two families on it", async () => {
    const kind = studentImport(STUDENT_IMPORT, { sectionId: s.s5a, applyFeePlan: false });
    const rows = [
      ["Demo Nophone Anand", "", "", "11-02-2016", "Male", "Demo Bhaskar Nophone", "", "Demo Vani Nophone"],
      ["Demo Nophone Charan", "", "", "12-03-2016", "Male", "Demo Devendra Nophone", "NA", ""],
      ["Demo Nophone Eshwar", "", "", "13-04-2016", "Male", "Demo Fakir Nophone", "-", ""],
    ];
    const preview = await withSchool(s.ctx, (tx) => previewImport(tx, s.ctx, kind, rows, byHeadings(kind, headers)));
    // No "Parent's phone is empty", and no "same family?" question between the three empty phones.
    expect(preview.bad).toEqual([]);
    expect(preview.good.map((g) => g.line)).toEqual([2, 3, 4]);
    const batch = await withSchool(s.ctx, (tx) => runImport(tx, s.ctx, kind, "no-phones.csv", preview));
    expect(batch.added).toBe(3);
    const parents = await withSchool(s.ctx, (tx) => tx.guardian.findMany({ where: { name: { endsWith: "Nophone" } }, include: { students: true }, orderBy: { name: "asc" } }));
    // Three fathers and one mother, each their own record, none with a phone (never an empty text).
    expect(parents.map((g) => [g.name, g.phone, g.students.length])).toEqual([
      ["Demo Bhaskar Nophone", null, 1], ["Demo Devendra Nophone", null, 1], ["Demo Fakir Nophone", null, 1], ["Demo Vani Nophone", null, 1],
    ]);
    // Undo still works for rows with no phone.
    await withSchool(s.ctx, (tx) => undoImport(tx, s.ctx, batch.id));
    expect(await withSchool(s.ctx, (tx) => tx.guardian.count({ where: { name: { endsWith: "Nophone" }, archivedAt: null } }))).toBe(0);
  });

  it("a parent can be added and saved with no phone, and is never offered as 'already on record' for an empty phone", async () => {
    const a = await withSchool(s.ctx, (tx) => createGuardian(tx, s.ctx, { name: "Demo Empty One", relationship: "Father", phone: null }));
    const b = await withSchool(s.ctx, (tx) => createGuardian(tx, s.ctx, { name: "Demo Empty Two", relationship: "Father", phone: "" }));
    expect([a.phone, b.phone]).toEqual([null, null]);
    expect(await withSchool(s.ctx, (tx) => parentsWithPhone(tx, null))).toEqual([]);
    expect(await withSchool(s.ctx, (tx) => parentsWithPhone(tx, ""))).toEqual([]);
    // Adding the phone later is a change in the audit log, from "no phone".
    await withSchool(s.ctx, (tx) => updateGuardian(tx, s.ctx, a.id, { name: "Demo Empty One", relationship: "Father", phone: "9876577001" }));
    const log = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findFirst({ where: { recordType: "Guardian", recordId: a.id, action: "changed" } }));
    expect(log?.before).toMatchObject({ phone: null });
    expect(log?.after).toMatchObject({ phone: "9876577001" });
  });

  it("the duplicate check never takes two children for one because both parents have no phone", async () => {
    await addStudent(s.ctx, s.s5a, { fullName: "Demo Twin Check", guardianName: "Demo Dup Father", guardianPhone: null, dateOfBirth: new Date("2015-01-05T00:00:00Z") });
    // Same name, different birth date, no phone: not a match.
    const none = await withSchool(s.ctx, (tx) => findDuplicates(tx, { fullName: "Demo Twin Check", dateOfBirth: new Date("2015-07-07T00:00:00Z"), guardianPhone: null }));
    expect(none).toEqual([]);
    // Same name and birth date: still found, by the date.
    const byDob = await withSchool(s.ctx, (tx) => findDuplicates(tx, { fullName: "Demo Twin Check", dateOfBirth: new Date("2015-01-05T00:00:00Z"), guardianPhone: null }));
    expect(byDob.map((d) => d.why)).toEqual(["same name and date of birth"]);
  });

  it("the update import adds a phone to a parent who had none, and Undo takes it off again", async () => {
    const { student } = await addStudent(s.ctx, s.s5a, { guardianName: "Demo Later Phone", guardianPhone: null });
    const cols = byHeadings(studentUpdateImport, ["Admission number", "Parent's phone"]);
    const p = await withSchool(s.ctx, (tx) => previewImport(tx, s.ctx, studentUpdateImport, [[student.admissionNo, "9876577002"]], cols));
    expect(p.bad).toEqual([]);
    expect(p.good[0].value.changes).toEqual([{ label: "Parent's phone", from: "Phone missing", to: "9876577002" }]);
    const batch = await withSchool(s.ctx, (tx) => runImport(tx, s.ctx, studentUpdateImport, "phones.csv", p));
    const gid = p.good[0].value.guardianId!;
    expect((await withSchool(s.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: gid } }))).phone).toBe("9876577002");
    await withSchool(s.ctx, (tx) => undoImport(tx, s.ctx, batch.id));
    expect((await withSchool(s.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: gid } }))).phone).toBeNull();
  });

  it("Switching to School OS: parents with no phone are never 'a phone shared by different families'", () => {
    const kid = (id: string) => ({ studentId: id });
    expect(phonesOfDifferentFamilies([
      { name: "Ramesh", phone: null, students: [kid("a")] },
      { name: "Suresh", phone: null, students: [kid("b")] },
      { name: "Mahesh", phone: "", students: [kid("c")] },
    ])).toBe(0);
    expect(phonesOfDifferentFamilies([
      { name: "Ramesh", phone: "9876500011", students: [kid("a")] },
      { name: "Suresh", phone: "9876500011", students: [kid("b")] },
    ])).toBe(1);
  });
});

describe("messages and Parent Link for a parent with no phone (decision 15)", () => {
  let c: Awaited<ReturnType<typeof makeCommSchool>>;
  beforeAll(async () => {
    c = await makeCommSchool();
    // Kiran's father has no phone.
    await withSchool(c.ctx, (tx) => tx.guardian.update({ where: { id: c.otherFather.id }, data: { phone: null } }));
  });

  it("a message skips the parent with the reason 'No phone'", async () => {
    const plan = await withSchool(c.ctx, (tx) => planMessage(tx, c.ctx, { to: { guardianIds: [c.otherFather.id, c.father.id] }, channels: ["whatsapp"], text: "PTM on Saturday" }));
    expect(plan.rows.map((r) => r.candidate.name)).toEqual(["Srinivas Kumar"]);
    expect(plan.skipped).toEqual([expect.objectContaining({ reason: "No phone", count: 1, names: ["Other Section Father"] })]);
  });

  it("Parent Link is not made for a parent with no phone: 'Add a phone first'", async () => {
    await expect(withSchool(c.ctx, (tx) => createLink(tx, c.ctx, c.otherFather.id))).rejects.toThrow(/^Add a phone first\. Other Section Father has no phone/);
    expect(await withSchool(c.ctx, (tx) => guardiansWithPhone(tx, [c.otherFather.id, c.father.id]))).toEqual([c.father.id]);
    expect(maskPhone(null)).toBe("Phone missing");
    expect(maskPhone("9876500123")).toBe("+91 ••••• ••123");
  });

  it("sending links to families leaves out the parents with no phone and counts them", async () => {
    const r = await withSchool(c.ctx, (tx) => sendToFamilies(tx, c.ctx, [c.otherFather.id, c.teluguMother.id], { audienceLabel: "Test families" }));
    expect(r.made).toBe(1);
    expect(r.noPhone).toBe(1);
    expect(await withSchool(c.ctx, (tx) => tx.parentLink.count({ where: { guardianId: c.otherFather.id } }))).toBe(0);
    // Only parents with no phone left: nothing is made, and the reason is plain.
    await expect(withSchool(c.ctx, (tx) => sendToFamilies(tx, c.ctx, [c.otherFather.id], { audienceLabel: "Test families" }))).rejects.toThrow(/^Add a phone first/);
  });
});

describe("WhatsApp number for parents (decision 17)", () => {
  it("uses the School Profile number, else the office phone only when it is a mobile", () => {
    expect(parentWhatsappNumber({ phone: "040 2345 6789", parentWhatsapp: "+91 98480 22222" })).toBe("9848022222");
    expect(parentWhatsappNumber({ phone: "09848011111", parentWhatsapp: null })).toBe("9848011111");
    expect(parentWhatsappNumber({ phone: "040 2345 6789", parentWhatsapp: null })).toBeNull();
    expect(parentWhatsappNumber({ phone: null })).toBeNull();
    expect(indianMobileDigits("5876543210")).toBeNull();
    expect(whatsappChatLink("9848022222")).toBe("https://wa.me/919848022222");
  });

  it("is saved on School Profile with the change in the audit log, and an empty save leaves the office phone in use", async () => {
    const school = await withSchool(s.ctx, (tx) => tx.school.findUniqueOrThrow({ where: { id: s.ctx.schoolId } }));
    expect(school.parentWhatsapp).toBeNull();
    const base = { name: school.name, address: school.address ?? "Main road", phone: "04023456789", email: school.email ?? "office@school.test", website: null, affiliationNumber: null, gstin: null, brandColor: null };
    expect(await withSchool(s.ctx, (tx) => saveDetails(tx, s.ctx, { ...base, parentWhatsapp: "9848033333" }))).toBe(true);
    const log = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findFirst({ where: { recordType: "School", recordId: s.ctx.schoolId, action: "changed" }, orderBy: { at: "desc" } }));
    expect(log?.after).toMatchObject({ parentWhatsapp: "9848033333" });
    // Saved again without the field (an older form): the number stays.
    await withSchool(s.ctx, (tx) => saveDetails(tx, s.ctx, base));
    expect((await withSchool(s.ctx, (tx) => tx.school.findUniqueOrThrow({ where: { id: s.ctx.schoolId } }))).parentWhatsapp).toBe("9848033333");
    await withSchool(s.ctx, (tx) => saveDetails(tx, s.ctx, { ...base, parentWhatsapp: null }));
    expect((await withSchool(s.ctx, (tx) => tx.school.findUniqueOrThrow({ where: { id: s.ctx.schoolId } }))).parentWhatsapp).toBeNull();
  });
});
