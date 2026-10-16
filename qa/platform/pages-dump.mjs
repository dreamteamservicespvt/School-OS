// Opens pages in the browser as one login and prints a short summary of each:
// status, final address, time, layout problems, console/page errors, first words.
//   node qa/platform/pages-dump.mjs <login> <url> [url ...]
import { close, BASE, layoutIssues, shot } from "../lib.mjs";
import { as } from "./util.mjs";
const [login, ...urls] = process.argv.slice(2);
const p = await as(login);
for (const u of urls) {
  p.problems.length = 0;
  const s = Date.now();
  const r = await p.goto(BASE + u).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 40)}` }));
  await p.waitForTimeout(Number(process.env.WAIT ?? 600));
  const ms = Date.now() - s;
  const text = (await p.locator("main").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  const lay = await layoutIssues(p).catch(() => []);
  console.log(`\n### ${u} -> ${r.status()} ${p.url().replace(BASE, "")} ${ms}ms ${lay.length ? "LAYOUT " + lay.join(" | ") : ""} ${p.problems.length ? "PROBLEMS " + p.problems.join(" | ") : ""}`);
  console.log(text.slice(0, Number(process.env.MAX ?? 600)));
  if (process.env.SHOTS) await shot(p, `${login}${u}`.replace(/[^a-z0-9]+/gi, "_"));
}
await close();
