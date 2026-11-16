// Ctrl K search like a clerk: node qa/layman/na-search.mjs <role> word1 word2 ...
import { asRole, close, snap, log, go, sleep } from "./na-h.mjs";
const [role, ...words] = process.argv.slice(2);
const p = await asRole(role);
await go(p, "/dashboard");
for (const w of words) {
  await p.keyboard.press("Control+k"); await sleep(800);
  const box = p.locator('[role="dialog"] input, [cmdk-input], input[type=search]').first();
  await box.fill("");
  const t0 = Date.now();
  await box.pressSequentially(w, { delay: 40 });
  await sleep(2500);
  const res = await p.locator('[role="dialog"]:visible, [role="listbox"]:visible').last().innerText().catch(() => "?");
  log(`SEARCH ${role} "${w}" (${Date.now() - t0} ms): ${res.replace(/\n/g, " | ").slice(0, 600)}`);
  await snap(p, `search-${role}-${w.replace(/\W+/g, "_")}`, false);
  await p.keyboard.press("Escape"); await sleep(400);
}
await close();
