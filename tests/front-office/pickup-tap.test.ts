// Pickup "tap to approve" (owner decision 21, 16 Nov 2026). WhatsApp never delivers
// one-time codes to Indian (+91) numbers, so with "Pickup code check" on no code
// could go. The desk now asks the guardian in their own WhatsApp: the "pickup-approve"
// card's "Open Parent Link" button carries a one-time secret; the guardian taps
// Approve or "No, call the school"; the release checks the approval on the server
// and uses it once. A guardian with no Parent Link is checked by photo, ID or a call.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { encryptSecrets } from "@/lib/messaging/channels";
import { ensureReadyTemplates } from "@/lib/messaging/templates";
import { deliverMessage } from "@/lib/messaging/deliver";
import { createLink, findLink, newDeviceKey, revokeLink, splitTap, TAP_GONE, TAP_SECRET, tokenFor, type LinkFound } from "@/lib/parent-link/links";
import { confirmTap, PICKUP_CHOOSE, tapView } from "@/lib/parent-link/tap";
import { pickupCodeCheckFor, releaseStudent, type Released } from "@/lib/front-office/pickup";
import { askPickupApproval, pickupApprovals, spendApproval, TAP_CHECK } from "@/lib/front-office/pickup-tap";
import { KeptRefusal } from "@/lib/front-office/problem";
import { as, at, makeFrontOfficeSchool, TZ, type FoFixture } from "./fixture";

// The Student Pickup server action, as the signed-in person (the real role check runs first).
const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", async (original) => ({
  ...(await original<typeof import("@/lib/current")>()),
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school } };
    return { current, reach: requirePermission(view.permissions, module as never, action as never) };
  },
}));
const actions = await import("@/app/(school)/front-office/actions");
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };

let f: FoFixture;
let other: FoFixture;
let linkId = "";
let found: LinkFound;
const device = { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120", ipAddress: "10.0.0.9" };
const minutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

/** WhatsApp connected for real (Meta), SMS off, credits, and the "pickup-approve" card approved by WhatsApp. */
async function liveWhatsapp(s: FoFixture) {
  const sys = as(s, null);
  await withSchool(sys, async (tx) => {
    await tx.messagingChannel.create({ data: { schoolId: s.school.id, channel: "whatsapp", provider: "meta-cloud", isOn: true, environment: "live", config: { phoneNumberId: "1", businessAccountId: "2" }, ...encryptSecrets({ appSecret: "app-secret-1234", verifyToken: "verify-me", accessToken: "x" }) } });
    await tx.messagingChannel.create({ data: { schoolId: s.school.id, channel: "sms", provider: "sandbox", isOn: false, environment: "test" } });
    await tx.creditLedgerEntry.create({ data: { schoolId: s.school.id, channel: "whatsapp", amount: 1000, note: "Test top-up" } });
    await ensureReadyTemplates(tx, sys);
    const t = await tx.template.findFirstOrThrow({ where: { key: "pickup-approve", channel: "whatsapp" } });
    await tx.templateVersion.updateMany({ where: { templateId: t.id }, data: { whatsappStatus: "APPROVED", whatsappName: "pickup_approve_abc123", whatsappNote: null } });
    await tx.frontOfficeSetting.upsert({ where: { schoolId: s.school.id }, create: { schoolId: s.school.id, pickupCodeCheck: true }, update: { pickupCodeCheck: true } });
  });
}

// The tap link is written to the server log on a tester's computer (and in the tests), like other links.
const logged: string[] = [];
beforeAll(async () => {
  const original = console.info.bind(console);
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    const m = String(args[0]).match(/^\[dev\] one-time code .*\(pickup approval\): (\S+)$/);
    if (m) logged.push(m[1]);
    else original(...args);
  });
  f = await makeFrontOfficeSchool("Pickup Tap School");
  other = await makeFrontOfficeSchool("Pickup Tap Other School");
  await liveWhatsapp(f);
  await liveWhatsapp(other);
  linkId = (await withSchool(as(f, null), (tx) => createLink(tx, as(f, null), f.father.id))).id;
  found = (await findLink(tokenFor(linkId)))!;
  await withSchool(as(other, null), (tx) => createLink(tx, as(other, null), other.father.id));
}, 120_000);
afterEach(() => vi.unstubAllGlobals());

const desk = () => as(f, f.frontdesk.id);
/** Asks the father to approve Aarav's (or another child's) pickup; the secret from the tap link. */
async function ask(now: Date, studentId = f.aarav.id) {
  logged.length = 0;
  const sent = await withSchool(desk(), (tx) => askPickupApproval(tx, desk(), { studentId, guardianId: f.father.id, now }));
  const tap = splitTap(new URL(logged.at(-1)!).pathname.slice("/p/".length));
  expect(tap.token).toBe(tokenFor(linkId));
  expect(tap.secret).toMatch(TAP_SECRET);
  return { sent, secret: tap.secret! };
}
// The father has no photo on record, so the desk confirmed him on a call.
const release = (studentId: string, now: Date, s: FoFixture = f) =>
  withSchool(as(s, s.frontdesk.id), (tx) => releaseStudent(tx, as(s, s.frontdesk.id), { studentId, guardianId: s.father.id, photoMatch: false, otherCheck: "call", code: null, reason: "Unwell", otherReason: null, minute: null }, { timeZone: TZ, codeCheck: false, tapCheck: true, now }));
const released = (r: Released | KeptRefusal) => { if (r instanceof KeptRefusal) throw new Error(r.message); return r; };
const letAllOut = () => withSchool(as(f, null), (tx) => tx.gatePass.updateMany({ where: { kind: "PICKUP", status: "ISSUED" }, data: { status: "LEFT", leftAt: new Date() } }));
const state = (studentId: string, now: Date) => withSchool(desk(), async (tx) => (await pickupApprovals(tx, desk(), studentId, [f.father.id], TZ, now))[f.father.id]);

describe("where no code can go", () => {
  it("the pickup check asks for approval on WhatsApp instead", async () => {
    expect(await withSchool(desk(), (tx) => pickupCodeCheckFor(tx, desk(), true))).toEqual({ on: false, tap: true, why: null });
    expect(await withSchool(desk(), (tx) => pickupCodeCheckFor(tx, desk(), false))).toEqual({ on: false, tap: false, why: null });
  });

  it("a release without an approval is refused, by the server action too", async () => {
    const now = at("2026-10-07", "09:00");
    expect(await state(f.aarav.id, now)).toEqual({ state: "none" });
    await expect(release(f.aarav.id, now)).rejects.toThrow("Ask Rajesh to approve on WhatsApp first.");
    who.userId = f.frontdesk.id;
    who.schoolId = f.school.id;
    const r = await actions.releaseAction(null, form({ studentId: f.aarav.id, guardianId: f.father.id, otherCheck: "call", reason: "Unwell" }));
    expect(r).toMatchObject({ ok: false, errors: { approval: "Ask Rajesh to approve on WhatsApp first." } });
    expect(await withSchool(as(f, null), (tx) => tx.gatePass.count({ where: { studentId: f.aarav.id } }))).toBe(0);
  });
});

describe("tap to approve a pickup", () => {
  it("sends the pickup-approve card with the one-time secret only in its button; nothing stored holds it", async () => {
    // Fixed times, earliest first: the desk reads the newest request.
    const now = at("2026-10-07", "08:30");
    const { sent, secret } = await ask(now);
    expect(sent).toMatchObject({ name: "Rajesh Sharma", testMode: false });
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const job = as(f, null);
    await withSchool(job, (tx) => deliverMessage(tx, job, { messageId: sent.messageId!, round: "0", chunk: 0 }));
    const tpl = calls.find((c) => c.url.endsWith("/1/messages"))!.body.template as { name: string; components: { type: string; parameters: { text: string }[] }[] };
    expect(tpl.name).toBe("pickup_approve_abc123");
    expect(tpl.components.find((c) => c.type === "button")!.parameters[0].text).toBe(`${tokenFor(linkId)}.${secret}`);
    const body = JSON.stringify(tpl.components.filter((c) => c.type !== "button"));
    expect(body).toContain("Rajesh Sharma");
    expect(body).toContain("Aarav Sharma");
    expect(body).not.toContain(secret);
    const stored = await withSchool(as(f, null), async (tx) => JSON.stringify({
      m: await tx.message.findUniqueOrThrow({ where: { id: sent.messageId! } }),
      r: await tx.messageRecipient.findMany({ where: { messageId: sent.messageId! } }),
      codes: await tx.parentLinkCode.findMany({ where: { messageId: sent.messageId! } }),
      audit: await tx.auditLogEntry.findMany({ where: { recordId: f.aarav.id } }),
    }));
    expect(stored).not.toContain(secret);
    expect(stored).toContain("••••••");
    expect((await state(f.aarav.id, now)).state).toBe("waiting");
  });

  it("the guardian approves on the page, then the release is allowed and uses the approval once", async () => {
    const now = at("2026-10-07", "10:00");
    const { secret } = await ask(now);
    // The page only shows what is asked; opening it twice changes nothing.
    for (let i = 0; i < 2; i++) expect(await withSchool(as(f, null), (tx) => tapView(tx, linkId, secret, null, now))).toEqual({ kind: "pickup", person: "Rajesh Sharma", student: "Aarav" });
    // No answer chosen is never taken as a yes.
    expect(await confirmTap(found, secret, newDeviceKey(), device, now)).toEqual({ ok: false, message: PICKUP_CHOOSE });
    expect(await confirmTap(found, secret, newDeviceKey(), device, minutes(now, 1), "approved")).toEqual({ ok: true, kind: "pickup", answer: "approved", person: "Rajesh Sharma", student: "Aarav" });
    expect(await state(f.aarav.id, minutes(now, 2))).toEqual({ state: "approved", by: "Rajesh Sharma", at: "10:01 AM" });
    // Used once: the same tap again does nothing.
    expect(await confirmTap(found, secret, newDeviceKey(), device, minutes(now, 2), "declined")).toEqual({ ok: false, message: TAP_GONE });

    const r = released(await release(f.aarav.id, minutes(now, 3)));
    expect(r.pass.verification).toBe(`call to a guardian, ${TAP_CHECK}`);
    const lines = await withSchool(as(f, null), (tx) => tx.auditLogEntry.findMany({ where: { recordId: f.aarav.id, action: { in: ["pickup-approval-asked", "pickup-approved", "pickup-approval-used"] }, at: { gte: new Date(Date.now() - 60_000) } }, select: { action: true } }));
    expect(new Set(lines.map((l) => l.action))).toEqual(new Set(["pickup-approval-asked", "pickup-approved", "pickup-approval-used"]));
    // The approval cannot release the child a second time.
    await letAllOut();
    await expect(withSchool(desk(), (tx) => spendApproval(tx, desk(), { studentId: f.aarav.id, guardianId: f.father.id, first: "Rajesh", student: "Aarav", timeZone: TZ }, minutes(now, 4)))).rejects.toThrow("Ask Rajesh to approve on WhatsApp first.");
    await expect(release(f.aarav.id, minutes(now, 4))).rejects.toThrow("Ask Rajesh to approve on WhatsApp first.");
  });

  it("a No blocks the release with a clear note", async () => {
    const now = at("2026-10-07", "11:00");
    const { secret } = await ask(now);
    expect(await confirmTap(found, secret, newDeviceKey(), device, minutes(now, 1), "declined")).toMatchObject({ ok: true, kind: "pickup", answer: "declined" });
    expect(await state(f.aarav.id, minutes(now, 2))).toMatchObject({ state: "declined", at: "11:01 AM" });
    await expect(release(f.aarav.id, minutes(now, 2))).rejects.toThrow("Rajesh said no on WhatsApp at 11:01 AM. Do not release Aarav. Call Rajesh, or ask again.");
    const line = await withSchool(as(f, null), (tx) => tx.auditLogEntry.findFirst({ where: { recordId: f.aarav.id, action: "pickup-declined" }, orderBy: { at: "desc" } }));
    expect(JSON.stringify(line?.after)).toContain("by a tap on the school's WhatsApp message");
  });

  it("a request or an approval that ran out is refused", async () => {
    const now = at("2026-10-07", "12:00");
    const { secret: late } = await ask(now);
    // The guardian taps after the code minutes (10 by default).
    expect(await confirmTap(found, late, newDeviceKey(), device, minutes(now, 11), "approved")).toEqual({ ok: false, message: TAP_GONE });
    expect(await state(f.aarav.id, minutes(now, 11))).toEqual({ state: "expired" });
    await expect(release(f.aarav.id, minutes(now, 11))).rejects.toThrow("The approval on WhatsApp ran out. Ask Rajesh again.");
    // A newer request replaces an older one that was not answered.
    const later = minutes(now, 12);
    const { secret: first } = await ask(later);
    const { secret: second } = await ask(minutes(later, 1));
    expect(await confirmTap(found, first, newDeviceKey(), device, minutes(later, 2), "approved")).toEqual({ ok: false, message: TAP_GONE });
    expect(await confirmTap(found, second, newDeviceKey(), device, minutes(later, 2), "approved")).toMatchObject({ ok: true, answer: "approved" });
    // Approved, but the desk waited longer than the code minutes.
    await expect(release(f.aarav.id, minutes(later, 13))).rejects.toThrow("Ask Rajesh to approve on WhatsApp first.");
  });

  it("an approval for another child, or from another school, is refused", async () => {
    const now = at("2026-10-07", "13:00");
    const { secret } = await ask(now);
    expect(await confirmTap(found, secret, newDeviceKey(), device, minutes(now, 1), "approved")).toMatchObject({ ok: true });
    // Aarav was approved, not his sister Diya.
    await expect(release(f.diya.id, minutes(now, 2))).rejects.toThrow("Ask Rajesh to approve on WhatsApp first.");
    // Another school sees neither the request nor the approval.
    expect(await withSchool(as(other, null), (tx) => tapView(tx, linkId, secret, null, minutes(now, 2)))).toBeNull();
    await expect(release(other.aarav.id, minutes(now, 2), other)).rejects.toThrow("Ask Rajesh to approve on WhatsApp first.");
    await expect(withSchool(as(other, null), (tx) => tx.parentLinkCode.count({ where: { parentLinkId: linkId } }))).resolves.toBe(0);
    // Aarav's own approval still works.
    expect(released(await release(f.aarav.id, minutes(now, 2))).pass.verification).toContain(TAP_CHECK);
    await letAllOut();
  });

  it("a child the guardian may no longer act for is refused on the page", async () => {
    const now = at("2026-10-07", "14:00");
    const { secret } = await ask(now, f.diya.id);
    const sg = await withSchool(as(f, null), (tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId: f.diya.id, guardianId: f.father.id } }));
    await withSchool(as(f, null), (tx) => tx.studentGuardian.update({ where: { id: sg.id }, data: { restriction: "Court order: may not collect the child." } }));
    expect(await withSchool(as(f, null), (tx) => tapView(tx, linkId, secret, null, minutes(now, 1)))).toBeNull();
    expect(await confirmTap(found, secret, newDeviceKey(), device, minutes(now, 1), "approved")).toEqual({ ok: false, message: "This request is not for your child. Please call the school." });
    await withSchool(as(f, null), (tx) => tx.studentGuardian.update({ where: { id: sg.id }, data: { restriction: null } }));
  });
});

describe("with no Parent Link", () => {
  it("the desk falls back to the photo, ID or call check", async () => {
    const now = at("2026-10-07", "15:00");
    await withSchool(as(f, f.admin.id), (tx) => revokeLink(tx, as(f, f.admin.id), linkId, "Lost phone"));
    expect(await state(f.aarav.id, now)).toEqual({ state: "no-link" });
    await expect(withSchool(desk(), (tx) => askPickupApproval(tx, desk(), { studentId: f.aarav.id, guardianId: f.father.id, now }))).rejects.toThrow("Rajesh has no Parent Link, so approval cannot be asked on WhatsApp. Check the photo, ID proof or call a guardian instead.");
    expect(released(await release(f.aarav.id, now)).pass.verification).toBe("call to a guardian");
  });
});
