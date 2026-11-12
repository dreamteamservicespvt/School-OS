// Layman C: principal finds the LC notice waiting for approval and declines it; looks at results publish controls.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("principal");
await go(p, "/approvals?type=notice"); await sleep(1500);
const t = await mainText(p, 20000);
console.log("APPROVALS has LC notice:", /LC- సెలవు/.test(t), (t.match(/[^\n]*LC-[^\n]*/g) ?? []).slice(0, 4));
await snap(p, "c-princ-approvals", false);
const n = await p.getByRole("button", { name: /^Decline/ }).count(); console.log("decline buttons", n);
const card = n === 1 ? p.locator("main") : p.locator("main div").filter({ hasText: "LC- సెలవు" }).filter({ has: p.getByRole("button", { name: /^Decline/ }) }).last();
const dec = card.getByRole("button", { name: /Decline|Reject/ }).first();
if (await dec.isVisible().catch(() => false)) {
  await dec.click(); await sleep(1000);
  const d = p.getByRole("dialog").last();
  console.log("DECLINE DLG", (await d.innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 400));
  const r = d.locator("textarea, input[type=text]").first(); if (await r.count()) await r.fill("LC test, not needed");
  await d.getByRole("button", { name: /Decline|Reject/ }).last().click().catch(() => {}); await sleep(2500);
  console.log("AFTER DECLINE", (await mainText(p, 20000)).includes("LC- సెలవు") ? "still listed" : "gone");
}
await go(p, "/communication/notices/343443c8-7b6d-4dda-921f-b7b125ddc77e"); await sleep(1000);
console.log("NOTICE NOW", (await mainText(p, 800)).replace(/\n+/g, " | ").slice(0, 300));
console.log("PROBLEMS", p.problems);
await close();
