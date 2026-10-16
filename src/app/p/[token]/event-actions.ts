"use server";

// Parent consent for an event on Parent Link (apps.jsx ConsentCard): "Give
// consent" sends a one-time code to the guardian's registered mobile and the
// code confirms it (the child is registered and any fee is added); "Not this
// time" is recorded at once and charges nothing. Each action finds the link
// from the token again, checks the phone again on the server, and is
// rate-limited by address and by link (08-platform-security.md §7).
import { cookies } from "next/headers";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { MessagingProblem } from "@/lib/messaging/send";
import { confirmedDevice, deviceCookieName, findLink, ParentLinkProblem } from "@/lib/parent-link/links";
import { askEventConsentCode, confirmEventConsent, declineOnParentLink } from "@/lib/events/consent";
import { localNow } from "@/lib/events/jobs";
import type { GuardianState } from "./actions";

const GONE = "This link is no longer active. Please ask the school for a new one.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function limits(keys: [string, number, number][]) {
  for (const [key, max, seconds] of keys) {
    const r = await hitLimit(key, max, seconds);
    if (!r.ok) return limitMessage(r);
  }
  return null;
}

async function guardianFor(token: string) {
  const found = await findLink(token);
  if (!found) return null;
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  const ctx = { schoolId: found.schoolId, userId: null };
  return withSchool(ctx, async (tx) => {
    const ok = await confirmedDevice(tx, found.linkId, key);
    if (!ok) return null;
    const school = await tx.school.findUnique({ where: { id: found.schoolId }, select: { timeZone: true } });
    return { ctx, linkId: found.linkId, guardianId: ok.link.guardianId, today: localNow(new Date(), school?.timeZone ?? "Asia/Kolkata").today };
  });
}

function ids(form: FormData) {
  const eventId = String(form.get("eventId") ?? "");
  const studentId = String(form.get("studentId") ?? "");
  return UUID.test(eventId) && UUID.test(studentId) ? { eventId, studentId } : null;
}

/** Step 1 of "yes": a code to the registered mobile. */
export async function askEventConsent(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const g = await guardianFor(token);
  if (!g) return { ok: false, message: GONE };
  const x = ids(form);
  if (!x) return { ok: false, message: "Choose your child for this event." };
  const limited = await limits([
    [`pl-code:ip:${device.ipAddress ?? "unknown"}`, 10, 3600],
    [`pl-code:link:${g.linkId}`, 5, 3600],
  ]);
  if (limited) return { ok: false, message: limited };
  try {
    await withSchool(g.ctx, (tx) => askEventConsentCode(tx, g.ctx, g.linkId, g.guardianId, x.eventId, x.studentId, g.today));
    return { ok: true, step: "code", message: "Code sent. Type it below to confirm." };
  } catch (e) {
    if (e instanceof ParentLinkProblem) return { ok: false, message: e.message };
    if (e instanceof MessagingProblem) return { ok: false, message: "The school cannot send codes right now. Please call the school." };
    throw e;
  }
}

/** Step 2: the code confirms the "yes". */
export async function confirmEventConsentCode(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const typed = String(form.get("code") ?? "").replace(/\D/g, "");
  if (typed.length !== 6) return { ok: false, step: "code", message: "Type the 6-digit code from the message." };
  const g = await guardianFor(token);
  if (!g) return { ok: false, message: GONE };
  const limited = await limits([[`pl-verify:ip:${device.ipAddress ?? "unknown"}`, 20, 600]]);
  if (limited) return { ok: false, step: "code", message: limited };
  const r = await withSchool(g.ctx, (tx) => confirmEventConsent(tx, g.ctx, g.linkId, g.guardianId, typed, g.today));
  if (!r.ok) return { ok: false, step: "code", message: r.message };
  return { ok: true, step: "done", message: `Thank you. Your consent for ${r.event.name} is recorded.` };
}

/** "Not this time": recorded without a code; nothing is charged. */
export async function declineEvent(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const g = await guardianFor(token);
  if (!g) return { ok: false, message: GONE };
  const x = ids(form);
  if (!x) return { ok: false, message: "Choose your child for this event." };
  const limited = await limits([[`pl-answer:ip:${device.ipAddress ?? "unknown"}`, 20, 600]]);
  if (limited) return { ok: false, message: limited };
  try {
    const r = await withSchool(g.ctx, (tx) => declineOnParentLink(tx, g.ctx, g.linkId, g.guardianId, x.eventId, x.studentId, g.today));
    return { ok: true, step: "done", message: `Saved. Your child is not going to ${r.event.name}. Nothing is charged.` };
  } catch (e) {
    if (e instanceof ParentLinkProblem) return { ok: false, message: e.message };
    throw e;
  }
}
