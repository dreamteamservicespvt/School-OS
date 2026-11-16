import { asRole, go, sleep, close, snap, one, timed, watch } from "./nc-h.mjs";
const p = watch(await asRole("teacher"));
await go(p, "/examination-results/marks/17468ebc-6920-41ac-8327-16458ca0a0fa/47cfe8fa-64c4-4d99-8225-91808e82644c"); await sleep(1500);
await p.locator("main button", { hasText: /^13$/ }).first().click(); await sleep(1500);
const dlg = p.locator("dialog[open], [role=dialog]").last();
console.log("SHEET", one(await dlg.innerText().catch(() => "none"), 1500));
console.log("FIELDS", (await dlg.locator("input,textarea,select,button").evaluateAll(es => es.map(e => `${e.tagName}#${e.id}[${e.name}] ${e.getAttribute("aria-label")||e.innerText||""}`))).join(" ; "));
await snap(p, "marks-correct-sheet");
// empty submit
const sub = dlg.locator("button[type=submit]").last();
await sub.click(); await sleep(1500);
console.log("EMPTY ->", one(await dlg.innerText().catch(() => "none"), 1200));
// same mark, over max
const num = dlg.locator("input:not([type=hidden])").first();
await num.fill("30"); await sub.click(); await sleep(1500);
console.log("30 ->", one(await dlg.innerText().catch(() => "none"), 1200));
await num.fill("13"); 
const r = dlg.locator("textarea, input[name=reason]").first();
if (await r.count()) await r.fill("NC- test, same mark");
await sub.click(); await sleep(1500);
console.log("SAME ->", one(await dlg.innerText().catch(() => "none"), 1200));
await snap(p, "marks-correct-same");
console.log("PROBLEMS", p.problems);
await close();
