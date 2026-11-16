// Tour: each role opens its area pages at 1440 and 390; time, errors, bad words, sideways scroll.
import { asRole, go, sleep, close, snap, one, timed, watch } from "./nc-h.mjs";
const role = process.argv[2]; const urls = process.argv.slice(3);
const p = watch(await asRole(role));
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  await p.setViewportSize(vp);
  for (const u of urls) {
    p.problems.length = 0;
    const r = await timed(p, u);
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    const bad = (r.text.match(/undefined|NaN|null\b|\[object|Something went wrong|could not open|\d{4}-\d{2}-\d{2}/g) ?? []);
    const refused = /not part of your role|no-access/.test(r.text + p.url());
    console.log(`${vp.width} ${u} ${r.status} ${r.ms}ms${r.ms > 3000 ? " SLOW" : ""}${sideways ? " SIDEWAYS" : ""}${refused ? " REFUSED" : ""}${bad.length ? " BAD:" + [...new Set(bad)].join(",") : ""}${p.problems.length ? " ERR:" + p.problems.join(" ;; ") : ""}`);
    if (process.env.V) console.log("   ", one(r.text, 900));
    await snap(p, `tour-${role}-${vp.width}-${u.replace(/\W+/g, "_")}`, vp.width === 390);
  }
}
await close();
