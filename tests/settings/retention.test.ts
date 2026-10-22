// Retention schedule (08-platform-security.md §12; gap list G46 part 1): the
// nightly check lists records past their period for the School Admin, clears
// working rows by itself, and the School Admin's yes blanks personal details
// without deleting a single record.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { fileStore } from "@/lib/storage";
import { setRetention } from "@/lib/data-security/privacy";
import { CLEARABLE_TYPES, clearListed, cutoffFor, findDue, RetentionProblem, runRetentionCheck } from "@/lib/data-security/retention";
import { makeSchool, makeUser } from "../helpers";

const NOW = new Date("2026-10-23T02:00:00Z");
const OLD = new Date("2022-06-01T05:00:00Z");
const RECENT = new Date("2026-09-01T05:00:00Z");

let school: Awaited<ReturnType<typeof makeSchool>>;
let admin: { id: string };
let ctx: SchoolContext;
const ids: Record<string, string> = {};

async function storeFile(tx: Parameters<Parameters<typeof withSchool>[1]>[0], purpose: string) {
  const id = randomUUID();
  const key = `${school.id}/${purpose}/${id}`;
  await fileStore().put(key, Buffer.from("photo"), "image/jpeg");
  await tx.storedFile.create({ data: { id, schoolId: school.id, storageKey: key, fileName: "x.jpg", contentType: "image/jpeg", sizeBytes: 5, purpose } });
  return { id, key };
}

beforeAll(async () => {
  school = await makeSchool("Retention School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }] });
  ctx = { schoolId: school.id, userId: admin.id };
  const year = randomUUID();
  await withSchool({ schoolId: school.id, userId: null }, async (tx) => {
    const photo = await storeFile(tx, "visitor-photo");
    ids.photoKey = photo.key;
    ids.photo = photo.id;
    const visitor = (at: Date, passNo: string, photoFileId: string | null) => tx.visitorEntry.create({
      data: { schoolId: school.id, passNo, visitDate: at, name: "Ramesh Visitor", phone: "9876543210", purpose: "Meeting", timeIn: at, passExpiresAt: at, photoFileId, idProofType: "aadhaar", idProofLast4: "1234", vehicleNo: "AP09 1234" },
    });
    ids.oldVisitor = (await visitor(OLD, "V-1", photo.id)).id;
    ids.newVisitor = (await visitor(RECENT, "V-2", null)).id;
    ids.oldGate = (await tx.gateEntry.create({ data: { schoolId: school.id, at: OLD, direction: "IN", kind: "person", who: "Suresh", vehicleNo: "TS07 1", purpose: "Delivery" } })).id;
    const enquiry = (status: string, phone: string) => tx.enquiry.create({
      data: { schoolId: school.id, campusId: school.campus.id, academicYearId: year, childName: "Anu", parentName: "Lakshmi", phone, email: "l@example.com", source: "walk-in", firstSource: "walk-in", status, notes: "Called twice" },
    });
    ids.lostEnquiry = (await enquiry("lost", "9000000001")).id;
    ids.joinedEnquiry = (await enquiry("admitted", "9000000002")).id;
    await tx.enquiryActivity.create({ data: { schoolId: school.id, enquiryId: ids.lostEnquiry, kind: "note", text: "Father said 9000000001 is best" } });
    // The enquiries were last touched long ago.
    await tx.$executeRaw`UPDATE enquiry SET updated_at = ${OLD} WHERE school_id = ${school.id}::uuid`;
    const msg = await tx.message.create({ data: { schoolId: school.id, body: "Ravi was absent today", audienceLabel: "Father of Ravi", recipientCount: 1, createdAt: OLD, status: "SENT" } });
    ids.oldMessage = msg.id;
    ids.oldRecipient = (await tx.messageRecipient.create({ data: { schoolId: school.id, messageId: msg.id, recipientType: "guardian", name: "Mohan", channel: "sms", address: "9888888888", text: "Ravi was absent today", status: "DELIVERED", credits: 1 } })).id;
    ids.newMessage = (await tx.message.create({ data: { schoolId: school.id, body: "Holiday tomorrow", audienceLabel: "All parents", createdAt: RECENT, status: "SENT" } })).id;
    ids.otp = (await tx.admissionOtp.create({ data: { schoolId: school.id, phone: "9777777777", purpose: "consent:x", codeHash: "hash", expiresAt: OLD, createdAt: OLD } })).id;
    const zip = await storeFile(tx, "data-export");
    ids.zip = zip.id;
    ids.zipKey = zip.key;
    await tx.dataExport.create({ data: { schoolId: school.id, status: "ready", fileId: zip.id, readyAt: new Date(NOW.getTime() - 3 * 86_400_000) } });
  });
});

describe("retention schedule", () => {
  it("never offers to clear students, results, fees, finance or the audit log", () => {
    expect(CLEARABLE_TYPES.sort()).toEqual(["enquiries", "message-history", "visitor-entries"]);
  });

  it("the nightly check lists what is past its period and clears only working rows by itself", async () => {
    const run = await withSchool({ schoolId: school.id, userId: null }, (tx) => runRetentionCheck(tx, { schoolId: school.id, userId: null }, NOW));
    expect(run.status).toBe("waiting");
    const due = run.due as Record<string, { count: number }>;
    expect(due["visitor-entries"].count).toBe(2); // the old visitor and the old gate entry
    expect(due.enquiries.count).toBe(1); // the lost one, not the admitted one
    expect(due["message-history"].count).toBe(1);
    expect(run.autoCleared).toEqual({ "one-time-codes": 1, "export-files": 1 });

    await withSchool(ctx, async (tx) => {
      // Listed, not yet cleared.
      expect((await tx.visitorEntry.findUnique({ where: { id: ids.oldVisitor } }))?.name).toBe("Ramesh Visitor");
      // Working rows cleared without asking, and the expired export file is gone.
      expect(await tx.admissionOtp.findUnique({ where: { id: ids.otp } })).toMatchObject({ codeHash: "", phone: "" });
      expect((await tx.storedFile.findUnique({ where: { id: ids.zip } }))?.archivedAt).not.toBeNull();
      // The School Admin is told, and the check is in the audit log.
      expect(await tx.notification.count({ where: { userLoginId: admin.id, type: "privacy" } })).toBe(1);
      expect(await tx.auditLogEntry.count({ where: { action: "retention-checked", recordId: run.id } })).toBe(1);
    });
    expect(await fileStore().get(ids.zipKey)).toBeNull();
  });

  it("running the check again the same day changes nothing and does not tell the School Admin twice", async () => {
    const again = await withSchool({ schoolId: school.id, userId: null }, (tx) => runRetentionCheck(tx, { schoolId: school.id, userId: null }, NOW));
    expect(again.status).toBe("waiting");
    await withSchool(ctx, async (tx) => {
      expect(await tx.retentionRun.count()).toBe(1);
      expect(await tx.notification.count({ where: { userLoginId: admin.id, type: "privacy" } })).toBe(1);
    });
  });

  it("the School Admin's yes blanks personal details, keeps every record, removes visitor photos and writes the audit log", async () => {
    const run = await withSchool(ctx, (tx) => tx.retentionRun.findFirstOrThrow({ where: { status: "waiting" } }));
    const done = await withSchool(ctx, (tx) => clearListed(tx, ctx, run.id, NOW));
    expect(done.cleared).toEqual({ "visitor-entries": 2, enquiries: 1, "message-history": 1 });
    await withSchool(ctx, async (tx) => {
      const v = await tx.visitorEntry.findUniqueOrThrow({ where: { id: ids.oldVisitor } });
      expect(v).toMatchObject({ name: "Removed visitor", phone: "", photoFileId: null, idProofLast4: null, vehicleNo: null, passNo: "V-1" });
      expect(v.clearedAt).not.toBeNull();
      expect((await tx.visitorEntry.findUniqueOrThrow({ where: { id: ids.newVisitor } })).name).toBe("Ramesh Visitor");
      expect(await tx.gateEntry.findUniqueOrThrow({ where: { id: ids.oldGate } })).toMatchObject({ who: "Removed", vehicleNo: null });
      const e = await tx.enquiry.findUniqueOrThrow({ where: { id: ids.lostEnquiry } });
      expect(e).toMatchObject({ childName: "Removed person", phone: "", email: null, notes: null, status: "lost" });
      expect(e.archivedAt).not.toBeNull();
      expect((await tx.enquiryActivity.findFirstOrThrow({ where: { enquiryId: ids.lostEnquiry } })).text).not.toContain("9000000001");
      expect((await tx.enquiry.findUniqueOrThrow({ where: { id: ids.joinedEnquiry } })).childName).toBe("Anu");
      const m = await tx.message.findUniqueOrThrow({ where: { id: ids.oldMessage } });
      expect(m.body).not.toContain("Ravi");
      expect(m.recipientCount).toBe(1);
      expect(await tx.messageRecipient.findUniqueOrThrow({ where: { id: ids.oldRecipient } })).toMatchObject({ address: "", name: "Removed", credits: 1, status: "DELIVERED" });
      expect((await tx.message.findUniqueOrThrow({ where: { id: ids.newMessage } })).body).toBe("Holiday tomorrow");
      expect((await tx.storedFile.findUniqueOrThrow({ where: { id: ids.photo } })).archivedAt).not.toBeNull();
      const audit = await tx.auditLogEntry.findFirstOrThrow({ where: { action: "retention-cleared", recordId: run.id } });
      expect(audit.userLoginId).toBe(admin.id);
      expect(JSON.stringify(audit.after)).not.toContain("Ramesh");
    });
    expect(await fileStore().get(ids.photoKey)).toBeNull();
    await expect(withSchool(ctx, (tx) => clearListed(tx, ctx, run.id, NOW))).rejects.toThrow(RetentionProblem);
  });

  it("a longer period chosen after the list was made wins: nothing the school now keeps is cleared", async () => {
    const s = await makeSchool("Retention Longer");
    const c = { schoolId: s.id, userId: null };
    await withSchool(c, (tx) => tx.message.create({ data: { schoolId: s.id, body: "Old but wanted", audienceLabel: "All", createdAt: OLD, status: "SENT" } }));
    const run = await withSchool(c, (tx) => runRetentionCheck(tx, c, NOW));
    expect((run.due as Record<string, { count: number }>)["message-history"].count).toBe(1);
    await withSchool(c, (tx) => setRetention(tx, c, "message-history", null));
    const done = await withSchool(c, (tx) => clearListed(tx, c, run.id, NOW));
    expect(done.cleared).toEqual({});
    expect(await withSchool(c, (tx) => tx.message.findFirstOrThrow())).toMatchObject({ body: "Old but wanted" });
    expect(await withSchool(c, (tx) => findDue(tx, NOW))).toEqual({});
  });

  it("works out the cut-off by calendar months", () => {
    expect(cutoffFor(new Date("2026-10-23T00:00:00Z"), 12).toISOString()).toBe("2025-10-23T00:00:00.000Z");
  });
});

