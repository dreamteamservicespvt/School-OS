// After the lock: the class teacher asks for a correction on a phone (Akshara Pillai, 16 Oct, Present -> Absent);
// mistakes first (nothing chosen, short reason); the principal approves in Approvals; the register changes, audit keeps the original.
import { as, visit, text, report, shot, VIEWPORTS, sql, one, sleep, messages, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";

const SEC = "b07ca58e-2716-4729-ab56-3cdf783e5598";
const D = "2026-10-16";
const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, `/attendance-management?section=${SEC}&date=${D}`, 1200);
await t.getByRole("link", { name: "Request a correction" }).first().click();
await t.waitForLoadState("load"); await sleep(1500);
console.log("correction url:", t.url());
console.log(await text(t, 1500));
await report(t, "correction form");
await shot(t, "corr-form-phone", true);
// 1. Send with nothing filled
const send = t.getByRole("button", { name: "Send for approval" });
await send.click(); await sleep(2000);
console.log("empty send ->", await messages(t));
console.log((await text(t, 1500)).slice(0, 900));
// 2. Choose Akshara, status Absent, a too-short reason
const ak = t.getByLabel(/Akshara Pillai/);
if (await ak.count()) await ak.check();
await t.getByLabel("New status").selectOption({ label: /Absent/ }).catch(async () => {
  const opts = await t.getByLabel("New status").locator("option").allInnerTexts(); console.log("status options:", opts);
  await t.getByLabel("New status").selectOption({ label: opts.find((o) => /^Absent/.test(o)) });
});
await t.getByLabel("Reason").fill("oops");
await send.click(); await sleep(2000);
console.log("short reason ->", await messages(t));
await t.getByLabel("Reason").fill("She left after the first period with fever; marked present by mistake.");
await send.click(); await sleep(3000);
console.log("send ->", await messages(t), t.url());
console.log((await text(t, 1200)));
await shot(t, "corr-sent-phone", false);
console.log("corrections:", sql(`select c.id, c.status, c.entries::text, c.reason, c.approval_id from attendance_correction c where c.school_id='${SUNRISE}' and c.date='${D}' order by c.created_at desc limit 3`));
// Double send? send again same thing
await visit(t, t.url(), 1000);
console.log("approvals rows:", sql(`select a.type, a.status, a.summary, a.current_approver_role from approval a where a.school_id='${SUNRISE}' and a.type ilike '%correction%' order by a.created_at desc limit 3`));

// Principal approves in Approvals
const p = await as("principal", VIEWPORTS.phone390);
await visit(p, "/approvals", 1500);
console.log("\nprincipal approvals:", (await text(p, 2500)));
await report(p, "approvals");
await shot(p, "corr-approvals-phone", true);
await close();
