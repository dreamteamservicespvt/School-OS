// Layman A: recheck double click on Add class after an error; then archive the LA classes.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
const S = Date.now().toString().slice(-4);
const log = (k, v) => console.log(`== ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const dlg = () => p.getByRole("dialog").last();
const dt = async () => (await dlg().innerText().catch(() => "")).replace(/\n+/g, " | ");
await go(p, "/academic-management"); await sleep(800);
await p.getByRole("button", { name: "Add class", exact: true }).click(); await sleep(1000);
const submit = () => dlg().getByRole("button", { name: /^(Add class|Adding)/ }).last();
const name = dlg().locator("input[name=name]");
await name.fill("Class 2"); await submit().click(); await sleep(2500);
log("dup msg", (await dt()).slice(0, 100));
await name.fill(`LA-Dbl ${S}`); await submit().dblclick(); await sleep(5000);
log("after dblclick box open?", await dlg().isVisible().catch(() => false)); log("box", (await dt()).slice(0, 160));
await snap(p, "class3-dbl", false);
if (await dlg().isVisible().catch(() => false)) await p.keyboard.press("Escape");
await go(p, "/academic-management"); await sleep(1000);
let t = await mainText(p, 40000);
log("LA-Dbl count (3 = once)", (t.match(new RegExp(`LA-Dbl ${S}`, "g")) ?? []).length);
for (let i = 0; i < 4; i++) {
  await go(p, "/academic-management"); await sleep(1000);
  t = await mainText(p, 40000);
  const nm = (t.match(/LA-(Class \d+|తరగతి \d+|Dbl \d+)/) ?? [])[0];
  if (!nm) break;
  const card = p.locator("main section, main li, main article, main div").filter({ has: p.getByText(nm, { exact: true }) }).filter({ has: p.getByRole("button", { name: "Archive", exact: true }) }).last();
  await card.getByRole("button", { name: "Archive", exact: true }).first().click(); await sleep(1200);
  await dlg().getByRole("button", { name: new RegExp(`^Archive `) }).click(); await sleep(3000);
  log(`archived ${nm}`, (await mainText(p, 600)).match(/[^\n]*(Undo|archived|Archived)[^\n]*/g));
}
await go(p, "/academic-management"); await sleep(1000);
t = await mainText(p, 40000);
log("LA left after archive", t.match(/LA-[^\n|]+/g));
log("header counts", t.slice(t.indexOf("Classes\n"), t.indexOf("Classes\n") + 80).replace(/\n/g, " | "));
console.log("PROBLEMS", p.problems);
await close();
