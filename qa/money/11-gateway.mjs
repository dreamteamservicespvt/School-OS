// Payment gateway (Razorpay, test mode, FAKE demo keys) through Settings, Payment Gateways as the School Admin.
// step add (prod): add the gateway and try "Test these details" (no Razorpay account → must fail plainly).
// step test-on (run against the dev server with qa/money/fake-razorpay.mjs): test passes, switch on.
import { as, visit, shot, sql, SCHOOL_A, result, mainText } from "./m.mjs";
import { close } from "../lib.mjs";

const M = "Settings", P = "Payment Gateways";
const step = process.argv[2] ?? "add";
const gw = () => sql(`select id, display_name, is_active, last_test_ok, environment from payment_gateway_account where school_id='${SCHOOL_A}' and archived_at is null`);
const page = await as("cems.admin");

if (step === "add") {
  if (!gw().length) {
    await visit(page, "/settings/payment-gateways/new");
    await page.locator("select[name=provider]").selectOption("razorpay").catch(() => {});
    await page.locator("input[name=displayName]").fill("Razorpay (Demo test keys)");
    await page.locator("input[name=environment][value=test]").check();
    await page.locator("input[name=f_keyId]").fill("rzp_test_QADEMO00000001");
    await page.locator("input[name=f_keySecret]").fill("qademo-key-secret-not-real");
    await page.locator("input[name=webhookSecret]").fill("qa-demo-webhook-secret-123");
    await page.getByRole("button", { name: "Test these details" }).click();
    await page.waitForTimeout(8000);
    const t = (await mainText(page, 4000)).replace(/\s+/g, " ");
    const m = t.match(/(Razorpay[^.]*\.|could not[^.]*\.|not reach[^.]*\.|Key[^.]*\.)/g)?.slice(0, 4).join(" ") ?? t.slice(-300);
    result({ module: M, page: P, action: "Test fake Razorpay test-mode keys (no Razorpay account here)", role: "admin", expected: "Fails with plain words; nothing claims success", actual: m, status: /\b(ok|worked|passed)\b/i.test(m) && !/not|could/i.test(m) ? "FAIL" : "NEEDS EXTERNAL CREDENTIAL" });
    await shot(page, "gateway-test-fail");
    const cleared = (await page.locator("input[name=f_keyId]").inputValue()) === "";
    result({ module: M, page: P, action: "Form after 'Test these details'", role: "admin", expected: "Typed details kept so the admin can save", actual: cleared ? "Key ID, Key Secret and Webhook secret are emptied after the test; admin must type them again" : "kept", status: cleared ? "FAIL" : "PASS", defect: cleared ? "MONEY-05" : undefined });
    if ((await page.locator("input[name=displayName]").inputValue()) === "") await page.locator("input[name=displayName]").fill("Razorpay (Demo test keys)");
    await page.locator("input[name=f_keyId]").fill("rzp_test_QADEMO00000001");
    await page.locator("input[name=f_keySecret]").fill("qademo-key-secret-not-real");
    await page.locator("input[name=webhookSecret]").fill("qa-demo-webhook-secret-123");
    await page.getByRole("button", { name: "Add gateway" }).click();
    await page.waitForTimeout(4000);
  }
  const g = gw();
  result({ module: M, page: P, action: "Add Razorpay gateway (test mode)", role: "admin", expected: "Saved switched off; secret encrypted", actual: JSON.stringify(g), status: g.length === 1 && g[0][2] === "f" ? "PASS" : "FAIL" });
  const enc = sql(`select position('qademo-key-secret-not-real' in coalesce(secrets_enc::text,'')), position('qa-demo-webhook' in coalesce(webhook_secret_enc::text,'')) from payment_gateway_account where school_id='${SCHOOL_A}'`).flat();
  console.log("plain secret position (0 = not stored in clear):", enc);
  // Switch on without a passing test: not offered.
  await visit(page, `/settings/payment-gateways/${g[0][0]}`);
  const t = await mainText(page, 3000);
  result({ module: M, page: P, action: "Switch on a gateway whose test failed", role: "admin", expected: "Not offered until a test passes", actual: /Switch on becomes available after a test passes/.test(t) ? "Shows 'Switch on becomes available after a test passes.'" : t.slice(0, 200), status: /after a test passes/.test(t) ? "PASS" : "FAIL" });
}
if (step === "test-on") {
  const g = gw()[0];
  await visit(page, `/settings/payment-gateways/${g[0]}`);
  await page.getByRole("button", { name: "Test connection" }).click();
  await page.waitForTimeout(8000);
  await visit(page, `/settings/payment-gateways/${g[0]}`);
  await page.getByRole("button", { name: "Switch on" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: /Switch on/ }).last().click();
  await page.waitForTimeout(4000);
  result({ module: M, page: P, action: "Test connection (against a stand-in for Razorpay) and switch on", role: "admin", expected: "Test passes, gateway on", actual: JSON.stringify(gw()), status: gw()[0][2] === "t" ? "PASS" : "FAIL" });
}
if (step === "off") {
  const g = gw()[0];
  await visit(page, `/settings/payment-gateways/${g[0]}`);
  await page.getByRole("button", { name: "Switch off" }).first().click();
  const dlg = page.getByRole("dialog").last();
  const typed = dlg.locator("input[type=text], input:not([type])").first();
  if (await typed.count()) await typed.fill(g[1]);
  await dlg.getByRole("button", { name: /Switch off/ }).last().click();
  await page.waitForTimeout(4000);
  result({ module: M, page: P, action: "Switch the demo gateway off again after the webhook test", role: "admin", expected: "Gateway off", actual: JSON.stringify(gw()), status: gw()[0][2] === "f" ? "PASS" : "FAIL" });
}
await close();
