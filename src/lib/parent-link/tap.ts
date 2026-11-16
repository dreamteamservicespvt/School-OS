// "Tap to confirm" on Parent Link (live test 16 Nov 2026: Meta does not deliver
// code messages to WhatsApp users on +91 numbers, so a Parent Link code never
// came). On WhatsApp the guardian's own Parent Link card comes again with a
// one-time secret in its "Open Parent Link" button: /p/<token>.<secret>.
// Opening it shows what it confirms (this phone, or the consent the parent
// asked for); one more tap there records it. The page itself only reads, so a
// link preview or a scanner opening the address changes nothing.
// - The secret is 144 random bits, kept only as a hash, used once, and runs
//   out with the code minutes (Message Settings, Parent Link).
// - A new phone: the browser that opens the guardian's own WhatsApp message is
//   the one confirmed. When it is not the browser that asked, the page warns:
//   someone with a forwarded link could ask the parent to forward this one too
//   (security review 16 Nov), so it says which phone asked and when.
// - A consent: the link must be usable and the section switched on; the child
//   is checked again (./consent.ts, ../events/consent.ts).
// - A pickup the front desk asked the guardian to approve: Approve or "No, call
//   the school"; the link must be usable and the child the guardian's own
//   (../front-office/pickup-tap.ts).
import "server-only";

import { withSchool, type SchoolContext, type Tx } from "../db";
import { hashToken } from "./token";
import { messageSettings } from "../messaging/settings";
import { localNow } from "../events/jobs";
import { confirmEventConsent } from "../events/consent";
import { confirmConsent } from "./consent";
import { ACCESS_WORDS, confirmDevice, linkUsable, TAP_GONE, tapRequest, type LinkFound } from "./links";
import { answerPickup, pickupTapView, type PickupAnswer } from "../front-office/pickup-tap";

export type TapView =
  | { kind: "device"; sameBrowser: boolean; askedOn: string | null; askedMinutesAgo: number }
  | { kind: "consent"; title: string; action: "give" | "withdraw" }
  | { kind: "event"; title: string }
  | { kind: "pickup"; person: string; student: string };

/** What a tapped confirmation is for, to show before it is used; null when it ran out or was used. Only reads. */
export async function tapView(tx: Tx, linkId: string, secret: string, deviceKey: string | null = null, now = new Date()): Promise<TapView | null> {
  const req = await tapRequest(tx, linkId, secret, now);
  if (!req) return null;
  if (req.purpose === "device") {
    const asked = typeof req.detail.asked === "string" ? req.detail.asked.slice(0, 60) : null;
    return { kind: "device", sameBrowser: Boolean(deviceKey && req.keyHash && req.keyHash === hashToken(deviceKey)), askedOn: asked, askedMinutesAgo: Math.max(0, Math.round((now.getTime() - req.askedAt.getTime()) / 60_000)) };
  }
  const d = req.detail;
  if (req.purpose === "pickup") {
    const link = await tx.parentLink.findUnique({ where: { id: linkId }, select: { guardianId: true } });
    return link ? pickupTapView(tx, link.guardianId, d) : null;
  }
  if (d.kind === "event" && typeof d.eventId === "string") {
    const e = await tx.event.findFirst({ where: { id: d.eventId }, select: { name: true } });
    return e ? { kind: "event", title: e.name } : null;
  }
  if (typeof d.consentTextId === "string") {
    const text = await tx.consentText.findFirst({ where: { id: d.consentTextId }, select: { title: true } });
    return text ? { kind: "consent", title: text.title, action: d.action === "withdraw" ? "withdraw" : "give" } : null;
  }
  return null;
}

export type TapResult =
  | { ok: true; kind: "device"; days: number }
  | { ok: true; kind: "consent"; title: string; action: "give" | "withdraw" }
  | { ok: true; kind: "event"; title: string }
  | { ok: true; kind: "pickup"; answer: PickupAnswer; person: string; student: string }
  | { ok: false; message: string };

/** A pickup answer must be chosen on the page: never taken as a yes. */
export const PICKUP_CHOOSE = "Tap Approve, or No if you do not know about this.";

/**
 * Records a tapped confirmation: this browser (with deviceKey, a new key the
 * caller then keeps in a cookie), the consent the parent asked for, or the
 * guardian's answer to a pickup request (pickup: "approved" or "declined").
 */
export async function confirmTap(found: LinkFound, secret: string, deviceKey: string, device: { userAgent: string | null; ipAddress: string | null }, now = new Date(), pickup: PickupAnswer | null = null): Promise<TapResult> {
  const ctx: SchoolContext = { schoolId: found.schoolId, userId: null };
  return withSchool(ctx, async (tx): Promise<TapResult> => {
    const stop = await linkUsable(tx, ctx, found.linkId);
    if (stop) return { ok: false, message: ACCESS_WORDS[stop] };
    const req = await tapRequest(tx, found.linkId, secret, now);
    if (!req) return { ok: false, message: TAP_GONE };
    if (req.purpose === "device") {
      const r = await confirmDevice(tx, ctx, found.linkId, deviceKey, secret, device, now);
      return r.ok ? { ok: true, kind: "device", days: r.days } : { ok: false, message: r.message };
    }
    const link = await tx.parentLink.findUniqueOrThrow({ where: { id: found.linkId }, select: { guardianId: true } });
    if (req.purpose === "pickup") {
      if (!pickup) return { ok: false, message: PICKUP_CHOOSE };
      const r = await answerPickup(tx, ctx, req, link.guardianId, pickup, device, now);
      return r.ok ? { ok: true, kind: "pickup", answer: r.answer, person: r.person, student: r.student } : { ok: false, message: r.message };
    }
    const shows = (await messageSettings(tx, ctx)).parentLink.shows;
    if (req.detail.kind === "event") {
      if (shows.events === false) return { ok: false, message: ACCESS_WORDS["section-off"] };
      const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
      const r = await confirmEventConsent(tx, ctx, found.linkId, link.guardianId, secret, localNow(now, school.timeZone).today);
      return r.ok ? { ok: true, kind: "event", title: r.event.name } : { ok: false, message: r.message };
    }
    if (shows.consent === false) return { ok: false, message: ACCESS_WORDS["section-off"] };
    const r = await confirmConsent(tx, ctx, found.linkId, link.guardianId, secret, device);
    return r.ok ? { ok: true, kind: "consent", title: r.title, action: r.action } : { ok: false, message: r.message };
  });
}
