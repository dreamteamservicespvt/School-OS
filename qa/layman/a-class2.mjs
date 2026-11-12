// Layman A: does the Add class box close after a good save that followed an error? Then archive the LA classes.
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
await name.fill("Class 1"); await submit().click(); await sleep(2500);
log("dup msg", (await dt()).slice(0, 120));
await name.fill(`LA-Class ${S}`); await dlg().locator("input[name=sections]").fill("A, B"); await dlg().locator("input[name=seats]").fill("abc");
await submit().click(); await sleep(2500);
log("seats abc", (await dt()).slice(0, 200));
await dlg().locator("input[name=seats]").fill("30");
await submit().click(); await sleep(4000);
log("after good save, box open?", await dlg().isVisible().catch(() => false)); log("box", (await dt()).slice(0, 200));
await snap(p, "class2-after", false);
if (await dlg().isVisible().catch(() => false)) await p.keyboard.press("Escape");
await go(p, "/academic-management"); await sleep(1000);
const t = await mainText(p, 40000);
log("LA classes", [...new Set(t.match(/LA-(Class \d+|తరగతి \d+)(?= \|?\n?)/g) ?? [])]);
log("block", t.slice(t.indexOf(`LA-Class ${S}`), t.indexOf(`LA-Class ${S}`) + 300).replace(/\n/g, " | "));
// archive each LA class: the class "Archive" button next to it
for (const nm of [`LA-Class ${S}`]) {
  const card = p.locator("main section, main li, main article, main div").filter({ has: p.getByText(nm, { exact: true }) }).filter({ has: p.getByRole("button", { name: "Archive", exact: true }) }).last();
  const btn = card.getByRole("button", { name: "Archive", exact: true }).first();
  log("archive btn count", await card.getByRole("button", { name: "Archive", exact: true }).count());
  await btn.click(); await sleep(1500);
  log("archive confirm", (await dt()).slice(0, 500));
  await snap(p, "class2-archive-confirm", false);
}
console.log("PROBLEMS", p.problems);
await close();
