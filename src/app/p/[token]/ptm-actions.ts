"use server";

// PTM booking on Parent Link (mod-events.jsx: "Parents book a slot on Parent
// Link; the office can book for them"): book a free time, move the booking
// to another time, or cancel it, until the day before the PTM. Each action
// finds the link from the token again, checks again on the server that the
// link, Parent Link, the confirmed phone (device) and the Events switch are on
// (./guardian.ts), checks the child is one the guardian may act for, and is
// rate-limited by address and by link (08-platform-security.md §7).
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { ParentLinkProblem } from "@/lib/parent-link/links";
import { bookOnParentLink, cancelOnParentLink } from "@/lib/events/ptm-parent";
import { localNow } from "@/lib/events/jobs";
import type { GuardianState } from "./actions";
import { guardianFor as accessFor } from "./guardian";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function limited(linkId: string) {
  const device = await deviceInfo();
  for (const [key, max, seconds] of [[`pl-ptm:ip:${device.ipAddress ?? "unknown"}`, 30, 600], [`pl-ptm:link:${linkId}`, 12, 3600]] as const) {
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
  const slotId = String(form.get("slotId") ?? "");
  const studentId = String(form.get("studentId") ?? "");
  return UUID.test(slotId) && UUID.test(studentId) ? { slotId, studentId } : null;
}

/** Book a free time (or move the child's booking at this PTM to it). */
export async function bookPtmSlot(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const g = await guardianFor(token);
  if (!g.ok) return { ok: false, message: g.message };
  const x = ids(form);
  if (!x) return { ok: false, message: "Pick a time first." };
  const stop = await limited(g.linkId);
  if (stop) return { ok: false, message: stop };
  try {
    const r = await withSchool(g.ctx, (tx) => bookOnParentLink(tx, g.ctx, { guardianId: g.guardianId, studentId: x.studentId, slotId: x.slotId, today: g.today }));
    if (r.unchanged) return { ok: true, step: "done", message: `You already have ${r.time} with ${r.teacher}.` };
    return { ok: true, step: "done", message: r.changed ? `Changed. Your meeting with ${r.teacher} is now at ${r.time}. A confirmation message is on its way.` : `Booked: ${r.time} with ${r.teacher}. A confirmation message is on its way.` };
  } catch (e) {
    if (e instanceof ParentLinkProblem) return { ok: false, message: e.message };
    throw e;
  }
}

/** Cancel the child's booking. */
export async function cancelPtmSlot(token: string, _prev: GuardianState, form: FormData): Promise<GuardianState> {
  const g = await guardianFor(token);
  if (!g.ok) return { ok: false, message: g.message };
  const x = ids(form);
  if (!x) return { ok: false, message: "This booking was not found. Please refresh the page." };
  const stop = await limited(g.linkId);
  if (stop) return { ok: false, message: stop };
  try {
    const r = await withSchool(g.ctx, (tx) => cancelOnParentLink(tx, g.ctx, { guardianId: g.guardianId, studentId: x.studentId, slotId: x.slotId, today: g.today }));
    return { ok: true, step: "done", message: `Cancelled your meeting with ${r.teacher} at ${r.time} on ${r.when}. You can book again until the day before.` };
  } catch (e) {
    if (e instanceof ParentLinkProblem) return { ok: false, message: e.message };
    throw e;
  }
}
