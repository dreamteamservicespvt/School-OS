// Journey E7 part 2: unknown card, then issue copy 00516 to Kabir (double click), then return it.
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const p = await as("librarian");
await go(p, "/library-management");
await p.locator("#scan-member").fill("NO-SUCH-CARD");
await p.getByRole("button", { name: "Go" }).click(); await p.waitForTimeout(2500);
console.log("UNKNOWN CARD:", (await p.locator("main").innerText()).replace(/\n+/g, " | ").match(/Library card or name.{0,300}/s)?.[0]);
await go(p, "/library-management");
await p.locator("#scan-member").fill("SPS/2023/0185");
await p.getByRole("button", { name: "Go" }).click(); await p.waitForTimeout(3000);
await p.locator("#scan-copy").fill("00516");
const go2 = p.getByRole("button", { name: "Go" }).last();
await go2.click(); await p.waitForTimeout(2500);
const txt = await mainText(p, 2000);
console.log("AFTER SCAN:", txt.replace(/\n+/g, " | ").match(/Kabir.{0,500}/s)?.[0]);
console.log("ISSUE BUTTONS", await p.getByRole("button", { name: /Issue/ }).allInnerTexts());
await close();
// (appended) issue, then return twice: the new copy and an overdue one.
const q = await as("librarian");
await go(q, "/library-management");
await q.locator("#scan-member").fill("SPS/2023/0185");
await q.getByRole("button", { name: "Go" }).click(); await q.waitForTimeout(3000);
await q.locator("#scan-copy").fill("00516");
await q.getByRole("button", { name: "Go" }).last().click(); await q.waitForTimeout(2500);
const ib = q.getByRole("button", { name: /^Issue “/ });
await ib.click(); await ib.click({ timeout: 800 }).catch(() => {});
await q.waitForTimeout(3500);
console.log("AFTER ISSUE:", (await mainText(q, 1500)).replace(/\n+/g, " | ").match(/Kabir.{0,300}/s)?.[0]);
for (const acc of ["00516", "00400"]) {
  await go(q, "/library-management?mode=return");
  const box = q.locator("main input:not([type=hidden])").first();
  await box.fill(acc);
  await q.getByRole("button", { name: "Go" }).first().click(); await q.waitForTimeout(3000);
  console.log(`RETURN ${acc} SCREEN:`, (await mainText(q, 2500)).replace(/\n+/g, " | ").match(/(Return|Book).{0,600}/s)?.[0]);
  const rb = q.getByRole("button", { name: /^(Return|Take back|Mark returned)/ }).first();
  console.log("  buttons", await q.locator("main button").allInnerTexts());
  if (await rb.count()) { await rb.click(); await rb.click({ timeout: 800 }).catch(() => {}); await q.waitForTimeout(3500); console.log("  AFTER:", (await mainText(q, 1500)).replace(/\n+/g, " | ").slice(0, 500)); }
}
await shot(q, "j7-return", false);
console.log("PROBLEMS", q.problems);
await close();
