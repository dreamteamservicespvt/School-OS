// WhatsApp Inbox (11-communication.md): incoming messages land in one chat per number, matched to
// the parent; replies only inside WhatsApp's 24-hour window; a class teacher sees and answers only
// chats given to them and cannot pass chats around. The page is optional, switched on per school.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { createSession } from "@/lib/auth/sessions";
import { withSchool } from "@/lib/db";
import { assignChat, chatToQuery, inboxWhere, InboxProblem, recordIncoming, replyToChat } from "@/lib/communication/inbox";
import { makeCommSchool } from "./fixture";

type School = Awaited<ReturnType<typeof makeCommSchool>>;
let s: School;
async function signIn(userId: string) {
  token = (await createSession(userId, s.school.id, { userAgent: "test" })).token;
}

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, (tx) => tx.schoolFeature.create({ data: { schoolId: s.school.id, featureKey: "whatsapp-inbox", isOn: true } }));
});
beforeEach(async () => {
  await signIn(s.principal.id);
});

describe("incoming WhatsApp messages", () => {
  it("make one chat per number, matched to the parent, and never record a retry twice", async () => {
    const id = await withSchool(s.ctx, async (tx) => {
      const first = await recordIncoming(tx, s.ctx, { from: `91${s.father.phone}`, text: "When is the PTM?", providerMessageId: "wamid-1" });
      await recordIncoming(tx, s.ctx, { from: `91${s.father.phone}`, text: "When is the PTM?", providerMessageId: "wamid-1" });
      await recordIncoming(tx, s.ctx, { from: s.father.phone, text: "Also, the bus?", providerMessageId: "wamid-2" });
      return first!;
    });
    await withSchool(s.ctx, async (tx) => {
      const chat = await tx.whatsappChat.findUniqueOrThrow({ where: { id } });
      expect(chat.contactType).toBe("guardian");
      expect(chat.contactId).toBe(s.father.id);
      expect(chat.displayName).toBe("Srinivas Kumar");
      expect(chat.unreadCount).toBe(2);
      expect(await tx.whatsappChatMessage.count({ where: { chatId: id } })).toBe(2);
    });
  });

  it("keeps an unknown number as unknown", async () => {
    await withSchool(s.ctx, async (tx) => {
      const id = await recordIncoming(tx, s.ctx, { from: "919999911111", name: "Visitor", text: "Admissions open?" });
      const chat = await tx.whatsappChat.findUniqueOrThrow({ where: { id: id! } });
      expect(chat.contactType).toBe("unknown");
      expect(chat.displayName).toBe("Visitor");
    });
  });
});

describe("replies", () => {
  it("are sent inside the 24-hour window and refused after it", async () => {
    await withSchool(s.ctx, async (tx) => {
      const id = (await recordIncoming(tx, s.ctx, { from: s.mother.phone, text: "Thanks", at: new Date(Date.now() - 2 * 3600_000) }))!;
      const msg = await replyToChat(tx, s.ctx, true, id, "Noted, thank you.");
      expect(msg.direction).toBe("out");
      const later = new Date(Date.now() + 25 * 3600_000);
      await expect(replyToChat(tx, s.ctx, true, id, "Hello again", later)).rejects.toThrow(/24-hour/);
      const chat = await tx.whatsappChat.findUniqueOrThrow({ where: { id } });
      expect(chat.assignedToId).toBe(s.principal.id);
    });
  });

  it("turns a chat into a query once", async () => {
    await withSchool(s.ctx, async (tx) => {
      const id = (await recordIncoming(tx, s.ctx, { from: s.teluguMother.phone, text: "Fee receipt not received" }))!;
      const q = await chatToQuery(tx, s.ctx, id);
      expect(q.number).toBeTruthy();
      await expect(chatToQuery(tx, s.ctx, id)).rejects.toBeInstanceOf(InboxProblem);
    });
  });
});

describe("a class teacher", () => {
  it("sees only chats given to them", async () => {
    const tctx = { schoolId: s.school.id, userId: s.teacher.id };
    const id = await withSchool(s.ctx, (tx) => recordIncoming(tx, s.ctx, { from: s.otherFather.phone, text: "Is Kiran in class today?" }));
    await withSchool(tctx, async (tx) => {
      const before = await tx.whatsappChat.findMany({ where: inboxWhere(tctx, false, "all", "") });
      expect(before.map((c) => c.id)).not.toContain(id);
      await expect(replyToChat(tx, tctx, false, id!, "Yes")).rejects.toThrow(/not given to you/);
    });
    await withSchool(s.ctx, (tx) => assignChat(tx, s.ctx, id!, s.teacher.id));
    await withSchool(tctx, async (tx) => {
      const after = await tx.whatsappChat.findMany({ where: inboxWhere(tctx, false, "all", "") });
      expect(after.map((c) => c.id)).toContain(id);
      expect((await replyToChat(tx, tctx, false, id!, "Yes, he is here.")).direction).toBe("out");
    });
  });

  it("cannot assign chats or make queries from them", async () => {
    const id = await withSchool(s.ctx, (tx) => recordIncoming(tx, s.ctx, { from: "919888822222", text: "Hello" }));
    await signIn(s.teacher.id);
    const a = await import("@/app/(school)/communication/inbox/actions");
    expect(await a.assignChatAction(id!, s.teacher.id)).toMatch(/Only the Principal and School Admin/);
    const r = await a.chatToQueryAction(id!);
    expect(r.ok).toBe(false);
    const chat = await withSchool(s.ctx, (tx) => tx.whatsappChat.findUniqueOrThrow({ where: { id: id! } }));
    expect(chat.assignedToId).toBeNull();
    expect(chat.queryId).toBeNull();
  });
});

describe("switched off", () => {
  it("refuses replies when the school has not switched the inbox on", async () => {
    const other = await makeCommSchool();
    s = { ...s, school: other.school };
    token = (await createSession(other.principal.id, other.school.id, { userAgent: "test" })).token;
    const id = await withSchool(other.ctx, (tx) => recordIncoming(tx, other.ctx, { from: other.father.phone, text: "Hi" }));
    const a = await import("@/app/(school)/communication/inbox/actions");
    expect(await a.replyChatAction(id!, "Hello")).toMatch(/switched off/);
  });
});
