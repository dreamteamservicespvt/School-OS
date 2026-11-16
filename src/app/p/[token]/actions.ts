"use server";

// The guardian's actions on Parent Link (no login). Each one finds the link
// from the token again, checks again on the server that the link, Parent
// Link, the phone and the section's switch are all on (./guardian.ts), checks
// the child is one the guardian may act for, and is rate-limited by address
// and by link (08-platform-security.md §7).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { MessagingProblem } from "@/lib/messaging/send";
import { messageSettings } from "@/lib/messaging/settings";
import { ACCESS_WORDS, confirmDevice, deviceCookieName, deviceLabel, findLink, hashToken, linkUsable, newDeviceKey, ParentLinkProblem, codeSentWords, sendCode, TAP_GONE, TAP_SECRET } from "@/lib/parent-link/links";
import { askConsentCode, confirmConsent } from "@/lib/parent-link/consent";
import { confirmTap } from "@/lib/parent-link/tap";
import { guardianFor } from "./guardian";
import { PARENT_CODE_NOT_SENT } from "@/lib/dev-codes";
import { deliverCodeNow } from "@/lib/messaging/code-now";
import { parentLinkWords, parentMessage } from "@/lib/parent-link/language";

/**
 * notSent: Test mode kept the code back; the page shows the message instead of "code sent".
 * channel: what carried the code ("on WhatsApp", "by SMS"). callSchool: no code could go; the page says to call the school.
 * tap: WhatsApp carried the parent's own Parent Link to tap ("tap to confirm", src/lib/parent-link/tap.ts), not a code to type.
 */
export type GuardianState = { ok: boolean; message?: string; step?: "code" | "done"; notSent?: boolean; channel?: "sms" | "whatsapp"; callSchool?: boolean; tap?: boolean; pickup?: "approved" | "declined" } | null;

const GONE = ACCESS_WORDS.gone;

/** The code box opens only when there is a code to type (sent, or in the log on a tester's computer). */
function codeStep(w: { ok: boolean; message: string; notSent?: boolean }): GuardianState {
  return w.ok ? { ok: true, step: "code", message: w.message, notSent: w.notSent } : { ok: false, message: w.message };
}

/** The guardian's page language for an action's message (fixed and numbered messages; see parentMessage). */
async function inPageLanguage(token: string, s: GuardianState): Promise<GuardianState> {
  if (!s?.message) return s;
  return { ...s, message: parentMessage(await parentLinkWords(token), s.message) };
}

async function limits(keys: [string, number, number][]) {
  for (const [key, max, seconds] of keys) {
    const r = await hitLimit(key, max, seconds);
    if (!r.ok) return limitMessage(r);
  }
  return null;
}

async function setDeviceCookie(linkId: string, key: string, days: number) {
  (await cookies()).set(deviceCookieName(linkId), key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/p",
    maxAge: days * 86400,
  });
}

/** Sends a one-time code to the guardian's registered mobile for this phone. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the form action passes these; nothing is read from them
export async function sendDeviceCode(token: string, _prev: GuardianState, _form: FormData): Promise<GuardianState> {
  return inPageLanguage(token, await sendDeviceCodeEn(token));
}

async function sendDeviceCodeEn(token: string): Promise<GuardianState> {
  const device = await deviceInfo();
  const found = await findLink(token);
  if (!found) return { ok: false, message: GONE };
  const limited = await limits([
    [`pl-code:ip:${device.ipAddress ?? "unknown"}`, 100, 3600],
    [`pl-code:link:${found.linkId}`, 5, 3600],
  ]);
  if (limited) return { ok: false, message: limited };
  const jar = await cookies();
  const name = deviceCookieName(found.linkId);
  const key = jar.get(name)?.value && /^[A-Za-z0-9_-]{40,}$/.test(jar.get(name)!.value) ? jar.get(name)!.value : newDeviceKey();
  const ctx = { schoolId: found.schoolId, userId: null };
  try {
    const pl = await withSchool(ctx, async (tx) => {
      // No code while the school has Parent Link off or the link is revoked.
      const stop = await linkUsable(tx, ctx, found.linkId);
      if (stop) throw new ParentLinkProblem(ACCESS_WORDS[stop]);
      const sent = await sendCode(tx, ctx, found.linkId, "device", { keyHash: hashToken(key), detail: { asked: deviceLabel(device.userAgent) } });
      return { sent, settings: (await messageSettings(tx, ctx)).parentLink };
    });
    // "Code sent" only once WhatsApp or SMS really took it (owner test 2026-11-05).
    if (!pl.sent.testMode && (await deliverCodeNow(ctx, pl.sent.messageId)).state === "failed") return { ok: false, message: PARENT_CODE_NOT_SENT, callSchool: true };
    await setDeviceCookie(found.linkId, key, pl.settings.deviceDays);
    const step = codeStep(codeSentWords(pl.sent, `Code sent. It works for ${pl.settings.codeMinutes} minutes.`));
    return step?.ok ? { ...step, channel: pl.sent.channel, tap: pl.sent.mode === "tap" } : step;
  } catch (e) {
    if (e instanceof ParentLinkProblem || e instanceof MessagingProblem) {
      const notSent = !(e instanceof ParentLinkProblem) || e.message === PARENT_CODE_NOT_SENT;
      return { ok: false, message: e instanceof ParentLinkProblem ? e.message : PARENT_CODE_NOT_SENT, ...(notSent ? { callSchool: true } : {}) };
    }
    throw e;
  }
}

/** Checks the code typed on this phone; the phone is then remembered. */
export async function verifyDevice(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  return inPageLanguage(token, await verifyDeviceEn(token, form));
}

async function verifyDeviceEn(token: string, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const typed = String(form.get("code") ?? "").replace(/\D/g, "");
  if (typed.length !== 6) return { ok: false, step: "code", message: "Type the 6-digit code from the message." };
  const found = await findLink(token);
  if (!found) return { ok: false, message: GONE };
  const limited = await limits([[`pl-verify:ip:${device.ipAddress ?? "unknown"}`, 200, 600], [`pl-verify:link:${found.linkId}`, 20, 600]]);
  if (limited) return { ok: false, step: "code", message: limited };
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  if (!key) return { ok: false, message: "This code was sent for another phone or browser. Tap \"Send a new code\"." };
  const ctx = { schoolId: found.schoolId, userId: null };
  const result = await withSchool(ctx, async (tx) => {
    const stop = await linkUsable(tx, ctx, found.linkId);
    if (stop) return { ok: false as const, message: ACCESS_WORDS[stop] };
    return confirmDevice(tx, ctx, found.linkId, key, typed, device);
  });
  if (!result.ok) return { ok: false, step: "code", message: result.message };
  await setDeviceCookie(found.linkId, key, result.days);
  redirect(`/p/${token}`);
}

/** Step 1 of giving or withdrawing consent: a code to the registered mobile. */
export async function askConsent(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  return inPageLanguage(token, await askConsentEn(token, form));
}

async function askConsentEn(token: string, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const g = await guardianFor(token, "consent");
  if (!g.ok) return { ok: false, message: g.message };
  const limited = await limits([
    [`pl-code:ip:${device.ipAddress ?? "unknown"}`, 100, 3600],
    [`pl-code:link:${g.linkId}`, 5, 3600],
  ]);
  if (limited) return { ok: false, message: limited };
  const action = form.get("action") === "withdraw" ? "withdraw" : "give";
  const studentIds = form.getAll("studentId").map(String).filter(Boolean);
  const consentTextId = String(form.get("consentTextId") ?? "");
  if (!studentIds.length) return { ok: false, message: "Choose your child for this consent." };
  try {
    const sent = await withSchool(g.ctx, (tx) => askConsentCode(tx, g.ctx, g.linkId, g.guardianId, { consentTextId, studentIds, action }));
    if (!sent.testMode && (await deliverCodeNow(g.ctx, sent.messageId)).state === "failed") return { ok: false, message: PARENT_CODE_NOT_SENT };
    const step = codeStep(codeSentWords(sent, "Code sent. Type it below to confirm."));
    return step?.ok ? { ...step, tap: sent.mode === "tap" } : step;
  } catch (e) {
    if (e instanceof ParentLinkProblem) return { ok: false, message: e.message };
    if (e instanceof MessagingProblem) return { ok: false, message: PARENT_CODE_NOT_SENT };
    throw e;
  }
}

/** Step 2: the code confirms the consent. */
export async function confirmConsentCode(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  return inPageLanguage(token, await confirmConsentCodeEn(token, form));
}

async function confirmConsentCodeEn(token: string, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const typed = String(form.get("code") ?? "").replace(/\D/g, "");
  if (typed.length !== 6) return { ok: false, step: "code", message: "Type the 6-digit code from the message." };
  const g = await guardianFor(token, "consent");
  if (!g.ok) return { ok: false, message: g.message };
  const limited = await limits([[`pl-verify:ip:${device.ipAddress ?? "unknown"}`, 200, 600], [`pl-verify:link:${g.linkId}`, 20, 600]]);
  if (limited) return { ok: false, step: "code", message: limited };
  const result = await withSchool(g.ctx, (tx) => confirmConsent(tx, g.ctx, g.linkId, g.guardianId, typed, device));
  if (!result.ok) return { ok: false, step: "code", message: result.message };
  const t = await parentLinkWords(token);
  // Already in the page's language: parentMessage leaves words it does not know as they are.
  const title = t.any(result.title);
  return { ok: true, step: "done", message: result.action === "give" ? t("Thank you. Your consent for “{title}” is recorded.", { title }) : t("Your consent for “{title}” is removed.", { title }) };
}

/**
 * The tap on the parent's own WhatsApp message ("tap to confirm"): this browser
 * is confirmed (then the page opens), the consent the parent asked for is
 * recorded, or the guardian's answer to a pickup request at the front desk
 * (the button pressed: answer "approve" or "decline"). The page with the
 * secret only shows what it confirms; this is the tap.
 */
export async function confirmTapped(token: string, secret: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const a = form.get("answer");
  return inPageLanguage(token, await confirmTappedEn(token, secret, a === "approve" ? "approved" : a === "decline" ? "declined" : null));
}

async function confirmTappedEn(token: string, secret: string, pickup: "approved" | "declined" | null): Promise<GuardianState> {
  const device = await deviceInfo();
  if (!TAP_SECRET.test(secret)) return { ok: false, message: TAP_GONE };
  const found = await findLink(token);
  if (!found) return { ok: false, message: GONE };
  const limited = await limits([[`pl-verify:ip:${device.ipAddress ?? "unknown"}`, 200, 600], [`pl-verify:link:${found.linkId}`, 20, 600]]);
  if (limited) return { ok: false, message: limited };
  const key = newDeviceKey();
  const r = await confirmTap(found, secret, key, device, new Date(), pickup);
  if (!r.ok) return { ok: false, message: r.message };
  if (r.kind === "device") {
    await setDeviceCookie(found.linkId, key, r.days);
    redirect(`/p/${token}`);
  }
  const t = await parentLinkWords(token);
  if (r.kind === "pickup") {
    return { ok: true, step: "done", pickup: r.answer, message: r.answer === "approved"
      ? t("Thank you. The front desk can now let {person} take {student} home.", { person: r.person, student: r.student })
      : t("Thank you. {student} stays at school. Please call the school now.", { student: r.student }) };
  }
  const title = t.any(r.title);
  return { ok: true, step: "done", message: r.kind === "consent" && r.action === "withdraw" ? t("Your consent for “{title}” is removed.", { title }) : t("Thank you. Your consent for “{title}” is recorded.", { title }) };
}
