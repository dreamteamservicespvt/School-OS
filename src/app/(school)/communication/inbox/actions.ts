"use server";

// WhatsApp Inbox actions. Reply and mark resolved: anyone with Communication change reach, on chats
// they may see. Assign and "make it a query": school-wide reach only. Checked here, on the server.
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { commAction, commOfficeAction, OfficeOnly } from "@/lib/communication/access";
import { COMM_FEATURES } from "@/lib/communication/features";
import { assignChat, chatToQuery, InboxProblem, markRead, replyToChat, setResolved } from "@/lib/communication/inbox";

const uuid = /^[0-9a-f-]{36}$/;
const PATH = "/communication/inbox";

async function inboxAccess(office: boolean) {
  const access = office ? await commOfficeAction("edit") : await commAction("create");
  if (!access.current.features.has(COMM_FEATURES.inbox)) throw new InboxProblem("WhatsApp Inbox is switched off for this school.");
  return access;
}

async function run(office: boolean, fn: (a: Awaited<ReturnType<typeof inboxAccess>>) => Promise<unknown>): Promise<string | void> {
  try {
    const a = await inboxAccess(office);
    await fn(a);
  } catch (e) {
    if (e instanceof InboxProblem || e instanceof OfficeOnly) return e.message;
    throw e;
  }
  revalidatePath(PATH);
}

export async function replyChatAction(chatId: string, text: string): Promise<string | void> {
  if (!uuid.test(chatId)) return "This chat was not found.";
  return run(false, (a) => withSchool(a.current.ctx, (tx) => replyToChat(tx, a.current.ctx, a.full, chatId, String(text ?? ""))));
}

export async function resolveChatAction(chatId: string, resolved: boolean): Promise<string | void> {
  if (!uuid.test(chatId)) return "This chat was not found.";
  return run(false, (a) => withSchool(a.current.ctx, (tx) => setResolved(tx, a.current.ctx, a.full, chatId, Boolean(resolved))));
}

export async function assignChatAction(chatId: string, userLoginId: string): Promise<string | void> {
  if (!uuid.test(chatId) || !uuid.test(userLoginId)) return "Choose a staff member.";
  return run(true, (a) => withSchool(a.current.ctx, (tx) => assignChat(tx, a.current.ctx, chatId, userLoginId)));
}

export async function chatToQueryAction(chatId: string): Promise<{ ok: true; id: string; number: string } | { ok: false; message: string }> {
  if (!uuid.test(chatId)) return { ok: false, message: "This chat was not found." };
  try {
    const a = await inboxAccess(true);
    const q = await withSchool(a.current.ctx, (tx) => chatToQuery(tx, a.current.ctx, chatId));
    revalidatePath(PATH);
    return { ok: true, id: q.id, number: q.number };
  } catch (e) {
    if (e instanceof InboxProblem || e instanceof OfficeOnly) return { ok: false, message: e.message };
    throw e;
  }
}

/** Opening a chat clears its unread count (only chats the person may see). */
export async function markReadAction(chatId: string): Promise<void> {
  if (!uuid.test(chatId)) return;
  try {
    const a = await commAction("view");
    if (!a.current.features.has(COMM_FEATURES.inbox)) return;
    await withSchool(a.current.ctx, async (tx) => {
      const chat = await tx.whatsappChat.findFirst({ where: { id: chatId, schoolId: a.current.ctx.schoolId }, select: { assignedToId: true } });
      if (chat && (a.full || chat.assignedToId === a.current.user.id)) await markRead(tx, a.current.ctx, chatId);
    });
  } catch {
    // Unread counts are a convenience; never fail the page over them.
  }
}
