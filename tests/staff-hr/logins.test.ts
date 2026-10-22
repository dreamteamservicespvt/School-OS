// Staff logins (09 Add Staff step 2, 20 §2, 08 §2; gap G33 a and b): a new
// staff login's invite is sent to them as School OS's own message, with only
// a placeholder for the link in Message History; "New sign-in link" sends
// the new link too; or the login starts with a temporary password typed by
// HR, kept only as a hash and never sent, which opens nothing but the page to
// choose their own password at the first sign-in.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { acceptInvite, findInvite } from "@/lib/auth/invites";
import { signIn } from "@/lib/auth/sign-in";
import { encryptSecrets } from "@/lib/messaging/channels";
import { invitePlaceholderFor } from "@/lib/parent-link/token";
import { createStaff, issueInvite, type StaffDetails } from "@/lib/staff/staff";
import { savePasswordRules } from "@/lib/auth/password-rules";
import { d, makeHrSchool } from "./fixture";
import { noSleep } from "../helpers";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
const as = (userId: string | null) => ({ schoolId: f.school.id, userId });

beforeAll(async () => {
  f = await makeHrSchool();
  // WhatsApp in test mode, with credits, as a school that has set up Communication.
  await withSchool(as(f.admin.id), async (tx) => {
    await tx.messagingChannel.create({ data: { schoolId: f.school.id, channel: "whatsapp", provider: "sandbox", isOn: true, environment: "test", ...encryptSecrets({ appSecret: "app-secret-1234", verifyToken: "verify-me", accessToken: "x" }) } });
    await tx.creditLedgerEntry.create({ data: { schoolId: f.school.id, channel: "whatsapp", amount: 100, note: "Test top-up" } });
  });
}, 120_000);

const details = (over: Partial<StaffDetails> = {}): StaffDetails => ({
  fullName: "Kavya Iyer", phone: "9123400051", designation: "Teacher", departmentId: null, joiningDate: d("2026-10-01"), gender: "Female",
  email: null, staffCode: null, dateOfBirth: null, bloodGroup: null, aadhaar: null, address: null, permanentAddress: null, qualification: null,
  experienceYears: null, employmentType: "Permanent", reportingToId: null, campusId: null, phoneVerified: false, emailVerified: false, photoFileId: null, ...over,
});

describe("making a staff login sends the invite (G33 a)", () => {
  it("Add Staff sends the invite by WhatsApp as School OS's message; Message History has only a placeholder", async () => {
    const r = await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details(), { roleKeys: ["teacher"], username: null, exceptions: {}, campusId: null }, []));
    expect(r.temporary).toBe(false);
    expect(r.sent).toMatchObject({ sentBy: ["WhatsApp"], note: null });
    const login = await prisma.userLogin.findUniqueOrThrow({ where: { username: r.username! } });
    expect(login.status).toBe("INVITED");
    const token = r.inviteLink!.split("/").pop()!;
    expect((await findInvite(token))?.id).toBe(login.id);
    const msg = await withSchool(as(f.admin.id), async (tx) => ({
      message: await tx.message.findUniqueOrThrow({ where: { id: r.sent!.messageId! } }),
      recipients: await tx.messageRecipient.findMany({ where: { messageId: r.sent!.messageId! } }),
    }));
    expect(msg.message).toMatchObject({ messageType: "staff-invite", isEmergency: false, sentById: null });
    expect(msg.recipients).toHaveLength(1);
    expect(msg.recipients[0].text).toMatch(/⟦invite:[0-9a-f-]{36}:[A-Za-z0-9_-]{16,64}⟧/);
    expect(msg.recipients[0].text).not.toContain(token);
  });

  it("New sign-in link sends the new link and the old one stops working", async () => {
    const r = await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Rohit Sen", phone: "9123400052" }), { roleKeys: ["teacher"], username: null, exceptions: {}, campusId: null }, []));
    const old = r.inviteLink!.split("/").pop()!;
    const loginId = (await prisma.userLogin.findUniqueOrThrow({ where: { username: r.username! } })).id;
    const again = await withSchool(as(f.admin.id), (tx) => issueInvite(tx, as(f.admin.id), loginId));
    expect(again.sent.sentBy).toEqual(["WhatsApp"]);
    expect(await findInvite(old)).toBeNull();
    expect((await findInvite(again.link.split("/").pop()!))?.id).toBe(loginId);
    const text = await withSchool(as(f.admin.id), async (tx) => (await tx.messageRecipient.findFirstOrThrow({ where: { messageId: again.sent.messageId! } })).text);
    expect(text).toContain(invitePlaceholderFor(loginId, "").slice(0, -1));
  });
});

describe("a temporary password, changed at the first sign-in (G33 b)", () => {
  const TEMP = "Kite-river-2026";

  it("keeps only its hash, sends nothing, and writes no password to the Audit Log", async () => {
    const r = await withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Divya Nair", phone: "9123400053" }), { roleKeys: ["teacher"], username: "divya.nair", exceptions: {}, campusId: null, temporaryPassword: TEMP }, []));
    expect(r).toMatchObject({ temporary: true, inviteLink: null, sent: null, username: "divya.nair" });
    const login = await prisma.userLogin.findUniqueOrThrow({ where: { username: "divya.nair" } });
    expect(login).toMatchObject({ status: "ACTIVE", mustChangePassword: true, inviteTokenHash: null });
    expect(login.passwordHash).toBeTruthy();
    expect(login.passwordHash).not.toContain(TEMP);
    await withSchool(as(f.admin.id), async (tx) => {
      expect(await tx.message.count({ where: { sourceType: "User Login", sourceId: login.id } })).toBe(0);
      const audit = await tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "User Login", recordId: login.id, action: "login-created" } });
      expect(JSON.stringify(audit)).not.toContain(TEMP);
      expect((audit.after as { signIn: string }).signIn).toBe("temporary password, to change at first sign-in");
    });
  });

  it("signing in with it opens only the page to choose their own password; the same password is refused there", async () => {
    const first = await signIn("divya.nair", TEMP, {}, { sleep: noSleep });
    expect(first.ok).toBe(false);
    if (first.ok || !first.firstChange) throw new Error("expected the first-change step");
    expect(first.message).toBe("Choose your own password to finish signing in.");
    expect(await prisma.session.count({ where: { userLogin: { username: "divya.nair" } } })).toBe(0);
    expect((await acceptInvite(first.firstChange, TEMP)).ok).toBe(false);
    expect(await acceptInvite(first.firstChange, TEMP)).toEqual({ ok: false, message: "Choose a new password, not the temporary one your school gave you." });
    expect((await acceptInvite(first.firstChange, "Divya-own-77")).ok).toBe(true);
    const login = await prisma.userLogin.findUniqueOrThrow({ where: { username: "divya.nair" } });
    expect(login.mustChangePassword).toBe(false);
    expect(login.passwordChangedAt).not.toBeNull();
    // The temporary password no longer works; their own does.
    expect((await signIn("divya.nair", TEMP, {}, { sleep: noSleep })).ok).toBe(false);
    expect((await signIn("divya.nair", "Divya-own-77", {}, { sleep: noSleep })).ok).toBe(true);
  });

  it("a weak temporary password is refused with the rule", async () => {
    await expect(withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: "Short Pass", phone: "9123400054" }), { roleKeys: ["teacher"], username: null, exceptions: {}, campusId: null, temporaryPassword: "abc" }, []))).rejects.toThrow("Temporary password: Use at least 8 characters.");
  });

  it("a temporary password follows the school's password rules: its shortest length, and never a common password (gap list G45)", async () => {
    const make = (name: string, phone: string, temporaryPassword: string) =>
      withSchool(as(f.admin.id), (tx) => createStaff(tx, as(f.admin.id), details({ fullName: name, phone }), { roleKeys: ["teacher"], username: null, exceptions: {}, campusId: null, temporaryPassword }, []));
    await expect(make("Common Pass", "9123400055", "Welcome@2026")).rejects.toThrow("Temporary password: This password is too common");
    await withSchool(as(f.admin.id), (tx) => savePasswordRules(tx, as(f.admin.id), { minLength: 14, history: 0, expiryDays: null }));
    await expect(make("Twelve Long", "9123400056", "Kite-river-1")).rejects.toThrow("Temporary password: Use at least 14 characters.");
    await expect(make("Long Enough", "9123400057", "Kite-river-2026")).resolves.toBeTruthy();
    await withSchool(as(f.admin.id), (tx) => savePasswordRules(tx, as(f.admin.id), { minLength: 8, history: 0, expiryDays: null }));
  });
});
