// "Sent" claims while WhatsApp, SMS and Email are all off (Settings, SMS, WhatsApp & Email): hostel outings footnote,
// emailing a purchase order to the vendor.
import { asUser, go, mainText, close, record, send, sleep } from "./util.mjs";
const ONLY = process.env.ONLY?.split(",");
const step = async (name, fn) => { if (ONLY && !ONLY.some((o) => name.includes(o))) return; try { await fn(); } catch (e) { console.log("ERR", name, e.message.split("\n")[0]); } };
let channels = "";
await step("channels", async () => {
  const a = await asUser("cems.admin"); await go(a, "/settings/messaging"); const t = await mainText(a, 3000);
  const offs = (t.match(/(WhatsApp|SMS|Email)\nOff/g) ?? []).map((x) => x.split("\n")[0]);
  channels = offs.join(", ") + " off";
  record({ module: "Settings", page: "SMS, WhatsApp & Email", action: "Check which message channels are connected", role: "School Admin", expected: "Known state for the 'sent' checks", actual: channels, status: offs.length === 3 ? "PASS" : "BLOCKED" });
  await a.context().close();
});
await step("outings", async () => {
  const w = await asUser("cems.warden"); await go(w, "/hostel-management/outings"); const t = await mainText(w, 6000);
  const line = t.split("\n").find((l) => /Parents are told|Messages to parents/.test(l)) ?? "";
  const claim = /Parents are told/.test(line);
  record({ module: "Hostel Management", page: "Outing & Visitors", action: `Footnote on Outing passes while ${channels}`, role: "Hostel Warden", expected: "No claim that parents are told while no channel can send (or a plain 'messages are not sent: no channel connected')", actual: line.slice(line.indexOf("New outings")), status: claim ? "FAIL" : "PASS", ...(claim ? { defect: "CAMPUS2-05" } : {}) });
  await w.context().close();
});
await step("po-email", async () => {
  const s = await asUser("cems.store"); await go(s, "/inventory-management/purchases?tab=orders");
  const href = await s.evaluate(() => [...document.querySelectorAll("main a[href*='/purchases/orders/']")].map((a) => a.getAttribute("href"))[0]);
  await go(s, href + "?open=email"); await s.waitForSelector("dialog[open]", { timeout: 15000 }); await sleep(400);
  const dt = (await s.locator("dialog[open]").innerText()).replace(/\n/g, " / ");
  const to = s.locator("dialog[open] [name=to]"); if (!(await to.inputValue())) await to.fill("qa.demo.vendor@example.com");
  const r = await send(s, (await s.locator("dialog[open] button[type=submit]").last().innerText()).trim());
  const sent = /\bsent\b|emailed/i.test(r.s) && !/not sent|test mode|recorded|not connected|off/i.test(r.s);
  record({ module: "Inventory Management", page: "Purchases & Vendors", action: `Email a purchase order to the vendor while ${channels}`, role: "Store Keeper", expected: "Says plainly the email cannot go (Email is off), or that it was only recorded", actual: `sheet: ${dt.slice(0, 250)} → ${r.s}`, status: sent ? "FAIL" : "PASS", ...(sent ? { defect: "CAMPUS2-06" } : {}) });
  await s.context().close();
});
await close();
