// node qa/e2e/teaching/look.mjs <login> <viewport> <url> [url...]  — prints each page's text, layout issues and problems.
import { as, visit, text, report, shot, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";
const [login, vp, ...urls] = process.argv.slice(2);
const page = await as(login, VIEWPORTS[vp]);
for (const u of urls) {
  const r = await visit(page, u, 1200);
  console.log(`\n===== ${login} ${vp} ${u} -> ${r?.status()} ${page.url()}`);
  console.log((await text(page, Number(process.env.MAX ?? 3500))));
  await report(page, u);
  const name = `look-${login}-${vp}-${u.replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}`;
  await shot(page, name, process.env.FULL !== "0");
}
await close();
