"use server";

// The guardian's actions on Parent Link (no login). Each one finds the link
// from the token again, checks the phone again on the server, and is
// rate-limited by address and by link (08-platform-security.md §7).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { MessagingProblem } from "@/lib/messaging/send";
import { messageSettings } from "@/lib/messaging/settings";
import { confirmDevice, confirmedDevice, deviceCookieName, findLink, hashToken, newDeviceKey, ParentLinkProblem, sendCode } from "@/lib/parent-link/links";
import { askConsentCode, confirmConsent } from "@/lib/parent-link/consent";

export type GuardianState = { ok: boolean; message?: string; step?: "code" | "done" } | null;

const GONE = "This link is no longer active. Please ask the school for a new one.";

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
  const device = await deviceInfo();
  const found = await findLink(token);
  if (!found) return { ok: false, message: GONE };
  const limited = await limits([
    [`pl-code:ip:${device.ipAddress ?? "unknown"}`, 10, 3600],
    [`pl-code:link:${found.linkId}`, 5, 3600],
  ]);
  if (limited) return { ok: false, message: limited };
  const jar = await cookies();
  const name = deviceCookieName(found.linkId);
  const key = jar.get(name)?.value && /^[A-Za-z0-9_-]{40,}$/.test(jar.get(name)!.value) ? jar.get(name)!.value : newDeviceKey();
  const ctx = { schoolId: found.schoolId, userId: null };
  try {
    const pl = await withSchool(ctx, async (tx) => {
      await sendCode(tx, ctx, found.linkId, "device", { keyHash: hashToken(key) });
      return (await messageSettings(tx, ctx)).parentLink;
    });
    await setDeviceCookie(found.linkId, key, pl.deviceDays);
    return { ok: true, step: "code", message: `Code sent. It works for ${pl.codeMinutes} minutes.` };
  } catch (e) {
    if (e instanceof ParentLinkProblem || e instanceof MessagingProblem) return { ok: false, message: e instanceof ParentLinkProblem ? e.message : "The school cannot send codes right now. Please call the school." };
    throw e;
  }
}

/** Checks the code typed on this phone; the phone is then remembered. */
export async function verifyDevice(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const typed = String(form.get("code") ?? "").replace(/\D/g, "");
  if (typed.length !== 6) return { ok: false, step: "code", message: "Type the 6-digit code from the message." };
  const found = await findLink(token);
  if (!found) return { ok: false, message: GONE };
  const limited = await limits([[`pl-verify:ip:${device.ipAddress ?? "unknown"}`, 20, 600]]);
  if (limited) return { ok: false, step: "code", message: limited };
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  if (!key) return { ok: false, message: "This code was sent for another phone or browser. Tap \"Send a new code\"." };
  const ctx = { schoolId: found.schoolId, userId: null };
  const result = await withSchool(ctx, (tx) => confirmDevice(tx, ctx, found.linkId, key, typed, device));
  if (!result.ok) return { ok: false, step: "code", message: result.message };
  await setDeviceCookie(found.linkId, key, result.days);
  redirect(`/p/${token}`);
}

async function guardianFor(token: string) {
  const found = await findLink(token);
  if (!found) return null;
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  const ctx = { schoolId: found.schoolId, userId: null };
  const ok = await withSchool(ctx, (tx) => confirmedDevice(tx, found.linkId, key));
  return ok ? { ctx, linkId: found.linkId, guardianId: ok.link.guardianId } : null;
}

/** Step 1 of giving or withdrawing consent: a code to the registered mobile. */
export async function askConsent(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const g = await guardianFor(token);
  if (!g) return { ok: false, message: GONE };
  const limited = await limits([
    [`pl-code:ip:${device.ipAddress ?? "unknown"}`, 10, 3600],
    [`pl-code:link:${g.linkId}`, 5, 3600],
  ]);
  if (limited) return { ok: false, message: limited };
  const action = form.get("action") === "withdraw" ? "withdraw" : "give";
  const studentIds = form.getAll("studentId").map(String).filter(Boolean);
  const consentTextId = String(form.get("consentTextId") ?? "");
  if (!studentIds.length) return { ok: false, message: "Choose your child for this consent." };
  try {
    await withSchool(g.ctx, (tx) => askConsentCode(tx, g.ctx, g.linkId, g.guardianId, { consentTextId, studentIds, action }));
    return { ok: true, step: "code", message: "Code sent. Type it below to confirm." };
  } catch (e) {
    if (e instanceof ParentLinkProblem) return { ok: false, message: e.message };
    if (e instanceof MessagingProblem) return { ok: false, message: "The school cannot send codes right now. Please call the school." };
    throw e;
  }
}

/** Step 2: the code confirms the consent. */
export async function confirmConsentCode(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const typed = String(form.get("code") ?? "").replace(/\D/g, "");
  if (typed.length !== 6) return { ok: false, step: "code", message: "Type the 6-digit code from the message." };
  const g = await guardianFor(token);
  if (!g) return { ok: false, message: GONE };
  const limited = await limits([[`pl-verify:ip:${device.ipAddress ?? "unknown"}`, 20, 600]]);
  if (limited) return { ok: false, step: "code", message: limited };
  const result = await withSchool(g.ctx, (tx) => confirmConsent(tx, g.ctx, g.linkId, g.guardianId, typed, device));
  if (!result.ok) return { ok: false, step: "code", message: result.message };
  return { ok: true, step: "done", message: result.action === "give" ? `Thank you. Your consent for "${result.title}" is recorded.` : `Your consent for "${result.title}" is withdrawn.` };
}
