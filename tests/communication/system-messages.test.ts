// Parent Link and staff invite messages (QA LABEL-01). After SEC-01 one-time
// codes were no longer emergency broadcasts, but a guardian's Parent Link
// message and the invite to a new login still were: Message History said
// "Emergency broadcast. Sent also to parents who opted out.", named the staff
// member who pressed Send as the sender, and the Audit Log said
// "sent-emergency-broadcast".
//
// Now each is School OS's own message: Message Type "parent-link" or
// "staff-invite", not an emergency broadcast, no sender ("School OS (Parent
// Link)", "School OS (staff invite)"), Audit Log "system-message-sent" with
// the person who asked; it still reaches people who opted out, also when sent
// again. A real emergency broadcast is unchanged. Messages saved before the
// update are relabelled once by the migration.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { createAndSend, placeholderFor } from "@/lib/parent-link/links";
import { sendInviteMessage } from "@/lib/settings/invite-message";
import { invitePlaceholderFor } from "@/lib/parent-link/token";
import { sendMessage } from "@/lib/messaging/send";
import { resend } from "@/lib/messaging/resend";
import { SYSTEM_SCOPE } from "@/lib/messaging/recipients";
import { historyWhere, senderWords } from "@/lib/communication/history";
import { actionWords } from "@/lib/data-security/audit-view";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  s = await makeCommSchool();
  await prisma.userLogin.update({ where: { id: s.teacher.id }, data: { phone: "9876543288", email: null } });
}, 120_000);

/** A message, its recipients and its Audit Log lines. */
async function rowsOf(messageId: string) {
  return withSchool(s.ctx, async (tx) => ({
    message: await tx.message.findUniqueOrThrow({ where: { id: messageId } }),
    recipients: await tx.messageRecipient.findMany({ where: { messageId } }),
    audit: await tx.auditLogEntry.findMany({ where: { recordType: "Message", recordId: messageId }, orderBy: { at: "asc" } }),
  }));
}

let parentLinkMessage = "";

describe("a Parent Link and an invite are sent by School OS, not as an emergency broadcast", () => {
  it("Parent Link: not an emergency, no sender, still reaches a parent who opted out", async () => {
    const link = await withSchool(s.ctx, (tx) => createAndSend(tx, s.ctx, s.optFather.id));
    const m = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { sourceType: "Parent Link", sourceId: link.id } }));
    parentLinkMessage = m.id;
    const r = await rowsOf(m.id);
    expect(r.message).toMatchObject({ messageType: "parent-link", isEmergency: false, sentById: null });
    // The opted-out father is sent his link, not left out.
    expect(r.recipients.map((p) => p.guardianId)).toEqual([s.optFather.id]);
    expect(r.recipients[0].text).toContain(placeholderFor(link.id));
    expect(r.message.skipped).toEqual([]);
    // The Audit Log names the person who asked, and says what it was.
    expect(r.audit.map((a) => a.action)).toEqual(["system-message-sent"]);
    expect(r.audit[0]).toMatchObject({ userLoginId: s.principal.id, actorNote: "School OS (Parent Link)" });
    expect(actionWords("system-message-sent")).toBe("Message sent by School OS (a personal link)");
    expect(senderWords(r.message, new Map([[s.principal.id, "Principal Person"]]))).toBe("School OS (Parent Link)");
  });

  it("staff invite: not an emergency, no sender", async () => {
    const sent = await withSchool(s.ctx, (tx) => sendInviteMessage(tx, s.ctx, { id: s.teacher.id, displayName: "Teacher Person", phone: "9876543288", email: null }, "label01-invite-nonce-1"));
    expect(sent.messageId).toBeTruthy();
    const r = await rowsOf(sent.messageId!);
    expect(r.message).toMatchObject({ messageType: "staff-invite", isEmergency: false, sentById: null });
    expect(r.recipients[0].text).toContain(invitePlaceholderFor(s.teacher.id, "label01-invite-nonce-1"));
    expect(r.audit.map((a) => a.action)).toEqual(["system-message-sent"]);
    expect(r.audit[0]).toMatchObject({ userLoginId: s.principal.id, actorNote: "School OS (staff invite)" });
    expect(senderWords(r.message, new Map([[s.principal.id, "Principal Person"]]))).toBe("School OS (staff invite)");
  });

  it("sent again from Message History, a Parent Link stays School OS's message and still reaches the opted-out parent", async () => {
    await withSchool(s.ctx, async (tx) => {
      await tx.messageRecipient.updateMany({ where: { messageId: parentLinkMessage }, data: { status: "FAILED", failReason: "Provider said no" } });
      await tx.message.update({ where: { id: parentLinkMessage }, data: { status: "SENT" } });
    });
    const again = await withSchool(s.ctx, (tx) => resend(tx, s.ctx, parentLinkMessage, "failed", "whatsapp", SYSTEM_SCOPE));
    const r = await rowsOf(again.messageId);
    expect(r.message).toMatchObject({ messageType: "parent-link", isEmergency: false, sentById: null, resendOfId: parentLinkMessage });
    expect(r.recipients.map((p) => p.guardianId)).toEqual([s.optFather.id]);
    expect(r.audit.map((a) => a.action)).toEqual(["system-message-sent"]);
  });

  it("is not counted as sent by people in Message History's Sent by filter", async () => {
    const where = historyWhere(s.ctx, true, { q: "", filters: { sender: "people" }, page: 1, sort: null, dir: "asc", archived: false }, "Asia/Kolkata");
    const ids = await withSchool(s.ctx, async (tx) => (await tx.message.findMany({ where, select: { id: true } })).map((m) => m.id));
    expect(ids).not.toContain(parentLinkMessage);
  });

  it("a real emergency broadcast is unchanged", async () => {
    const r0 = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: ["whatsapp"], text: "School closes at 12 today due to heavy rain.", emergency: true }));
    const r = await rowsOf(r0.messageId);
    expect(r.message).toMatchObject({ messageType: "general", isEmergency: true, sentById: s.principal.id });
    expect(r.recipients.map((p) => p.guardianId)).toContain(s.optFather.id);
    expect(r.audit.map((a) => a.action)).toEqual(["sent-emergency-broadcast"]);
    expect(senderWords(r.message, new Map([[s.principal.id, "Principal Person"]]))).toBe("Principal Person");
  });
});

/** The data part of the update that relabels messages already saved, run again as the database owner. */
async function runUpdate() {
  const dir = path.resolve("prisma/schema/migrations");
  const name = readdirSync(dir).find((d) => d.endsWith("_system_messages_not_emergency"));
  if (!name) throw new Error("migration not found");
  const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
  const from = sql.indexOf('ALTER TABLE "message" NO FORCE ROW LEVEL SECURITY;');
  const statements = sql.slice(from).split(/;\s*\r?\n/).map((x) => x.trim()).filter((x) => x.replace(/^--.*$/gm, "").trim());
  const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
  try {
    await owner.$transaction(async (tx) => { for (const x of statements) await tx.$executeRawUnsafe(x); });
  } finally {
    await owner.$disconnect();
  }
}

describe("Parent Link and invite messages saved before this update", () => {
  it("lose the emergency mark and the sender, once, with an Audit Log line; a real emergency stays as it was", async () => {
    const linkId = crypto.randomUUID();
    const old = await withSchool(s.ctx, async (tx) => {
      const make = async (m: { trigger: string | null; sourceType: string | null; text: string; emergency: boolean }) => {
        const msg = await tx.message.create({ data: { schoolId: s.school.id, body: "Dear {guardian_name}, your Parent Link: {link}", channels: ["whatsapp"], audienceLabel: "Before", status: "SENT", isEmergency: m.emergency, messageType: "general", sentById: s.principal.id, trigger: m.trigger, sourceType: m.sourceType, sourceId: s.principal.id } });
        await tx.messageRecipient.create({ data: { schoolId: s.school.id, messageId: msg.id, recipientType: "guardian", guardianId: s.father.id, name: "Srinivas Kumar", channel: "whatsapp", address: "9876543210", text: m.text, values: {}, status: "DELIVERED", provider: "sandbox" } });
        return msg.id;
      };
      return {
        link: await make({ trigger: "Parent Link created", sourceType: "Parent Link", text: `Dear Srinivas Kumar, your Parent Link: ${placeholderFor(linkId)}`, emergency: true }),
        families: await make({ trigger: "Parent Links sent to existing families", sourceType: null, text: `Your Parent Link: ${placeholderFor(linkId)}`, emergency: true }),
        invite: await make({ trigger: "Invite to School OS", sourceType: "User Login", text: `Set your password: ${invitePlaceholderFor(s.teacher.id, "label01-old-nonce-12345")}`, emergency: true }),
        // A real emergency broadcast: not touched.
        rain: await make({ trigger: null, sourceType: null, text: "School closes at 12 today due to heavy rain.", emergency: true }),
      };
    });
    await runUpdate();
    await runUpdate();
    for (const [key, kind, sender] of [["link", "parent-link", "School OS (Parent Link)"], ["families", "parent-link", "School OS (Parent Link)"], ["invite", "staff-invite", "School OS (staff invite)"]] as const) {
      const r = await rowsOf(old[key]);
      expect(r.message, key).toMatchObject({ messageType: kind, isEmergency: false, sentById: null });
      expect(r.audit.map((a) => a.action), key).toEqual(["system-message-relabelled"]);
      expect(r.audit[0].before, key).toEqual({ type: "general", emergency: true, sentBy: s.principal.id });
      expect(r.audit[0].after, key).toEqual({ type: kind, emergency: false, sentBy: sender });
      expect(senderWords(r.message, new Map()), key).toBe(sender);
      // Their text is not changed.
      expect(r.recipients[0].text, key).toMatch(/⟦(parent-link|invite):/);
    }
    const rain = await rowsOf(old.rain);
    expect(rain.message).toMatchObject({ messageType: "general", isEmergency: true, sentById: s.principal.id });
    expect(rain.audit).toEqual([]);
    // Messages sent after the update are left alone.
    const now = await rowsOf(parentLinkMessage);
    expect(now.audit.map((a) => a.action)).toEqual(["system-message-sent"]);
  });
});
