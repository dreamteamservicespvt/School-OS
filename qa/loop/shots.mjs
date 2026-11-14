// Layman loop (15-16 Nov 2026): screenshots of pages at phone (390) and computer (1440) width, light and dark.
//   QA_SERVER_LOG=tools/app.log node qa/loop/shots.mjs <role> <name> <path> [<path> ...]
// Signs in once per role (saved session, see qa/layman/d-h.mjs), then writes
// qa-output/loop/<name>-<n>-<width>-<light|dark>.png and prints page problems (crash words, errors, sideways scroll).
import path from "node:path";
import { mkdirSync } from "node:fs";
import { asRole, close, sleep, mainText, OUTA } from "../layman/nc-h.mjs";

const [role, name, ...paths] = process.argv.slice(2);
const OUT = path.resolve("qa-output/loop");
mkdirSync(OUT, { recursive: true });
const first = await asRole(role);
const state = path.join(OUTA, `state-${role}.json`);
await first.context().storageState({ path: state });
const browser = first.context().browser();
await first.context().close();

const SIZES = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
let n = 0;
for (const p of paths) {
  n++;
  for (const vp of SIZES) {
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, storageState: state, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 140)));
      await page.goto(new URL(p, "http://localhost:3000").href, { timeout: 90000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await sleep(600);
      const file = path.join(OUT, `${name}-${n}-${vp.width}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
      const t = await mainText(page, 4000).catch(() => "");
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
      const bad = [];
      if (/Something went wrong|Application error/i.test(t)) bad.push("CRASH");
      if (wide > 2) bad.push(`sideways scroll ${wide}px`);
      bad.push(...errs.slice(0, 2));
      console.log(`${path.basename(file)}${bad.length ? "  !! " + bad.join(" | ") : ""}`);
      await ctx.close();
    }
  }
}
await close();
