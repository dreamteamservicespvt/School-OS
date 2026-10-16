// Demo data for Settings part B: a Razorpay gateway in test mode (made-up
// keys, generated here at random, never real ones), the two ready consent
// texts, a last-backup time, and a few sign-in lines for Login history.
import { randomBytes } from "node:crypto";
import { prisma, withSchool } from "../../src/lib/db";
import { encryptField } from "../../src/lib/crypto";
import { writeAudit } from "../../src/lib/audit";
import type { ModuleSeed } from "./types";

const DATA_TEXT =
  "I agree that {school} may keep and use my child's details (name, date of birth, class, attendance, marks, fees, health notes I give, and my contact details) to run the school: admission, teaching, exams, fees, safety and messages to me. The details are kept safely in India, are seen only by school staff who need them, and are never sold or used for advertising. I can ask to see, correct or remove them, and I can withdraw this consent at any time by telling the school office.";
const PHOTO_TEXT =
  "I agree that {school} may show photos and videos in which my child appears in the school gallery, in notices to parents and on the school's social media pages. I can withdraw this consent at any time; after that my child's photos will not be shared.";

const made = (n: number) => randomBytes(n).toString("base64url").replace(/[-_]/g, "x").slice(0, n);

export const seedSettingsSecurity: ModuleSeed = async (school) => {
  const admin = school.users.admin ?? school.users.principal;
  const ctx = { schoolId: school.schoolId, userId: admin };
  await withSchool(ctx, async (tx) => {
    if (school.full) {
      const keyId = `rzp_test_${made(14)}`;
      const keySecret = made(24);
      const webhookSecret = made(20);
      const g = await tx.paymentGatewayAccount.create({
        data: {
          schoolId: school.schoolId,
          displayName: "Razorpay",
          provider: "razorpay",
          environment: "test",
          isActive: false,
          publicKey: keyId,
          secretsEnc: encryptField(JSON.stringify({ keyId, keySecret })),
          secretsLast4: JSON.stringify({ keySecret: keySecret.slice(-4), webhookSecret: webhookSecret.slice(-4) }),
          webhookSecretEnc: encryptField(webhookSecret),
          lastTestNote: "Demo keys: add your own Razorpay test keys, then press Test connection.",
          createdById: admin,
        },
      });
      await writeAudit(tx, ctx, { action: "created", recordType: "Payment Gateway Account", recordId: g.id, after: { displayName: "Razorpay", provider: "razorpay", environment: "test" } });
    }
    for (const [consentType, title, text] of [["data-processing", "Use of my child's data", DATA_TEXT], ["photo", "Photos of my child", PHOTO_TEXT]] as const) {
      const row = await tx.consentText.create({ data: { schoolId: school.schoolId, consentType, title, version: 1, text: { en: text }, askedOnAdmission: true, isCurrent: true, createdById: admin } });
      await writeAudit(tx, ctx, { action: "consent-text-saved", recordType: "Consent Text", recordId: row.id, after: { consentType, version: 1, title } });
    }
    if (school.full && school.users.accountant) {
      const actx = { schoolId: school.schoolId, userId: school.users.accountant };
      const phone = { device: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36", ipAddress: "49.204.10.21" };
      await writeAudit(tx, actx, { action: "sign-in-failed", recordType: "User Login", recordId: school.users.accountant, ...phone });
      await writeAudit(tx, actx, { action: "signed-in-new-device", recordType: "User Login", recordId: school.users.accountant, ...phone });
    }
  });
  if (school.full) {
    // One backup record for the whole server (not a school record).
    const at = new Date();
    at.setUTCHours(21, 0, 0, 0);
    if (at > new Date()) at.setUTCDate(at.getUTCDate() - 1);
    await prisma.backupRun.create({ data: { kind: "nightly", finishedAt: at, location: "demo (no real backup on this computer)" } });
  }
};
