// Layman C: Parent Link as the parent sees it (preview from the office, and a real opened link if the old session still works).
import { asRole, go, mainText, sleep, close, snap, newPage } from "../full/selftest-A-h.mjs";
import { existsSync } from "node:fs";
const a = await asRole("admin");
await go(a, "/communication/parent-link"); await sleep(1000);
const ids = await a.locator("main a[href*='/communication/parent-link/']").evaluateAll((as) => as.map((x) => x.getAttribute("href")).filter((h) => /parent-link\/[0-9a-f-]{36}$/.test(h)));
console.log("links", ids.length, ids.slice(0, 3));
const target = ids.find(Boolean);
await go(a, target); await sleep(1000);
console.log("DETAIL", (await mainText(a, 3000)).replace(/\n+/g, " | ").slice(0, 900));
await snap(a, "c-plink-detail");
await a.setViewportSize({ width: 390, height: 844 });
await go(a, `${target}/preview`); await sleep(1500);
console.log("PREVIEW", (await mainText(a, 6000)).replace(/\n+/g, " | ").slice(0, 2500));
console.log("scrollWidth", await a.evaluate(() => document.documentElement.scrollWidth));
await snap(a, "c-plink-preview-390");
const tabs = await a.locator("a[href], button").evaluateAll((xs) => xs.map((x) => x.innerText.trim()).filter((t) => t && t.length < 30));
console.log("TABS", [...new Set(tabs)].join(" / ").slice(0, 600));
console.log("PROBLEMS", a.problems);
const st = "qa-output/full/state/parent-sanjay.json";
if (existsSync(st)) {
  const p = await newPage({ width: 390, height: 844 }, { storageState: st });
  await go(p, "/p"); await sleep(1500);
  console.log("PARENT /p ->", p.url(), (await mainText(p, 1500)).replace(/\n+/g, " | ").slice(0, 400));
}
await close();
