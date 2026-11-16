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
import { pickupCodeCheckFor, releaseStudent, type ReleaseInput, type Released } from "@/lib/front-office/pickup";
import { askPickupApproval, checkPickupAnswer, LEADER_CHECK, pickupApprovals, TAP_CHECK, TAP_FALLBACK_CHECK } from "@/lib/front-office/pickup-tap";
import type { CampusLimit } from "@/lib/campus";
import { makeUser } from "../helpers";
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
/** Any person, any guardian, with extra fields (a leader's note, the call fallback) or options (a campus limit). */
const releaseAs = (userId: string, studentId: string, guardianId: string, now: Date, extra: Partial<ReleaseInput> = {}, opts: { limit?: CampusLimit } = {}) =>
  withSchool(as(f, userId), (tx) => releaseStudent(tx, as(f, userId), { studentId, guardianId, photoMatch: false, otherCheck: "call", code: null, reason: "Unwell", otherReason: null, minute: null, ...extra }, { timeZone: TZ, codeCheck: false, tapCheck: true, now, ...opts }));
const released = (r: Released | KeptRefusal) => { if (r instanceof KeptRefusal) throw new Error(r.message); return r; };
/** A refused release is kept (its audit line stays), so it comes back as a KeptRefusal. */
const refusal = (r: Released | KeptRefusal) => (r instanceof KeptRefusal ? r.message : `released with ${r.pass.passNo}`);
const audits = (studentId: string, action: string) => withSchool(as(f, null), (tx) => tx.auditLogEntry.findMany({ where: { recordId: studentId, action }, orderBy: { at: "asc" } }));
const letAllOut = () => withSchool(as(f, null), (tx) => tx.gatePass.updateMany({ where: { kind: "PICKUP", status: "ISSUED" }, data: { status: "LEFT", leftAt: new Date() } }));
const state = (studentId: string, now: Date) => withSchool(desk(), async (tx) => (await pickupApprovals(tx, desk(), studentId, [f.father.id], { timeZone: TZ, now }))[f.father.id]);

describe("where no code can go", () => {
  it("the pickup check asks for approval on WhatsApp instead", async () => {
    expect(await withSchool(desk(), (tx) => pickupCodeCheckFor(tx, desk(), true))).toEqual({ on: false, tap: true, why: null });
    expect(await withSchool(desk(), (tx) => pickupCodeCheckFor(tx, desk(), false))).toEqual({ on: false, tap: false, why: null });
  });

  it("a release without an approval is refused, by the server action too", async () => {
    const now = at("2026-10-07", "09:00");
    expect(await state(f.aarav.id, now)).toEqual({ state: "none" });
    expect(refusal(await release(f.aarav.id, now))).toBe("Ask Rajesh to approve on WhatsApp first.");
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
    const again = await withSchool(desk(), (tx) => checkPickupAnswer(tx, desk(), { studentId: f.aarav.id, guardianId: f.father.id, first: "Rajesh", student: "Aarav", timeZone: TZ }, { tapCheck: true, fallback: null, leaderNote: null }, minutes(now, 4)));
    expect(again).toBeInstanceOf(KeptRefusal);
    expect((again as KeptRefusal).message).toBe("Ask Rajesh to approve on WhatsApp first.");
    expect(refusal(await release(f.aarav.id, minutes(now, 4)))).toBe("Ask Rajesh to approve on WhatsApp first.");
  });

  it("a No blocks the release with a clear note", async () => {
    const now = at("2026-10-07", "11:00");
    const { secret } = await ask(now);
    expect(await confirmTap(found, secret, newDeviceKey(), device, minutes(now, 1), "declined")).toMatchObject({ ok: true, kind: "pickup", answer: "declined" });
    expect(await state(f.aarav.id, minutes(now, 2))).toMatchObject({ state: "declined", at: "11:01 AM" });
    expect(refusal(await release(f.aarav.id, minutes(now, 2)))).toBe("Rajesh Sharma said no on WhatsApp at 11:01 AM. Do not release Aarav to anyone before 11:11 AM, unless the Principal or a School Admin allows it.");
    const line = await withSchool(as(f, null), (tx) => tx.auditLogEntry.findFirst({ where: { recordId: f.aarav.id, action: "pickup-declined" }, orderBy: { at: "desc" } }));
    expect(JSON.stringify(line?.after)).toContain("by a tap on the school's WhatsApp message");
  });

  it("a request or an approval that ran out is refused", async () => {
    const now = at("2026-10-07", "12:00");
    const { secret: late } = await ask(now);
    // The guardian taps after the code minutes (10 by default).
    expect(await confirmTap(found, late, newDeviceKey(), device, minutes(now, 11), "approved")).toEqual({ ok: false, message: TAP_GONE });
    expect(await state(f.aarav.id, minutes(now, 11))).toEqual({ state: "expired" });
    expect(refusal(await release(f.aarav.id, minutes(now, 11)))).toBe("The approval on WhatsApp ran out. Ask Rajesh again.");
    // A newer request replaces an older one that was not answered.
    const later = minutes(now, 12);
    const { secret: first } = await ask(later);
    const { secret: second } = await ask(minutes(later, 1));
    expect(await confirmTap(found, first, newDeviceKey(), device, minutes(later, 2), "approved")).toEqual({ ok: false, message: TAP_GONE });
    expect(await confirmTap(found, second, newDeviceKey(), device, minutes(later, 2), "approved")).toMatchObject({ ok: true, answer: "approved" });
    // Approved, but the desk waited longer than the code minutes.
    expect(refusal(await release(f.aarav.id, minutes(later, 13)))).toBe("Ask Rajesh to approve on WhatsApp first.");
  });

  it("an approval for another child, or from another school, is refused", async () => {
    const now = at("2026-10-07", "13:00");
    const { secret } = await ask(now);
    expect(await confirmTap(found, secret, newDeviceKey(), device, minutes(now, 1), "approved")).toMatchObject({ ok: true });
    // Aarav was approved, not his sister Diya.
    expect(refusal(await release(f.diya.id, minutes(now, 2)))).toBe("Ask Rajesh to approve on WhatsApp first.");
    // Another school sees neither the request nor the approval.
    expect(await withSchool(as(other, null), (tx) => tapView(tx, linkId, secret, null, minutes(now, 2)))).toBeNull();
    expect(refusal(await release(other.aarav.id, minutes(now, 2), other))).toBe("Ask Rajesh to approve on WhatsApp first.");
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

describe("a No warns the school and blocks every release of the child", () => {
  it("tells the leaders and the class teacher, blocks another guardian with no Parent Link, and only a leader's note allows it", async () => {
    const grandma = await withSchool(as(f, null), async (tx) => {
      const g = await tx.guardian.create({ data: { schoolId: f.school.id, name: "Kamala Sharma", relationship: "Grandmother", phone: "9849031266" } });
      await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: f.aarav.id, guardianId: g.id, relationship: "Grandmother" } });
      return g;
    });
    const now = at("2026-10-08", "09:00");
    const { secret } = await ask(now);
    expect(await confirmTap(found, secret, newDeviceKey(), device, minutes(now, 1), "declined")).toMatchObject({ ok: true, answer: "declined" });
    const told = await withSchool(as(f, null), (tx) => tx.notification.findMany({ where: { type: "pickup-refused", link: `/front-office/pickup?student=${f.aarav.id}` }, select: { userLoginId: true, text: true } }));
    for (const person of [f.principal.id, f.admin.id, f.classTeacher.id]) expect(told.map((n) => n.userLoginId)).toContain(person);
    expect(told[0].text).toMatch(/^Rajesh Sharma said no on WhatsApp at .* to taking Aarav Sharma home\. Do not release Aarav to anyone before/);

    // The desk chooses the grandmother (no Parent Link) and ticks "called": still refused, and the try is kept.
    const before = (await audits(f.aarav.id, "pickup-release-refused")).length;
    const r = await releaseAs(f.frontdesk.id, f.aarav.id, grandma.id, minutes(now, 2));
    expect(refusal(r)).toMatch(/^Rajesh Sharma said no on WhatsApp at .*\. Do not release Aarav to anyone before .*, unless the Principal or a School Admin allows it\.$/);
    expect((await audits(f.aarav.id, "pickup-release-refused")).length).toBe(before + 1);
    // Only a Principal or School Admin may allow it, with a note.
    await expect(releaseAs(f.frontdesk.id, f.aarav.id, grandma.id, minutes(now, 2), { leaderNote: "I say it is fine" })).rejects.toThrow("Only the Principal or a School Admin can allow this release.");
    await expect(releaseAs(f.admin.id, f.aarav.id, grandma.id, minutes(now, 2), { leaderNote: "ok" })).rejects.toThrow("Write why you are allowing this release.");
    const ok = released(await releaseAs(f.admin.id, f.aarav.id, grandma.id, minutes(now, 3), { leaderNote: "Mother called the Principal: grandmother may collect today." }));
    expect(ok.pass.verification).toBe(`call to a guardian, ${LEADER_CHECK}`);
    expect(JSON.stringify((await audits(f.aarav.id, "pickup-allowed-by-leader")).at(-1)?.after)).toContain("Mother called the Principal");
    await letAllOut();
    // After the code minutes the block is gone.
    expect(released(await releaseAs(f.frontdesk.id, f.aarav.id, grandma.id, minutes(now, 12))).pass.verification).toBe("call to a guardian");
    await letAllOut();
  });
});

describe("a child is never stuck", () => {
  it("when the request did not reach WhatsApp, a call is a real, audited fallback", async () => {
    const now = at("2026-10-08", "10:00");
    const { sent } = await ask(now);
    await withSchool(as(f, null), (tx) => tx.messageRecipient.updateMany({ where: { messageId: sent.messageId! }, data: { status: "FAILED", failReason: "Not a WhatsApp number" } }));
    expect(await state(f.aarav.id, minutes(now, 1))).toEqual({ state: "failed" });
    expect(refusal(await release(f.aarav.id, minutes(now, 1)))).toBe("The request did not reach Rajesh’s WhatsApp. Call Rajesh, and tick that they confirmed on the call.");
    const r = released(await releaseAs(f.frontdesk.id, f.aarav.id, f.father.id, minutes(now, 2), { tapFallback: "call" }));
    expect(r.pass.verification).toBe(`call to a guardian, ${TAP_FALLBACK_CHECK}`);
    expect(JSON.stringify((await audits(f.aarav.id, "pickup-approval-fallback")).at(-1)?.after)).toContain("approval could not be sent, checked by a call");
    await letAllOut();
  });

  it("when the guardian does not answer, a Principal or School Admin can allow it with a note", async () => {
    const now = at("2026-10-08", "11:00");
    await ask(now);
    expect(refusal(await release(f.aarav.id, minutes(now, 1)))).toBe("Rajesh has not approved on WhatsApp yet. Wait for the answer, or ask again.");
    const r = released(await releaseAs(f.principal.id, f.aarav.id, f.father.id, minutes(now, 2), { leaderNote: "Father's phone is switched off; he is known to the office." }));
    expect(r.pass.verification).toBe(`call to a guardian, ${LEADER_CHECK}`);
    await letAllOut();
  });
});

describe("a desk kept to one campus", () => {
  it("cannot ask, read or release for another campus's child", async () => {
    const main = f.school.campus.id;
    const { kiran, northDesk } = await withSchool(as(f, null), async (tx) => {
      const south = await tx.campus.create({ data: { schoolId: f.school.id, name: "South campus" } });
      const kiran = await tx.student.create({ data: { schoolId: f.school.id, campusId: south.id, admissionNo: "ADM-S1", firstName: "Kiran", lastName: "Sharma", fullName: "Kiran Sharma", status: "ACTIVE" } });
      await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: kiran.id, guardianId: f.father.id, relationship: "Father" } });
      return { kiran, northDesk: null as null | { id: string } };
    }).then(async (x) => {
      const u = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["receptionist"] }], name: "Main Campus Desk" });
      await withSchool(as(f, null), (tx) => tx.schoolAccess.updateMany({ where: { schoolId: f.school.id, userLoginId: u.id }, data: { scope: "CAMPUS", campusId: main } }));
      return { ...x, northDesk: u };
    });
    const limit = { campusId: main };
    const now = at("2026-10-08", "12:00");
    await expect(withSchool(desk(), (tx) => askPickupApproval(tx, desk(), { studentId: kiran.id, guardianId: f.father.id, limit, now }))).rejects.toThrow("This student was not found.");
    await expect(withSchool(desk(), (tx) => pickupApprovals(tx, desk(), kiran.id, [f.father.id], { timeZone: TZ, now, limit }))).rejects.toThrow("This student was not found.");
    await expect(releaseAs(f.frontdesk.id, kiran.id, f.father.id, now, {}, { limit })).rejects.toThrow("This student was not found.");
    // The same through the desk's own actions, signed in as the one-campus person.
    who.userId = northDesk.id;
    who.schoolId = f.school.id;
    expect(await actions.askApprovalAction(null, form({ studentId: kiran.id, guardianId: f.father.id }))).toMatchObject({ ok: false, message: "This student was not found." });
    expect(await actions.approvalNowAction(kiran.id, f.father.id)).toBeNull();
    expect(await actions.approvalNowAction(f.aarav.id, f.father.id)).not.toBeNull();
    expect(await actions.releaseAction(null, form({ studentId: kiran.id, guardianId: f.father.id, otherCheck: "call", reason: "Unwell" }))).toMatchObject({ ok: false, message: "This student was not found." });
    expect(await withSchool(as(f, null), (tx) => tx.parentLinkCode.count({ where: { detail: { path: ["studentId"], equals: kiran.id } } }))).toBe(0);
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
