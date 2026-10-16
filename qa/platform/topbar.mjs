// Top bar fit: page width against the window at tablet and laptop widths, and
// whether the profile button is inside the window.  node qa/platform/topbar.mjs [login] [url]
import { close, BASE, VIEWPORTS, shot } from "../lib.mjs";
import { as } from "./util.mjs";
const [login = "cems.admin", url = "/settings"] = process.argv.slice(2);
const p = await as(login);
for (const name of ["tablet768", "tablet820", "laptop1024", "laptop1280"]) {
  await p.setViewportSize(VIEWPORTS[name]);
  await p.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const b = document.querySelector('header button[aria-label="Your profile and settings"]')?.getBoundingClientRect();
    return { scroll: document.documentElement.scrollWidth, win: window.innerWidth, profileRight: b ? Math.round(b.right) : null };
  });
  console.log(`${r.scroll > r.win + 1 || (r.profileRight ?? 0) > r.win ? "FAIL" : "PASS"} ${name}: page ${r.scroll}px, window ${r.win}px, profile button right edge ${r.profileRight}px`);
  await shot(p, `topbar-${name}`, false);
}
await close();
