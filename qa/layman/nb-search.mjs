// Night B: a clerk types questions into the top search box.
import { asRole, go, mainText, sleep, snap, log, flat } from "./nb-h.mjs";
const L = log("search");
const p = await asRole(process.argv[2] ?? "accountant");
await go(p, "/dashboard"); await sleep(1000);
for (const q of (process.argv[3] ?? "refund|how to refund|refund payment|add expense|expense|cancel receipt|day close|close day|salary slip|concession").split("|")) {
  await p.keyboard.press("Control+k"); await sleep(800);
  const box = p.getByRole("dialog").last().locator("input").first();
  await box.fill(""); await box.pressSequentially(q, { delay: 40 }); await sleep(2500);
  const t = flat(await p.getByRole("dialog").last().innerText().catch(() => "none"));
  L(`Q "${q}" ->`, t.slice(0, 500));
  await snap(p, `search-${q.replace(/\W+/g, "-")}`, false);
  await p.keyboard.press("Escape"); await sleep(500);
}
process.exit(0);
