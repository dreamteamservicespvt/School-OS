// Parent Link online payment, confirmed by Razorpay's webhook, replayed against the running app.
//   node qa/money/24-webhook.mjs <token> <orderId> <amountPaise> <gatewayId>
// Expect: wrong signature refused; the first payment.captured posts ONE payment, ONE receipt,
// ONE Day Book entry; replays and order.paid (also three at the same moment) add nothing.
import { createHmac } from "node:crypto";
import { newPage, close, VIEWPORTS } from "../lib.mjs";
import { sql, SCHOOL_A, result, BASE, OUT } from "./m.mjs";

const [token, orderId, amount, gw] = process.argv.slice(2);
const SECRET = "qa-demo-webhook-secret-123"; // the demo gateway's webhook secret, typed in Settings (not a real account)
const payId = `pay_QADEMO${Date.now()}`;
const url = `${BASE}/api/v1/payments/razorpay/webhook?s=${SCHOOL_A}&g=${gw}`;
const M = "Fee Management", P = "Parent Link payment (Razorpay webhook)";

// The parent's pay page in a browser (no sign-in).

const page = await newPage(VIEWPORTS.phone375);
await page.goto(`${BASE}/pay/${SCHOOL_A}/${token}`, { waitUntil: "domcontentloaded", timeout: 300000 });
await page.waitForTimeout(2500);
const payText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
await page.screenshot({ path: `${OUT}/parent-pay-page-375.png`, fullPage: true });
result({ module: M, page: "Pay page", action: "Parent opens the payment link on a phone", role: "parent (no sign-in)", expected: "Student, amount ₹10,000 and a Pay button", actual: payText.slice(0, 220), status: /10,000/.test(payText) && /Pay/.test(payText) ? "PASS" : "FAIL" });

const body = (event) => JSON.stringify({ entity: "event", event, payload: { payment: { entity: { id: payId, order_id: orderId, amount: Number(amount), currency: "INR", status: "captured", method: "upi" } } }, created_at: Math.floor(Date.now() / 1000) });
const send = async (raw, sig) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": sig ?? createHmac("sha256", SECRET).update(raw).digest("hex") }, body: raw });
  return `${r.status} ${(await r.text()).slice(0, 80)}`;
};
const state = () => {
  const pays = sql(`select id, status, amount_paise from payment where school_id='${SCHOOL_A}' and reference='${payId}'`);
  const ids = pays.filter((p) => p[1] === "POSTED").map((p) => `'${p[0]}'`).join(",") || "'00000000-0000-0000-0000-000000000000'";
  const receipts = sql(`select count(*) from receipt where payment_id in (${ids})`)[0][0];
  const daybook = sql(`select count(*) from day_book_entry where school_id='${SCHOOL_A}' and source_type='payment' and source_id in (${ids.replace(/'/g, "'")}) and reverses_entry_id is null`)[0][0];
  return { posted: pays.filter((p) => p[1] === "POSTED").length, receipts: Number(receipts), daybook: Number(daybook) };
};

const bad = await send(body("payment.captured"), "0".repeat(64));
result({ module: M, page: P, action: "Webhook with a wrong signature", role: "Razorpay (replayed)", expected: "Refused (400); nothing posted", actual: `${bad} | ${JSON.stringify(state())}`, status: bad.startsWith("400") && state().posted === 0 ? "PASS" : "FAIL" });
const first = await send(body("payment.captured"));
const s1 = state();
result({ module: M, page: P, action: "payment.captured (signed)", role: "Razorpay (replayed)", expected: "ONE payment, ONE receipt, ONE Day Book entry", actual: `${first} | ${JSON.stringify(s1)}`, status: s1.posted === 1 && s1.receipts === 1 && s1.daybook === 1 ? "PASS" : "FAIL" });
const again = await send(body("payment.captured"));
const s2 = state();
result({ module: M, page: P, action: "Same payment.captured replayed", role: "Razorpay (replayed)", expected: "Accepted (200); still ONE of each", actual: `${again} | ${JSON.stringify(s2)}`, status: again.startsWith("200") && JSON.stringify(s2) === JSON.stringify(s1) ? "PASS" : "FAIL" });
const burst = await Promise.all([send(body("order.paid")), send(body("payment.captured")), send(body("order.paid"))]);
const s3 = state();
result({ module: M, page: P, action: "order.paid and payment.captured replayed three at the same moment", role: "Razorpay (replayed)", expected: "Still ONE payment, ONE receipt, ONE Day Book entry", actual: `${burst.join(" / ")} | ${JSON.stringify(s3)}`, status: JSON.stringify(s3) === JSON.stringify(s1) ? "PASS" : "FAIL", defect: JSON.stringify(s3) === JSON.stringify(s1) ? undefined : "MONEY-10" });
const link = sql(`select status from payment_link where gateway_order_id='${orderId}'`)[0]?.[0];
const bal = sql(`select coalesce(sum(balance_paise),0) from student_fee_due where student_id='f1bda690-4658-4866-b6fc-78412b605a65' and state='OPEN'`)[0][0];
result({ module: M, page: P, action: "After the webhook: link and balance", role: "SQL check", expected: "Link Paid; Ananya's balance ₹0", actual: `link=${link} open balance paise=${bal}`, status: link === "PAID" && Number(bal) === 0 ? "PASS" : "FAIL" });
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
result({ module: M, page: "Pay page", action: "Parent opens the same link after paying", role: "parent (no sign-in)", expected: "Says it is paid; no second Pay", actual: after.slice(0, 200), status: /paid/i.test(after) && !/Pay ₹/.test(after) ? "PASS" : "FAIL" });
await close();
