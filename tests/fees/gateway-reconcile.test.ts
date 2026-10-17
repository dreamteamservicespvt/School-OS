// Online fee payments are never taken and lost (06 §3 "Automatic work: Online
// payment received", rule 8; gap G10). Razorpay is stubbed: no keys, no network.
// - a payment on any order ever made for a link is matched and posted, also by
//   the link reference in the order's notes; payment.authorized posts nothing;
//   admission application fees are left to Admission Management;
// - the reconcile job asks Razorpay about Checkouts that were never confirmed and
//   posts captured payments once;
// - a payment that matched nothing is listed for the Accountant and posted to the
//   chosen student through the normal posting, with audit;
// - a refund or dispute made at Razorpay becomes a cancellation request in
//   Approvals, never an automatic cancellation.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/flash", () => ({ flash: async () => undefined }));

import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { encryptField } from "@/lib/crypto";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import "@/lib/fees/gateway-handler";
import { readRazorpayEvent, runGatewayEvent } from "@/lib/payments/events";
import { fetchOrderPayments, hmacHex, RazorpayProblem, type RazorpayCredentials } from "@/lib/payments/razorpay";
import {
  askToCancelReversed, confirmCheckout, confirmGatewayPayment, createPaymentLink, failedOnline, postUnmatchedToStudent, reconcileOnlinePayments, reversalsToCheck,
  startCheckout, studentsForPayer, unmatchedOnline,
} from "@/lib/fees/online";
import { askCancelReversedAction, postUnmatchedAction } from "@/app/(school)/fee-management/payments/actions";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";
import { makeUser } from "../helpers";

const CREDS: RazorpayCredentials = { keyId: "rzp_test_Abcdefgh1234", keySecret: "test-key-secret-for-stubs", webhookSecret: null, environment: "test" };

async function gatewayIn(f: FeeSchool) {
  return (await withSchool(f.ctx, (tx) => tx.paymentGatewayAccount.create({
    data: { schoolId: f.school.id, displayName: "Razorpay test", provider: "razorpay", environment: "test", isActive: true, secretsEnc: encryptField(JSON.stringify({ keyId: CREDS.keyId, keySecret: CREDS.keySecret })) },
  }))).id;
}

async function currentFor(f: FeeSchool, userId: string): Promise<Current> {
  const access = await accessIn(userId, f.school.id);
  return { ...access!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
}
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};

/** A stand-in for Razorpay's API: answers by method and path, and counts the calls. */
function fakeRazorpay(routes: Record<string, unknown>, calls: string[] = []) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(String(url)).pathname}`;
    calls.push(key);
    const r = routes[key];
    if (r === undefined) return new Response(JSON.stringify({ error: { description: "The id provided does not exist" } }), { status: 400 });
    if (r === 500) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify(typeof r === "function" ? (r as () => unknown)() : r), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

/** A signed-and-checked Razorpay webhook, as the route hands it on. */
function webhook(event: string, payment: Record<string, unknown>, more: Record<string, unknown> = {}) {
  return { entity: "event", event, payload: { payment: { entity: { currency: "INR", status: "captured", ...payment } }, ...more } };
}
/** As the webhook route runs it: in the school, with no person signed in. */
const deliver = (f: FeeSchool, gwId: string, body: unknown) => {
  const ctx = { schoolId: f.school.id, userId: null };
  return withSchool(ctx, (tx) => runGatewayEvent(tx, ctx, readRazorpayEvent(body, gwId)));
};

async function postedFor(f: FeeSchool, payId: string) {
  return withSchool(f.ctx, async (tx) => {
    const posted = await tx.payment.findMany({ where: { reference: payId, status: "POSTED" } });
    return { posted, receipts: await tx.receipt.count({ where: { paymentId: { in: posted.map((p) => p.id) } } }) };
  });
}

/** A link where Checkout was opened (attempts) some minutes ago on an order, and nothing came back. */
async function openedLink(f: FeeSchool, ctx: SchoolContext, studentId: string, dueIndex: number, orderId: string, minutesAgo = 40) {
  const open = await dues(f.ctx, studentId);
  return withSchool(ctx, async (tx) => {
    const made = await createPaymentLink(tx, ctx, { studentId, dueIds: [open[dueIndex].id], source: "PARENT_LINK" });
    await tx.paymentLinkOrder.create({ data: { schoolId: f.school.id, paymentLinkId: made.link.id, gatewayOrderId: orderId, amountPaise: made.amount } });
    await tx.paymentLink.update({ where: { id: made.link.id }, data: { gatewayOrderId: orderId, attempts: 1, lastAttemptAt: new Date(Date.now() - minutesAgo * 60_000) } });
    return { link: made.link, token: made.token, amount: made.amount };
  });
}

describe("Razorpay's order payments, read with a stub", () => {
  it("lists the payments on an order and refuses anything that is not an order id", async () => {
    const calls: string[] = [];
    const items = await fetchOrderPayments(CREDS, "order_Abc123", fakeRazorpay({ "GET /v1/orders/order_Abc123/payments": { entity: "collection", count: 1, items: [{ id: "pay_X1", status: "captured", amount: 100 }] } }, calls));
    expect(items.map((p) => p.id)).toEqual(["pay_X1"]);
    expect(calls).toEqual(["GET /v1/orders/order_Abc123/payments"]);
    await expect(fetchOrderPayments(CREDS, "../payments/pay_1", fakeRazorpay({}))).rejects.toThrow(RazorpayProblem);
    expect(await fetchOrderPayments(CREDS, "order_Empty1", fakeRazorpay({ "GET /v1/orders/order_Empty1/payments": {} }))).toEqual([]);
  });

  it("reads our notes from the order and the payment, and the refund or dispute of an event", () => {
    const e = readRazorpayEvent({ event: "order.paid", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 500, notes: [] } }, order: { entity: { id: "order_1", notes: { school_os_link: "abc", purpose: "x" } } } } }, "g");
    expect(e.notes).toEqual({ school_os_link: "abc", purpose: "x" });
    const r = readRazorpayEvent({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_9", amount: 300 } }, payment: { entity: { id: "pay_9", order_id: "order_9", amount: 900 } } } }, "g");
    expect(r).toMatchObject({ paymentId: "pay_9", orderId: "order_9", reversal: { kind: "refund", id: "rfnd_1", amountPaise: 300 } });
  });
});

describe("matching an online payment to its link", () => {
  let f: FeeSchool;
  let gw = "";

  beforeAll(async () => {
    f = await makeFeeSchool();
    gw = await gatewayIn(f);
  }, 120_000);

  it("posts a payment made on an older order of the link (an old tab), after the amount changed", async () => {
    const rows = await dues(f.ctx, f.ravi.id);
    const made = await withSchool(f.ctx, (tx) => createPaymentLink(tx, f.ctx, { studentId: f.ravi.id, dueIds: [rows[0].id, rows[1].id], source: "PARENT_LINK" }));
    const ids = ["order_OldTab1", "order_NewTab1"];
    let n = 0;
    const fetchImpl = fakeRazorpay({ "POST /v1/orders": () => ({ id: ids[n++], amount: 0, currency: "INR", receipt: null, status: "created" }) });
    expect((await withSchool(f.ctx, (tx) => startCheckout(tx, f.ctx, made.token, { creds: CREDS, fetchImpl }))).orderId).toBe("order_OldTab1");
    // Quarter 2 is paid at the counter meanwhile, so the next Checkout makes a new, smaller order.
    await collect(f.ctx, { studentId: f.ravi.id, dueIds: [rows[1].id], amountPaise: R(6000) });
    const second = await withSchool(f.ctx, (tx) => startCheckout(tx, f.ctx, made.token, { creds: CREDS, fetchImpl }));
    expect(second).toMatchObject({ orderId: "order_NewTab1", amountPaise: Number(R(6000)) });

    // The parent pays ₹12,000 in the old tab: Razorpay confirms the first order.
    await deliver(f, gw, webhook("payment.captured", { id: "pay_OldTab1", order_id: "order_OldTab1", amount: Number(R(12000)) }));
    const { posted, receipts } = await postedFor(f, "pay_OldTab1");
    expect(posted.map((p) => [p.amountPaise, p.advancePaise, p.paymentLinkId])).toEqual([[R(12000), R(6000), made.link.id]]);
    expect(receipts).toBe(1);
    const log = await withSchool(f.ctx, (tx) => tx.gatewayTransaction.findMany({ where: { gatewayPaymentId: "pay_OldTab1" } }));
    expect(log.map((l) => l.outcome)).toEqual(["posted"]);
  });

  it("accepts Checkout's own confirmation on an older order, and logs it with the order's amount", async () => {
    const rows = await dues(f.ctx, f.sita.id);
    const made = await withSchool(f.ctx, (tx) => createPaymentLink(tx, f.ctx, { studentId: f.sita.id, dueIds: [rows[0].id], source: "LINK" }));
    await withSchool(f.ctx, async (tx) => {
      await tx.paymentLinkOrder.create({ data: { schoolId: f.school.id, paymentLinkId: made.link.id, gatewayOrderId: "order_SitaOld1", amountPaise: R(6000) } });
      await tx.paymentLink.update({ where: { id: made.link.id }, data: { gatewayOrderId: "order_SitaNew1" } });
    });
    const signature = hmacHex("order_SitaOld1|pay_SitaOld1", CREDS.keySecret);
    const r = await withSchool(f.ctx, (tx) => confirmCheckout(tx, f.ctx, made.token, { paymentId: "pay_SitaOld1", orderId: "order_SitaOld1", signature }, { creds: CREDS }));
    expect(r.created).toBe(true);
    const log = await withSchool(f.ctx, (tx) => tx.gatewayTransaction.findFirstOrThrow({ where: { gatewayPaymentId: "pay_SitaOld1" } }));
    expect(log).toMatchObject({ event: "checkout.verified", outcome: "posted", amountPaise: R(6000) });
    // An order that is not this link's is still refused.
    await expect(withSchool(f.ctx, (tx) => confirmCheckout(tx, f.ctx, made.token, { paymentId: "pay_Other1", orderId: "order_NotMine1", signature: hmacHex("order_NotMine1|pay_Other1", CREDS.keySecret) }, { creds: CREDS }))).rejects.toThrow(/could not be matched/);
  });

  it("matches an order School OS never saw by the link reference in its notes, only for this school", async () => {
    const rows = await dues(f.ctx, f.anil.id);
    const made = await withSchool(f.ctx, (tx) => createPaymentLink(tx, f.ctx, { studentId: f.anil.id, dueIds: [rows[0].id], source: "PARENT_LINK" }));
    const elsewhere = "00000000-0000-4000-8000-0000000000aa";
    await deliver(f, gw, webhook("payment.captured", { id: "pay_Foreign1", order_id: "order_Foreign1", amount: Number(R(6000)), notes: { school_os_school: elsewhere, school_os_link: made.link.id } }));
    expect((await postedFor(f, "pay_Foreign1")).posted).toHaveLength(0);
    await deliver(f, gw, webhook("order.paid", { id: "pay_Notes1", order_id: "order_Notes1", amount: Number(R(6000)) }, { order: { entity: { id: "order_Notes1", notes: { school_os_school: f.school.id, school_os_link: made.link.id } } } }));
    expect((await postedFor(f, "pay_Notes1")).posted.map((p) => p.paymentLinkId)).toEqual([made.link.id]);
  });

  it("posts nothing on payment.authorized (money not taken yet) and leaves admission fees to Admission Management", async () => {
    await deliver(f, gw, webhook("payment.authorized", { id: "pay_Auth1", order_id: "order_OldTab1", amount: 100, status: "authorized" }));
    await deliver(f, gw, webhook("payment.captured", { id: "pay_Adm1", order_id: "order_Adm1", amount: 50000, notes: { purpose: "admission-application-fee" } }));
    const rows = await withSchool(f.ctx, (tx) => tx.gatewayTransaction.findMany({ where: { gatewayPaymentId: { in: ["pay_Auth1", "pay_Adm1"] } } }));
    expect(rows).toEqual([]);
    expect((await postedFor(f, "pay_Auth1")).posted).toHaveLength(0);
  });
});

describe("automatic reconciliation (the fee-gateway-reconcile job)", () => {
  let f: FeeSchool;

  beforeAll(async () => {
    f = await makeFeeSchool();
    await gatewayIn(f);
  }, 120_000);

  it("asks Razorpay about Checkouts never confirmed, posts captured payments once, records failures, and keeps going past an error", async () => {
    const a = await openedLink(f, f.ctx, f.ravi.id, 0, "order_RecA1");
    const b = await openedLink(f, f.ctx, f.sita.id, 0, "order_RecB1");
    const c = await openedLink(f, f.ctx, f.anil.id, 0, "order_RecC1");
    const d = await openedLink(f, f.ctx, f.ravi.id, 1, "order_RecD1");
    const calls: string[] = [];
    const fetchImpl = fakeRazorpay({
      "GET /v1/orders/order_RecA1/payments": { items: [{ id: "pay_RecA1", order_id: "order_RecA1", amount: Number(a.amount), currency: "INR", status: "captured", created_at: 0, contact: "+919800011111", method: "upi", notes: [] }] },
      "GET /v1/orders/order_RecB1/payments": { items: [] },
      "GET /v1/orders/order_RecC1/payments": { items: [{ id: "pay_RecC1", order_id: "order_RecC1", amount: Number(c.amount), currency: "INR", status: "failed", created_at: 0, error_description: "Card declined by the bank" }] },
      "GET /v1/orders/order_RecD1/payments": 500,
    }, calls);
    const now = new Date();
    const run = (at: Date) => withSchool(f.ctx, (tx) => reconcileOnlinePayments(tx, f.ctx, at, { creds: CREDS, fetchImpl }), { timeout: 60_000 });
    expect(await run(now)).toEqual({ checked: 3, posted: 1, notReached: 1 });
    // An hour later the job asks again about the ones still open; nothing posts twice.
    expect(await run(new Date(now.getTime() + 61 * 60_000))).toEqual({ checked: 2, posted: 0, notReached: 1 });
    expect(calls.filter((x) => x.includes("order_RecA1"))).toHaveLength(1);

    const { posted, receipts } = await postedFor(f, "pay_RecA1");
    expect(posted).toHaveLength(1);
    expect(receipts).toBe(1);
    const state = await withSchool(f.ctx, async (tx) => ({
      links: await tx.paymentLink.findMany({ where: { id: { in: [a.link.id, b.link.id, c.link.id, d.link.id] } } }),
      failed: await tx.payment.count({ where: { gatewayPaymentId: "pay_RecC1", status: "FAILED" } }),
      log: await tx.gatewayTransaction.findFirstOrThrow({ where: { gatewayPaymentId: "pay_RecA1" } }),
      dashboard: await failedOnline(tx, new Date(now.getTime() - 24 * 60 * 60_000)),
    }));
    const of = (id: string) => state.links.find((l) => l.id === id)!;
    expect([of(a.link.id).status, of(b.link.id).gatewayStatus, of(c.link.id).gatewayStatus, of(d.link.id).gatewayStatus]).toEqual(["PAID", "no-payment", "failed", "not-reached"]);
    expect(state.failed).toBe(1);
    expect(state.log).toMatchObject({ event: "reconcile.captured", outcome: "posted", details: { contact: "+919800011111", method: "upi" } });
    // The Fee Dashboard lists the one Razorpay could not be asked about; the abandoned Checkout is only counted.
    expect(state.dashboard.stuck.map((l) => l.id)).toEqual([d.link.id]);
    expect(state.dashboard.started).toBe(1);
    expect(state.dashboard.failed.map((p) => p.gatewayPaymentId)).toEqual(["pay_RecC1"]);
  });
});

describe("online payments that matched no link", () => {
  let f: FeeSchool;
  let gw = "";

  beforeAll(async () => {
    f = await makeFeeSchool();
    gw = await gatewayIn(f);
    await withSchool(f.ctx, (tx) => tx.role.updateMany({ where: { key: "vice-principal" }, data: { isEnabled: true } }));
  }, 120_000);

  it("are listed for the Accountant with the payer's phone, and posted to the chosen student once, through the normal posting", async () => {
    const phone = f.ravi.guardian.phone!;
    await deliver(f, gw, webhook("payment.captured", { id: "pay_Lost1", order_id: "order_Lost1", amount: Number(R(3000)), contact: `+91${phone}`, method: "upi" }));
    await deliver(f, gw, webhook("order.paid", { id: "pay_Lost1", order_id: "order_Lost1", amount: Number(R(3000)) }));
    const told = await withSchool(f.ctx, (tx) => tx.notification.findMany({ where: { userLoginId: f.accountant.id, type: "fee-online" } }));
    expect(told.some((n) => /could not be matched/.test(n.text))).toBe(true);

    const list = await withSchool(f.ctx, (tx) => unmatchedOnline(tx, new Date(Date.now() - 86_400_000)));
    expect(list.map((u) => [u.gatewayPaymentId, u.amountPaise, u.payer.contact])).toEqual([["pay_Lost1", R(3000), `+91${phone}`]]);
    expect((await withSchool(f.ctx, (tx) => studentsForPayer(tx, list[0].payer.contact))).map((s) => s.id)).toEqual([f.ravi.id]);

    who.current = await currentFor(f, f.accountant.id);
    const r = await postUnmatchedAction(null, form({ transactionId: list[0].id, studentId: f.ravi.id }));
    expect(r?.ok).toBe(true);
    const { posted, receipts } = await postedFor(f, "pay_Lost1");
    expect(posted.map((p) => [p.studentId, p.amountPaise, p.mode])).toEqual([[f.ravi.id, R(3000), "GATEWAY"]]);
    expect(receipts).toBe(1);
    const q1 = (await dues(f.ctx, f.ravi.id))[0];
    expect(q1.paidPaise).toBe(R(3000));
    const audit = await withSchool(f.ctx, (tx) => tx.auditLogEntry.findFirst({ where: { recordId: posted[0].id, action: "matched-by-hand" } }));
    expect(audit?.userLoginId).toBe(f.accountant.id);
    expect(await withSchool(f.ctx, (tx) => unmatchedOnline(tx, new Date(Date.now() - 86_400_000)))).toEqual([]);

    // Never twice: by hand again, or when Razorpay sends it again.
    const again = await postUnmatchedAction(null, form({ transactionId: list[0].id, studentId: f.ravi.id }));
    expect(again?.ok).toBe(false);
    expect(again?.message).toMatch(/already posted/);
    await deliver(f, gw, webhook("payment.captured", { id: "pay_Lost1", order_id: "order_Lost1", amount: Number(R(3000)) }));
    expect((await postedFor(f, "pay_Lost1")).posted).toHaveLength(1);
  });

  it("can be posted by admission number; a role that only views fees cannot post, and another school cannot see it", async () => {
    await deliver(f, gw, webhook("payment.captured", { id: "pay_Lost2", order_id: "order_Lost2", amount: Number(R(1000)) }));
    const row = (await withSchool(f.ctx, (tx) => unmatchedOnline(tx, new Date(Date.now() - 86_400_000)))).find((u) => u.gatewayPaymentId === "pay_Lost2")!;

    const vp = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["vice-principal"] }] });
    who.current = await currentFor(f, vp.id);
    expect((await postUnmatchedAction(null, form({ transactionId: row.id, admissionNo: f.sita.admissionNo })))?.ok).toBe(false);
    expect((await postedFor(f, "pay_Lost2")).posted).toHaveLength(0);

    const other = await makeFeeSchool();
    await expect(withSchool(other.ctx, (tx) => postUnmatchedToStudent(tx, other.ctx, { transactionId: row.id, studentId: other.ravi.id }))).rejects.toThrow(/not found/);
    expect(await withSchool(other.ctx, (tx) => unmatchedOnline(tx, new Date(Date.now() - 86_400_000)))).toEqual([]);

    who.current = await currentFor(f, f.accountant.id);
    expect((await postUnmatchedAction(null, form({ transactionId: row.id, admissionNo: f.sita.admissionNo.toLowerCase() })))?.ok).toBe(true);
    expect((await postedFor(f, "pay_Lost2")).posted.map((p) => p.studentId)).toEqual([f.sita.id]);
  }, 120_000);
});

describe("refunds and disputes made at Razorpay", () => {
  let f: FeeSchool;
  let gw = "";

  beforeAll(async () => {
    f = await makeFeeSchool();
    gw = await gatewayIn(f);
  }, 120_000);

  async function paidOnline(studentId: string, orderId: string, payId: string) {
    const rows = await dues(f.ctx, studentId);
    const made = await withSchool(f.ctx, (tx) => createPaymentLink(tx, f.ctx, { studentId, dueIds: [rows[0].id], source: "PARENT_LINK" }));
    await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: made.link.id }, data: { gatewayOrderId: orderId } }));
    const r = await withSchool(f.ctx, (tx) => confirmGatewayPayment(tx, f.ctx, { gatewayAccountId: gw, gatewayPaymentId: payId, orderId, amountPaise: Number(made.amount), event: "payment.captured" }));
    return { paymentId: r.paymentId!, amount: made.amount };
  }

  it("never cancel a receipt by themselves: the Accountant asks to cancel, the Principal decides in Approvals", async () => {
    const { paymentId, amount } = await paidOnline(f.ravi.id, "order_Ref1", "pay_Ref1");
    const refund = { event: "refund.processed", payload: { refund: { entity: { id: "rfnd_Ref1", payment_id: "pay_Ref1", amount: Number(amount) } }, payment: { entity: { id: "pay_Ref1", order_id: "order_Ref1", amount: Number(amount), status: "refunded" } } } };
    await deliver(f, gw, refund);
    await deliver(f, gw, refund);
    const after = await withSchool(f.ctx, async (tx) => ({
      payment: await tx.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      receipt: await tx.receipt.findUniqueOrThrow({ where: { paymentId } }),
      rows: await tx.gatewayTransaction.findMany({ where: { gatewayPaymentId: "pay_Ref1", outcome: "refund-reported" } }),
      told: await tx.notification.count({ where: { userLoginId: f.accountant.id, text: { contains: "Razorpay refunded" } } }),
      check: await reversalsToCheck(tx, new Date(Date.now() - 86_400_000)),
    }));
    expect(after.payment.status).toBe("POSTED");
    expect(after.receipt.status).toBe("valid");
    expect(after.rows).toHaveLength(1);
    expect(after.told).toBe(1);
    expect(after.check.map((c) => [c.paymentId, c.kind, c.partial, c.asked])).toEqual([[paymentId, "refund", false, false]]);

    who.current = await currentFor(f, f.accountant.id);
    const asked = await askCancelReversedAction(null, form({ transactionId: after.rows[0].id }));
    expect(asked?.ok).toBe(true);
    const waiting = await withSchool(f.ctx, async (tx) => {
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      return { p, approval: await tx.approval.findUniqueOrThrow({ where: { id: p.cancelApprovalId! } }) };
    });
    expect(waiting.p.status).toBe("POSTED");
    expect(waiting.approval).toMatchObject({ type: "payment-cancellation", status: "WAITING", askedById: f.accountant.id });
    expect(waiting.approval.summary).toMatch(/Refunded at Razorpay/);

    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, waiting.approval.id, "approve", null));
    const done = await withSchool(f.ctx, async (tx) => ({
      payment: await tx.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      receipt: await tx.receipt.findUniqueOrThrow({ where: { paymentId } }),
      check: await reversalsToCheck(tx, new Date(Date.now() - 86_400_000)),
    }));
    expect(done.payment.status).toBe("CANCELLED");
    expect(done.receipt.status).toBe("cancelled");
    expect(done.check).toEqual([]);
  });

  it("a part refund is recorded as a refund, not a cancellation; a dispute is kept for the office too", async () => {
    const part = await paidOnline(f.sita.id, "order_Ref2", "pay_Ref2");
    await deliver(f, gw, { event: "refund.processed", payload: { refund: { entity: { id: "rfnd_Ref2", payment_id: "pay_Ref2", amount: Number(R(2000)) } }, payment: { entity: { id: "pay_Ref2", order_id: "order_Ref2", amount: Number(part.amount) } } } });
    const disputed = await paidOnline(f.anil.id, "order_Dis1", "pay_Dis1");
    await deliver(f, gw, { event: "payment.dispute.created", payload: { dispute: { entity: { id: "disp_Dis1", payment_id: "pay_Dis1", amount: Number(disputed.amount) } }, payment: { entity: { id: "pay_Dis1", order_id: "order_Dis1", amount: Number(disputed.amount) } } } });
    const check = await withSchool(f.ctx, (tx) => reversalsToCheck(tx, new Date(Date.now() - 86_400_000)));
    expect(check.map((c) => [c.paymentId, c.kind, c.partial]).sort()).toEqual([[part.paymentId, "refund", true], [disputed.paymentId, "dispute", false]].sort());
    const partRow = check.find((c) => c.paymentId === part.paymentId)!;
    await expect(withSchool(f.ctx, (tx) => askToCancelReversed(tx, f.ctx, partRow.id))).rejects.toThrow(/Record it as a refund/);
    const statuses = await withSchool(f.ctx, (tx) => tx.payment.findMany({ where: { id: { in: [part.paymentId, disputed.paymentId] } }, select: { status: true } }));
    expect(statuses.every((s) => s.status === "POSTED")).toBe(true);
  });
});
