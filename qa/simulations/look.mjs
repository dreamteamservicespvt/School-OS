// node qa/simulations/look.mjs <login> <url> [<url> ...] — prints each screen's text (exploration aid).
import { as, visit, text, close } from "./sim-lib.mjs";
const [login, ...urls] = process.argv.slice(2);
const max = Number(process.env.MAX ?? 3500);
const page = await as(login);
for (const u of urls) {
  const r = await visit(page, u);
  console.log(`\n===== ${login} ${u} -> ${r?.status()} ${page.url()}`);
  console.log(await text(page, max));
  if (page.problems.length) console.log("PROBLEMS", page.problems.splice(0));
}
await close();
