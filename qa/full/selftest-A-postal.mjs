// Self-test A: postal hand over probe (the sheet said "Not at the desk" for an item at the desk).
import { asRole, go, text, sleep, close, snap } from "./selftest-A-h.mjs";
const p = await asRole("reception");
await go(p, "/front-office/postal"); await sleep(2500);
const links = await p.locator("main a").evaluateAll((as) => as.filter((a) => /Hand over/.test(a.innerText)).map((a) => a.getAttribute("href")));
console.log("HAND OVER LINKS", links.length, links.slice(0, 6).join("\n"));
const t = await text(p, 20000);
console.log("ROWS WITH QA:", (t.match(/[^\n]*QA Courier Sender[^\n]*/g) ?? []).join(" / "));
for (const h of links.slice(0, 2)) {
  await go(p, h); await sleep(2500);
  console.log("SHEET for", h.slice(-60), "=>", (await p.getByRole("dialog").last().innerText().catch(() => "(none)")).replace(/\n+/g, " | ").slice(0, 300));
}
await snap(p, "fo-postal-handover");
await close();
