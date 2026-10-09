"use server";

// Parent Link (school staff): send to existing families (preview, then send),
// resend, revoke or reissue with a reason, and consent requests with
// reminders. Principal and School Admin only.
import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { commAction } from "@/lib/communication/access";
import { localToUtc } from "@/lib/communication/time";
import { guardianIdsIn } from "@/lib/communication/parent-link-admin";
import { guardiansWithoutLinks, ParentLinkProblem, reissueLink, resendLink, revokeLink, REVOKE_REASONS, sendToFamilies } from "@/lib/parent-link/links";
import { remindConsent, requestConsent, standingConsents } from "@/lib/parent-link/consent";
import { channelSetups, type Channel } from "@/lib/messaging/channels";
import { creditBalances, creditsFor } from "@/lib/messaging/credits";
import { templateByKey } from "@/lib/messaging/templates";
import { MessagingProblem } from "@/lib/messaging/send";

const uuid = /^[0-9a-f-]{36}$/;

async function manager(action: "create" | "edit" = "create") {
  const access = await commAction(action);
  if (!access.full) throw new ParentLinkProblem("Only the Principal and School Admin can manage Parent Links.");
  return access;
}

function fail(e: unknown): string {
  if (e instanceof ParentLinkProblem || e instanceof MessagingProblem) return e.message;
  throw e;
}

type Who = { kind: "school" | "class" | "section"; id: string | null };
function readWho(form: FormData): Who | string {
  const v = String(form.get("who") ?? "school");
  if (v === "school") return { kind: "school", id: null };
  const [kind, id] = v.split(":");
  if ((kind === "class" || kind === "section") && uuid.test(id ?? "")) return { kind, id };
  return "Choose who: the whole school, a class or a section.";
}

async function whoLabel(tx: Parameters<Parameters<typeof withSchool>[1]>[0], schoolId: string, who: Who) {
  if (who.kind === "school") return "Whole school";
  if (who.kind === "class") return (await tx.schoolClass.findFirst({ where: { id: who.id!, schoolId }, select: { name: true } }))?.name ?? "Class";
  const s = await tx.section.findFirst({ where: { id: who.id!, schoolId }, select: { name: true, classId: true } });
  const c = s ? await tx.schoolClass.findFirst({ where: { id: s.classId, schoolId }, select: { name: true } }) : null;
  return `${c?.name ?? ""} ${s?.name ?? ""}`.trim() || "Section";
}

const pick = (who: Who) => ({ classIds: who.kind === "class" ? [who.id!] : [], sectionIds: who.kind === "section" ? [who.id!] : [] });

export type FamiliesPreview = { ok: true; label: string; total: number; todo: number; alreadyHave: number; channel: string; credits: number; balance: number | null; scheduled: string | null } | { ok: false; message: string };

/** P11 preview: how many families get a new link, by which channel, and the credits it uses. */
export async function previewFamilies(form: FormData): Promise<FamiliesPreview> {
  try {
    const access = await manager();
    const who = readWho(form);
    if (typeof who === "string") return { ok: false, message: who };
    const tz = access.current.school.timeZone;
    const at = String(form.get("sendAt") ?? "");
    const scheduledAt = at ? localToUtc(at, tz) : null;
    if (at && (!scheduledAt || scheduledAt.getTime() < Date.now())) return { ok: false, message: "Choose a time in the future, or leave it blank to send now." };
    const wanted = String(form.get("channel") ?? "");
    return await withSchool(access.current.ctx, async (tx) => {
      const ctx = access.current.ctx;
      const all = await guardianIdsIn(tx, ctx, pick(who));
      const todo = await guardiansWithoutLinks(tx, ctx, all);
      const setups = await channelSetups(tx, ctx);
      const channel: Channel | null = wanted === "whatsapp" || wanted === "sms" ? wanted : setups.whatsapp.isOn ? "whatsapp" : setups.sms.isOn ? "sms" : null;
      if (!channel || !setups[channel].isOn) return { ok: false as const, message: "Neither WhatsApp nor SMS is switched on, so links cannot be sent. Switch one on in Settings, SMS, WhatsApp & Email." };
      const t = await templateByKey(tx, ctx, "parent-link", channel);
      const v = t ? await tx.templateVersion.findFirst({ where: { templateId: t.id, isCurrent: true }, orderBy: { language: "asc" } }) : null;
      if (channel === "sms" && !v?.dltTemplateId) return { ok: false as const, message: "The Parent Link SMS template has no DLT template ID. Add it in Message Templates, or send by WhatsApp." };
      const per = creditsFor(channel, (v?.body ?? "").replace("{link}", "https://x.in/p/" + "x".repeat(43)));
      const balances = await creditBalances(tx, ctx);
      return { ok: true as const, label: await whoLabel(tx, ctx.schoolId, who), total: all.length, todo: todo.length, alreadyHave: all.length - todo.length, channel, credits: per * todo.length, balance: balances[channel], scheduled: scheduledAt ? at : null };
    });
  } catch (e) {
    return { ok: false, message: fail(e) };
  }
}

export type FamiliesResult = { ok: true; made: number; alreadyHad: number; queued: number; skipped: string[]; messageId: string | null } | { ok: false; message: string };

export async function sendFamiliesAction(form: FormData): Promise<FamiliesResult> {
  try {
    const access = await manager();
    const who = readWho(form);
    if (typeof who === "string") return { ok: false, message: who };
    const at = String(form.get("sendAt") ?? "");
    const scheduledAt = at ? localToUtc(at, access.current.school.timeZone) : null;
    if (at && (!scheduledAt || scheduledAt.getTime() < Date.now())) return { ok: false, message: "Choose a time in the future, or leave it blank to send now." };
    const wanted = String(form.get("channel") ?? "");
    const r = await withSchool(access.current.ctx, async (tx) => {
      const ctx = access.current.ctx;
      const ids = await guardianIdsIn(tx, ctx, pick(who));
      return sendToFamilies(tx, ctx, ids, { channel: wanted === "whatsapp" || wanted === "sms" ? wanted : null, scheduledAt, audienceLabel: `Parent Links: ${await whoLabel(tx, ctx.schoolId, who)}` });
    });
    revalidatePath("/communication/parent-link");
    return { ok: true, made: r.made, alreadyHad: r.alreadyHad, queued: r.result?.queued ?? 0, skipped: (r.result?.skipped ?? []).map((s) => `${s.count} ${s.reason}`), messageId: r.result?.messageId ?? null };
  } catch (e) {
    return { ok: false, message: fail(e) };
  }
}

export async function resendAction(linkId: string, channel: string): Promise<string | void> {
  if (!uuid.test(linkId)) return "This link was not found.";
  try {
    const access = await manager("edit");
    await withSchool(access.current.ctx, (tx) => resendLink(tx, access.current.ctx, linkId, channel === "whatsapp" || channel === "sms" ? channel : null));
    await flash({ message: "The same link was sent again. Phones already confirmed keep working.", tone: "success" });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/communication/parent-link/${linkId}`);
}

export async function revokeAction(linkId: string, mode: "revoke" | "reissue", reasonKey: string, other: string, channel: string): Promise<string | { newId: string } | void> {
  if (!uuid.test(linkId)) return "This link was not found.";
  if (!(REVOKE_REASONS as readonly string[]).includes(reasonKey)) return "Choose a reason.";
  const note = other.trim();
  if (reasonKey === "Other" && note.length < 5) return "Write the reason in at least 5 characters.";
  if (note.length > 300) return "The reason can be at most 300 characters.";
  const reason = reasonKey === "Other" ? note : note ? `${reasonKey}: ${note}` : reasonKey;
  try {
    const access = await manager("edit");
    const out = await withSchool(access.current.ctx, async (tx) => {
      if (mode === "reissue") return (await reissueLink(tx, access.current.ctx, linkId, reason, channel === "whatsapp" || channel === "sms" ? channel : null)).id;
      await revokeLink(tx, access.current.ctx, linkId, reason);
      return null;
    });
    await flash({ message: out ? "The old link stopped working. A new link was sent to the registered mobile." : "The link stopped working on every phone.", tone: "success" });
    revalidatePath("/communication/parent-link");
    if (out) return { newId: out };
  } catch (e) {
    return fail(e);
  }
}

export type ConsentRequestState = { ok: boolean; message?: string; errors?: Record<string, string>; preview?: { label: string; total: number; todo: number } } | null;

export async function consentRequestAction(_prev: ConsentRequestState, form: FormData): Promise<ConsentRequestState> {
  try {
    const access = await manager();
    const errors: Record<string, string> = {};
    const textId = String(form.get("consentTextId") ?? "");
    if (!uuid.test(textId)) errors.consentTextId = "Choose a consent type.";
    const who = readWho(form);
    if (typeof who === "string") errors.who = who;
    const replyRaw = String(form.get("replyBy") ?? "");
    const replyBy = /^\d{4}-\d{2}-\d{2}$/.test(replyRaw) ? new Date(`${replyRaw}T00:00:00Z`) : null;
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (!replyBy) errors.replyBy = "Choose a reply-by date.";
    else if (replyBy < today) errors.replyBy = "The reply-by date has passed. Choose a later date.";
    else if (replyBy.getTime() > today.getTime() + 180 * 86400_000) errors.replyBy = "Choose a date within 6 months.";
    if (Object.keys(errors).length) return { ok: false, errors, message: Object.values(errors)[0] };
    const w = who as Who;
    const confirmed = form.get("intent") === "send";
    const res = await withSchool(access.current.ctx, async (tx) => {
      const ctx = access.current.ctx;
      const text = await tx.consentText.findFirst({ where: { id: textId, schoolId: ctx.schoolId, isCurrent: true } });
      if (!text) throw new ParentLinkProblem("Choose a consent type.");
      const all = await guardianIdsIn(tx, ctx, pick(w));
      // Default: guardians with no current consent of this type (inferred).
      const standing = await standingConsents(tx, ctx, { guardianIds: all, consentType: text.consentType });
      const have = new Set(standing.filter((r) => !r.withdrawnAt && r.textVersion === text.version).map((r) => r.guardianId));
      const todo = all.filter((g) => !have.has(g));
      const label = await whoLabel(tx, ctx.schoolId, w);
      if (!confirmed) return { preview: { label, total: all.length, todo: todo.length } };
      const r = await requestConsent(tx, ctx, { consentTextId: text.id, guardianIds: todo, audienceLabel: label, replyBy: replyBy! });
      return { sent: todo.length, messaged: Boolean(r.message), title: text.title };
    });
    if ("preview" in res) return { ok: true, preview: res.preview };
    await flash({ message: `"${res.title}" requested from ${res.sent} parent${res.sent === 1 ? "" : "s"}. ${res.messaged ? "They were told by WhatsApp and" : "WhatsApp is off, so no message went out, but"} they see the form on their Parent Link.`, tone: "success" });
    revalidatePath("/communication/parent-link/consent");
    return { ok: true, message: "sent" };
  } catch (e) {
    return { ok: false, message: fail(e) };
  }
}

export async function remindConsentAction(requestId: string): Promise<string | void> {
  if (!uuid.test(requestId)) return "This request was not found.";
  try {
    const access = await manager("edit");
    const r = await withSchool(access.current.ctx, (tx) => remindConsent(tx, access.current.ctx, requestId));
    await flash({ message: `Reminder sent to ${r.count} parent${r.count === 1 ? "" : "s"} still waiting.`, tone: "success" });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/communication/parent-link/consent");
}
