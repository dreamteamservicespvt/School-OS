// Workflow 3 with no gateway connected: what the office and the parent see; nothing half-posted.
//   node qa/e2e/money/03-online.mjs
import { as, anon, visit, text, shot, sql, one, layoutIssues, VIEWPORTS, BASE, note, squeeze, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const STUDENT = "5323a56e-27dd-4d83-a914-3e95790b75a7";
const counts = () => ({ pays: one(`select count(*) from payment where school_id='${SUNRISE}'`), links: one(`select count(*) from payment_link where school_id='${SUNRISE}'`), day: one(`select count(*) from day_book_entry where school_id='${SUNRISE}'`) });
const c0 = counts();

// Office: Collect Fee buttons for online.
const acc = await as("accountant");
await visit(acc, `/fee-management/collect/${STUDENT}`, 1500);
const link = acc.getByRole("button", { name: "Send payment link instead" });
note("Send payment link: disabled=", await link.isDisabled(), "title=", await link.getAttribute("title"));
const qr = acc.getByRole("button", { name: /Show QR/ });
note("Show QR: disabled=", await qr.isDisabled(), "title=", await qr.getAttribute("title"));
// Online payments on the Fee Dashboard.
await visit(acc, "/fee-management/dashboard", 2000);
const fd = await text(acc, 9000);
note("DASH online bits:", (fd.match(/Online \(Razorpay\)[^A-Z]{0,30}|Failed online payments.{0,160}|Online payments to check.{0,160}/g) ?? []).join(" || "));
// Defaulters reminder: does it promise a payment link?
await visit(acc, "/fee-management/settings", 2000);
const fs = await text(acc, 6000);
note("FEE SETTINGS gateway part:", (fs.match(/.{0,80}(gateway|Razorpay|online).{0,200}/gi) ?? []).slice(0, 4).join(" || "));
await shot(acc, "fee-settings-accountant");
await acc.context().close();

// School Admin: Settings, Payment Gateways.
const adm = await as("admin");
await visit(adm, "/settings/payment-gateways", 2000);
note("PAYMENT GATEWAYS:", (await text(adm, 2000)).slice(0, 1200));
await shot(adm, "payment-gateways-admin");
await adm.context().close();

// Parent: a payment link that does not exist / was changed.
const par = await anon(VIEWPORTS.phone390);
for (const u of [`/pay/${SUNRISE}/not-a-real-token-1234567890`, `/pay/00000000-0000-4000-8000-000000000000/abc`, "/p/not-a-real-parent-link-token-000000000000"]) {
  const r = await par.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
  await par.waitForTimeout(1500);
  note(`PARENT ${u}: HTTP ${r.status()} :: ${squeeze(await par.locator("body").innerText()).slice(0, 300)}`);
  await shot(par, `parent-bad-${u.split("/")[1]}`);
}
// Gateway webhook with a wrong signature (as if someone fakes Razorpay).
const body = JSON.stringify({ entity: "event", event: "payment.captured", payload: { payment: { entity: { id: "pay_QAFAKE1", order_id: "order_QAFAKE1", amount: 100000, currency: "INR", status: "captured", method: "upi" } } } });
const gw = one(`select id from payment_gateway_account where school_id='${SUNRISE}' limit 1`);
for (const sig of ["0".repeat(64), ""]) {
  const r = await fetch(`${BASE}/api/v1/payments/razorpay/webhook?s=${SUNRISE}&g=${gw}`, { method: "POST", headers: { "content-type": "application/json", ...(sig ? { "x-razorpay-signature": sig } : {}) }, body });
  note(`WEBHOOK sig=${sig ? "wrong" : "none"}: ${r.status} ${(await r.text()).slice(0, 120)}`);
}
note("counts before", JSON.stringify(c0), "after", JSON.stringify(counts()));
note("problems", JSON.stringify(par.problems));
await close();
