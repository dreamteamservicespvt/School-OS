// Communication: an App notice to all staff (Principal), then a teacher sees it in-app;
// Message History shows the delivery status per person; Message Templates list.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Communication";
const T = async (p, sel = "main") => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const TITLE = `Demo staff notice ${new Date().toISOString().slice(11, 16)}`;
const pr = await as("cems.principal");
await go(pr, "/communication");
const main = pr.locator("main");
await main.locator("button", { hasText: /^Staff$/ }).first().click();
await pr.waitForTimeout(1000);
console.log("STAFF STEP", (await T(pr)).match(/1\. Who gets it.{0,500}/)?.[0]);
await pr.locator("input[name=title]").fill(TITLE);
await pr.locator("textarea[name=text]").fill("Dear staff, the staff meeting is at 3:45 PM today in the library. Demo message for QA.");
await pr.waitForTimeout(2000);
const check = (await T(pr)).match(/3\. Check and send.{0,500}/)?.[0] ?? "";
const btn = main.getByRole("button", { name: /^Send to/ });
const label = (await btn.count()) ? (await btn.innerText()).trim() : "none";
res({ module: M, page: "Send Message", action: "Preview: App notice to all staff", role: "Principal", expected: "Counts staff with a login; free", actual: `${label} || ${check.slice(0, 300)}`, status: /staff/i.test(check) && /Free/.test(check) ? "PASS" : "FAIL" });
if (await btn.count() && await btn.isEnabled()) {
  await btn.click();
  await pr.waitForTimeout(1200);
  const dlg = pr.locator("dialog[open]");
  if (await dlg.count()) await dlg.getByRole("button", { name: /Send/ }).last().click();
  await pr.waitForTimeout(4000);
}
const toast = await T(pr, "[role=status]");
await shot(pr, "staff-message-sent");
res({ module: M, page: "Send Message", action: "Send the App notice to all staff", role: "Principal", expected: "Says it went in-app to N staff", actual: toast.slice(0, 250), status: /staff|sent|app/i.test(toast) ? "PASS" : "FAIL" });

// A teacher sees it
const te = await as("cems.teacher");
await go(te, "/notifications");
await te.waitForTimeout(1000);
let t = await T(te);
const inbox = t.includes(TITLE) ? t : (await (async () => { await go(te, "/communication/inbox"); await te.waitForTimeout(1000); return T(te); })());
res({ module: M, page: "Notifications / Inbox", action: "A teacher receives the staff App notice", role: "Teacher", expected: "The notice is there with its title", actual: (inbox.match(new RegExp(`.{0,60}${TITLE}.{0,100}`)) ?? [inbox.slice(0, 200)])[0], status: inbox.includes(TITLE) ? "PASS" : "FAIL" });

// History: delivery status
await go(pr, "/communication/history");
await pr.waitForTimeout(1000);
const row = pr.locator("main a").filter({ hasText: TITLE }).first();
if (await row.count()) { await row.click(); await pr.waitForTimeout(1500); }
t = await T(pr);
await shot(pr, "staff-message-history");
res({ module: M, page: "Message History", action: "Delivery status of the staff App notice", role: "Principal", expected: "Per person status (Delivered in app / Read), no false WhatsApp/SMS", actual: t.slice(0, 350), status: t.includes(TITLE) && /Delivered|Read|In app|App/i.test(t) && !/WhatsApp.{0,20}Delivered/.test(t) ? "PASS" : "FAIL" });

// Templates
await go(pr, "/communication/templates");
await pr.waitForTimeout(1000);
t = await T(pr);
res({ module: M, page: "Message Templates", action: "Open Message Templates", role: "Principal", expected: "Templates listed with channel, language and approval state", actual: t.slice(0, 300), status: /template/i.test(t) && !/error/i.test(t) ? "PASS" : "FAIL" });
console.log(pr.problems, te.problems);
await close();
