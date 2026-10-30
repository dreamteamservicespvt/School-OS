// Delivery audit 2026-10-31: every main-menu page at the widths round 1 did not cover
// (320, 375, 768, 1024, 1920), for one login. Reports sideways scroll, broken pages,
// browser errors and server errors; a screenshot of every page with a problem.
//   MSYS_NO_PATHCONV=1 node qa/full/widths.mjs <login> [widths=320,768,1024,1920] [crawl]
// With "crawl", every page round 1's crawl found for that login (qa-output/full/crawl-<login>-laptop1280.json).
import { mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { go, menu, layoutIssues, pageState, OUT, VIEWPORTS } from "./h.mjs";
import { as } from "./look.mjs";

const login = process.argv[2] ?? "principal";
const widths = (process.argv[3] ?? "320,768,1024,1920").split(",").map(Number);
const dir = path.join(OUT, "widths"); mkdirSync(dir, { recursive: true });
const log = path.join(OUT, `widths-${login}${process.argv[4] ? "-" + process.argv[4] : ""}.txt`);
const page0 = await as(login, VIEWPORTS.desk1440);
let links = (await menu(page0)).filter((l) => l.href.startsWith("/"));
if (process.argv[4] === "crawl") {
  const { readFileSync } = await import("node:fs");
  const j = JSON.parse(readFileSync(path.join(OUT, `crawl-${login}-laptop1280.json`), "utf8"));
  links = [...new Set(j.results.filter((r) => r.status === 200 && !r.refused).map((r) => r.href))].map((href) => ({ href }));
}
await page0.context().close();
let bad = 0;
for (const w of widths) {
  const page = await as(login, { width: w, height: w < 500 ? 740 : 900 });
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|status of 4\d\d/.test(m.text())) page.problems.push(`console: ${m.text().slice(0, 160)}`); });
  for (const l of links) {
    page.problems.length = 0;
    try { await go(page, l.href); } catch (e) { page.problems.push(`load: ${e.message.slice(0, 80)}`); }
    await page.waitForTimeout(400);
    const st = await pageState(page);
    const issues = (await layoutIssues(page)).filter((x) => x.startsWith("page scrolls"));
    const all = [...issues, ...(st.broken ? ["BROKEN PAGE"] : []), ...page.problems];
    const line = `${w}\t${l.href}\t${all.length ? all.join(" | ") : "ok"}`;
    appendFileSync(log, line + "\n");
    if (all.length) {
      bad++;
      console.log(line);
      await page.screenshot({ path: path.join(dir, `${login}-${w}-${l.href.replace(/\W+/g, "_")}.png`), fullPage: false }).catch(() => {});
    }
  }
  await page.context().close();
}
console.log(`${login}: ${links.length} pages x ${widths.length} widths, ${bad} with problems`);
process.exit(0);
