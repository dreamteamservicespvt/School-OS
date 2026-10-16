// A guardian's mobile changes: phones confirmed for Parent Link with a code to
// the old number must be confirmed again; the link keeps working (QA PEOPLE-13).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { updateGuardian } from "@/lib/students/guardians";
import { createLink, confirmedDevice, hashToken, newDeviceKey } from "@/lib/parent-link/links";
import { addStudent, studentSchool } from "./fixtures";

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
});
