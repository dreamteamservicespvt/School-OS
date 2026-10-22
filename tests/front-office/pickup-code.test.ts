// Student Pickup code guessing (gap list G04; 16-front-office.md §2). The code to the
// guardian's phone has 4 digits, so wrong codes are limited: a few per code, and too
// many in an hour for one student (whoever types them) or by one person at the desk
// (whichever students) lock code checks for an hour. Every wrong code is kept and
// written to the audit log even though the child is not released; during a lock even
// the right code is refused; the Principal and School Admins are told and it shows in
// Security alerts. Codes come from the server log, as on a tester's computer.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { encryptSecrets } from "@/lib/messaging/channels";
import { ensureReadyTemplates } from "@/lib/messaging/templates";
import { daysAgo, securityAlerts } from "@/lib/data-security/alerts";
import { KeptRefusal } from "@/lib/front-office/problem";
import { PICKUP_CODE_TRIES, PICKUP_LOCK_MS, PICKUP_WRONG_LIMIT, pickupCodeLock, releaseStudent, sendPickupCode, type Released } from "@/lib/front-office/pickup";
import { clockAt } from "@/lib/front-office/time";
import { takeLoggedCode, watchLoggedCodes } from "../helpers";
import { as, at, makeFrontOfficeSchool, TZ, type FoFixture } from "./fixture";

watchLoggedCodes();

// The Student Pickup server action, as the signed-in person (the real role check runs first).
const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school } };
    return { current, reach: requirePermission(view.permissions, module as never, action as never) };
  },
}));
const actions = await import("@/app/(school)/front-office/actions");
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };

const minutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);
/** Any 4 digits that are not the code. */
const wrongFor = (code: string) => String((Number(code) + 1) % 10_000).padStart(4, "0");

let f: FoFixture;
beforeAll(async () => {
  f = await makeFrontOfficeSchool("Pickup Code School");
  const sys = as(f, null);
  // Messages in Test mode, with credits, so a pickup code can be sent.
  await withSchool(sys, async (tx) => {
    for (const channel of ["whatsapp", "sms"]) {
      await tx.messagingChannel.create({ data: { schoolId: f.school.id, channel, provider: "sandbox", isOn: true, environment: "test", ...(channel === "whatsapp" ? encryptSecrets({ appSecret: "app-secret-1234", verifyToken: "verify-me", accessToken: "x" }) : encryptSecrets({ webhookKey: "msg91-key-123456" })) } });
      await tx.creditLedgerEntry.create({ data: { schoolId: f.school.id, channel, amount: 1000, note: "Test top-up" } });
    }
    await ensureReadyTemplates(tx, sys);
  });
}, 120_000);

const send = async (userId: string, studentId: string, now: Date) => {
  await withSchool(as(f, userId), (tx) => sendPickupCode(tx, as(f, userId), studentId, f.father.id, now));
  return takeLoggedCode();
};
// The father has no photo on record, so the desk confirmed him on a call.
const release = (userId: string, studentId: string, code: string, now: Date) =>
  withSchool(as(f, userId), (tx) => releaseStudent(tx, as(f, userId), { studentId, guardianId: f.father.id, photoMatch: false, otherCheck: "call", code, reason: "Unwell", otherReason: null, minute: null }, { timeZone: TZ, codeCheck: true, now }));
const refusal = (r: Released | KeptRefusal) => (r instanceof KeptRefusal ? r.message : `released with ${r.pass.passNo}`);
const tries = (studentId: string) => withSchool(as(f, null), (tx) => tx.pickupCodeTry.findMany({ where: { studentId }, orderBy: { at: "asc" } }));
const audits = (studentId: string, action: string) => withSchool(as(f, null), (tx) => tx.auditLogEntry.findMany({ where: { recordId: studentId, action }, orderBy: { at: "asc" } }));
const passes = (studentId: string, from: Date) => withSchool(as(f, null), (tx) => tx.gatePass.count({ where: { studentId, kind: "PICKUP", createdAt: { gte: from } } }));

describe("a wrong pickup code", () => {
  const day = at("2026-10-06", "09:00");
  let first = "";

  it("is counted, kept and written to the audit log, though the child is not released", async () => {
    const code = await send(f.frontdesk.id, f.aarav.id, day);
    first = code;
    const startedAt = new Date();
    const r = await release(f.frontdesk.id, f.aarav.id, wrongFor(code), minutes(day, 1));
    expect(r).toBeInstanceOf(KeptRefusal);
    expect(r).toMatchObject({ field: "code", message: `That code is not right. Ask them to read it again. ${PICKUP_CODE_TRIES - 1} more tries for this code.` });
    expect(await tries(f.aarav.id)).toMatchObject([{ guardianId: f.father.id, enteredById: f.frontdesk.id, studentLockedUntil: null, personLockedUntil: null }]);
    const lines = await audits(f.aarav.id, "pickup-code-wrong");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ userLoginId: f.frontdesk.id, recordType: "Student", after: { guardianId: f.father.id, triesLeftOnCode: 4, wrongForStudentInHour: 1, wrongByPersonInHour: 1 } });
    // The code itself is never written down.
    expect(JSON.stringify(lines)).not.toContain(code);
    const row = await withSchool(as(f, null), (tx) => tx.pickupCode.findFirstOrThrow({ where: { studentId: f.aarav.id }, orderBy: { createdAt: "desc" } }));
    expect(row.attempts).toBe(1);
    expect(await passes(f.aarav.id, startedAt)).toBe(0);
  });

  it(`stops one code after ${PICKUP_CODE_TRIES} wrong tries: then even its right code is refused, and a new code works`, async () => {
    const row = await withSchool(as(f, null), (tx) => tx.pickupCode.findFirstOrThrow({ where: { studentId: f.aarav.id }, orderBy: { createdAt: "desc" } }));
    const messages: string[] = [];
    for (let i = 2; i <= PICKUP_CODE_TRIES; i++) messages.push(refusal(await release(f.frontdesk.id, f.aarav.id, wrongFor(first), minutes(day, i))));
    const after = await withSchool(as(f, null), (tx) => tx.pickupCode.findUniqueOrThrow({ where: { id: row.id } }));
    expect(messages.at(-2)).toBe("That code is not right. Ask them to read it again. 1 more try for this code.");
    expect(messages.at(-1)).toBe(`That code is not right, and after ${PICKUP_CODE_TRIES} wrong tries it no longer works. Send a new code, or call the guardian.`);
    expect(after.attempts).toBe(PICKUP_CODE_TRIES);
    await expect(release(f.frontdesk.id, f.aarav.id, first, minutes(day, 7))).rejects.toThrow("Too many wrong codes. Send a new code, or call the guardian.");

    const fresh = await send(f.frontdesk.id, f.aarav.id, minutes(day, 8));
    const done = await release(f.frontdesk.id, f.aarav.id, fresh, minutes(day, 9));
    if (done instanceof KeptRefusal) throw new Error(done.message);
    expect(done.pass.verification).toBe("call to a guardian, code");
    expect(await audits(f.aarav.id, "pickup-code-locked")).toHaveLength(0);
  });
});

describe(`${PICKUP_WRONG_LIMIT} wrong codes in an hour for one student`, () => {
  const day = at("2026-10-07", "09:00");
  let right = "";
  let lockedAt = day;

  it("lock code checks for that student, whoever typed them", async () => {
    // Five wrong on the first code (the desk), four on the second and one on the third (Office Staff).
    const a = await send(f.frontdesk.id, f.diya.id, day);
    for (let i = 1; i <= 5; i++) await release(f.frontdesk.id, f.diya.id, wrongFor(a), minutes(day, i));
    const b = await send(f.office.id, f.diya.id, minutes(day, 6));
    for (let i = 7; i <= 10; i++) await release(f.office.id, f.diya.id, wrongFor(b), minutes(day, i));
    right = await send(f.office.id, f.diya.id, minutes(day, 11));
    lockedAt = minutes(day, 12);
    const r = await release(f.office.id, f.diya.id, wrongFor(right), lockedAt);
    const until = new Date(lockedAt.getTime() + PICKUP_LOCK_MS);
    expect(refusal(r)).toBe(`Code checks for Diya are locked until ${clockAt(until, TZ)} after ${PICKUP_WRONG_LIMIT} wrong codes in an hour. Even the right code is not accepted before then. The Principal and School Admins have been told.`);
    const kept = await tries(f.diya.id);
    expect(kept).toHaveLength(PICKUP_WRONG_LIMIT);
    expect(kept.at(-1)).toMatchObject({ studentLockedUntil: until, personLockedUntil: null });
    expect(await audits(f.diya.id, "pickup-code-wrong")).toHaveLength(PICKUP_WRONG_LIMIT);
    expect((await audits(f.diya.id, "pickup-code-locked")).map((l) => l.after)).toEqual([{ guardianId: f.father.id, lockedFor: "student", lockedUntil: until.toISOString(), wrongCodes: PICKUP_WRONG_LIMIT }]);
  });

  it("refuse even the right code until the lock ends, and send no new code", async () => {
    const r = await release(f.frontdesk.id, f.diya.id, right, minutes(lockedAt, 1));
    expect(r).toBeInstanceOf(KeptRefusal);
    expect(refusal(r)).toMatch(/^Code checks for Diya are locked until .* Even the right code is not accepted before then\./);
    expect(await passes(f.diya.id, day)).toBe(0);
    expect(await audits(f.diya.id, "pickup-code-refused-locked")).toHaveLength(1);
    // The code was not used up: it still works once the lock has ended, if it has not expired.
    await expect(withSchool(as(f, f.frontdesk.id), (tx) => sendPickupCode(tx, as(f, f.frontdesk.id), f.diya.id, f.father.id, minutes(lockedAt, 30))))
      .rejects.toThrow(/^Code checks for Diya are locked until/);
    expect(await withSchool(as(f, f.frontdesk.id), (tx) => pickupCodeLock(tx, f.diya.id, f.frontdesk.id, minutes(lockedAt, 59)))).toMatchObject({ by: "student" });
    expect(await withSchool(as(f, f.frontdesk.id), (tx) => pickupCodeLock(tx, f.diya.id, f.frontdesk.id, minutes(lockedAt, 61)))).toBeNull();
  });

  it("tell the Principal and the School Admin, and show in Security alerts", async () => {
    for (const leader of [f.principal.id, f.admin.id]) {
      const notes = await withSchool(as(f, leader), (tx) => tx.notification.findMany({ where: { userLoginId: leader, type: "security", text: { contains: "Pickup code checks" } } }));
      expect(notes.map((n) => [n.text, n.link])).toEqual([[
        `Pickup code checks for Diya Sharma (1 A) are locked until ${clockAt(new Date(lockedAt.getTime() + PICKUP_LOCK_MS), TZ)} after ${PICKUP_WRONG_LIMIT} wrong codes in an hour, the last typed by Office Person. Check with the front desk that the right person is collecting.`,
        "/settings/data-security",
      ]]);
    }
    const alerts = await withSchool(as(f, f.admin.id), (tx) => securityAlerts(tx, daysAgo(365, minutes(lockedAt, 1))));
    expect(alerts.filter((a) => a.recordId === f.diya.id)).toMatchObject([{ kind: "Student Pickup code checks locked after wrong codes", tone: "danger", userLoginId: f.office.id }]);
  });

  it("after the lock, a new code works again", async () => {
    const later = minutes(lockedAt, PICKUP_LOCK_MS / 60_000 + 5);
    const fresh = await send(f.frontdesk.id, f.diya.id, later);
    const done = await release(f.frontdesk.id, f.diya.id, fresh, minutes(later, 1));
    if (done instanceof KeptRefusal) throw new Error(done.message);
    expect(done.pass.kind).toBe("PICKUP");
  });
});

describe(`${PICKUP_WRONG_LIMIT} wrong codes in an hour by one person at the desk`, () => {
  const day = at("2026-10-08", "09:00");

  it("lock that person's code checks for every student, while others at the desk carry on", async () => {
    // The guardian pickups of earlier days are done; Office Staff now type wrong codes for two children.
    const a = await send(f.office.id, f.aarav.id, day);
    for (let i = 1; i <= 5; i++) await release(f.office.id, f.aarav.id, wrongFor(a), minutes(day, i));
    const d = await send(f.office.id, f.diya.id, minutes(day, 6));
    for (let i = 7; i <= 10; i++) await release(f.office.id, f.diya.id, wrongFor(d), minutes(day, i));
    const lockedAt = minutes(day, 11);
    const r = await release(f.office.id, f.diya.id, wrongFor(d), lockedAt);
    const until = new Date(lockedAt.getTime() + PICKUP_LOCK_MS);
    expect(refusal(r)).toBe(`Your code checks are locked until ${clockAt(until, TZ)} after ${PICKUP_WRONG_LIMIT} wrong pickup codes in an hour. Even the right code is not accepted before then. The Principal and School Admins have been told.`);
    expect((await audits(f.diya.id, "pickup-code-locked")).at(-1)?.after).toMatchObject({ lockedFor: "person", lockedUntil: until.toISOString() });

    // Another person sends a new code; the locked person cannot use even that right code, or send one.
    const fresh = await send(f.frontdesk.id, f.diya.id, minutes(day, 14));
    expect(refusal(await release(f.office.id, f.diya.id, fresh, minutes(day, 15)))).toMatch(/^Your code checks are locked until/);
    await expect(withSchool(as(f, f.office.id), (tx) => sendPickupCode(tx, as(f, f.office.id), f.aarav.id, f.father.id, minutes(day, 15)))).rejects.toThrow(/^Your code checks are locked until/);
    const done = await release(f.frontdesk.id, f.diya.id, fresh, minutes(day, 16));
    if (done instanceof KeptRefusal) throw new Error(done.message);
    expect(done.pass.kind).toBe("PICKUP");

    const note = await withSchool(as(f, f.principal.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.principal.id, type: "security", text: { contains: "Office Person typed" } } }));
    expect(note?.text).toBe(`Office Person typed ${PICKUP_WRONG_LIMIT} wrong pickup codes in an hour, the last for Diya Sharma (1 A). Their code checks are locked until ${clockAt(until, TZ)}. Check with the front desk that the right person is collecting.`);
  });
});

describe("the Student Pickup action", () => {
  it("keeps a wrong code's count and audit line, though it answers with a refusal (it used to be undone with it)", async () => {
    await withSchool(as(f, null), (tx) => tx.frontOfficeSetting.upsert({ where: { schoolId: f.school.id }, create: { schoolId: f.school.id, pickupCodeCheck: true }, update: { pickupCodeCheck: true } }));
    const code = await send(f.frontdesk.id, f.aarav.id, new Date());
    const before = { tries: (await tries(f.aarav.id)).length, lines: (await audits(f.aarav.id, "pickup-code-wrong")).length };
    who.userId = f.frontdesk.id;
    who.schoolId = f.school.id;
    const r = await actions.releaseAction(null, form({ studentId: f.aarav.id, guardianId: f.father.id, otherCheck: "call", code: wrongFor(code), reason: "Unwell" }));
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/^That code is not right\./), errors: { code: expect.stringMatching(/^That code is not right\./) } });
    expect((await tries(f.aarav.id)).length).toBe(before.tries + 1);
    expect((await audits(f.aarav.id, "pickup-code-wrong")).length).toBe(before.lines + 1);
  });
});
