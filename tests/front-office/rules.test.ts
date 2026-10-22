// Front Office rules (16-front-office.md §5 "Rules and mistake-proofing" and
// §9 "Done when"), on a real database: returning visitors fill in, the staff
// member is told, passes expire by themselves (also when scanned), ID proof
// follows the school's policy, only people on the approved pickup list can
// collect a child and every pickup makes a Pickup gate pass, desk enquiries
// reach Admissions with an owner and a follow-up, no double booking, and a
// walk-in request gets a number that can be searched.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { checkOutVisitor, checkPass, registerVisitor, returningVisitor, visitorStatus, type RegisterInput } from "@/lib/front-office/visitors";
import { pickupStudent, releaseStudent, refusedPickup, type Released } from "@/lib/front-office/pickup";
import { KeptRefusal } from "@/lib/front-office/problem";
import { bookAppointment, dayPlan, setAppointmentStatus } from "@/lib/front-office/appointments";
import { deskEnquiry, logCall } from "@/lib/front-office/calls";
import { addWalkIn } from "@/lib/front-office/desk";
import { frontOfficeSettings, passExpiryFor } from "@/lib/front-office/settings";
import { closedWords, maskPhone, passLine, phoneProblem, tidyVehicle, vehicleProblem } from "@/lib/front-office/words";
import { randomUUID } from "node:crypto";
import { as, at, currentOf, day, makeFrontOfficeSchool, TZ, type FoFixture } from "./fixture";

const visitor = (over: Partial<RegisterInput> = {}): RegisterInput => ({
  phone: "98663 21450", name: "Venu Gopal", purpose: "Meeting", meetStaffId: null, note: null, peopleCount: 1, photo: null,
  idProofType: null, idProofNo: null, vehicleNo: null, ...over,
});
const TODAY = "2026-10-14";
/** A release that went through (a wrong code would come back as a KeptRefusal). */
const released = (r: Released | KeptRefusal) => { if (r instanceof KeptRefusal) throw new Error(r.message); return r; };

describe("Front Office rules", () => {
  let f: FoFixture;
  beforeAll(async () => {
    f = await makeFrontOfficeSchool();
  });
  const desk = () => as(f, f.frontdesk.id);

  it("registers a visitor with a pass number, tells the staff member, and fills a returning visitor from the phone (Done when 1, 2)", async () => {
    const now = at(TODAY, "10:00");
    const r = await withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor({ meetStaffId: f.principalStaff.id }), { timeZone: TZ, now }));
    expect(r.visitor.passNo).toMatch(/^V-\d{4}$/);
    expect(r.told).toBe(true);
    const told = await withSchool(as(f, f.principal.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.principal.id, type: "visitor-arrived" } }));
    expect(told?.text).toContain("Venu Gopal");
    const back = await withSchool(desk(), (tx) => returningVisitor(tx, "+91 98663 21450", TZ));
    expect(back).toMatchObject({ kind: "visitor", name: "Venu Gopal", purpose: "Meeting", meetStaffId: f.principalStaff.id });
    // Checking out records the time out, and the pass stops working.
    const out = await withSchool(desk(), (tx) => checkOutVisitor(tx, desk(), r.visitor.id, { timeZone: TZ, now: at(TODAY, "10:30") }));
    expect(out.at.toISOString()).toBe(at(TODAY, "10:30").toISOString());
    const scan = await withSchool(desk(), (tx) => checkPass(tx, r.visitor.passNo, at(TODAY, "10:40")));
    expect(scan).toMatchObject({ kind: "visitor", status: "Out" });
    await expect(withSchool(desk(), (tx) => checkOutVisitor(tx, desk(), r.visitor.id, { timeZone: TZ, now: at(TODAY, "10:45") }))).rejects.toThrow(/already checked out/);
  });

  it("finds a parent of the school by phone when they have not visited before", async () => {
    const back = await withSchool(desk(), (tx) => returningVisitor(tx, "9849031277", TZ));
    expect(back).toMatchObject({ kind: "parent", name: "Rajesh Sharma" });
  });

  it("needs a person to meet for meetings and checks the phone and vehicle number", async () => {
    await expect(withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor(), { timeZone: TZ }))).rejects.toThrow("Choose who they are here to meet.");
    await expect(withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor({ purpose: "Delivery", phone: "12345" }), { timeZone: TZ }))).rejects.toThrow("Enter a 10-digit Indian mobile number");
    await expect(withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor({ purpose: "Delivery", vehicleNo: "HELLO" }), { timeZone: TZ }))).rejects.toThrow(/vehicle number/);
    expect(phoneProblem("+91 98480 12345")).toBe("");
    expect(vehicleProblem("ts08ez4410")).toBe("");
    expect(tidyVehicle("ts8ez4410")).toBe("TS 08 EZ 4410");
    expect(maskPhone("9876543210")).toBe("••••••3210");
  });

  it("lets a pass expire by itself at the set time, and a scan shows Expired (Done when 8)", async () => {
    const now = at(TODAY, "11:00");
    const r = await withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor({ phone: "9700000001", name: "Late Leaver", purpose: "Delivery" }), { timeZone: TZ, now }));
    // No periods are set, so the school day ends at 3:30 PM.
    expect(r.visitor.passExpiresAt.toISOString()).toBe(at(TODAY, "15:30").toISOString());
    expect(visitorStatus(r.visitor, at(TODAY, "15:00"))).toBe("In");
    expect(visitorStatus(r.visitor, at(TODAY, "15:31"))).toBe("Expired");
    const scan = await withSchool(desk(), (tx) => checkPass(tx, r.visitor.passNo.toLowerCase(), at(TODAY, "16:00")));
    expect(scan).toMatchObject({ kind: "visitor", status: "Expired" });
    // The desk closes it with the time they really left, never before they came in.
    await expect(withSchool(desk(), (tx) => checkOutVisitor(tx, desk(), r.visitor.id, { timeZone: TZ, leftAtMinute: 10 * 60, now: at(TODAY, "16:00") }))).rejects.toThrow(/before they came in/);
    const closed = await withSchool(desk(), (tx) => checkOutVisitor(tx, desk(), r.visitor.id, { timeZone: TZ, leftAtMinute: 15 * 60 + 40, now: at(TODAY, "16:00") }));
    expect(closed.at.toISOString()).toBe(at(TODAY, "15:40").toISOString());
    // A set expiry time wins over the end of the school day; a late arrival still gets an hour.
    const late = await withSchool(desk(), async (tx) => passExpiryFor(tx, desk(), { passExpiry: "18:00" }, TODAY, TZ, at(TODAY, "17:50")));
    expect(late.toISOString()).toBe(at(TODAY, "18:50").toISOString());
    expect(await withSchool(desk(), (tx) => checkPass(tx, "V-9999"))).toMatchObject({ kind: "none" });
  });

  it("follows the school's ID proof policy (Done when 9) and keeps only the last 4 digits readable", async () => {
    const free = await withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor({ phone: "9700000002", name: "No Id", purpose: "Delivery" }), { timeZone: TZ }));
    expect(free.visitor.idProofNo).toBeNull();
    await withSchool(desk(), async (tx) => { await frontOfficeSettings(tx, desk()); await tx.frontOfficeSetting.update({ where: { schoolId: f.school.id }, data: { idProofRequired: true } }); });
    await expect(withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor({ phone: "9700000003", name: "Needs Id", purpose: "Delivery" }), { timeZone: TZ })))
      .rejects.toThrow("ID proof is required by school policy");
    const ok = await withSchool(desk(), (tx) => registerVisitor(tx, desk(), visitor({ phone: "9700000003", name: "Has Id", purpose: "Delivery", idProofType: "Aadhaar", idProofNo: "1234 5678 4821" }), { timeZone: TZ }));
    expect(ok.visitor.idProofLast4).toBe("4821");
    expect(ok.visitor.idProofNo).not.toContain("4821");
    await withSchool(desk(), (tx) => tx.frontOfficeSetting.update({ where: { schoolId: f.school.id }, data: { idProofRequired: false } }));
  });

  it("shows a custody-restricted guardian in red and never lets them, or anyone off the list, collect the child (Done when 3)", async () => {
    const info = await withSchool(desk(), (tx) => pickupStudent(tx, desk(), f.aarav.id, day(TODAY)));
    const uncle = info!.people.find((p) => p.guardianId === f.uncle.id)!;
    expect(uncle).toMatchObject({ allowed: false, restriction: "Court order: may not collect the child." });
    expect(info!.people.some((p) => p.guardianId === f.neighbour.id)).toBe(false);
    const base = { studentId: f.aarav.id, photoMatch: true, code: null, reason: "Unwell", otherReason: null, minute: null };
    for (const guardianId of [f.uncle.id, f.neighbour.id]) {
      await expect(withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, guardianId }, { timeZone: TZ, codeCheck: false })))
        .rejects.toThrow("Not on Aarav’s pickup list. Call a registered guardian.");
    }
    expect(await withSchool(desk(), (tx) => tx.gatePass.count({ where: { studentId: f.aarav.id } }))).toBe(0);
    // "Someone not on this list is here": kept with the student's record; the class teacher is told.
    const refused = await withSchool(desk(), (tx) => refusedPickup(tx, desk(), f.aarav.id, "Suresh, neighbour", { timeZone: TZ }));
    expect(refused.told).toBe(true);
  });

  it("needs collector, photo check, reason and time, and makes a gate pass of kind Pickup (Done when 4, 12)", async () => {
    // The father has a photo on record, so the desk matches his face with it.
    await withSchool(as(f, null), (tx) => tx.guardian.update({ where: { id: f.father.id }, data: { photoFileId: randomUUID() } }));
    const base = { studentId: f.aarav.id, guardianId: f.father.id, code: null, otherReason: null, minute: null };
    await expect(withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, photoMatch: false, reason: "Unwell" }, { timeZone: TZ, codeCheck: false }))).rejects.toThrow(/face matches the photo/);
    await expect(withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, photoMatch: true, reason: "" }, { timeZone: TZ, codeCheck: false }))).rejects.toThrow("Choose a reason.");
    await expect(withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, photoMatch: true, reason: "Unwell" }, { timeZone: TZ, codeCheck: true }))).rejects.toThrow("Enter the 4-digit code the guardian received.");
    await expect(withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, code: "1234", photoMatch: true, reason: "Unwell" }, { timeZone: TZ, codeCheck: true }))).rejects.toThrow(/code has expired or was not sent/);
    const r = released(await withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, photoMatch: true, reason: "Doctor visit" }, { timeZone: TZ, codeCheck: false })));
    expect(r.pass).toMatchObject({ kind: "PICKUP", guardianId: f.father.id, collectorName: "Rajesh Sharma", collectorRelation: "Father", verification: "photo", reason: "Doctor visit", status: "ISSUED", sectionLabel: "1 A" });
    expect(r.pass.passNo).toMatch(/^GP-\d{4}-\d{4}$/);
    const audit = await withSchool(desk(), (tx) => tx.auditLogEntry.findFirst({ where: { recordType: "Gate Pass", recordId: r.pass.id } }));
    expect(audit).not.toBeNull();
    // One pass at a time per child, and the class teacher is told.
    await expect(withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, photoMatch: true, reason: "Unwell" }, { timeZone: TZ, codeCheck: false }))).rejects.toThrow(/already has gate pass/);
    const note = await withSchool(as(f, f.classTeacher.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.classTeacher.id, type: "early-pickup" } }));
    expect(note?.text).toContain("Aarav Sharma");
    expect(note?.text).toContain(": doctor visit.");
    // A reason typed under Other keeps its capitals (QA PEOPLE-19).
    await withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, studentId: f.diya.id, photoMatch: true, reason: "Other", otherReason: "Appointment with Dr. Rao at KGH" }, { timeZone: TZ, codeCheck: false }));
    const other = await withSchool(as(f, f.classTeacher.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.classTeacher.id, type: "early-pickup", text: { contains: "Diya" } } }));
    expect(other?.text).toContain(": Appointment with Dr. Rao at KGH.");
  });

  it("asks for ID proof or a call, never a photo match, when the guardian has no photo on record (QA FO-01)", async () => {
    const { kiran, mohan } = await withSchool(as(f, null), async (tx) => {
      const kiran = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: "ADM-7", firstName: "Kiran", lastName: "Pillai", fullName: "Kiran Pillai", status: "ACTIVE" } });
      await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: kiran.id, academicYearId: f.yearId, classId: f.c1, sectionId: f.section.id, rollNo: 7 } });
      const mohan = await tx.guardian.create({ data: { schoolId: f.school.id, name: "Mohan Pillai", relationship: "Father", phone: "9849031300" } });
      await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: kiran.id, guardianId: mohan.id, relationship: "Father", isPrimary: true } });
      return { kiran, mohan };
    });
    const info = await withSchool(desk(), (tx) => pickupStudent(tx, desk(), kiran.id, day(TODAY)));
    expect(info!.people[0]).toMatchObject({ guardianId: mohan.id, photoFileId: null, allowed: true });
    const base = { studentId: kiran.id, guardianId: mohan.id, code: null, reason: "Unwell", otherReason: null, minute: null };
    // A photo-match tick means nothing without a photo: it is refused.
    await expect(withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, photoMatch: true }, { timeZone: TZ, codeCheck: false })))
      .rejects.toThrow("No photo of Mohan on record. Check their ID proof, or call a registered parent or guardian.");
    // With the school's code check on, the code is still needed after the ID proof.
    await expect(withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, photoMatch: false, otherCheck: "call" }, { timeZone: TZ, codeCheck: true }))).rejects.toThrow("Enter the 4-digit code the guardian received.");
    const r = released(await withSchool(desk(), (tx) => releaseStudent(tx, desk(), { ...base, photoMatch: false, otherCheck: "id-proof" }, { timeZone: TZ, codeCheck: false })));
    expect(r.pass).toMatchObject({ kind: "PICKUP", collectorName: "Mohan Pillai", verification: "ID proof" });
  });

  it("names the holiday on a closed day instead of saying attendance is not marked (QA FO-02)", async () => {
    await withSchool(as(f, null), (tx) => tx.calendarEntry.create({ data: { schoolId: f.school.id, academicYearId: f.yearId, type: "holiday", title: "Test holidays", startDate: day("2026-11-02"), endDate: day("2026-11-03") } }));
    const closed = await withSchool(desk(), (tx) => pickupStudent(tx, desk(), f.diya.id, day("2026-11-02")));
    expect(closed!.closed).toEqual({ reason: "holiday", title: "Test holidays" });
    expect(closedWords(closed!.closed!)).toBe("School is closed today (Test holidays)");
    const open = await withSchool(desk(), (tx) => pickupStudent(tx, desk(), f.diya.id, day("2026-11-04")));
    expect(open!.closed).toBeNull();
    const sunday = await withSchool(desk(), (tx) => pickupStudent(tx, desk(), f.diya.id, day("2026-11-08")));
    expect(sunday!.closed).toEqual({ reason: "sunday", title: "Sunday" });
  });

  it("says today's pass expiry, the late visitor's hour and a closed day plainly (QA FO-03)", () => {
    const end = 15 * 60;
    expect(passLine(end, 10 * 60, null)).toBe("Today’s passes expire by themselves at 3:00 PM");
    expect(passLine(end, end - 10, null)).toBe("A pass made now lasts an hour");
    expect(passLine(end, 10 * 60, { reason: "holiday", title: "Dasara holidays" })).toBe("School is closed today (Dasara holidays) · today’s passes expire by themselves at 3:00 PM");
  });

  it("sends a desk enquiry straight to Admission Management with an owner and a follow-up (Done when 5)", async () => {
    const current = await currentOf(f, f.frontdesk.id);
    const r = await withSchool(desk(), (tx) => deskEnquiry(tx, desk(), current, { childName: "Advik Rao", parentName: "Swapnil Rao", phone: "98491 22086", classId: f.c1, source: "walk-in", note: null }, { timeZone: TZ }));
    const e = await withSchool(as(f, f.counsellor.id), (tx) => tx.enquiry.findUniqueOrThrow({ where: { id: r.enquiry.id } }));
    expect(e).toMatchObject({ source: "walk-in", childName: "Advik Rao", phone: "9849122086" });
    // Owner from "Who gets new enquiries" (here the default: whoever takes it at the desk).
    expect(e.ownerStaffId).toBe(f.frontdeskStaff);
    expect(e.nextFollowUpAt).not.toBeNull();
    expect(r.owner).toBe("Kavitha Staff");
    // A phone call about admission makes the enquiry in the same step.
    const call = await withSchool(desk(), (tx) => logCall(tx, desk(), current, { direction: "IN", phone: "9030451127", name: "Praveen Goud", purpose: "Admission enquiry", note: null, childName: "Rudra Goud", classId: f.c2, followUp: null }, { timeZone: TZ }));
    expect(call.enquiryNo).toBeTruthy();
    expect(call.call.status).toBe("FOLLOW_UP");
    const phoned = await withSchool(desk(), (tx) => tx.enquiry.findFirstOrThrow({ where: { id: call.call.enquiryId! } }));
    expect(phoned.source).toBe("phone");
  });

  it("does not let the Principal be booked twice at the same time (Done when 6)", async () => {
    const now = at(TODAY, "08:00");
    const day2 = "2026-10-15";
    const input = { staffId: f.principalStaff.id, dayIso: day2, startMin: 11 * 60, lengthMin: 30, visitorName: "Prakash Reddy", visitorPhone: "9848055120", purpose: "Sports quota admission", confirm: false };
    const first = await withSchool(desk(), (tx) => bookAppointment(tx, desk(), input, { timeZone: TZ, now }));
    expect(first.appointment.status).toBe("BOOKED");
    await expect(withSchool(desk(), (tx) => bookAppointment(tx, desk(), { ...input, startMin: 11 * 60 + 15, lengthMin: 15, visitorName: "Someone Else", visitorPhone: "9848055121" }, { timeZone: TZ, now })))
      .rejects.toThrow("The Principal already has a meeting at 11:00 AM. Pick another slot.");
    const plan = await withSchool(desk(), (tx) => dayPlan(tx, desk(), f.principalStaff.id, day2, { timeZone: TZ, now, length: 15 }));
    expect(plan!.free).not.toContain(11 * 60);
    expect(plan!.free).not.toContain(11 * 60 + 15);
    expect(plan!.free).toContain(11 * 60 + 30);
    // A cancelled meeting frees the time again.
    await withSchool(desk(), (tx) => setAppointmentStatus(tx, desk(), first.appointment.id, "CANCELLED", { timeZone: TZ, now }));
    const again = await withSchool(desk(), (tx) => bookAppointment(tx, desk(), { ...input, visitorName: "Someone Else", visitorPhone: "9848055121" }, { timeZone: TZ, now }));
    expect(again.appointment.startMin).toBe(11 * 60);
    await expect(withSchool(desk(), (tx) => bookAppointment(tx, desk(), { ...input, dayIso: "2026-10-13" }, { timeZone: TZ, now }))).rejects.toThrow(/has passed/);
  });

  it("says when the asked-for confirmation could not be sent (QA PEOPLE-17)", async () => {
    const now = at(TODAY, "08:00");
    const input = { staffId: f.principalStaff.id, dayIso: "2026-10-16", startMin: 12 * 60, lengthMin: 15, visitorName: "Demo Visitor Rao", visitorPhone: "9848055130", purpose: "Fee query", confirm: true };
    const r = await withSchool(desk(), (tx) => bookAppointment(tx, desk(), input, { timeZone: TZ, now }));
    expect(r.sent).toBeNull();
    expect(r.notSent).toMatch(/No WhatsApp or SMS is set up/);
    expect(r.appointment.confirmationSent).toBe(false);
  });

  it("gives every walk-in request a number and a department, and finds it by that number (Done when 11)", async () => {
    const a = await withSchool(desk(), (tx) => addWalkIn(tx, desk(), { fromName: "", fromPhone: null, guardianId: f.father.id, studentId: f.aarav.id, request: "Bonafide certificate for passport", department: "Office", note: null, givenBy: "slip" }, { timeZone: TZ }));
    const b = await withSchool(desk(), (tx) => addWalkIn(tx, desk(), { fromName: "Walk In", fromPhone: "9700000004", guardianId: null, studentId: null, request: "Fee statement", department: "Accounts", note: null, givenBy: "slip" }, { timeZone: TZ }));
    expect(a.request.requestNo).toMatch(/^REQ-\d{4}-\d{4}$/);
    expect(a.request.requestNo).not.toBe(b.request.requestNo);
    expect(a.request).toMatchObject({ fromName: "Rajesh Sharma", about: "Father of Aarav Sharma", department: "Office" });
    // Office goes to the School Admin as a task.
    expect(a.handler?.loginId).toBe(f.admin.id);
    expect(a.request.taskId).not.toBeNull();
    const found = await withSchool(desk(), (tx) => tx.walkInRequest.findMany({ where: { requestNo: { contains: a.request.requestNo.toLowerCase(), mode: "insensitive" } } }));
    expect(found.map((x) => x.id)).toEqual([a.request.id]);
    await expect(withSchool(desk(), (tx) => addWalkIn(tx, desk(), { fromName: "Walk In", fromPhone: null, guardianId: null, studentId: null, request: "Fee statement", department: "Accounts", note: null, givenBy: "whatsapp" }, { timeZone: TZ })))
      .rejects.toThrow(/Enter their phone/);
  });
});
