// Night B: Principal finds today's NB requests in Approvals (paging like a person), opens each.
import { asRole, go, mainText, sleep, snap, log, flat } from "./nb-h.mjs";
const L = log("appr");
const p = await asRole("principal");
await go(p, "/approvals"); await sleep(1500);
const t = await mainText(p, 20000);
L("TAIL", flat(t).slice(-1500));
const btns = await p.locator("main button, main a").evaluateAll((es) => es.map((e) => e.innerText.trim()).filter((x) => x && x.length < 40));
L("BTNS", [...new Set(btns)].join(" ; "));
for (let i = 0; i < 4; i++) {
  const more = p.getByRole("button", { name: /Show more|Load more|Next|More/ }).or(p.getByRole("link", { name: /Next|Page 2|›/ })).first();
  if (!(await more.isVisible().catch(() => false))) break;
  L("CLICK", await more.innerText()); await more.click(); await sleep(2500);
}
const links = await p.locator("main a").evaluateAll((as) => as.map((a) => `${a.innerText.trim().replace(/\n/g, " ").slice(0, 120)} -> ${a.getAttribute("href")}`));
L("NB LINKS", links.filter((l) => /Vihaan|NB-/.test(l)).join("\n"));
await snap(p, "approvals-paged");
process.exit(0);
