// A small school for Fee and Finance tests: the 2026-27 year, Class 5 A with
// three students and their parents, a Tuition head with four quarterly
// installments of ₹6,000 assigned to the class, messaging in test mode with
// credits, and a principal and an accountant.
import { randomUUID } from "node:crypto";
import { withSchool, type SchoolContext } from "@/lib/db";
import { encryptSecrets } from "@/lib/messaging/channels";
import { ensureReadyTemplates } from "@/lib/messaging/templates";
import { ensureFeeDefaults } from "@/lib/fees/settings";
import { ensureFinanceDefaults } from "@/lib/finance/settings";
import { saveFeeHead, openDraft, saveFeeRow, publishStructure, assignToClass } from "@/lib/fees/structure";
import { defaultSchedule } from "@/lib/fees/schedule";
import { collectPayment, type CollectInput } from "@/lib/fees/collect";
import { makeSchool, makeUser } from "../helpers";

let phoneSeq = 8000000000 + Math.floor(Math.random() * 90000000);
const nextPhone = () => String(++phoneSeq);

export const R = (rupees: number) => BigInt(Math.round(rupees * 100));

export async function makeFeeSchool() {
  const school = await makeSchool("Fee School");
  const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Principal Person" });
  const accountant = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }], name: "Accountant Person" });
  const ctx: SchoolContext = { schoolId: school.id, userId: accountant.id };
  const pctx: SchoolContext = { schoolId: school.id, userId: principal.id };
  const ids = await withSchool(ctx, async (tx) => {
    await tx.school.update({ where: { id: school.id }, data: { phone: "9876500001" } });
    const year = await tx.academicYear.create({ data: { schoolId: school.id, campusId: school.campus.id, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: school.id, campusId: school.campus.id, name: "Class 5", sortOrder: 5 } });
    const a = await tx.section.create({ data: { schoolId: school.id, classId: cls.id, academicYearId: year.id, name: "A" } });
    async function student(name: string, guardianName: string, opts: { optedOut?: boolean } = {}) {
      const g = await tx.guardian.create({ data: { schoolId: school.id, name: guardianName, relationship: "Father", phone: nextPhone(), language: "en", optedOut: opts.optedOut ?? false } });
      const s = await tx.student.create({ data: { schoolId: school.id, campusId: school.campus.id, admissionNo: `A${randomUUID().slice(0, 6)}`, firstName: name.split(" ")[0], fullName: name } });
      await tx.enrolment.create({ data: { schoolId: school.id, studentId: s.id, academicYearId: year.id, classId: cls.id, sectionId: a.id } });
      await tx.studentGuardian.create({ data: { schoolId: school.id, studentId: s.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
      return { ...s, guardian: g };
    }
    const ravi = await student("Ravi Kumar", "Srinivas Kumar");
    const sita = await student("Sita Rao", "Mohan Rao");
    const anil = await student("Anil Das", "Opted Out Father", { optedOut: true });
    for (const channel of ["whatsapp", "sms"]) {
      await tx.messagingChannel.create({ data: { schoolId: school.id, channel, provider: "sandbox", isOn: true, environment: "test", ...(channel === "whatsapp" ? encryptSecrets({ appSecret: "app-secret-1234", verifyToken: "verify-me", accessToken: "x" }) : encryptSecrets({ webhookKey: "msg91-key-123456" })) } });
      await tx.creditLedgerEntry.create({ data: { schoolId: school.id, channel, amount: 1000, note: "Test top-up" } });
    }
    await ensureReadyTemplates(tx, ctx);
    await ensureFeeDefaults(tx, ctx);
    await ensureFinanceDefaults(tx, ctx);
    const tuition = await saveFeeHead(tx, ctx, { name: "Tuition fee", kind: "tuition", taxable: false, gstRateBp: null, sacCode: null, bankAccountId: null, lateFeeApplies: true });
    const draft = await openDraft(tx, ctx, year.id, cls.id);
    await saveFeeRow(tx, ctx, draft.id, { feeHeadId: tuition.id, frequency: "QUARTERLY", totalPaise: R(24000), schedule: defaultSchedule("QUARTERLY", R(24000), year.startDate) });
    await publishStructure(tx, ctx, draft.id, year.startDate);
    await assignToClass(tx, ctx, draft.id, false);
    return { year, cls, a, ravi, sita, anil, tuition, structureId: draft.id };
  });
  return { school, principal, accountant, ctx, pctx, ...ids };
}

export type FeeSchool = Awaited<ReturnType<typeof makeFeeSchool>>;

/** The student's open rows, oldest first. */
export async function dues(ctx: SchoolContext, studentId: string) {
  return withSchool(ctx, (tx) => tx.studentFeeDue.findMany({ where: { studentId, state: "OPEN" }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] }));
}

/** A counter collection with sensible defaults (cash, now). */
export async function collect(ctx: SchoolContext, input: Partial<CollectInput> & Pick<CollectInput, "studentId" | "dueIds" | "amountPaise">, roleKeys = ["accountant"]) {
  return withSchool(ctx, (tx) =>
    collectPayment(tx, ctx, { roleKeys }, {
      mode: "CASH", reference: null, chequeNo: null, chequeBank: null, chequeDate: null, paidAt: null, note: null,
      discountPaise: BigInt(0), discountReason: null, waiveDueIds: [], waiveReason: null, confirmDuplicate: false,
      ...input,
    }),
  );
}

export async function feature(ctx: SchoolContext, key: string, isOn = true) {
  await withSchool(ctx, (tx) => tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } }, create: { schoolId: ctx.schoolId, featureKey: key, isOn }, update: { isOn } }));
}
