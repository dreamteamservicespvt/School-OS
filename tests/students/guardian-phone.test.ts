// A guardian's mobile changes: phones confirmed for Parent Link with a code to
// the old number must be confirmed again; the link keeps working (QA PEOPLE-13).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { setGuardianPhoto, updateGuardian } from "@/lib/students/guardians";
import { randomUUID } from "node:crypto";
import { createLink, confirmedDevice, hashToken, newDeviceKey } from "@/lib/parent-link/links";
import { addStudent, studentSchool } from "./fixtures";
// Registers Parent Link with Student Management, as the app does.
import "@/lib/communication/student-parent-link";
import { makeCommSchool } from "../communication/fixture";

let s: Awaited<ReturnType<typeof studentSchool>>;
beforeAll(async () => {
  s = await studentSchool();
});

describe("guardian phone change", () => {
  it("signs out the phones confirmed for the old number, keeps the link, and logs it", async () => {
    const { student } = await addStudent(s.ctx, s.s5a, { guardianPhone: "9876511111", guardianName: "Demo Old Phone" });
    const key = newDeviceKey();
    const { guardianId, linkId } = await withSchool(s.ctx, async (tx) => {
      const sg = await tx.studentGuardian.findFirstOrThrow({ where: { studentId: student.id } });
      const link = await createLink(tx, s.ctx, sg.guardianId);
      await tx.parentLinkDevice.create({ data: { schoolId: s.ctx.schoolId, parentLinkId: link.id, keyHash: hashToken(key), label: "Android phone, Chrome", verifiedAt: new Date(), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 86400_000) } });
      return { guardianId: sg.guardianId, linkId: link.id };
    });
    expect(await withSchool(s.ctx, (tx) => confirmedDevice(tx, linkId, key))).not.toBeNull();

    // A change that is not the phone keeps the phone confirmed.
    await withSchool(s.ctx, (tx) => updateGuardian(tx, s.ctx, guardianId, { name: "Demo Old Phone", relationship: "Father", phone: "9876511111", occupation: "Farmer" }));
    expect(await withSchool(s.ctx, (tx) => confirmedDevice(tx, linkId, key))).not.toBeNull();

    await withSchool(s.ctx, (tx) => updateGuardian(tx, s.ctx, guardianId, { name: "Demo Old Phone", relationship: "Father", phone: "9876522222" }));
    expect(await withSchool(s.ctx, (tx) => confirmedDevice(tx, linkId, key))).toBeNull();
    const link = await withSchool(s.ctx, (tx) => tx.parentLink.findUniqueOrThrow({ where: { id: linkId } }));
    expect(link.status).toBe("ACTIVE");
    const log = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findFirst({ where: { recordType: "Parent Link", recordId: linkId, action: "phones-signed-out" } }));
    expect(log?.after).toMatchObject({ reason: "Guardian changed mobile", phones: 1 });
  });

  it("a school with no WhatsApp or SMS still saves the new mobile when the send box is ticked", async () => {
    const { student } = await addStudent(s.ctx, s.s5a, { guardianPhone: "9876544441", guardianName: "Demo No Channel" });
    const { guardianId, linkId } = await withSchool(s.ctx, async (tx) => {
      const sg = await tx.studentGuardian.findFirstOrThrow({ where: { studentId: student.id } });
      return { guardianId: sg.guardianId, linkId: (await createLink(tx, s.ctx, sg.guardianId)).id };
    });
    const g = await withSchool(s.ctx, (tx) => updateGuardian(tx, s.ctx, guardianId, { name: "Demo No Channel", relationship: "Father", phone: "9876544442" }, { sendLinkToNewPhone: true }));
    expect(g.phone).toBe("9876544442");
    expect((await withSchool(s.ctx, (tx) => tx.parentLink.findUniqueOrThrow({ where: { id: linkId } }))).lastSentAt).toBeNull();
  });

  it("sends Parent Link to the new number in the same save when asked, and only then", async () => {
    const c = await makeCommSchool();
    const linkId = await withSchool(c.ctx, async (tx) => (await createLink(tx, c.ctx, c.father.id)).id);
    const sentAt = () => withSchool(c.ctx, (tx) => tx.parentLink.findUniqueOrThrow({ where: { id: linkId } })).then((l) => l.lastSentAt?.getTime() ?? null);
    const g = await withSchool(c.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: c.father.id } }));
    const base = { name: g.name, relationship: g.relationship };
    const first = await sentAt();
    // Phone changed, box not ticked: nothing is sent.
    await withSchool(c.ctx, (tx) => updateGuardian(tx, c.ctx, c.father.id, { ...base, phone: "9876544452" }));
    expect(await sentAt()).toBe(first);
    // Ticked, phone unchanged: nothing is sent.
    await withSchool(c.ctx, (tx) => updateGuardian(tx, c.ctx, c.father.id, { ...base, phone: "9876544452", occupation: "Driver" }, { sendLinkToNewPhone: true }));
    expect(await sentAt()).toBe(first);
    // Phone changed and ticked: the link goes out again, to the new number.
    await withSchool(c.ctx, (tx) => updateGuardian(tx, c.ctx, c.father.id, { ...base, phone: "9876544453" }, { sendLinkToNewPhone: true }));
    expect(await sentAt()).not.toBe(first);
    const to = await withSchool(c.ctx, (tx) => tx.messageRecipient.count({ where: { guardianId: c.father.id, address: { contains: "9876544453" } } }));
    expect(to).toBeGreaterThan(0);
  });

  it("keeps a guardian's photo for the pickup check, with each change in the audit log (QA FO-01)", async () => {
    const { student } = await addStudent(s.ctx, s.s5a, { guardianPhone: "9876533333", guardianName: "Demo Photo Parent" });
    const guardianId = await withSchool(s.ctx, async (tx) => (await tx.studentGuardian.findFirstOrThrow({ where: { studentId: student.id } })).guardianId);
    const fileId = randomUUID();
    await withSchool(s.ctx, (tx) => setGuardianPhoto(tx, s.ctx, guardianId, fileId));
    expect((await withSchool(s.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: guardianId } }))).photoFileId).toBe(fileId);
    await withSchool(s.ctx, (tx) => setGuardianPhoto(tx, s.ctx, guardianId, null));
    const log = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Guardian", recordId: guardianId }, orderBy: { at: "asc" } }));
    expect(log.map((l) => l.action)).toEqual(["photo-added", "photo-removed"]);
  });
});
