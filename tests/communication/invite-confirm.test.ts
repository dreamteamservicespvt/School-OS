// Staff invite links say "sent" only once WhatsApp, SMS or email really took them (owner test
// 2026-11-05, leftover 3c). Before, the screen said "The link was sent to them by WhatsApp" as
// soon as the message was queued, also when WhatsApp then refused it.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { confirmInviteSent, inviteSentWords, sendInviteMessage } from "@/lib/settings/invite-message";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  s = await makeCommSchool();
  await prisma.userLogin.update({ where: { id: s.teacher.id }, data: { phone: "9876543277", email: null } });
}, 120_000);

describe("the invite words follow what really happened", () => {
  it("says sent, on its way or not taken, from the confirmed channels only", () => {
    expect(inviteSentWords({ sentBy: ["WhatsApp"], note: null, messageId: "m" })).toBe(" The link was sent to them by WhatsApp.");
    expect(inviteSentWords({ sentBy: [], pending: ["WhatsApp"], note: null, messageId: "m" })).toBe(" It is on its way by WhatsApp: check Message History in a minute.");
    expect(inviteSentWords({ sentBy: [], pending: [], note: "WhatsApp did not take it (template not approved). Copy the link and send it yourself.", messageId: "m" }))
      .toBe(" WhatsApp did not take it (template not approved). Copy the link and send it yourself.");
    expect(inviteSentWords(null)).toBe("");
  });

  it("hands the invite over at once and reports each channel from its recipient rows", async () => {
    const queued = await withSchool(s.ctx, (tx) => sendInviteMessage(tx, s.ctx, { id: s.teacher.id, displayName: "Teacher Person", phone: "9876543277", email: null }, "confirm-invite-nonce-1"));
    expect(queued.sentBy).toEqual(["WhatsApp"]);
    const confirmed = await confirmInviteSent(s.ctx, queued);
    const rows = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: queued.messageId! }, select: { status: true, failReason: true } }));
    expect(rows.length).toBe(1);
    // No longer waiting in the queue: the provider was asked while the person waited.
    expect(rows[0].status).not.toBe("QUEUED");
    if (["SENT", "DELIVERED", "READ"].includes(rows[0].status)) expect(confirmed?.sentBy).toEqual(["WhatsApp"]);
    else if (rows[0].status === "FAILED") {
      expect(confirmed?.sentBy).toEqual([]);
      expect(confirmed?.note).toContain("WhatsApp did not take it");
      expect(confirmed?.note).toContain("Copy the link");
    } else expect(confirmed?.pending).toEqual(["WhatsApp"]);
  });

  it("leaves an invite that could not be queued as it was", async () => {
    const none = { sentBy: [], note: "They have no phone or email on their login, so copy the link and give it to them.", messageId: null };
    expect(await confirmInviteSent(s.ctx, none)).toBe(none);
  });
});
