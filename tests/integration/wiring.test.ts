// The hand-offs between modules built side by side: invites, sign-in codes,
// staff messages, behaviour notes and Student List recipients go through
// Communication's messaging API; Student Management uses Communication's
// Parent Link (status, resend, revoke) and consent; certificates and ID cards
// print with Settings' document designs.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { findInvite } from "@/lib/auth/invites";
import { deliverCode, deliverCodeTo, startChallenge } from "@/lib/auth/two-step";
import { inviteUser, resendInvite } from "@/lib/settings/users";
import { withHiddenLinks, withRealLinks } from "@/lib/parent-link/token";
import { messageStaff } from "@/lib/staff/staff-message";
import { reportIncident } from "@/lib/students/behaviour";
import { parentLinkProvider } from "@/lib/students/guardians";
import "@/lib/students/provider-modules";
import { consentRows, photoConsentStands, requestConsent as requestFromStudents, withdrawConsent } from "@/lib/students/consent";
import { askConsentCode, confirmConsent, standingConsents } from "@/lib/parent-link/consent";
import { readAudienceForm } from "@/lib/communication/send-form";
import { planMessage } from "@/lib/messaging";
import { certificateHtml, printContext } from "@/lib/students/certificates";
import { idCardsHtml, sectionCards } from "@/lib/students/id-cards";
import { notify } from "@/lib/notifications";
import { addDlt, makeCommSchool } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
const device = { userAgent: "Wiring test", ipAddress: "10.0.0.4" };

beforeAll(async () => {
  s = await makeCommSchool();
});

const teacherRole = () => withSchool(s.ctx, async (tx) => (await tx.role.findFirstOrThrow({ where: { key: "teacher" } })).id);
const recipientsOf = (messageId: string) => withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId } }));

describe("invites go out through Communication", () => {
  it("sends the invite link by WhatsApp and email, keeping only a placeholder in Message History", async () => {
    const role = await teacherRole();
    const r = await withSchool(s.ctx, (tx) =>
      inviteUser(tx, s.ctx, { displayName: "Meena Iyer", phone: "9876512345", email: "meena@example.com", username: `meena.w.${Date.now()}`, roleIds: [role], scope: "WHOLE_SCHOOL", campusId: null, staffId: null }),
    );
    expect(r.sent.sentBy).toEqual(["WhatsApp", "email"]);
    expect((await findInvite(r.token))?.id).toBe(r.login.id);
    const rows = await recipientsOf(r.sent.messageId!);
    expect(rows.map((x) => x.channel).sort()).toEqual(["email", "whatsapp"]);
    for (const row of rows) {
      expect(row.recipientType).toBe("login");
      expect(row.userLoginId).toBe(r.login.id);
      // The working link is never stored; it is put in only when handed to the provider.
      expect(row.text).not.toContain(r.token);
      expect(withRealLinks(row.text)).toContain(`/invite/${r.token}`);
      expect(withHiddenLinks(row.text)).toContain("[personal invite link]");
    }
    expect(rows.find((x) => x.channel === "whatsapp")!.address).toBe("9876512345");

    // A new link goes out again; the old one stops working.
    const again = await withSchool(s.ctx, (tx) => resendInvite(tx, s.ctx, r.login.id));
    expect(again.sent.sentBy).toEqual(["WhatsApp", "email"]);
    expect(await findInvite(r.token)).toBeNull();
    const second = await recipientsOf(again.sent.messageId!);
    expect(withRealLinks(second[0].text)).toContain(`/invite/${again.token}`);
  });

  it("still invites when no channel is on: the link is shown on screen only", async () => {
    const off = await makeCommSchool({ channelsOn: false });
    const role = await withSchool(off.ctx, async (tx) => (await tx.role.findFirstOrThrow({ where: { key: "teacher" } })).id);
    const r = await withSchool(off.ctx, (tx) =>
      inviteUser(tx, off.ctx, { displayName: "No Channel", phone: "9876512399", email: null, username: `nochannel.${Date.now()}`, roleIds: [role], scope: "WHOLE_SCHOOL", campusId: null, staffId: null }),
    );
    expect(r.sent.sentBy).toEqual([]);
    expect(r.sent.note).toMatch(/copy the link/);
    expect(await withSchool(off.ctx, (tx) => tx.message.count({ where: { sourceType: "User Login" } }))).toBe(0);
  });
});

describe("two-step sign-in codes", () => {
  it("go by SMS when the school's SMS channel is on and its template has a DLT ID", async () => {
    await prisma.userLogin.update({ where: { id: s.principal.id }, data: { phone: "9876543299", email: null } });
    // No DLT template ID yet: SMS is not used (rule 34).
    const before = await deliverCode({ email: null, phone: "9876543299", name: "Principal Person", schoolId: s.school.id, userLoginId: s.principal.id, key: "k-no-dlt" }, "123456");
    expect(before).not.toMatchObject({ channel: "sms" });

    await addDlt(s.ctx, "sign-in-code");
    const sent = await startChallenge(s.principal.id, s.school.id, device);
    expect(sent).toMatchObject({ ok: true, channel: "sms" });
    const msg = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { sourceType: "User Login", sourceId: s.principal.id, trigger: { startsWith: "Sign-in code" } }, include: { recipients: true } }));
    expect(msg.recipients).toHaveLength(1);
    expect(msg.recipients[0]).toMatchObject({ channel: "sms", address: "9876543299" });
    expect(msg.recipients[0].text).toMatch(/^\d{6} is your School OS sign-in code/);
  });

  it("a code to confirm a new mobile number goes to that new number", async () => {
    const r = await deliverCodeTo({ email: null, phone: "9876500001", name: "Principal Person", schoolId: s.school.id, userLoginId: s.principal.id, key: "k-new-phone" }, "246810", "change-phone");
    expect(r).toMatchObject({ channel: "sms" });
    const msg = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { idempotencyKey: "change-phone:k-new-phone" }, include: { recipients: true } }));
    expect(msg.recipients[0]).toMatchObject({ channel: "sms", address: "9876500001" });
    expect(msg.recipients[0].text).toContain("246810");
  });

  it("fall back to email (or the log in development) when SMS is off", async () => {
    await withSchool(s.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "sms" } }, data: { isOn: false } }));
    const r = await deliverCode({ email: null, phone: "9876543299", name: "Principal Person", schoolId: s.school.id, userLoginId: s.principal.id, key: "k-off" }, "654321");
    expect(r).toMatchObject({ channel: "log" });
    await withSchool(s.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "sms" } }, data: { isOn: true } }));
  });
});

describe("Staff List, Send message", () => {
  it("sends WhatsApp copies through Communication and app notifications to staff with a login", async () => {
    const r = await withSchool(s.ctx, (tx) => messageStaff(tx, s.ctx, { staffIds: [s.teacherStaff.id, s.officeStaff.id], text: "Staff meeting at 3 PM today.", channels: ["whatsapp"], senderName: "Principal Person", key: "6f0c1d1e-0000-4000-8000-000000000001" }));
    expect(r.inApp).toBe(1);
    expect(r.copies?.people).toBe(2);
    const rows = await recipientsOf(r.copies!.messageId);
    expect(rows.map((x) => x.staffId).sort()).toEqual([s.teacherStaff.id, s.officeStaff.id].sort());
    expect(rows[0].text).toContain("Staff meeting at 3 PM today.");
    // The same key never sends twice.
    const again = await withSchool(s.ctx, (tx) => messageStaff(tx, s.ctx, { staffIds: [s.teacherStaff.id, s.officeStaff.id], text: "Staff meeting at 3 PM today.", channels: ["whatsapp"], senderName: "Principal Person", key: "6f0c1d1e-0000-4000-8000-000000000001" }));
    expect(again.copies?.messageId).toBe(r.copies!.messageId);
  });

  it("refuses SMS without a DLT template ID", async () => {
    await expect(withSchool(s.ctx, (tx) => messageStaff(tx, s.ctx, { staffIds: [s.officeStaff.id], text: "Hello", channels: ["sms"], senderName: "P", key: "6f0c1d1e-0000-4000-8000-000000000002" }))).rejects.toThrow(/DLT template ID/);
  });
});

describe("Student Management and Communication", () => {
  it("Send message from the Student List reaches the chosen students' main contacts", async () => {
    const fd = new FormData();
    fd.append("guardiansOf", s.ravi.id);
    fd.append("guardiansOf", s.priya.id);
    const to = readAudienceForm(fd);
    expect(to?.guardiansOf).toEqual([s.ravi.id, s.priya.id]);
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: to!, channels: ["whatsapp"], text: "PTM on Saturday." }));
    expect(plan.rows.map((r) => r.candidate.name).sort()).toEqual(["Padma Reddy", "Srinivas Kumar"]);
  });

  it("a behaviour record with Inform parent sends the Behaviour note to the main contact", async () => {
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const inc = await withSchool(s.ctx, (tx) => reportIncident(tx, s.ctx, { studentIds: [s.ravi.id], typeKey: "late", description: "Came late to assembly", date: today, informParent: true }));
    expect(inc.parentInformed).toBe(true);
    expect(inc.parentMessage?.sent).toBe(true);
    const rows = await recipientsOf(inc.parentMessage!.messageId!);
    expect(rows.map((r) => r.name)).toEqual(["Srinivas Kumar"]);
    expect(rows[0].text).not.toContain("Came late to assembly");
  });

  it("Parent Link is registered for the Parent & Guardian screens: status, resend and revoke", async () => {
    const provider = parentLinkProvider();
    expect(provider).not.toBeNull();
    const g = s.otherFather.id;
    expect((await withSchool(s.ctx, (tx) => provider!.status(tx, s.ctx, [g]))).get(g)).toBeUndefined();
    const to = await withSchool(s.ctx, (tx) => provider!.resend(tx, s.ctx, g));
    expect(to).toMatch(/^\+91 ••••• ••\d{3}$/);
    expect((await withSchool(s.ctx, (tx) => provider!.status(tx, s.ctx, [g]))).get(g)?.status).toBe("Active");
    const first = await withSchool(s.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: g, status: "ACTIVE" } }));
    await withSchool(s.ctx, (tx) => provider!.revoke(tx, s.ctx, g));
    const links = await withSchool(s.ctx, (tx) => tx.parentLink.findMany({ where: { guardianId: g }, orderBy: { createdAt: "asc" } }));
    expect(links.find((l) => l.id === first.id)?.status).toBe("REVOKED");
    expect(links.filter((l) => l.status === "ACTIVE")).toHaveLength(1);
    expect((await withSchool(s.ctx, (tx) => provider!.status(tx, s.ctx, [g]))).get(g)?.status).toBe("Active");
  });

  it("consent asked from Student Management is given on Parent Link, and both sides agree", async () => {
    const texts = await withSchool(s.ctx, async (tx) => ({
      data: await tx.consentText.create({ data: { schoolId: s.school.id, consentType: "data-processing", title: "Use of your child's data", version: 1, text: { en: "We use your child's details to run the school." } } }),
      photo: await tx.consentText.create({ data: { schoolId: s.school.id, consentType: "photo", title: "Photo consent", version: 1, text: { en: "We may use photos of your child." } } }),
    }));
    const g = s.teluguMother.id;
    const asked = await withSchool(s.ctx, (tx) => requestFromStudents(tx, s.ctx, [g]));
    expect(asked.requested).toBe(2);
    const requested = await withSchool(s.ctx, (tx) => consentRows(tx, s.ctx, { guardianIds: [g] }));
    expect(requested.map((r) => `${r.consentType}:${r.status}`).sort()).toEqual(["data-processing:REQUESTED", "photo:REQUESTED"]);

    // The guardian agrees on Parent Link with a one-time code.
    const link = await withSchool(s.ctx, async (tx) => (await tx.parentLink.findFirst({ where: { guardianId: g, status: "ACTIVE" } })) ?? (await import("@/lib/parent-link/links")).createLink(tx, s.ctx, g));
    await withSchool(s.ctx, (tx) => askConsentCode(tx, s.ctx, link.id, g, { consentTextId: texts.photo.id, studentIds: [s.priya.id], action: "give" }));
    const code = await withSchool(s.ctx, async (tx) => {
      const c = await tx.parentLinkCode.findFirstOrThrow({ where: { parentLinkId: link.id, purpose: "consent" }, orderBy: { createdAt: "desc" } });
      const r = await tx.messageRecipient.findFirstOrThrow({ where: { messageId: c.messageId! } });
      return r.text.match(/\b(\d{6})\b/)![1];
    });
    const done = await withSchool(s.ctx, (tx) => confirmConsent(tx, s.ctx, link.id, g, code, device));
    expect(done.ok).toBe(true);
    const after = await withSchool(s.ctx, (tx) => consentRows(tx, s.ctx, { guardianIds: [g] }));
    expect(after.find((r) => r.consentType === "photo")).toMatchObject({ status: "GIVEN", method: "parent-link", version: 1 });
    expect(after.find((r) => r.consentType === "data-processing")?.status).toBe("REQUESTED");
    expect(await withSchool(s.ctx, (tx) => photoConsentStands(tx, s.ctx, s.priya.id))).toBe(true);

    // A withdrawal recorded by the office is seen by Parent Link too.
    await withSchool(s.ctx, (tx) => withdrawConsent(tx, s.ctx, { guardianId: g, consentType: "photo", note: "Letter dated 12-10-2026" }));
    expect(await withSchool(s.ctx, (tx) => standingConsents(tx, s.ctx, { guardianIds: [g], consentType: "photo" }))).toEqual([]);
    expect(await withSchool(s.ctx, (tx) => photoConsentStands(tx, s.ctx, s.priya.id))).toBe(false);
  });
});

describe("certificates and ID cards use Settings, Document Designs", () => {
  it("prints a bonafide certificate with the school's design, its number and signatory", async () => {
    const html = await withSchool(s.ctx, async (tx) => {
      await tx.documentDesign.create({ data: { schoolId: s.school.id, docType: "bonafide-certificate", base: "modern", version: 1, isCurrent: true, options: { body: "Certified that {{student_name}} studies in {{class_section}} for {{purpose}}." } } });
      const sig = await tx.signatory.create({ data: { schoolId: s.school.id, name: "Lakshmi Rao", title: "Principal" } });
      const p = await printContext(tx, s.ctx, { signatoryId: sig.id, verifyCode: "abc" }, "https://school.example");
      return certificateHtml({ type: "BONAFIDE", number: "BONAFIDE/2026-27/0007", issueDate: new Date("2026-10-09T00:00:00Z"), purpose: "a passport", isDuplicate: true, duplicateReason: "Lost", status: "ISSUED", data: { name: "Ravi Kumar", admissionNo: "A1", lastClass: "Class 5 A", lastYear: "2026-27", gender: "Male", father: "Srinivas Kumar" } }, p);
    });
    expect(html).toContain("Certified that Ravi Kumar studies in Class 5 A for a passport.");
    expect(html).toContain("No. BONAFIDE/2026-27/0007");
    expect(html).toContain("Date: 09-10-2026");
    expect(html).toContain("Lakshmi Rao");
    expect(html).toContain("DUPLICATE");
    expect(html).toContain('class="qr"');
  });

  it("prints student ID cards with the Student ID card design", async () => {
    const html = await withSchool(s.ctx, async (tx) => {
      const c = await sectionCards(tx, s.a.id);
      return idCardsHtml(tx, s.ctx, c.students, { classLabel: c.label, yearName: "2026-27", validUntil: new Date("2027-03-31T00:00:00Z") });
    });
    expect(html).toContain('class="card');
    expect(html).toContain("Ravi Kumar");
    expect(html).toContain("Valid until 31-03-2027");
  });
});

describe("Student Profile tabs from built modules", () => {
  it("adds Time Table (Academic Management), Attendance, Exams and Communication for people who may view them", async () => {
    await import("@/lib/students/profile-tab-modules");
    const { profileTabsFor } = await import("@/lib/students/profile-tabs");
    const { accessIn } = await import("@/lib/auth/access");
    const principal = await accessIn(s.principal.id, s.school.id);
    expect(profileTabsFor({ permissions: principal!.permissions, modulesOn: new Set() }).map((t) => t.key)).toEqual(["timetable", "attendance", "exams", "communication"]);
  });
});

describe("notifications on the channels a person chose", () => {
  it("sends a copy by WhatsApp and email when chosen in My profile, and nothing extra otherwise", async () => {
    await prisma.userLogin.update({ where: { id: s.teacher.id }, data: { phone: "9876512111", email: "teacher.person@example.com", notificationPrefs: { "leave-decided": ["app", "whatsapp", "email"] } } });
    const n = await withSchool(s.ctx, (tx) => notify(tx, s.ctx, { to: s.teacher.id, type: "leave-decided", text: "Your leave for 14-10-2026 was approved.", link: "/profile" }));
    const msg = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { sourceType: "Notification", sourceId: n!.id }, include: { recipients: true } }));
    expect(msg.recipients.map((r) => r.channel).sort()).toEqual(["email", "whatsapp"]);
    expect(msg.recipients.find((r) => r.channel === "whatsapp")!.address).toBe("9876512111");
    expect(msg.recipients.every((r) => r.text.includes("Your leave for 14-10-2026 was approved."))).toBe(true);

    const other = await withSchool(s.ctx, (tx) => notify(tx, s.ctx, { to: s.teacher.id, type: "approval-waiting", text: "Something waits.", link: "/approvals" }));
    expect(await withSchool(s.ctx, (tx) => tx.message.count({ where: { sourceType: "Notification", sourceId: other!.id } }))).toBe(0);
  });
});
