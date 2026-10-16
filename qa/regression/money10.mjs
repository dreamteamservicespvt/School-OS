// MONEY-10 (P1): one gateway payment posted twice after a failed confirmation.
// The defect was a direct webhook call, so the webhooks are sent straight to the running app
// (signed with the demo gateway's made-up webhook secret); the result is read on the screens.
//   QA_OUT=qa-output/regression node qa/regression/money10.mjs <studentName>
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { as, open, mainText, shot, close, squeeze, check, BASE } from "./_lib.mjs";

const SCHOOL_A = "fbe1c0d0-cc45-4512-908c-70436e3fd47f";
const SECRET = "qa-demo-webhook-secret-123"; // typed in Settings by the money QA for the demo gateway; not a real account
const NAME = process.argv[2] ?? "Demo QA Regress 61783";
const harness = (...a) => JSON.parse(execFileSync("npx", ["tsx", "--conditions=react-server", "--env-file=.env", "qa/regression/money10-harness.ts", ...a], { encoding: "utf8" }).trim().split("\n").pop());

await check({ id: "MONEY-10", area: "money", role: "Razorpay webhook (replayed) + cems.accountant", check: "payment.failed, then payment.captured and order.paid together for one payment id: ONE payment, ONE receipt, ONE Day Book line" }, async (set) => {
  const p = set(await as("cems.accountant"));
  await open(p, `/student-management?q=${encodeURIComponent(NAME)}`);
  const sid = (await p.locator("main a[href*='/student-management/students/']").filter({ hasText: NAME }).first().getAttribute("href")).match(/students\/([0-9a-f-]{36})/)[1];
  const h = harness("on", sid);
  try {
    const payId = `pay_QAREG${Date.now()}`;
    const url = `${BASE}/api/v1/payments/razorpay/webhook?s=${SCHOOL_A}&g=${h.gatewayId}`;
    const body = (event, status) => JSON.stringify({ entity: "event", event, payload: { payment: { entity: { id: payId, order_id: h.orderId, amount: Number(h.amountPaise), currency: "INR", status, method: "upi" } } }, created_at: Math.floor(Date.now() / 1000) });
    const send = async (raw) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }, body: raw }); return `${r.status}`; };
    const failed = await send(body("payment.failed", "failed"));
    const burst = await Promise.all([send(body("payment.captured", "captured")), send(body("order.paid", "captured")), send(body("payment.captured", "captured"))]);
    await p.waitForTimeout(3000);
    // What the accountant sees: the student's ledger and today's Day Book.
    await open(p, `/fee-management/ledger/${sid}`);
    const led = squeeze(await mainText(p, 20000));
    const inLedger = (led.match(new RegExp(payId, "g")) ?? []).length;
    const s = await shot(p, "MONEY-10-ledger");
    await open(p, "/finance-management/day-book");
    const db = squeeze(await mainText(p, 40000));
    const inDayBook = (db.match(new RegExp(payId, "g")) ?? []).length;
    const ok = inDayBook === 1 && inLedger >= 1;
    return { status: ok ? "PASS" : "FAIL", note: `order ${h.orderId} ₹${Number(h.amountPaise) / 100}; webhook answers: failed ${failed}, then ${burst.join("/")}; ledger shows ${payId} ${inLedger} time(s); Day Book today has ${inDayBook} line(s) for it. The order was made with a stand-in for Razorpay (qa/regression/money10-harness.ts); a real Razorpay round trip NEEDS EXTERNAL CREDENTIAL.`, shot: s };
  } finally {
    if (!h.wasActive) harness("off");
  }
});
await close();
