import { asRole, go, sleep, close, snap, one, timed, watch } from "./nc-h.mjs";
const who = process.argv[2] ?? "principal";
const p = watch(await asRole(who));
for (const u of ["/approvals", "/approvals?tab=mine", "/approvals?tab=all"]) {
  await go(p, u); await sleep(1000);
  const t = await p.locator("main").innerText();
  console.log(u, "count Reyansh:", (t.match(/Reyansh[^\n]*/g) ?? []).slice(0, 3), "| NC:", (t.match(/NC-[^\n]*/g) ?? []).slice(0, 5));
  console.log("  tabs/top:", one(t, 300));
}
// show more?
console.log("LINKS", (await p.locator("main a, main button").allInnerTexts()).filter(x => /more|next|page|show/i.test(x)).slice(0, 10));
await close();
