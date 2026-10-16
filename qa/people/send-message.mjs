// Send Message to a section's parents with no SMS/WhatsApp/email connected: what the preview
// and the result say, and what Message History then shows.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const page = await as(process.env.LOGIN ?? "cems.principal");
const M = "Communication", P = "Send Message", R = process.env.ROLE_NAME ?? "Principal";
await go(page, "/communication");
await page.locator("main button", { hasText: /^Sections$/ }).first().click();
await page.waitForTimeout(800);
const main = page.locator("main");
console.log((await main.innerText()).slice(0, 1500));
// pick Grade 5 A
const opt = main.getByRole("button", { name: /^Grade 5 A/ }).or(main.locator("label", { hasText: /^Grade 5 A/ })).first();
await opt.click().catch(async () => { await main.getByText("Grade 5 A", { exact: false }).first().click(); });
await page.waitForTimeout(800);
await page.locator("input[name=title]").fill("Demo: PTM on Saturday");
await page.locator("textarea[name=text]").fill("Dear parent of {student_name} ({class}), the PTM is on Saturday 17-10-2026 at 9:30 AM. Demo message.");
await page.waitForTimeout(2000);
const check = (await main.innerText()).replace(/\s+/g, " ");
const sec3 = (check.match(/3\. Check and send.{0,600}/) ?? [""])[0];
await shot(page, "send-message-preview");
res({ module: M, page: P, action: "Preview: Grade 5 A parents, no SMS/WhatsApp/email connected, App notice only", role: R, expected: "Says exactly who gets it and that parents without app/Parent Link get nothing", actual: sec3.slice(0, 450), status: /no app|will not|not get|nobody|0 parents/i.test(sec3) ? "PASS" : "FAIL" });
const btn = main.getByRole("button", { name: /^Send to/ });
const label = await btn.innerText();
const enabled = await btn.isEnabled();
if (enabled) {
  await btn.click();
  await page.waitForTimeout(1500);
  const dlg = page.locator("dialog[open]");
  if (await dlg.count()) { console.log("CONFIRM:", (await dlg.innerText()).slice(0, 500)); await dlg.getByRole("button", { name: /Send/ }).last().click(); }
  await page.waitForTimeout(4000);
}
const toast = (await page.locator("[role=status]").allInnerTexts()).join(" ").replace(/\s+/g, " ");
await shot(page, "send-message-after");
res({ module: M, page: P, action: `Send to Grade 5 A (button "${label.trim()}")`, role: R, expected: "Only the people who can really get it are counted; result says queued/in-app, never 'delivered' to parents who cannot receive it", actual: `enabled=${enabled}; ${toast.slice(0, 300)}; url=${page.url()}`, status: enabled ? (/sent to \d+ parents/i.test(toast) && !/app/i.test(toast) ? "FAIL" : "PASS") : "PASS" });
console.log(page.problems);
await close();
