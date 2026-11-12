// Layman B: advance form with a staff member chosen; slip PDF download; history by staff member.
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
import { appendFileSync } from "node:fs";
const OUT = process.env.QA_OUT; const log = (...a) => { const s = a.join(" "); console.log(s); appendFileSync(`${OUT}/salary.log`, s + "\n"); };
const p = await asRole("accountant");
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
const errsIn = async () => (await p.evaluate(() => [...document.querySelectorAll("[role=dialog] [id$='-error'], [role=dialog] [role=alert]")].map((e) => e.innerText.trim()).filter(Boolean).join(" || ")));
const S = new Date().toTimeString().slice(0, 5).replace(":", "");
// slip PDF by clicking
await go(p, "/salary-management/slips?run=1a10f825-6b89-4935-9a31-8e288a616de9&slip=c7e336c0-274d-4ce0-857d-a32caedff1bb"); await sleep(2500);
log("SLIP2", (await dt()).slice(0, 200));
try { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 40000 }), dlg().getByRole("button", { name: /Download PDF/ }).or(dlg().getByRole("link", { name: /Download PDF/ })).first().click()]); await d.saveAs(`${OUT}/dl/slip.pdf`); log("SLIP PDF saved", d.suggestedFilename()); }
catch (e) { log("SLIP PDF no download:", e.message.slice(0, 100), "| popup url?", p.context().pages().map((x) => x.url()).join(" ")); }
await p.keyboard.press("Escape");
// history by staff member
await go(p, "/salary-management/history"); await sleep(1500);
const tabs = await p.evaluate(() => [...document.querySelectorAll("main a, main button, main [role=tab]")].filter((e) => /By staff member/.test(e.innerText)).map((e) => `${e.tagName} ${e.getAttribute("href") ?? ""} ${e.getAttribute("role") ?? ""}`));
log("TABS", tabs.join(" ; "));
await p.locator("main").getByText("By staff member", { exact: true }).first().click(); await sleep(3000);
const hs = await mainText(p, 5000); log("HIST STAFF", p.url(), hs.slice(0, 1800).replace(/\n/g, " / ")); await snap(p, "sal-history-staff");
// advance with a staff member chosen
await go(p, "/salary-management/advances"); await sleep(1500);
await p.getByRole("button", { name: /Give advance or loan/ }).or(p.getByRole("link", { name: /Give advance or loan/ })).first().click(); await sleep(2000);
await dlg().getByLabel(/Staff member/).selectOption({ label: "Saroja Devi · Attendant" });
const ab = () => dlg().getByRole("button", { name: /Send|Save|Give|Approval/ }).last();
log("ADV button", await ab().innerText());
const amt = dlg().getByLabel(/^Amount/).first(); const each = dlg().getByLabel(/Recover each month/).first();
const why = dlg().getByLabel(/Reason|Why|Purpose|For/i).first();
await why.fill(`LB-${S} layman test advance`).catch(() => log("no reason field"));
for (const [a, e] of [["-5000", "500"], ["0", "500"], ["100.555", "10"], ["5000", "0"], ["5000", "9000"], ["99999999999", "100"], ["5000", "-100"]]) {
  await amt.fill(a); await each.fill(e); await sleep(300); await ab().click().catch(() => {}); await sleep(2000);
  log(`ADV amount "${a}" each "${e}" ->`, await errsIn(), "| open:", await dlg().isVisible().catch(() => false));
  if (!(await dlg().isVisible().catch(() => false))) { log("!! ADV SAVED with", a, e); break; }
}
await snap(p, "sal-adv-bad2", false);
log("ADV SHEET NOW", (await dt()).slice(-700));
await p.keyboard.press("Escape");
process.exit(0);
