// Layman C: report card PDF, results export, analysis export (admin).
import { asRole, go, mainText, sleep, close, snap, OUTA } from "../full/selftest-A-h.mjs";
import { writeFileSync } from "node:fs";
const p = await asRole("admin");
await go(p, "/examination-results/report-cards"); await sleep(1000);
const hrefs = await p.locator("main a").evaluateAll((as) => as.filter((a) => /PDF/i.test(a.innerText)).map((a) => a.getAttribute("href")));
console.log("PDF LINKS", hrefs.slice(0, 3), hrefs.length);
const btns = await p.locator("main button").evaluateAll((bs) => bs.map((b) => b.innerText.trim()).filter(Boolean));
console.log("BUTTONS", [...new Set(btns)].join(" | ").slice(0, 600));
const get = async (url, file) => { const r = await p.request.get(url.startsWith("http") ? url : `http://localhost:3000${url}`); const b = await r.body(); writeFileSync(`${OUTA}/${file}`, b); console.log("GET", url, r.status(), r.headers()["content-type"], b.length, "->", file); return r; };
if (hrefs[0]) await get(hrefs[0], "c-rc-one.pdf");
// Print all ready
const printAll = p.getByRole("button", { name: /Print all ready/ }).first();
if (await printAll.isVisible().catch(() => false)) {
  const [pop, dl] = await Promise.all([p.context().waitForEvent("page", { timeout: 20000 }).catch(() => null), p.waitForEvent("download", { timeout: 20000 }).catch(() => null), printAll.click()]);
  if (dl) { await dl.saveAs(`${OUTA}/c-rc-all.pdf`); console.log("DOWNLOAD", dl.suggestedFilename()); }
  if (pop) { await pop.waitForLoadState().catch(() => {}); console.log("POPUP", pop.url()); await get(pop.url(), "c-rc-all.pdf").catch((e) => console.log(e.message)); }
  await sleep(1500); console.log("AFTER PRINT ALL", (await mainText(p, 1500)).replace(/\n+/g, " | ").slice(0, 300));
  const d = p.getByRole("dialog"); if (await d.count()) console.log("DLG", (await d.last().innerText()).replace(/\n+/g, " | ").slice(0, 400));
  await snap(p, "c-rc-printall", false);
}
// Results export
await go(p, "/examination-results/results"); await sleep(1000);
const exp = p.getByRole("button", { name: /^Export/ }).first();
await exp.click(); await sleep(800);
const menuT = await p.locator("[role=menu], [role=dialog]").last().innerText().catch(() => "");
console.log("EXPORT MENU", menuT.replace(/\n+/g, " | "));
const opt = p.getByRole("menuitem").or(p.locator("[role=dialog] button, [role=dialog] a")).filter({ hasText: /Excel/ }).first();
const [dl2] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }).catch(() => null), opt.click().catch((e) => console.log("no excel option", e.message.slice(0, 80)))]);
if (dl2) { const f = `c-results-${dl2.suggestedFilename()}`; await dl2.saveAs(`${OUTA}/${f}`); console.log("RESULTS DOWNLOAD", f); }
await close();
