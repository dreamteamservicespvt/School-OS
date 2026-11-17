// "How did this message do" (research 2026-11-15, Inkwelly section 3 row 9): the rings and the
// By channel bars count one message's own recipient rows. Read counts as delivered, test mode is
// never delivered, SMS backup copies are not extra people, a message still going says so, a channel
// with no delivery report is not shown as 0% read, a one-campus login counts only its campus, and
// another school's rows never count, even one that names this school's message.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { recipientCampusWhere } from "@/lib/communication/history";
import { messageSummary, share } from "@/lib/communication/summary";
import { makeSchool } from "../helpers";
import { makeCommSchool } from "./fixture";

type F = Awaited<ReturnType<typeof makeCommSchool>>;
let f: F;
let other: Awaited<ReturnType<typeof makeSchool>>;
let mixedId: string;
let goingId: string;
let otherMessageId: string;
let northCampusId: string;

type Row = { channel: string; status: "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"; provider?: string | null; isBackup?: boolean; guardianId?: string | null };
const rowsOf = (schoolId: string, messageId: string, rows: Row[]) =>
  rows.map((r, i) => ({ schoolId, messageId, recipientType: "guardian", guardianId: r.guardianId ?? null, name: `Parent ${i}`, channel: r.channel, address: `98765${String(i).padStart(5, "0")}`, text: "PTM on Saturday", status: r.status, provider: r.provider === undefined ? (r.channel === "app" ? "app" : "meta-cloud") : r.provider, isBackup: r.isBackup ?? false }));
const times = (n: number, r: Row): Row[] => Array.from({ length: n }, () => r);

beforeAll(async () => {
  f = await makeCommSchool();
  other = await makeSchool("Other Summary School");
  const g = f.father.id;
  await withSchool(f.ctx, async (tx) => {
    // WhatsApp: 2 read, 3 delivered, 1 sent with no report, 1 failed, 1 in test mode. App: 2 read, 2 delivered.
    // One SMS backup copy for someone already counted.
    const mixed = await tx.message.create({ data: { schoolId: f.school.id, body: "PTM on Saturday", channels: ["whatsapp", "app"], audienceLabel: "Parents of Class 5", status: "SENT", smsBackup: true } });
    mixedId = mixed.id;
    await tx.messageRecipient.createMany({ data: rowsOf(f.school.id, mixed.id, [
      ...times(2, { channel: "whatsapp", status: "READ", guardianId: g }),
      ...times(3, { channel: "whatsapp", status: "DELIVERED", guardianId: g }),
      { channel: "whatsapp", status: "SENT", guardianId: g },
      { channel: "whatsapp", status: "FAILED", guardianId: g },
      { channel: "whatsapp", status: "DELIVERED", provider: "sandbox", guardianId: g },
      ...times(2, { channel: "app", status: "READ", guardianId: g }),
      ...times(2, { channel: "app", status: "DELIVERED", guardianId: g }),
      { channel: "sms", status: "SENT", provider: "msg91", isBackup: true, guardianId: g },
    ]) });
    // Still going: SMS 2 queued, 1 being handed over, 1 taken with no report yet.
    const going = await tx.message.create({ data: { schoolId: f.school.id, body: "Fees reminder", channels: ["sms"], audienceLabel: "Parents", status: "QUEUED" } });
    goingId = going.id;
    await tx.messageRecipient.createMany({ data: rowsOf(f.school.id, going.id, [
      ...times(2, { channel: "sms", status: "QUEUED", provider: null, guardianId: g }),
      { channel: "sms", status: "SENDING", provider: "msg91", guardianId: g },
      { channel: "sms", status: "SENT", provider: "msg91", guardianId: g },
    ]) });
    // A parent of a North campus student, on the same message.
    const north = await tx.campus.create({ data: { schoolId: f.school.id, name: "North Campus" } });
    northCampusId = north.id;
    const neha = await tx.student.create({ data: { schoolId: f.school.id, campusId: north.id, admissionNo: `N${randomUUID().slice(0, 6)}`, firstName: "Neha", fullName: "Neha Singh" } });
    const northFather = await tx.guardian.create({ data: { schoolId: f.school.id, name: "North Father", relationship: "Father", phone: "9123400001" } });
    await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: neha.id, guardianId: northFather.id, relationship: "Father", isPrimary: true } });
    await tx.messageRecipient.createMany({ data: rowsOf(f.school.id, mixed.id, [{ channel: "whatsapp", status: "READ", guardianId: northFather.id }]) });
  });
  await withSchool({ schoolId: other.id, userId: null }, async (tx) => {
    const m = await tx.message.create({ data: { schoolId: other.id, body: "Other school", channels: ["whatsapp"], audienceLabel: "Parents", status: "SENT" } });
    otherMessageId = m.id;
    await tx.messageRecipient.createMany({ data: rowsOf(other.id, m.id, times(4, { channel: "whatsapp", status: "READ" })) });
    // Another school's row that names this school's message: it must never be counted there.
    await tx.messageRecipient.createMany({ data: rowsOf(other.id, mixedId, times(3, { channel: "whatsapp", status: "FAILED" })) });
  });
}, 120_000);

const summaryFor = (messageId: string, campusId: string | null) =>
  withSchool(f.ctx, async (tx) => messageSummary(tx, f.ctx, messageId, await recipientCampusWhere(tx, f.ctx, campusId)));

describe("How did this message do", () => {
  it("counts delivered (with read), read and failed out of everyone, and each channel used", async () => {
    const s = await summaryFor(mixedId, f.school.campus.id);
    expect({ total: s.total, delivered: s.delivered, read: s.read, failed: s.failed, sent: s.sent, testMode: s.testMode, going: s.going, backup: s.backup })
      .toEqual({ total: 12, delivered: 9, read: 4, failed: 1, sent: 1, testMode: 1, going: 0, backup: 1 });
    expect(s.stillGoing).toBe(false);
    expect(s.reports && s.readReports).toBe(true);
    expect(share(s.delivered, s.total)).toBe(75);
    expect(share(s.read, s.total)).toBe(33);
    expect(share(s.failed, s.total)).toBe(8);
    // Only the channels people got it on (the SMS backup copy is not a channel line), WhatsApp first.
    expect(s.channels.map((c) => c.channel)).toEqual(["whatsapp", "app"]);
    const [wa, app] = s.channels;
    expect({ total: wa.total, delivered: wa.delivered, read: wa.read, failed: wa.failed, sent: wa.sent, testMode: wa.testMode }).toEqual({ total: 8, delivered: 5, read: 2, failed: 1, sent: 1, testMode: 1 });
    expect({ total: app.total, delivered: app.delivered, read: app.read, failed: app.failed }).toEqual({ total: 4, delivered: 4, read: 2, failed: 0 });
    expect(wa.reports && wa.readReports && app.reports && app.readReports).toBe(true);
  });

  it("says a message is still going, and a channel with no delivery report is not 0% read", async () => {
    const s = await summaryFor(goingId, null);
    expect(s.stillGoing).toBe(true);
    expect({ total: s.total, going: s.going, sent: s.sent, delivered: s.delivered, read: s.read, failed: s.failed }).toEqual({ total: 4, going: 3, sent: 1, delivered: 0, read: 0, failed: 0 });
    expect(s.channels).toHaveLength(1);
    expect(s.channels[0]).toMatchObject({ channel: "sms", reports: false, readReports: false });
    expect(s.reports).toBe(false);
    expect(s.readReports).toBe(false);
  });

  it("counts only the campus of a one-campus login; the whole school sees everyone", async () => {
    expect((await summaryFor(mixedId, null)).total).toBe(13);
    const north = await summaryFor(mixedId, northCampusId);
    expect({ total: north.total, read: north.read, backup: north.backup }).toEqual({ total: 1, read: 1, backup: 0 });
  });

  it("never counts another school's rows", async () => {
    // The other school's three failed rows that name this message are not here (failed stays 1).
    const whole = await summaryFor(mixedId, null);
    expect(whole.failed).toBe(1);
    // The other school's own message is not this school's to count.
    const theirs = await summaryFor(otherMessageId, null);
    expect(theirs.total).toBe(0);
    expect(theirs.channels).toEqual([]);
    // And the other school sees its own rows only.
    const ctx = { schoolId: other.id, userId: null };
    const own = await withSchool(ctx, (tx) => messageSummary(tx, ctx, otherMessageId, {}));
    expect({ total: own.total, read: own.read }).toEqual({ total: 4, read: 4 });
  });
});
