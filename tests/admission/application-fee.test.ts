// The application fee in the school's money records (gap list G21): taken at
// the counter or confirmed by Razorpay, it is posted through Fee Management
// to the Day Book (Other fee types, "Application fee", Cash in hand or the
// bank), once, with its receipt number; cancelled the normal way (a reason
// from the list, the receipt number kept, a reversal in the Day Book today),
// by the Principal or School Admin only. Through the server actions with a
// real session.
import { beforeAll, describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { createSession } from "@/lib/auth/sessions";
import type { FormState } from "@/lib/forms";
import { withSchool, type SchoolContext } from "@/lib/db";
import { createApplication, type ApplicationInput } from "@/lib/admission/applications";
import { onAdmissionGatewayEvent, cancelPayment } from "@/lib/admission/fee";
import { cashAccount, ensureFinanceDefaults, mainBankAccount } from "@/lib/finance/settings";
import { dayBookTotals } from "@/lib/finance/daybook";
import { dayBookView } from "@/lib/finance/daybook-view";
import { todayIn } from "@/lib/staff/dates";
import { cancelPaymentAction, counterPaymentAction } from "@/app/(school)/admission-management/applications/actions";
import { admissionSchool, applicationInput } from "./fixtures";
import { randomUUID } from "node:crypto";
import type { FeeViewer } from "@/lib/fees/access";
import { applicantForFees, collectApplicationFee, findApplicants } from "@/lib/fees/applicants";
import { collectApplicationFeeAction } from "@/app/(school)/fee-management/collect/application/[applicationId]/actions";
import { makeUser } from "../helpers";

let t: Awaited<ReturnType<typeof admissionSchool>>;
type Who = Awaited<ReturnType<typeof t.who>>;
let counsellor: Who;
let principal: Who;
let sys: SchoolContext;

const signIn = async (userId: string) => { token = (await createSession(userId, t.school.id, { userAgent: "test" })).token; };
/** A server action's first argument: the form's previous state (unused). */
const START: FormState<unknown> = { ok: false };
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };
const run = <T,>(fn: Parameters<typeof withSchool<T>>[1]) => withSchool(sys, fn);
let n = 0;
const phone = () => `95${String(30000000 + (++n) * 7121 + Math.floor(Math.random() * 500)).slice(0, 8)}`;

async function application() {
  const ctx = counsellor.ctx;
  return withSchool(ctx, (tx) => createApplication(tx, ctx, counsellor.v, counsellor.s, applicationInput(t.nextYearId, t.c1, { phone: phone() }) as ApplicationInput, { campusId: t.campusId, channel: "counter", force: true }));
}
const entriesOf = (paymentId: string) => run((tx) => tx.dayBookEntry.findMany({ where: { sourceId: paymentId }, orderBy: { postedAt: "asc" } }));

beforeAll(async () => {
  t = await admissionSchool("Application Fee School");
  sys = { schoolId: t.school.id, userId: null };
  await run(async (tx) => {
    await ensureFinanceDefaults(tx, sys);
    await tx.admissionSetting.upsert({ where: { schoolId: t.school.id }, create: { schoolId: t.school.id, applicationFeeOn: true }, update: { applicationFeeOn: true } });
    await tx.admissionClassRule.upsert({ where: { schoolId_classId: { schoolId: t.school.id, classId: t.c1 } }, create: { schoolId: t.school.id, classId: t.c1, feePaise: BigInt(50000) }, update: { feePaise: BigInt(50000) } });
  });
  [counsellor, principal] = await Promise.all([t.who(t.counsellor), t.who(t.principal)]);
}, 120_000);

describe("the application fee reaches the Day Book (G21)", () => {
  it("a counter payment posts one Day Book entry in Cash in hand, under Other fee types, with its receipt number", async () => {
    const app = await application();
    expect(app.feeDuePaise).toBe(BigInt(50000));
    await signIn(t.counsellor.id);
    const r = await counterPaymentAction(START, form({ id: app.id, amount: "500", mode: "cash" }));
    expect(r).toMatchObject({ ok: true });
    const pay = await run((tx) => tx.applicationFeePayment.findFirstOrThrow({ where: { applicationId: app.id } }));
    expect(pay.receiptNo).toMatch(/\/AF\//);
    const [entry, ...more] = await entriesOf(pay.id);
    expect(more).toEqual([]);
    const cash = await run((tx) => cashAccount(tx, sys));
    expect(entry).toMatchObject({
      direction: "IN", amountPaise: BigInt(50000), mode: "CASH", section: "other-fees", headName: "Application fee",
      sourceType: "application-fee", accountId: cash.id, partyName: `${app.fullName} (application ${app.applicationNo})`, classId: t.c1,
    });
    expect(entry.note).toContain(pay.receiptNo!);
    const fees = await run((tx) => tx.accountHead.findFirstOrThrow({ where: { systemKey: "fees" } }));
    expect(entry.accountHeadId).toBe(fees.id);
    // The Day Book shows it with its receipt number and the application it came from.
    const today = todayIn("Asia/Kolkata");
    const view = await run((tx) => dayBookView(tx, { from: entry.date, to: entry.date > today ? entry.date : today, classId: null, depositAccountId: null, waiting: false }));
    const row = [...view.sections.otherFees].find((x) => x.sourceId === pay.id);
    expect(row).toMatchObject({ number: pay.receiptNo, applicationId: app.id });
  });

  it("a UPI payment lands in the main bank account", async () => {
    const app = await application();
    await signIn(t.counsellor.id);
    expect(await counterPaymentAction(START, form({ id: app.id, amount: "500", mode: "upi", reference: "UPI1234567" }))).toMatchObject({ ok: true });
    const pay = await run((tx) => tx.applicationFeePayment.findFirstOrThrow({ where: { applicationId: app.id } }));
    const main = await run((tx) => mainBankAccount(tx, sys));
    expect(await entriesOf(pay.id)).toEqual([expect.objectContaining({ mode: "UPI", accountId: main.id, depositAccountId: main.id, reference: "UPI1234567" })]);
  });

  it("a Razorpay confirmation posts once, however many times it arrives", async () => {
    const app = await application();
    const orderId = `order_${n}${Date.now()}`;
    const pending = await run((tx) => tx.applicationFeePayment.create({ data: { schoolId: t.school.id, applicationId: app.id, amountPaise: BigInt(50000), mode: "online", status: "PENDING", gatewayOrderId: orderId } }));
    expect(await entriesOf(pending.id)).toEqual([]);
    const event = { provider: "razorpay", gatewayAccountId: "x", event: "payment.captured", paymentId: `pay_${n}${Date.now()}`, orderId, amountPaise: 50000, payload: {} };
    await run((tx) => onAdmissionGatewayEvent(tx, sys, event));
    await run((tx) => onAdmissionGatewayEvent(tx, sys, { ...event, event: "order.paid" }));
    const entries = await entriesOf(pending.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ mode: "GATEWAY", amountPaise: BigInt(50000), section: "other-fees" });
    expect((await run((tx) => tx.applicationFeePayment.findUniqueOrThrow({ where: { id: pending.id } }))).status).toBe("CONFIRMED");
  });
});

describe("cancelling an application fee, the normal way (G21)", () => {
  it("is refused to the Admission Counsellor: only the Principal or School Admin cancel a payment", async () => {
    const app = await application();
    await signIn(t.counsellor.id);
    await counterPaymentAction(START, form({ id: app.id, amount: "500", mode: "cash" }));
    const pay = await run((tx) => tx.applicationFeePayment.findFirstOrThrow({ where: { applicationId: app.id } }));
    const r = await cancelPaymentAction(START, form({ paymentId: pay.id, reason: "Duplicate" }));
    expect(r).toMatchObject({ ok: false });
    expect(await entriesOf(pay.id)).toHaveLength(1);
    expect((await run((tx) => tx.applicationFeePayment.findUniqueOrThrow({ where: { id: pay.id } }))).cancelledAt).toBeNull();
  });

  it("needs a reason from the list, and a note for Other", async () => {
    const app = await application();
    await signIn(t.counsellor.id);
    await counterPaymentAction(START, form({ id: app.id, amount: "500", mode: "cash" }));
    const pay = await run((tx) => tx.applicationFeePayment.findFirstOrThrow({ where: { applicationId: app.id } }));
    await signIn(t.principal.id);
    expect(await cancelPaymentAction(START, form({ paymentId: pay.id, reason: "Changed my mind" }))).toMatchObject({ ok: false, errors: { reason: "Choose why it is cancelled." } });
    expect(await cancelPaymentAction(START, form({ paymentId: pay.id, reason: "Other" }))).toMatchObject({ ok: false, errors: { note: expect.stringMatching(/at least 5 characters/) } });
  });

  it("keeps the payment and its receipt number, and reverses the Day Book entry today", async () => {
    const app = await application();
    await signIn(t.counsellor.id);
    await counterPaymentAction(START, form({ id: app.id, amount: "500", mode: "cash" }));
    const pay = await run((tx) => tx.applicationFeePayment.findFirstOrThrow({ where: { applicationId: app.id } }));
    await signIn(t.principal.id);
    const r = await cancelPaymentAction(START, form({ paymentId: pay.id, reason: "Wrong amount", note: "Typed 500 for 50" }));
    expect(r).toMatchObject({ ok: true });
    const after = await run((tx) => tx.applicationFeePayment.findUniqueOrThrow({ where: { id: pay.id } }));
    expect(after).toMatchObject({ status: "CONFIRMED", receiptNo: pay.receiptNo, cancelReason: "Wrong amount: Typed 500 for 50" });
    expect(after.cancelledAt).not.toBeNull();
    const entries = await entriesOf(pay.id);
    expect(entries).toHaveLength(2);
    const [original, reversal] = entries;
    expect(reversal).toMatchObject({ direction: "OUT", amountPaise: BigInt(50000), section: "reversal", sourceType: "application-fee-cancel", reversesEntryId: original.id });
    expect(dayBookTotals(entries).net).toBe(BigInt(0));
    // Cancelling again changes nothing.
    expect(await cancelPaymentAction(START, form({ paymentId: pay.id, reason: "Duplicate" }))).toMatchObject({ ok: false, message: "This payment is already cancelled." });
    expect(await entriesOf(pay.id)).toHaveLength(2);
  });

  it("a payment taken before this change (never posted) cancels without a reversal", async () => {
    const app = await application();
    const old = await run((tx) => tx.applicationFeePayment.create({ data: { schoolId: t.school.id, applicationId: app.id, amountPaise: BigInt(50000), mode: "cash", status: "CONFIRMED", receiptNo: `OLD/AF/${n}`, confirmedAt: new Date() } }));
    await signIn(t.principal.id);
    expect(await cancelPaymentAction(START, form({ paymentId: old.id, reason: "Duplicate" }))).toMatchObject({ ok: true });
    expect(await entriesOf(old.id)).toEqual([]);
  });

  it("DREAM TEAM support access never cancels a payment", async () => {
    const app = await application();
    await signIn(t.counsellor.id);
    await counterPaymentAction(START, form({ id: app.id, amount: "500", mode: "cash" }));
    const pay = await run((tx) => tx.applicationFeePayment.findFirstOrThrow({ where: { applicationId: app.id } }));
    const support: SchoolContext = { ...principal.ctx, support: { requestId: "r1", name: "DREAM TEAM" } };
    await expect(withSchool(support, (tx) => cancelPayment(tx, support, principal.v, pay.id, { reason: "Duplicate", note: null }))).rejects.toThrow(/support access cannot cancel payments/);
  });
});

describe("the Accountant takes the application fee in Fee Management, Collect Fee (G21)", () => {
  let accountant: { id: string };
  const feeViewerOf = (userId: string, campusId: string | null = null): FeeViewer => ({ userId, see: "all", change: "all", roleKeys: ["accountant"], sectionIds: null, yearId: null, yearIds: [], campusId });
  beforeAll(async () => {
    accountant = await makeUser({ schools: [{ id: t.school.id, roleKeys: ["accountant"] }], name: "Accountant" });
  });

  it("finds the applicant by name, application number or phone, and takes the fee with a receipt in the application fee series and a Day Book entry", async () => {
    const app = await application();
    const v = feeViewerOf(accountant.id);
    for (const q of [app.fullName, app.applicationNo, app.phone.slice(-6)]) {
      const found = await run((tx) => findApplicants(tx, v, q));
      expect(found.map((a) => a.id)).toContain(app.id);
      expect(found.find((a) => a.id === app.id)?.status.key).toBe("due");
    }
    await signIn(accountant.id);
    const r = await collectApplicationFeeAction(START, form({ applicationId: app.id, amount: "500", mode: "upi", reference: "UPI99887766" }));
    expect(r).toMatchObject({ ok: true, message: expect.stringMatching(/^Application fee ₹500(\.00)? received\. Receipt .+\/AF\//) });
    const pay = await run((tx) => tx.applicationFeePayment.findFirstOrThrow({ where: { applicationId: app.id } }));
    expect(pay).toMatchObject({ status: "CONFIRMED", mode: "upi", amountPaise: BigInt(50000), receivedById: accountant.id });
    expect(pay.receiptNo).toMatch(/\/AF\//);
    const main = await run((tx) => mainBankAccount(tx, sys));
    expect(await entriesOf(pay.id)).toEqual([expect.objectContaining({ direction: "IN", mode: "UPI", section: "other-fees", headName: "Application fee", accountId: main.id, sourceType: "application-fee" })]);
    // The application shows it as paid, wherever it is looked at.
    const shown = await run((tx) => applicantForFees(tx, v, app.id));
    expect(shown).toMatchObject({ status: { key: "paid" }, leftPaise: BigInt(0), payments: [expect.objectContaining({ id: pay.id, receiptNo: pay.receiptNo, status: "CONFIRMED" })] });
    const history = await run((tx) => tx.applicationActivity.findFirstOrThrow({ where: { applicationId: app.id, kind: "fee" } }));
    expect(history.text).toContain("at the fee counter");
    // Paid in full: a second payment is refused, and nothing new is posted.
    expect(await collectApplicationFeeAction(START, form({ applicationId: app.id, amount: "100", mode: "cash" }))).toMatchObject({ ok: false, message: "The application fee is already paid." });
    expect(await run((tx) => tx.applicationFeePayment.count({ where: { applicationId: app.id } }))).toBe(1);
  });

  it("keeps the counter's rules: a reference for UPI, and no more than is due", async () => {
    const app = await application();
    await signIn(accountant.id);
    expect(await collectApplicationFeeAction(START, form({ applicationId: app.id, amount: "500", mode: "upi" }))).toMatchObject({ ok: false, errors: { reference: expect.stringMatching(/transaction reference/) } });
    expect(await collectApplicationFeeAction(START, form({ applicationId: app.id, amount: "900", mode: "cash" }))).toMatchObject({ ok: false, errors: { amount: expect.stringMatching(/^Only ₹500(\.00)? is due/) } });
    expect(await run((tx) => tx.applicationFeePayment.count({ where: { applicationId: app.id } }))).toBe(0);
  });

  it("is refused to the Admission Counsellor, who sees only fee status in Fee Management; the Accountant has no Admission Management", async () => {
    const app = await application();
    await signIn(t.counsellor.id);
    expect(await collectApplicationFeeAction(START, form({ applicationId: app.id, amount: "500", mode: "cash" }))).toMatchObject({ ok: false });
    await signIn(accountant.id);
    expect(await counterPaymentAction(START, form({ id: app.id, amount: "500", mode: "cash" }))).toMatchObject({ ok: false });
    expect(await run((tx) => tx.applicationFeePayment.count({ where: { applicationId: app.id } }))).toBe(0);
  });

  it("a person limited to another campus does not find or open the applicant", async () => {
    const app = await application();
    const other = feeViewerOf(accountant.id, randomUUID());
    expect(await run((tx) => findApplicants(tx, other, app.applicationNo))).toEqual([]);
    expect(await run((tx) => applicantForFees(tx, other, app.id))).toBeNull();
    await expect(run((tx) => collectApplicationFee(tx, { schoolId: t.school.id, userId: accountant.id }, other, app.id, { amountPaise: BigInt(50000), mode: "cash", reference: null }))).rejects.toThrow(/not found/);
  });

  it("an application fee taken before this page existed (never posted to the Day Book) still shows as paid, with its receipt", async () => {
    const app = await application();
    const old = await run((tx) => tx.applicationFeePayment.create({ data: { schoolId: t.school.id, applicationId: app.id, amountPaise: BigInt(50000), mode: "cash", status: "CONFIRMED", receiptNo: `OLD/AF/X${n}`, confirmedAt: new Date() } }));
    const shown = await run((tx) => applicantForFees(tx, feeViewerOf(accountant.id), app.id));
    expect(shown).toMatchObject({ status: { key: "paid" }, payments: [expect.objectContaining({ id: old.id, receiptNo: old.receiptNo, status: "CONFIRMED" })] });
    expect((await run((tx) => findApplicants(tx, feeViewerOf(accountant.id), app.applicationNo)))[0].status.key).toBe("paid");
  });
});
