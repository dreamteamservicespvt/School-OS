"use server";

// Notice Board: save, publish (or send for approval), archive, read and
// acknowledge, remind, and resend to parents who have not seen it. Anyone who
// may send messages writes notices within their own scope (a teacher: their
// own sections); reminding and resending stay with the office.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { commAction, commOfficeAction } from "@/lib/communication/access";
import { localToUtc } from "@/lib/communication/time";
import { archiveNotice, checkNoticeCampus, checkNoticeScope, markRead, noticeOnCampus, NoticeProblem, NOTICE_CHANNELS, noticeResendInput, remindUnacknowledged, saveNotice, CRITICAL_WORD, type NoticeChannel, type NoticeInput } from "@/lib/communication/notices";
import { DOCUMENT_TYPES, FileProblem, saveFile } from "@/lib/files";
import { creditWords, planMessage, sendMessage, MessagingProblem } from "@/lib/messaging/send";
import { requireAction } from "@/lib/current";

export type NoticeState = { ok: boolean; message?: string; errors?: Record<string, string>; needsCritical?: boolean } | null;

const uuid = /^[0-9a-f-]{36}$/;
const list = (f: FormData, k: string) => [...new Set(f.getAll(k).map(String).filter((v) => uuid.test(v)))];

function readNotice(form: FormData, timeZone: string): { input: NoticeInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!title) errors.title = "Give the notice a title.";
  else if (title.length > 150) errors.title = "The title can be at most 150 characters.";
  if (!body) errors.body = "Write the notice.";
  else if (body.length > 5000) errors.body = "The notice can be at most 5000 characters.";
  const audience = {
    parents: form.get("parents") === "on",
    students: form.get("students") === "on",
    staff: form.get("staff") === "on",
    roleKeys: [...new Set(form.getAll("roleKeys").map(String).filter((v) => /^[a-z0-9-]{1,40}$/.test(v)))],
    classIds: list(form, "classIds"),
    sectionIds: list(form, "sectionIds"),
    campusIds: list(form, "campusIds"),
  };
  if (!audience.parents && !audience.students && !audience.staff) errors.audience = "Choose who the notice is for: parents, students or staff.";
  const p = String(form.get("priority") ?? "NORMAL");
  const priority = p === "HIGH" || p === "CRITICAL" ? p : "NORMAL";
  const channels = form.getAll("channels").map(String).filter((c): c is NoticeChannel => NOTICE_CHANNELS.some((x) => x.key === c));
  const publishRaw = String(form.get("publishAt") ?? "");
  const publishAt = publishRaw ? localToUtc(publishRaw, timeZone) : null;
  if (publishRaw && !publishAt) errors.publishAt = "Choose a proper date and time, or leave it blank to publish now.";
  const expRaw = String(form.get("expiresOn") ?? "");
  const expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(expRaw) ? new Date(`${expRaw}T00:00:00Z`) : null;
  if (expRaw && !expiresOn) errors.expiresOn = "Choose a proper date.";
  if (expiresOn && expiresOn.getTime() < Date.now() - 86400_000) errors.expiresOn = "The expiry date has passed. Choose a later date.";
  if (expiresOn && publishAt && expiresOn.getTime() < publishAt.getTime() - 86400_000) errors.expiresOn = "The notice would expire before it is published.";
  return { input: { title, body, attachmentFileIds: list(form, "keepFiles"), audience, priority, channels, publishAt, expiresOn, askAck: form.get("askAck") === "on" }, errors };
}

export async function saveNoticeAction(_prev: NoticeState, form: FormData): Promise<NoticeState> {
  const access = await commAction(form.get("id") ? "edit" : "create");
  const { current } = access;
  const { input, errors } = readNotice(form, current.school.timeZone);
  // Critical goes even to parents who opted out (an emergency broadcast): the office's call.
  if (input.priority === "CRITICAL" && !access.full) errors.priority = "Only the office can mark a notice Critical. Choose Normal or High.";
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length + input.attachmentFileIds.length > 5) errors.files = "A notice can have at most 5 attachments.";
  if (Object.keys(errors).length) return { ok: false, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things before saving.`, errors };
  const action = form.get("intent") === "publish" ? "publish" : "draft";
  const criticalConfirmed = String(form.get("criticalWord") ?? "").trim().toUpperCase() === CRITICAL_WORD;
  if (action === "publish" && input.priority === "CRITICAL" && !criticalConfirmed) return { ok: false, needsCritical: true, message: `Type ${CRITICAL_WORD} to pin this on every chosen parent's Parent Link.` };
  const raw = String(form.get("id") ?? "");
  const id = uuid.test(raw) ? raw : null;
  let result;
  try {
    // A sender limited to one campus: the notice is for their campus, and its classes must be of it.
    checkNoticeScope(input, access.scope);
    result = await withSchool(current.ctx, async (tx) => {
      await checkNoticeCampus(tx, input.audience, access.scope.campusId);
      const found = id ? await tx.notice.findFirst({ where: { id, schoolId: current.ctx.schoolId }, select: { createdById: true, attachmentFileIds: true, audience: true } }) : null;
      if (id && (!found || !noticeOnCampus(found, access.scope.campusId, current.user.id))) throw new NoticeProblem("This notice was not found.");
      const before = found;
      // Someone with their own scope changes only notices they wrote.
      if (before && !access.full && before.createdById !== current.user.id) throw new NoticeProblem("You can change only notices you wrote.");
      // Attachments kept from before must be this notice's own.
      input.attachmentFileIds = input.attachmentFileIds.filter((f) => before?.attachmentFileIds.includes(f));
      for (const f of files) {
        const saved = await saveFile(tx, current.ctx, { file: f, purpose: "notice", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 });
        input.attachmentFileIds.push(saved.id);
      }
      return saveNotice(tx, current.ctx, input, { id, action, criticalConfirmed });
    });
  } catch (e) {
    if (e instanceof NoticeProblem || e instanceof FileProblem) return { ok: false, message: e.message };
    throw e;
  }
  const words = { draft: "Saved as a draft.", approval: "Sent for approval. It is published once it is approved.", scheduled: "Scheduled. It is published at its time.", published: "Published." }[result.outcome];
  await flash({ message: `${words}`, tone: "success", link: { href: `/communication/notices/${result.notice.id}`, label: "Open notice" } });
  redirect(`/communication/notices/${result.notice.id}`);
}

export async function archiveNoticeAction(id: string): Promise<string | void> {
  const { current, scope } = await commAction("archive");
  try {
    const n = await withSchool(current.ctx, async (tx) => {
      const own = await tx.notice.findFirst({ where: { id, schoolId: current.ctx.schoolId } });
      if (!own || !noticeOnCampus(own, scope.campusId, current.user.id)) throw new NoticeProblem("This notice was not found.");
      if (current.permissions.communication.change !== "all" && own.createdById !== current.user.id) throw new NoticeProblem("You can archive only notices you wrote.");
      return archiveNotice(tx, current.ctx, id);
    });
    await flash({ message: `Archived "${n.title}". It has left the board and Parent Link.`, tone: "success", undo: { kind: "notice-archive", id: `${n.id}:${n.status}` } });
  } catch (e) {
    if (e instanceof NoticeProblem) return e.message;
    throw e;
  }
  revalidatePath("/communication/notices");
}

/** "I have read this" (and opening the notice counts as read). */
export async function acknowledgeNotice(id: string) {
  const { current } = await requireAction("communication", "view");
  await withSchool(current.ctx, (tx) => markRead(tx, current.ctx, id, true));
  revalidatePath(`/communication/notices/${id}`);
}

export async function remindAction(id: string): Promise<string | void> {
  const { current, scope } = await commOfficeAction("create");
  try {
    const n = await withSchool(current.ctx, (tx) => remindUnacknowledged(tx, current.ctx, id, scope.campusId));
    await flash({ message: `Reminded ${n} ${n === 1 ? "person" : "people"}.`, tone: "success" });
  } catch (e) {
    if (e instanceof NoticeProblem) return e.message;
    throw e;
  }
  revalidatePath(`/communication/notices/${id}`);
}

export type NoticeResendPreview = { ok: true; people: number; cost: string; skipped: string[]; problem: string | null } | { ok: false; message: string };

export async function previewNoticeResend(id: string, channel: "whatsapp" | "sms" | "email"): Promise<NoticeResendPreview> {
  const { current, scope } = await commOfficeAction("create");
  try {
    const plan = await withSchool(current.ctx, async (tx) => planMessage(tx, current.ctx, { ...(await noticeResendInput(tx, current.ctx, id, channel, scope.campusId)), scope }));
    return { ok: true, people: plan.people, cost: creditWords(plan), skipped: plan.skipped.map((g) => `${g.reason}: ${g.count}`), problem: plan.problems[0] ?? plan.creditProblem ?? null };
  } catch (e) {
    if (e instanceof NoticeProblem || e instanceof MessagingProblem) return { ok: false, message: e.message };
    throw e;
  }
}

export async function resendNotice(id: string, channel: "whatsapp" | "sms" | "email"): Promise<string | void> {
  const { current, scope } = await commOfficeAction("create");
  let messageId: string;
  try {
    const r = await withSchool(current.ctx, async (tx) => sendMessage(tx, current.ctx, { ...(await noticeResendInput(tx, current.ctx, id, channel, scope.campusId)), scope }));
    messageId = r.messageId;
    await flash({ message: `Sending to ${r.people} parents who have not seen it.`, tone: "success", link: { href: `/communication/history/${r.messageId}`, label: "See delivery" } });
  } catch (e) {
    if (e instanceof NoticeProblem || e instanceof MessagingProblem) return e.message;
    throw e;
  }
  redirect(`/communication/history/${messageId}`);
}
