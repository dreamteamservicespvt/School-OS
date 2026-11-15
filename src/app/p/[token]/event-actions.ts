"use server";

// Parent consent for an event on Parent Link (apps.jsx ConsentCard): "Give
// consent" sends a one-time code to the guardian's registered mobile and the
// code confirms it (the child is registered and any fee is added); "Not this
// time" is recorded at once and charges nothing. Each action finds the link
// from the token again, checks again on the server that the link, Parent
// Link, the phone and the Events switch are on (./guardian.ts) and that the
// child is one the guardian may act for, and is rate-limited by address and
// by link (08-platform-security.md §7).
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { MessagingProblem } from "@/lib/messaging/send";
import { codeSentWords, ParentLinkProblem } from "@/lib/parent-link/links";
import { askEventConsentCode, confirmEventConsent, declineOnParentLink } from "@/lib/events/consent";
import { localNow } from "@/lib/events/jobs";
import type { GuardianState } from "./actions";
import { PARENT_CODE_NOT_SENT } from "@/lib/dev-codes";
import { guardianFor as accessFor } from "./guardian";
import { parentLinkWords, parentMessage } from "@/lib/parent-link/language";

/** An answer in the page's language (the browser no longer gets every word to match it there). */
async function inPageLanguage(token: string, s: GuardianState): Promise<GuardianState> {
  return s?.message ? { ...s, message: parentMessage(await parentLinkWords(token), s.message) } : s;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function limits(keys: [string, number, number][]) {
  for (const [key, max, seconds] of keys) {
    const r = await hitLimit(key, max, seconds);
    if (!r.ok) return limitMessage(r);
  }
  return null;
}

/** The guardian, with the school's today, when the Events and PTM section is on for them. */
async function guardianFor(token: string) {
  const g = await accessFor(token, "events");
  return g.ok ? { ...g, today: localNow(new Date(), g.timeZone).today } : g;
}

function ids(form: FormData) {
  const eventId = String(form.get("eventId") ?? "");
  const studentId = String(form.get("studentId") ?? "");
  return UUID.test(eventId) && UUID.test(studentId) ? { eventId, studentId } : null;
}

/** Step 1 of "yes": a code to the registered mobile. */
/** The code box opens only when there is a code to type (sent, or in the log on a tester's computer). */
function codeStep(w: { ok: boolean; message: string; notSent?: boolean }): GuardianState {
  return w.ok ? { ok: true, step: "code", message: w.message, notSent: w.notSent } : { ok: false, message: w.message };
}

export async function askEventConsent(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  return inPageLanguage(token, await askEventConsentEn(token, form));
}

async function askEventConsentEn(token: string, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const g = await guardianFor(token);
  if (!g.ok) return { ok: false, message: g.message };
  const x = ids(form);
  if (!x) return { ok: false, message: "Choose your child for this event." };
  const limited = await limits([
    [`pl-code:ip:${device.ipAddress ?? "unknown"}`, 10, 3600],
    [`pl-code:link:${g.linkId}`, 5, 3600],
  ]);
  if (limited) return { ok: false, message: limited };
  try {
    const sent = await withSchool(g.ctx, (tx) => askEventConsentCode(tx, g.ctx, g.linkId, g.guardianId, x.eventId, x.studentId, g.today));
    return codeStep(codeSentWords(sent, "Code sent. Type it below to confirm."));
  } catch (e) {
    if (e instanceof ParentLinkProblem) return { ok: false, message: e.message };
    if (e instanceof MessagingProblem) return { ok: false, message: PARENT_CODE_NOT_SENT };
    throw e;
  }
}

/** Step 2: the code confirms the "yes". */
export async function confirmEventConsentCode(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  return inPageLanguage(token, await confirmEventConsentCodeEn(token, form));
}

async function confirmEventConsentCodeEn(token: string, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const typed = String(form.get("code") ?? "").replace(/\D/g, "");
  if (typed.length !== 6) return { ok: false, step: "code", message: "Type the 6-digit code from the message." };
  const g = await guardianFor(token);
  if (!g.ok) return { ok: false, message: g.message };
  const limited = await limits([[`pl-verify:ip:${device.ipAddress ?? "unknown"}`, 20, 600]]);
  if (limited) return { ok: false, step: "code", message: limited };
  const r = await withSchool(g.ctx, (tx) => confirmEventConsent(tx, g.ctx, g.linkId, g.guardianId, typed, g.today));
  if (!r.ok) return { ok: false, step: "code", message: r.message };
  const t = await parentLinkWords(token);
  return { ok: true, step: "done", message: t("Thank you. Your consent for “{title}” is recorded.", { title: r.event.name }) };
}

/** "Not this time": recorded without a code; nothing is charged. */
export async function declineEvent(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  return inPageLanguage(token, await declineEventEn(token, form));
}

async function declineEventEn(token: string, form: FormData): Promise<GuardianState> {
  const device = await deviceInfo();
  const g = await guardianFor(token);
  if (!g.ok) return { ok: false, message: g.message };
  const x = ids(form);
  if (!x) return { ok: false, message: "Choose your child for this event." };
  const limited = await limits([[`pl-answer:ip:${device.ipAddress ?? "unknown"}`, 20, 600]]);
  if (limited) return { ok: false, message: limited };
  try {
    const r = await withSchool(g.ctx, (tx) => declineOnParentLink(tx, g.ctx, g.linkId, g.guardianId, x.eventId, x.studentId, g.today));
    const t = await parentLinkWords(token);
    return { ok: true, step: "done", message: t("Saved. Your child is not going to {event}. Nothing is charged.", { event: r.event.name }) };
  } catch (e) {
    if (e instanceof ParentLinkProblem) return { ok: false, message: e.message };
    throw e;
  }
}
